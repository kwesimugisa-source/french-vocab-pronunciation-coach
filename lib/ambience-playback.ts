import type { PlaybackAudio, PlaybackEnvironment } from "./theatre-playback";
import { localAmbienceProvider } from "./theatre-ambience";
import type { AmbienceKind, AmbienceProvider } from "./theatre-ambience";
import { environmentAudioEntry } from "./semantic-audio";
export type AmbienceLevel = "off" | "low" | "medium";
const volume = { off: 0, low: 0.5, medium: 1 };

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
  private resolving = false;
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
        if (this.resolving) return;
        const result = this.provider(this.kind);
        if (result instanceof Promise) {
          const epoch = ++this.epoch; this.resolving = true;
          void result.then(blob => {
            if (epoch !== this.epoch) return;
            this.resolving = false;
            try { if (this.install(blob)) this.sync(); } catch { this.fail(); }
          }).catch(() => { if (epoch === this.epoch) this.fail(); });
          return;
        }
        if (!this.install(result)) return;
      }
      this.audio!.volume = volume[this.level] * (environmentAudioEntry(this.kind)?.defaultGain ?? 0.16);
      if (this.running) return;
      const epoch = ++this.epoch;
      this.running = true;
      void this.audio!.play().then(() => { if(epoch===this.epoch) this.onPlaying(); }).catch(() => { if (epoch === this.epoch) this.fail(); });
    } catch { this.fail(); }
  }
  private install(blob: Blob | null): boolean {
    if (!blob) { this.fail(); return false; }
    this.url = this.env.createUrl(blob); this.audio = this.env.createAudio(this.url);
    this.audio.loop = environmentAudioEntry(this.kind)?.loop ?? true;
    const audio = this.audio;
    audio.onerror = () => { if (this.audio === audio) this.fail(); };
    return true;
  }
  private fail() { this.failed = true; this.release(); this.onFailure(); }
  private release() {
    this.epoch++; this.running = false; this.resolving = false;
    if (this.audio) {
      this.audio.onended = this.audio.onerror = this.audio.ontimeupdate = null;
      this.audio.volume = 0; this.audio.pause(); this.audio.removeAttribute("src"); this.audio.load(); this.audio = null;
    }
    if (this.url) this.env.revokeUrl(this.url);
    this.url = null;
  }
  stop() { this.active = false; this.kind = "none"; this.failed = false; this.release(); }
}
