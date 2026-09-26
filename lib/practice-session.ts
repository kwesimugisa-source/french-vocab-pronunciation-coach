import type { ContentDocument } from "./content-document";
import { practiceTarget, practiceUnits, supportsUniversalPractice, PracticeUnit } from "./practice-units";
import type { ReadingPlaybackSession } from "./reading-playback";
import type { PronunciationSession } from "./pronunciation-session";

type Snapshot = { active: boolean; units: PracticeUnit[]; selected: PracticeUnit | null; error: string | null };
/** Shared learner orchestration only. Existing controllers own cancellation,
 * microphone tracks, audio URLs and analysis epochs; no second scoring engine. */
export class PracticeSession {
  private document: ContentDocument | null = null;
  private snapshot: Snapshot = { active: false, units: [], selected: null, error: null };
  private listeners = new Set<() => void>();
  constructor(private playback: ReadingPlaybackSession, private pronunciation: PronunciationSession) {}
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private update(patch: Partial<Snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(fn => fn()); }
  clear() {
    this.playback.stop(); this.pronunciation.reset(); this.document = null;
    this.update({ active: false, units: [], selected: null, error: null });
  }
  enter(doc: ContentDocument) {
    this.clear();
    if (!supportsUniversalPractice(doc.contentType)) return;
    try {
      const units = practiceUnits(doc);
      this.document = doc;
      this.update({ active: true, units, selected: units[0] ?? null });
    } catch { this.update({ error: "Impossible de préparer les unités de ce texte. Vérifiez sa structure." }); }
  }
  select(id: string) {
    const selected = this.snapshot.units.find(unit => unit.id === id);
    if (!selected || !this.snapshot.active) return false;
    if (this.snapshot.selected?.id !== id) {
      // Cancel even pending microphone permissions and ignored abort responses.
      this.playback.stop(); this.pronunciation.reset();
      this.update({ selected });
    }
    return true;
  }
  async listen(speed: string) {
    const doc = this.document, unit = this.snapshot.selected;
    if (!doc || !unit || this.pronunciation.isBusy() || this.playback.getSnapshot().mode === "pending") return;
    this.playback.stop();
    await this.playback.start(doc.contentType === "conversation" ? doc.text : unit.text, speed, doc,
      doc.contentType === "conversation" ? unit.id : undefined);
  }
  record() {
    if (!this.document || !this.snapshot.selected || this.pronunciation.isBusy()) return;
    this.playback.stop();
    return this.pronunciation.start(practiceTarget(this.document, this.snapshot.selected));
  }
}
