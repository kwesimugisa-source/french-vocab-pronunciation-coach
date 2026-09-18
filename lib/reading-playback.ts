import { theatreStyle, TheatreStyle } from "./theatre-performance";
import { ContentIdentity, validateIdentity } from "./content-document";
import { browserPlaybackEnvironment, TheatrePlaybackController } from "./theatre-playback";
import type { PlaybackAudio, PlaybackEnvironment, TheatrePlaybackSnapshot } from "./theatre-playback";
import { AmbiencePlayback } from "./ambience-playback";
import type { AmbienceLevel } from "./ambience-playback";
import { validateAmbience, ambienceStatus } from "./theatre-ambience";
import type { AmbienceStatus, AmbienceRecommendation } from "./theatre-ambience";
import { Preparation, PreparationState } from "./preparation";
import { betaContext, betaHeaders, betaJournal, BetaData } from "./beta-events";
import { requestError } from "./safe-errors";
import type { AmbienceKind, AmbienceProvider } from "./theatre-ambience";
import type { TheatreResponse } from "./theatre";
import { ConversationPlayback } from "./conversation-playback";

type ReadingSnapshot = {
  performanceStyle: TheatreStyle;
  mode: "pending" | "theatre" | "ordinary" | "conversation" | null;
  busy: boolean;
  theatre: TheatrePlaybackSnapshot;
  error: string | null;
  preparation: PreparationState | null;
  conversationPreparing: boolean;
  ambience: { environment: AmbienceKind; level: AmbienceLevel; status: AmbienceStatus };
};

/** Own the request before its response mode is known. Ordinary/poetry keep their
 * existing one-blob, one-Audio playback; theatre alone uses the item controller.
 */
export class ReadingPlaybackSession {
  readonly theatre: TheatrePlaybackController;
  readonly conversation: ConversationPlayback;
  readonly preparation = new Preparation();
  private analysisCache: { key: string; reference?: string; ambience?: AmbienceRecommendation; retryAt: number } | null = null;
  private lifecycle: { context: Partial<BetaData>; status: string; since: number } | null = null;
  private request: AbortController | null = null;
  private conversationRequest = false;
  private ordinary: PlaybackAudio | null = null;
  private ordinaryUrl: string | null = null;
  private listeners = new Set<() => void>();
  private snapshot: ReadingSnapshot;
  private unsubscribe: () => void;
  private ambience: AmbiencePlayback;
  private captures = 0;

