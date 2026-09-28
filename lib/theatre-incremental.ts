import { assertCompleteTheatreResponse, parseTheatreItems } from "./theatre";
import type { TheatreClip, TheatreResponse } from "./theatre";
import { isChorusSpeaker } from "./theatre-speakers";
import { validateTheatreAudio } from "./theatre-audio-validation";

export class ClipPreparationError extends Error {}

export type TheatreManifest = TheatreResponse & { protocol: "incremental-v1"; sceneToken: string };
export function assertTheatreManifest(value: unknown, source: string): asserts value is TheatreManifest {
  const data = value as TheatreManifest;
  if (!data || data.protocol !== "incremental-v1" || typeof data.sceneToken !== "string" ||
    !data.sceneToken || data.sceneToken.length > 450_000 || !Array.isArray(data.clips) ||
    data.integrity?.generatedClipCount !== 0 || data.clips.some(c => c.audioBase64 !== "" ||
      (isChorusSpeaker(c.speaker) && c.type === "dialogue") !== !!c.chorus || c.chorus?.components.some(p => p.audioBase64 !== "")))
    throw new Error("Plan de scène invalide.");
  // Reuse the canonical identity/order checks. These validation-only markers
  // never enter the queue or reach Audio: manifest clips contain no audio yet.
  assertCompleteTheatreResponse({ ...data, integrity: { ...data.integrity, generatedClipCount: data.clips.length },
    clips: data.clips.map(c => ({ ...c, audioBase64: c.pauseMs ? "" : "pending", ...(c.chorus ? {chorus:{components:c.chorus.components.map(p=>({...p,audioBase64:"pending"}))}} : {}) })) }, parseTheatreItems(source));
}

export const THEATRE_PREPARATION_CONCURRENCY = 2;
export const THEATRE_LOOKAHEAD = 6;
export type PreparationEvent = { index: number; component?: number; session: number; attempt: number; phase: "queued" | "request" | "prepared" | "cached" | "failed" | "cancelled" | "stale" | "validation_valid" | "validation_invalid" | "validation_unavailable"; at: number };
/** Two active logical jobs maximum; chorus components remain sequential within
 * each job. Completed components survive retries. No content leaves diagnostics. */
