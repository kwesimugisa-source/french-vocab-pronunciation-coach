import { PronunciationSession } from "./pronunciation-session";
import type { RecordingEnvironment, PronunciationSnapshot } from "./pronunciation-session";
import type { LearnerTurn } from "./theatre-role-play";
import type { TheatreClip } from "./theatre";
import type { TheatrePlaybackController, PlaybackAudio, PlaybackEnvironment } from "./theatre-playback";

type Snapshot = {
  turn: LearnerTurn | null;
  media: "idle" | "loading-model" | "model" | "self";
  recording: PronunciationSnapshot;
  error: string | null;
};

/** Assistance owns resources, never a scene cursor. All actions require the
 * exact held token; asynchronous completions additionally require this epoch. */
export class HeldTurnAssistance {
  readonly pronunciation: PronunciationSession;
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private disposed = false;
  private audio: PlaybackAudio | null = null;
  private url: string | null = null;
  private release: (() => void) | null = null;
  private unsubscribers: (() => void)[];
  constructor(private theatre: TheatrePlaybackController,
    private environment: PlaybackEnvironment,
    private capture: () => (() => void),
    private loadModel: (turn: LearnerTurn) => Promise<TheatreClip>,
    recordingEnvironment?: RecordingEnvironment) {
    this.pronunciation = new PronunciationSession(recordingEnvironment, capture);
    this.snapshot = { turn: theatre.getSnapshot().learnerTurn, media: "idle", recording: this.pronunciation.getSnapshot(), error: null };
    this.unsubscribers = [this.pronunciation.subscribe(() => this.update({ recording: this.pronunciation.getSnapshot() })),
      theatre.subscribe(() => {
        const turn = theatre.getSnapshot().learnerTurn;
        if (turn !== this.snapshot.turn) { this.cancel(); this.update({ turn }); }
      })];
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(fn => fn()); }
  private current(turn: LearnerTurn) { return !this.disposed && this.snapshot.turn === turn && this.theatre.getSnapshot().learnerTurn === turn; }
  private releaseAudio() {
    if (this.audio) {
      this.audio.onended = this.audio.onerror = this.audio.onplaying = null;
      this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.audio = null;
    }
    if (this.url) this.environment.revokeUrl(this.url);
    this.url = null; this.release?.(); this.release = null;
  }
  stopListening(turn: LearnerTurn) {
    if (!this.current(turn)) return;
    this.epoch++; this.releaseAudio(); this.update({ media: "idle", error: null });
  }
  cancel() {
    this.epoch++; this.releaseAudio(); this.pronunciation.reset();
    this.update({ media: "idle", recording: this.pronunciation.getSnapshot(), error: null });
  }
  continue(turn: LearnerTurn) {
    if (!this.current(turn)) return false;
    this.cancel();
    return this.theatre.continueLearner(turn);
  }
  async record(turn: LearnerTurn) {
    if (!this.current(turn) || this.pronunciation.isBusy()) return;
    this.stopListening(turn);
    await this.pronunciation.start({ text: turn.text, itemId: turn.itemId, speaker: turn.speaker,
      sessionId: turn.run.sessionId, documentId: turn.run.documentId, revision: turn.run.revision, contentType: "theatre" });
  }
  stopRecording(turn: LearnerTurn) { if (this.current(turn)) this.pronunciation.stop(); }
  async analyze(turn: LearnerTurn) {
    if (!this.current(turn) || this.pronunciation.isBusy()) return;
    this.stopListening(turn); await this.pronunciation.analyze();
  }
  private async play(turn: LearnerTurn, epoch: number, blob: Blob, media: "model" | "self") {
    if (!this.current(turn) || epoch !== this.epoch) return;
    this.url = this.environment.createUrl(blob);
    const audio = this.environment.createAudio(this.url); this.audio = audio;
    const finish = (error: string | null = null) => {
      if (!this.current(turn) || epoch !== this.epoch || this.audio !== audio) return;
      this.releaseAudio(); this.update({ media: "idle", error });
    };
    audio.onended = () => finish();
    audio.onerror = () => finish("Lecture impossible. Réessayez l’écoute.");
    this.update({ media });
    try { await audio.play(); } catch { finish("Lecture bloquée ou indisponible. Appuyez de nouveau sur Écouter."); }
  }
  async listen(turn: LearnerTurn, source: "model" | "self") {
    if (!this.current(turn) || this.pronunciation.isBusy() || this.snapshot.media !== "idle") return;
    const recording = this.pronunciation.getSnapshot().recording;
    if (source === "self" && !recording) return;
    const epoch = ++this.epoch;
    this.release = this.capture();
    this.update({ media: source === "model" ? "loading-model" : "self", error: null });
    try {
      if (source === "self") await this.play(turn, epoch, recording!.blob, "self");
      else {
        const clip = await this.loadModel(turn);
        if (!this.current(turn) || epoch !== this.epoch) return;
        const bytes = Uint8Array.from(atob(clip.audioBase64), char => char.charCodeAt(0));
        await this.play(turn, epoch, new Blob([bytes], { type: "audio/mpeg" }), "model");
      }
    } catch {
      if (this.current(turn) && epoch === this.epoch) {
        this.releaseAudio(); this.update({ media: "idle", error: "Écoute indisponible. Réessayez ou continuez la scène." });
      }
    }
  }
  dispose() { this.disposed = true; this.unsubscribers.forEach(fn => fn()); this.cancel(); this.pronunciation.dispose(); this.listeners.clear(); }
}
