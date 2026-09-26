import { assertCompleteTheatreResponse, parseTheatreItems } from "./theatre";
import type { TheatreClip, TheatreResponse } from "./theatre";
import { isChorusSpeaker } from "./theatre-speakers";

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
    clips: data.clips.map(c => ({ ...c, audioBase64: "pending", ...(c.chorus ? {chorus:{components:c.chorus.components.map(p=>({...p,audioBase64:"pending"}))}} : {}) })) }, parseTheatreItems(source));
}

/** One active component request per scene, with at most two logical items of
 * lookahead requested by the controller. Completed components survive retries. */
export class IncrementalTheatreLoader {
  private abort = new AbortController();
  private tail: Promise<void> = Promise.resolve();
  private pending = new Map<number, Promise<TheatreClip>>();
  private clips: TheatreClip[];
  constructor(private manifest: TheatreManifest, private fetchAudio: typeof fetch, private headers: () => Record<string,string>) {
    this.clips = structuredClone(manifest.clips);
  }
  dispose() { this.abort.abort(); }
  load = (index: number): Promise<TheatreClip> => {
    if (this.abort.signal.aborted) return Promise.reject(new Error("cancelled"));
    if (this.pending.has(index)) return this.pending.get(index)!;
    const task = this.tail.then(async () => {
      const clip = this.clips[index];
      if (!clip) throw new Error("Élément invalide.");
      const parts = clip.chorus?.components ?? [{voice:clip.voice,audioBase64:clip.audioBase64}];
      for (let componentIndex=0; componentIndex<parts.length; componentIndex++) {
        this.abort.signal.throwIfAborted();
        if (parts[componentIndex].audioBase64) continue;
        const response = await this.fetchAudio("/api/theatre-clip", {method:"POST",headers:{"Content-Type":"application/json",...this.headers()},
          body:JSON.stringify({sceneToken:this.manifest.sceneToken,itemId:clip.id,componentIndex}),signal:this.abort.signal});
        this.abort.signal.throwIfAborted();
        if (!response.ok) throw new ClipPreparationError(response.status===429 ? "Préparation temporairement limitée. Patientez, puis réessayez cet élément." : response.status===410 ? "La session de préparation a expiré. Relancez la scène." : "Impossible de préparer cet élément. Réessayez; les passages prêts sont conservés.");
        const data = await response.json();
        this.abort.signal.throwIfAborted();
        if (data?.mode !== "theatre-component" || data.itemId !== clip.id || data.componentIndex !== componentIndex ||
          data.voice !== parts[componentIndex].voice || data.speed !== clip.speed || typeof data.audioBase64 !== "string" ||
          !data.audioBase64 || data.audioBase64.length > 3_500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.audioBase64)) throw new Error("Audio reçu invalide. Réessayez cet élément.");
        parts[componentIndex].audioBase64 = data.audioBase64;
        if (componentIndex===0) clip.audioBase64=data.audioBase64;
      }
      return structuredClone(clip);
    });
    this.tail = task.then(()=>{},()=>{});
    this.pending.set(index, task);
    void task.finally(()=>this.pending.delete(index)).catch(()=>{});
    return task;
  };
}
