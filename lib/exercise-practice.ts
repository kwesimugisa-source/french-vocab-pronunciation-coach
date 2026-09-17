import type { ContentDocument } from "./content-document";
import type { ReadingPlaybackSession } from "./reading-playback";
import type { PronunciationSession, PronunciationTarget } from "./pronunciation-session";
import { exerciseTarget } from "./tongue-twisters";

/** Selection and orchestration only. No theatre queue, scoring engine or audio cache. */
export class ExercisePracticeSession {
  private snapshot: { target: PronunciationTarget | null } = { target: null };
  private listeners = new Set<() => void>();
  constructor(private playback: ReadingPlaybackSession, private pronunciation: PronunciationSession) {}
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  clear() { this.playback.stop(); this.pronunciation.reset(); this.snapshot = { target: null }; this.listeners.forEach(fn => fn()); }
  select(doc: ContentDocument, id: string) {
    if (this.pronunciation.isBusy()) return false;
    const target = exerciseTarget(doc, id), previous = this.snapshot.target;
    if (previous?.documentId !== target.documentId || previous.revision !== target.revision || previous.itemId !== target.itemId) {
      this.playback.stop(); this.pronunciation.reset();
    }
    this.snapshot = { target }; this.listeners.forEach(fn => fn()); return true;
  }
  async listen(doc: ContentDocument, id: string, speed: string) {
    if (!this.select(doc, id)) return;
    this.playback.stop();
    // Always request the chosen sentence at the current shared speed. No stale cached-speed audio.
    await this.playback.start(this.snapshot.target!.text, speed, doc);
  }
  record() {
    if (!this.snapshot.target || this.pronunciation.isBusy()) return;
    this.playback.stop();
    return this.pronunciation.start(this.snapshot.target);
  }
}
