import type { PlaybackAudio, PlaybackEnvironment } from "./theatre-playback";
import { localAmbienceProvider } from "./theatre-ambience";
import type { AmbienceKind, AmbienceProvider } from "./theatre-ambience";
export type AmbienceLevel = "off" | "low" | "medium";
const volume = { off: 0, low: 0.08, medium: 0.16 };

/** Independent scene loop. No queue cursor and no authority to advance speech. */
export class AmbiencePlayback {
  private audio: PlaybackAudio | null = null;
  private url: string | null = null;
  private kind: AmbienceKind = "none";
  private level: AmbienceLevel = "off";
  private active = false;
  private muted = false;
  private running = false;
  private failed = false;
  private epoch = 0;
  constructor(private env: PlaybackEnvironment, private provider: AmbienceProvider = localAmbienceProvider,
    private onFailure: () => void = () => {}, private onPlaying: () => void = () => {}) {}
  configure(kind: AmbienceKind) { this.release(); this.kind = kind; this.failed = false; this.sync(); }
  setLevel(level: AmbienceLevel) {
    if (!(level in volume)) return;
    this.level = level;
    if (level === "off") { this.release(); this.failed = false; }
    this.sync();
  }
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) this.release();
    this.sync();
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted && this.audio) { this.epoch++; this.audio.volume = 0; this.audio.pause(); this.running = false; }
    this.sync();
  }
  private sync() {
    if (!this.active || this.muted || this.level === "off" || this.kind === "none" || this.failed) return;
    try {
      if (!this.audio) {
        const blob = this.provider(this.kind);
        if (!blob) { this.fail(); return; }
        this.url = this.env.createUrl(blob); this.audio = this.env.createAudio(this.url);
        this.audio.loop = true;
        const audio = this.audio;
        audio.onerror = () => { if (this.audio === audio) this.fail(); };
      }
      this.audio.volume = volume[this.level];
      if (this.running) return;
      const epoch = ++this.epoch;
      this.running = true;
      void this.audio.play().then(() => { if(epoch===this.epoch) this.onPlaying(); }).catch(() => { if (epoch === this.epoch) this.fail(); });
    } catch { this.fail(); }
  }
  private fail() { this.failed = true; this.release(); this.onFailure(); }
  private release() {
    this.epoch++; this.running = false;
    if (this.audio) {
      this.audio.onended = this.audio.onerror = this.audio.ontimeupdate = null;
      this.audio.volume = 0; this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.audio = null;
    }
    if (this.url) this.env.revokeUrl(this.url);
    this.url = null;
  }
  stop() { this.active = false; this.kind = "none"; this.failed = false; this.release(); }
}
