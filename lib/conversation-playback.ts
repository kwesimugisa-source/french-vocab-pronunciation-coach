import { assertConversationResponse } from "./conversation";
import type { ConversationClip } from "./conversation";
import type { PlaybackAudio, PlaybackEnvironment } from "./theatre-playback";

/** Conversation-only sequential player. No scene, practice, chorus or ambience.
 * Audio ownership plus generation tokens reject duplicate and late callbacks. */
export class ConversationPlayback {
  private epoch = 0;
  private audio: PlaybackAudio | null = null;
  private url: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private snapshot = { busy: false, playedIds: [] as string[], error: null as string | null };
  constructor(private env: PlaybackEnvironment, private changed: () => void) {}
  getSnapshot = () => this.snapshot;
  private update(patch: Partial<typeof this.snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.changed(); }
  private release() {
    if (this.timer !== undefined) this.env.clearTimer(this.timer);
    this.timer = undefined;
    if (this.audio) {
      this.audio.onended = this.audio.onerror = this.audio.ontimeupdate = null;
      this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.audio = null;
    }
    if (this.url) this.env.revokeUrl(this.url);
    this.url = null;
  }
  stop() { this.epoch++; this.release(); this.update({ busy: false, playedIds: [], error: null }); }
  accept(value: unknown, text: string, speed: number) {
    assertConversationResponse(value, text, speed);
    this.stop();
    const epoch = this.epoch, clips = value.clips;
    this.update({ busy: true });
    this.play(clips, 0, epoch);
  }
  private play(clips: ConversationClip[], index: number, epoch: number) {
    if (epoch !== this.epoch) return;
    if (index === clips.length) { this.update({ busy: false }); return; }
    const fail = () => {
      if (epoch !== this.epoch) return;
      this.epoch++; this.release();
      this.update({ busy: false, error: `Erreur audio au tour ${index + 1}. La conversation est arrêtée ; relancez la lecture pour réessayer.` });
    };
    try {
      const clip = clips[index];
      const bytes = Uint8Array.from(atob(clip.audioBase64), char => char.charCodeAt(0));
      this.url = this.env.createUrl(new Blob([bytes], { type: "audio/mpeg" }));
      const audio = this.env.createAudio(this.url); this.audio = audio;
      const current = () => epoch === this.epoch && this.audio === audio;
      const arm = () => {
        if (this.timer !== undefined) this.env.clearTimer(this.timer);
        this.timer = this.env.setTimer(() => { if (current()) fail(); }, 45_000);
      };
      let lastTime = 0;
      audio.ontimeupdate = () => { if (current() && audio.currentTime > lastTime) { lastTime = audio.currentTime; arm(); } };
      audio.onerror = () => { if (current()) fail(); };
      audio.onended = () => {
        if (!current()) return;
        this.release();
        this.update({ playedIds: [...this.snapshot.playedIds, clip.id] });
        this.play(clips, index + 1, epoch);
      };
      arm();
      void audio.play().catch(() => { if (current()) fail(); });
    } catch { fail(); }
  }
}
