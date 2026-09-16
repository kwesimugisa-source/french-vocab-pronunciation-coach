import { browserPlaybackEnvironment, TheatrePlaybackController } from "./theatre-playback";
import type { PlaybackAudio, PlaybackEnvironment, TheatrePlaybackSnapshot } from "./theatre-playback";
import { AmbiencePlayback } from "./ambience-playback";
import type { AmbienceLevel } from "./ambience-playback";
import { validateAmbience } from "./theatre-ambience";
import type { AmbienceKind, AmbienceProvider } from "./theatre-ambience";
import type { TheatreResponse } from "./theatre";

type ReadingSnapshot = {
  mode: "pending" | "theatre" | "ordinary" | null;
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
  private request: AbortController | null = null;
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
      busy: !!this.request || !!this.ordinary || !!theatre.practiceTarget ||
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
    request?.abort();
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

  async start(text: string, speed: string) {
    if (this.snapshot.busy || this.captures) return;
    this.stop();
    const request = new AbortController();
    this.request = request;
    this.update({ mode: "pending", error: null });
    const sessionId = this.theatre.beginLoading();
    const current = () => this.request === request && !request.signal.aborted;
    const run = async () => {
      try {
        const response = await this.fetchAudio("/api/read-passage", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, speed }), signal: request.signal,
        });
        if (!current()) return;
        if (!response.ok) throw new Error("Échec de la génération audio.");
        if ((response.headers.get("Content-Type") || "").includes("application/json")) {
          const data: unknown = await response.json();
          if (!current()) return;
          this.theatre.acceptScene(sessionId, data, text);
          const scene = data as TheatreResponse;
          const recommendation = validateAmbience({ ...scene.ambience, confidence: "high" }, scene.clips);
          this.ambience.configure(recommendation.environment);
          this.update({ mode: "theatre", ambience: { ...this.snapshot.ambience, environment: recommendation.environment } });
        } else {
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
      } catch {
        if (!current()) return;
        this.releaseOrdinary();
        this.theatre.failGeneration(sessionId, "Impossible de charger la lecture IA.");
        this.update({ error: "Impossible de charger la lecture IA. Réessayez." });
      } finally {
        if (this.request === request) { this.request = null; this.update({}); }
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
