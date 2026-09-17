import { ContentIdentity, validateIdentity } from "./content-document";
import { browserPlaybackEnvironment, TheatrePlaybackController } from "./theatre-playback";
import type { PlaybackAudio, PlaybackEnvironment, TheatrePlaybackSnapshot } from "./theatre-playback";
import { AmbiencePlayback } from "./ambience-playback";
import type { AmbienceLevel } from "./ambience-playback";
import { validateAmbience } from "./theatre-ambience";
import type { AmbienceKind, AmbienceProvider } from "./theatre-ambience";
import type { TheatreResponse } from "./theatre";
import { ConversationPlayback } from "./conversation-playback";

type ReadingSnapshot = {
  mode: "pending" | "theatre" | "ordinary" | "conversation" | null;
  busy: boolean;
  theatre: TheatrePlaybackSnapshot;
  error: string | null;
  ambience: { environment: AmbienceKind; level: AmbienceLevel };
};

/** Own the request before its response mode is known. Ordinary/poetry keep their
 * existing one-blob, one-Audio playback; theatre alone uses the item controller.
 */
export class ReadingPlaybackSession {
  readonly theatre: TheatrePlaybackController;
  readonly conversation: ConversationPlayback;
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
    this.ambience = new AmbiencePlayback(environment, ambienceProvider);
    this.conversation = new ConversationPlayback(environment, () => this.update({ error: this.conversation.getSnapshot().error }));
    this.snapshot = { mode: null, busy: false, theatre: this.theatre.getSnapshot(), error: null,
      ambience: { environment: "none", level: "off" } };
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
    this.snapshot = { ...this.snapshot, ...patch, theatre,
      busy: !!this.request || !!this.ordinary || this.conversation.getSnapshot().busy || !!theatre.practiceTarget ||
        ["playing", "paused", "replaying", "practising"].includes(theatre.status) };
    this.listeners.forEach((listener) => listener());
  }
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
  dispose() { this.stop(); this.unsubscribe(); this.listeners.clear(); this.theatre.dispose(); }

  async start(text: string, speed: string, identity?: ContentIdentity) {
    if (this.snapshot.busy || this.captures) return;
    this.stop();
    if (identity) {
      try { validateIdentity(identity); } catch { this.update({ error: "Identité du document invalide." }); return; }
    }
    const request = new AbortController();
    this.request = request;
    this.update({ mode: "pending", error: null });
    this.conversationRequest = identity?.contentType === "conversation";
    const sessionId = this.conversationRequest ? null : this.theatre.beginLoading();
    const current = () => this.request === request && !request.signal.aborted;
    const run = async () => {
      try {
        const response = await this.fetchAudio("/api/read-passage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, speed, ...(identity ? { documentId: identity.documentId, revision: identity.revision, contentType: identity.contentType } : {}) }), signal: request.signal,
        });
        if (!current()) return;
        if (!response.ok) {
          if (response.status === 413 || this.conversationRequest) throw new Error(await response.text());
          throw new Error("Échec de la génération audio. Aucun passage incomplet ne sera lu.");
        }
        if ((response.headers.get("Content-Type") || "").includes("application/json")) {
          if (identity?.contentType === "conversation") {
            const data: unknown = await response.json();
            if (!current() || this.captures) return;
            this.conversation.accept(data, text, ({ "very-slow": 0.7, slow: 0.85, normal: 1, fast: 1.15 } as Record<string, number>)[speed]);
            this.update({ mode: "conversation" });
            return;
          }
          if (identity && identity.contentType !== "theatre")
            throw new Error("Le mode audio reçu ne correspond pas au texte.");
          const data: unknown = await response.json();
          if (!current()) return;
          this.theatre.acceptScene(sessionId!, data, text);
          const scene = data as TheatreResponse;
          // Only CP4's sanitized legacy shape omitted confidence. New scene
          // reasoning must carry its own validated confidence, never invent it.
          const ambience = scene.ambience;
          const recommendation = validateAmbience(ambience && Object.hasOwn(ambience, "basis") ? ambience :
            { ...ambience, confidence: ambience?.confidence ?? "high" }, scene.clips);
          this.ambience.configure(recommendation.environment);
          this.update({ mode: "theatre", ambience: { ...this.snapshot.ambience, environment: recommendation.environment } });
        } else {
          if (identity?.contentType === "conversation") throw new Error("La réponse audio ne contient pas les tours de parole attendus.");
          if (identity?.contentType === "theatre") throw new Error("La scène théâtrale reçue est incomplète.");
          const blob = await response.blob();
          if (!current()) return;
          if (!blob.size) throw new Error("La réponse audio est vide.");
          this.theatre.stop();
          this.ordinaryUrl = this.environment.createUrl(blob);
          const audio = this.environment.createAudio(this.ordinaryUrl);
          this.ordinary = audio;
          const finish = (error: string | null) => {
            if (this.ordinary !== audio) return;
            this.releaseOrdinary();
            this.update({ error });
          };
          audio.onended = () => finish(null);
          audio.onerror = () => finish("Erreur de lecture audio.");
          this.update({ mode: "ordinary" });
          if (!this.captures) void audio.play().catch(() => finish("Impossible de lancer la lecture IA."));
        }
      } catch (error) {
        if (!current()) return;
        this.releaseOrdinary();
        if (sessionId !== null) this.theatre.failGeneration(sessionId, "Impossible de charger la lecture IA.");
        this.update({ error: error instanceof Error ? error.message : "Impossible de charger la lecture IA. Réessayez." });
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