export class IncrementalTheatreLoader {
  private abort = new AbortController();
  private active = 0;
  private waiting: { index: number; start: () => void }[] = [];
  private diagnostics: PreparationEvent[] = [];
  private droppedEvents = 0;
  getDroppedEvents = () => this.droppedEvents;
  private attempts = new Map<number,number>();
  private delivery = new Map<string,unknown>();
  private deliveryBytes = 0;
  getDelivery = (index: number, component = 0) => structuredClone(this.delivery.get(`${index}:${component}`) ?? null);
  private captureDelivery(index: number, component: number, value: unknown) {
    if(!this.debug || !value || typeof value!=="object") return;
    // Server constructs this allowlisted object. Never retain the response/audio/token.
    const d=value as Record<string,unknown>;
    const safe={capture:{session:this.session,attempt:this.attempts.get(index)??0,index,component},kind:d.kind,item:d.item,componentIndex:d.componentIndex,performanceStyle:d.performanceStyle,language:d.language,
      direction:d.direction,tts:d.tts,director:d.director,requestOutcome:d.requestOutcome,provenance:d.provenance};
    const bytes=JSON.stringify(safe).length;
    if(bytes>32_000) return;
    const key=`${index}:${component}`;
    if(this.delivery.has(key)) this.deliveryBytes-=JSON.stringify(this.delivery.get(key)).length;
    this.delivery.delete(key);
    while(this.delivery.size>=256 || this.deliveryBytes+bytes>2_000_000) {
      const oldest=this.delivery.keys().next().value!;
      this.deliveryBytes-=JSON.stringify(this.delivery.get(oldest)).length; this.delivery.delete(oldest);
    }
    this.delivery.set(key,safe);this.deliveryBytes+=bytes;
  }
  getDiagnostics = () => this.diagnostics.slice();
  private trace(index: number, phase: PreparationEvent["phase"], component?: number) {
    this.diagnostics.push({index,phase,component,session:this.session,attempt:this.attempts.get(index)??0,at:Date.now()});
    if(this.diagnostics.length>1024) { this.diagnostics.shift();this.droppedEvents++; }
  }
  private promote(index: number) {
    const position=this.waiting.findIndex(job=>job.index===index);
    if(position>0) this.waiting.unshift(...this.waiting.splice(position,1));
  }
  private async slot(index: number, required: boolean) {
    if(this.active>=THEATRE_PREPARATION_CONCURRENCY) await new Promise<void>(resolve=>{
      this.waiting.push({index,start:resolve}); if(required) this.promote(index);
    });
    else this.active++;
  }
  private release() { const next=this.waiting.shift(); if(next) next.start(); else this.active--; }
  private pending = new Map<number, Promise<TheatreClip>>();
  private clips: TheatreClip[];
  constructor(private manifest: TheatreManifest, private fetchAudio: typeof fetch, private headers: () => Record<string,string>, private session=0, private debug=false, private validateAudio=validateTheatreAudio) {
    this.clips = structuredClone(manifest.clips);
  }
  dispose() { for(const index of this.pending.keys()) this.trace(index,"cancelled"); this.abort.abort(); }
  load = (index: number, required = false): Promise<TheatreClip> => {
    if (this.abort.signal.aborted) return Promise.reject(new Error("cancelled"));
    if (this.pending.has(index)) { if(required) this.promote(index); return this.pending.get(index)!; }
    this.attempts.set(index,(this.attempts.get(index)??0)+1);
    this.trace(index,"queued");
    const task = this.slot(index,required).then(async () => {
      try {
      this.abort.signal.throwIfAborted();
      const clip = this.clips[index];
      if (!clip) throw new Error("Élément invalide.");
      if (clip.pauseMs) return structuredClone(clip);
      const parts = clip.chorus?.components ?? [{voice:clip.voice,audioBase64:clip.audioBase64}];
      for (let componentIndex=0; componentIndex<parts.length; componentIndex++) {
        this.abort.signal.throwIfAborted();
        if (parts[componentIndex].audioBase64) { this.trace(index,"cached",componentIndex); continue; }
        this.trace(index,"request",componentIndex);
        const response = await this.fetchAudio("/api/theatre-clip", {method:"POST",headers:{"Content-Type":"application/json",...this.headers()},
          body:JSON.stringify({sceneToken:this.manifest.sceneToken,itemId:clip.id,componentIndex,...(this.debug?{debug:true}:{})}),signal:this.abort.signal});
        if(this.abort.signal.aborted) this.trace(index,"stale",componentIndex);
        this.abort.signal.throwIfAborted();
        const data = await response.json().catch(()=>null);
        if(this.abort.signal.aborted) this.trace(index,"stale",componentIndex);
        this.abort.signal.throwIfAborted();
        this.captureDelivery(index,componentIndex,data?.debug);
        if (!response.ok) throw new ClipPreparationError(response.status===429 ? "Préparation temporairement limitée. Patientez, puis réessayez cet élément." : response.status===410 ? "La session de préparation a expiré. Relancez la scène." : "Impossible de préparer cet élément. Réessayez; les passages prêts sont conservés.");
        this.abort.signal.throwIfAborted();
        if (data?.mode !== "theatre-component" || data.itemId !== clip.id || data.componentIndex !== componentIndex ||
          data.voice !== parts[componentIndex].voice || data.speed !== clip.speed || typeof data.audioBase64 !== "string" ||
          !data.audioBase64 || data.audioBase64.length > 3_500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.audioBase64)) throw new Error("Audio reçu invalide. Réessayez cet élément.");
        const validation = await this.validateAudio(data.audioBase64, this.abort.signal);
        if(this.abort.signal.aborted) this.trace(index,"stale",componentIndex);
        this.abort.signal.throwIfAborted();
        this.trace(index,`validation_${validation.status}`,componentIndex);
        if(validation.status === "invalid") throw new ClipPreparationError("Audio reçu inutilisable. Réessayez cet élément; les passages prêts sont conservés.");
        parts[componentIndex].audioBase64 = data.audioBase64;
        if (componentIndex===0) clip.audioBase64=data.audioBase64;
        this.trace(index,"prepared",componentIndex);
      }
      return structuredClone(clip);
      } catch(error) { this.trace(index,"failed"); throw error; }
      finally { this.release(); }
    });
    this.pending.set(index, task);
    void task.finally(()=>this.pending.delete(index)).catch(()=>{});
    return task;
  };
}