  constructor(
    private environment: PlaybackEnvironment = browserPlaybackEnvironment,
    private fetchAudio: typeof fetch = (...args) => fetch(...args),
    ambienceProvider?: AmbienceProvider
  ) {
    this.theatre = new TheatrePlaybackController(environment);
    this.ambience = new AmbiencePlayback(environment, ambienceProvider, () => {
      this.update({ ambience: { ...this.snapshot.ambience, status: "playback_failed" } });
      betaJournal.emit({ ...this.lifecycle?.context, name:"ambience",status:"playback_failed",code:"PLAYBACK_FAILED" });
    }, () => {
      if(this.snapshot.ambience.status==="playback_failed") this.update({ambience:{...this.snapshot.ambience,status:"detected_available"}});
    });
    this.conversation = new ConversationPlayback(environment, () => this.update({ error: this.conversation.getSnapshot().error }));
    this.snapshot = { performanceStyle: "clarte", mode: null, busy: false, theatre: this.theatre.getSnapshot(), error: null, preparation:null, conversationPreparing:false,
      ambience: { environment: "none", level: "off", status:"analysis_unavailable" } };
    this.preparation.subscribe(() => this.update({}));
    this.unsubscribe = this.theatre.subscribe(() => this.update({}));
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<ReadingSnapshot>) {
    const theatre = this.theatre.getSnapshot();
    this.ambience.setActive(["playing", "paused", "replaying", "practising"].includes(theatre.status));
    this.snapshot = { ...this.snapshot, ...patch, theatre, preparation:this.preparation.getSnapshot(), conversationPreparing:this.conversation.getSnapshot().preparing,
      busy: !!this.request || !!this.ordinary || this.conversation.getSnapshot().busy || !!theatre.practiceTarget ||
        ["playing", "paused", "replaying", "practising"].includes(theatre.status) };
    if (this.lifecycle && this.snapshot.mode === "theatre") {
      const status = theatre.status === "completed" ? "completed" : theatre.status === "error" ? "failed" : theatre.status === "paused" ? "paused" : ["playing","replaying","practising"].includes(theatre.status) ? (this.lifecycle.status === "paused" ? "resumed" : "started") : null;
      if (status) this.playbackEvent(status, theatre.queue.length);
    } else if (this.lifecycle && this.snapshot.mode === "conversation") {
      const s = this.conversation.getSnapshot();
      if (s.error) this.playbackEvent("failed");
      else if (!s.busy && s.playedIds.length) this.playbackEvent("completed",s.playedIds.length);
      else if (s.busy && !s.preparing) this.playbackEvent("started");
    }
    this.listeners.forEach((listener) => listener());
  }
  private playbackEvent(status: "started" | "completed" | "failed" | "paused" | "resumed" | "cancelled", logicalItems?: number) {
    const run=this.lifecycle;
    if (!run || run.status===status || (["started","resumed"].includes(run.status) && status==="started")) return;
    if (status === "started" && run.status === "pending") run.since = Date.now();
    run.status=status;
    betaJournal.emit({...run.context,name:"playback",status,durationMs:Math.max(0,Date.now()-run.since),...(logicalItems!==undefined?{logicalItems}:{}),...(status==="failed"?{code:"PLAYBACK_FAILED" as const}:{})});
    if (["completed","failed","cancelled"].includes(status)) this.lifecycle=null;
  }
  invalidateDocument() { this.stop(); this.analysisCache=null; }
  private releaseOrdinary() {
    if (this.ordinary) {
      this.ordinary.onended = this.ordinary.onerror = null;
      this.ordinary.pause();
      this.ordinary.removeAttribute("src");
      this.ordinary.load();
      this.ordinary = null;
    }
    if (this.ordinaryUrl) this.environment.revokeUrl(this.ordinaryUrl);
    this.ordinaryUrl = null;
  }
  stop() {
    this.playbackEvent("cancelled"); this.preparation.cancel();
    const request = this.request;
    this.request = null;
    this.conversationRequest = false;
    request?.abort();
    this.conversation.stop();
    this.releaseOrdinary();
    this.ambience.stop();
    this.theatre.stop();
    this.update({ mode: null, error: null, ambience: { ...this.snapshot.ambience, environment: "none" } });
  }
  setAmbienceLevel(level: AmbienceLevel) {
    if (!["off", "low", "medium"].includes(level)) return;
    this.ambience.setLevel(level);
    this.update({ ambience: { ...this.snapshot.ambience, level } });
  }
  /** Reusable turn-taking boundary: synchronous silence BEFORE getUserMedia.
   * The idempotent release restores ambience, never resumes performance. */
  beginMicrophoneCapture = () => {
    this.captures++;
    // Conversation cannot advance while the microphone owns the audio boundary.
    // Invalidate pending responses too; releasing capture never starts speech.
    if (this.snapshot.mode === "conversation" || this.conversationRequest) this.stop();
    this.ambience.setMuted(true);
    this.theatre.setCaptureBlocked(true);
    this.ordinary?.pause();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.captures--;
      if (!this.captures) {
        this.theatre.setCaptureBlocked(false);
        this.ambience.setMuted(false);
      }
    };
  };
  dispose() { this.invalidateDocument(); this.unsubscribe(); this.listeners.clear(); this.theatre.dispose(); }

  /** A new style owns a fresh audio session. Scene analysis is independent and reusable.
   * Restart from the beginning explicitly; never mix an old queue/practice bookmark. */
  async changeTheatreStyle(value: unknown, text: string, speed: string, identity: ContentIdentity) {
    const style = theatreStyle(value);
    if (identity.contentType !== "theatre" || this.captures || style === this.snapshot.performanceStyle) return;
    const restart = this.snapshot.mode === "theatre" || this.snapshot.mode === "pending";
    this.stop();
    this.update({ performanceStyle: style });
    if (restart) await this.start(text, speed, identity);
  }

  async start(text: string, speed: string, identity?: ContentIdentity) {
    if (this.snapshot.busy || this.captures) return;
    this.stop();
    if (identity) {
      try { validateIdentity(identity); } catch { this.update({ error: "Identité du document invalide." }); return; }
    }
    const performanceStyle = identity?.contentType === "theatre" ? this.snapshot.performanceStyle : "clarte";
    const request = new AbortController();
    this.request = request;
    const context={...betaContext(identity,speed),...(identity?.contentType === "theatre" ? {performanceStyle} : {})};
    this.lifecycle={context,status:"pending",since:Date.now()};
    const preparationId=this.preparation.begin("reading",context);
    const key=identity ? `${identity.documentId}:${identity.revision}:${text}` : "";
    if (this.analysisCache?.key !== key) this.analysisCache=null;
    const cached=identity?.contentType === "theatre" ? this.analysisCache : null;
    this.update({ mode: "pending", error: null });
    this.conversationRequest = identity?.contentType === "conversation";
    const sessionId = this.conversationRequest ? null : this.theatre.beginLoading();
    const current = () => this.request === request && !request.signal.aborted;
    let failureCode: "RATE_LIMITED" | "PROVIDER_FAILED" = "PROVIDER_FAILED";
    let failureMessage = requestError(500, "reading");
    const run = async () => {
      try {
        const response = await this.fetchAudio("/api/read-passage", {
          method: "POST", headers: { "Content-Type": "application/json", ...betaHeaders() },
          body: JSON.stringify({ text, speed, ...(identity?.contentType === "theatre" ? {performanceStyle} : {}), ...(cached?.ambience ? {analysisCacheKey:cached.reference,ambienceDecision:cached.ambience} : cached && Date.now()<cached.retryAt ? {skipAnalysis:true} : {}), ...(identity ? { documentId: identity.documentId, revision: identity.revision, contentType: identity.contentType, ...(identity.theatreCharacters ? {theatreCharacters:identity.theatreCharacters} : {}) } : {}) }), signal: request.signal,
        });
        if (!current()) return;
        if (!response.ok) {
          if(response.status===429) failureCode="RATE_LIMITED";
          failureMessage = requestError(response.status,"reading");
          throw new Error(failureMessage);
        }
        if ((response.headers.get("Content-Type") || "").includes("application/json")) {
          if (identity?.contentType === "conversation") {
            const data: unknown = await response.json();
            if (!current() || this.captures) return;
            this.conversation.accept(data, text, ({ "very-slow": 0.7, slow: 0.85, normal: 1, fast: 1.15 } as Record<string, number>)[speed]);
            this.preparation.finish(preparationId,"completed");
            this.update({ mode: "conversation" });
            return;
          }
          if (identity && identity.contentType !== "theatre")
            throw new Error("Le mode audio reçu ne correspond pas au texte.");
          const data: unknown = await response.json();
          if (!current()) return;
          const scene = data as TheatreResponse;
          if (theatreStyle(scene.performanceStyle) !== performanceStyle)
            throw new Error("Le style audio reçu ne correspond pas au style demandé.");
          this.theatre.acceptScene(sessionId!, data, text);
          // Only CP4's sanitized legacy shape omitted confidence. New scene
          // reasoning must carry its own validated confidence, never invent it.
          const ambience = scene.ambience;
          const recommendation = validateAmbience(ambience && Object.hasOwn(ambience, "basis") ? ambience :
            { ...ambience, confidence: ambience?.confidence ?? "high" }, scene.clips);
          const status=ambienceStatus(recommendation,scene.direction?.status==="analyzed" || !!cached?.ambience);
          if (key) {
            const reference = typeof scene.analysisCacheKey === "string" && /^[0-9a-f-]{36}$/i.test(scene.analysisCacheKey) ? scene.analysisCacheKey : undefined;
            this.analysisCache={key,reference,ambience:status!=="analysis_unavailable"?recommendation:undefined,retryAt:cached && Date.now()<cached.retryAt ? cached.retryAt : Date.now()+30_000};
          }
          betaJournal.emit({...context,name:"ambience",status,environment:["none","office","rain","neutral_room","station"].includes(recommendation.environment)?recommendation.environment as BetaData["environment"]:"other"});
          this.preparation.finish(preparationId,"completed");
          this.update({ mode: "theatre", ambience: { ...this.snapshot.ambience, environment: recommendation.environment, status } });
          this.ambience.configure(status === "detected_available" ? recommendation.environment : "none");
        } else {
          if (identity?.contentType === "conversation") throw new Error("La réponse audio ne contient pas les tours de parole attendus.");
          if (identity?.contentType === "theatre") throw new Error("La scène théâtrale reçue est incomplète.");
          const blob = await response.blob();
          if (!current()) return;
          if (!blob.size) throw new Error("La réponse audio est vide.");
          this.preparation.finish(preparationId,"completed");
          this.theatre.stop();
          this.ordinaryUrl = this.environment.createUrl(blob);
          const audio = this.environment.createAudio(this.ordinaryUrl);
          this.ordinary = audio;
          const finish = (error: string | null) => {
            if (this.ordinary !== audio) return;
            this.playbackEvent(error ? "failed" : "completed");
            this.releaseOrdinary();
            this.update({ error });
          };
          audio.onended = () => finish(null);
          audio.onerror = () => finish("Erreur de lecture audio.");
          this.update({ mode: "ordinary" });
          if (!this.captures) void audio.play().then(() => { if(this.ordinary===audio) this.playbackEvent("started"); }).catch(() => finish("Impossible de lancer la lecture IA."));
        }
      } catch (error) {
        if (!current()) return;
        this.preparation.finish(preparationId,"failed",failureCode); this.playbackEvent("failed");
        this.releaseOrdinary();
        if (sessionId !== null) this.theatre.failGeneration(sessionId, "Impossible de charger la lecture IA.");
        this.update({ error: failureMessage });
      } finally {
        if (this.request === request) { this.request = null; this.conversationRequest = false; this.update({}); }
      }
    };
    // Stop settles start() even if a transport/mock ignores AbortSignal.
    let cancel!: () => void;
    const cancelled = new Promise<void>((resolve) => { cancel = resolve; });
    request.signal.addEventListener("abort", cancel, { once: true });
    await Promise.race([run(), cancelled]);
    request.signal.removeEventListener("abort", cancel);
  }
}
