import type { ContentDocument } from "./content-document";
import { betaContext, betaJournal } from "./beta-events";
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
    const target = {...exerciseTarget(doc, id),contentType:doc.contentType,origin:doc.origin,level:doc.level}, previous = this.snapshot.target;
    if (previous?.documentId !== target.documentId || previous.revision !== target.revision || previous.itemId !== target.itemId) {
      this.playback.stop(); this.pronunciation.reset();
    }
    this.snapshot = { target }; this.listeners.forEach(fn => fn()); return true;
  }
  async listen(doc: ContentDocument, id: string, speed: string) {
    if(this.playback.getSnapshot().mode==="pending") return;
    if (!this.select(doc, id)) return;
    betaJournal.emit({...betaContext(doc,speed),name:"virelangue_listen",status:"started"});
    this.playback.stop();
    // Always request the chosen sentence at the current shared speed. No stale cached-speed audio.
    await this.playback.start(this.snapshot.target!.text, speed, doc);
  }
  record() {
    if (!this.snapshot.target || this.pronunciation.isBusy()) return;
    betaJournal.emit({...betaContext(this.snapshot.target),name:"virelangue_practice",status:"started",contentType:"tongue-twisters"});
    this.playback.stop();
    return this.pronunciation.start(this.snapshot.target);
  }
}
