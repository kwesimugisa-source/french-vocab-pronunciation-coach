import type { PlaybackAudio, PlaybackEnvironment, GroupPosition } from "./theatre-playback";

/** One logical media handle, three independently owned sources. Wait for all
 * sources to be ready, then issue play() calls together (not sequential awaits).
 * Any failed component stops the whole group; no partial completion. */
export class ChorusAudio implements PlaybackAudio {
  onended: PlaybackAudio["onended"] = null;
  onerror: PlaybackAudio["onerror"] = null;
  ontimeupdate: PlaybackAudio["ontimeupdate"] = null;
  private sources: { audio: PlaybackAudio; url: string; done: boolean; ready: Promise<void>; settle: () => void }[] = [];
  private disposed = false;
  private playing = false;
  private epoch = 0;

  constructor(parts: readonly { audioBase64: string }[], private env: PlaybackEnvironment) {
    try {
      for (const part of parts) {
        const bytes = Uint8Array.from(atob(part.audioBase64), (c) => c.charCodeAt(0));
        const url = env.createUrl(new Blob([bytes], { type: "audio/mpeg" }));
        let audio: PlaybackAudio;
        try { audio = env.createAudio(url); } catch (error) { env.revokeUrl(url); throw error; }
        let settle!: () => void;
        const ready = new Promise<void>((resolve) => { settle = resolve; });
        const source = { audio, url, done: false, ready, settle };
        this.sources.push(source);
        audio.volume = 1 / parts.length;
        audio.oncanplay = () => { if (!this.disposed) settle(); };
        audio.onended = (event) => {
          if (this.disposed || source.done) return;
          source.done = true;
          if (this.playing && this.ended) { this.playing = false; this.onended?.(event); }
        };
        audio.onerror = (event) => {
          if (this.disposed) return;
          this.pause(); this.onerror?.(event);
        };
        audio.ontimeupdate = (event) => { if (!this.disposed && this.playing) this.ontimeupdate?.(event); };
        // Test media without readyState is ready immediately. Real browser media
        // waits for canplay; preload starts before any voice can be audible.
        audio.preload = "auto";
        if (audio.readyState === undefined || audio.readyState >= 3) settle();
      }
    } catch (error) { this.removeAttribute("src"); throw error; }
  }
  get ended() { return this.sources.every((source) => source.done); }
  get currentTime() { return Math.max(0, ...this.sources.map(({ audio }) => audio.currentTime)); }
  set currentTime(time: number) { this.sources.forEach((source) => { source.audio.currentTime = time; source.done = false; }); }
  capturePosition(): GroupPosition { return this.sources.map(({ audio, done }) => ({ time: audio.currentTime, ended: done })); }
  restorePosition(position: GroupPosition) {
    this.sources.forEach((source, i) => { source.audio.currentTime = position[i].time; source.done = position[i].ended; });
  }
  async play() {
    const epoch = ++this.epoch;
    await Promise.all(this.sources.map((source) => source.ready));
    if (this.disposed || epoch !== this.epoch) return;
    this.playing = true;
    try {
      await Promise.all(this.sources.filter((source) => !source.done).map(({ audio }) => audio.play()));
    } catch (error) {
      if (!this.disposed && epoch === this.epoch) { this.pause(); throw error; }
    }
  }
  pause() { this.epoch++; this.playing = false; this.sources.forEach(({ audio }) => audio.pause()); }
  removeAttribute(_name: string) {
    if (this.disposed) return;
    this.disposed = true; this.pause();
    this.sources.forEach(({ audio, url, settle }) => {
      audio.onended = audio.onerror = audio.ontimeupdate = audio.oncanplay = null;
      audio.removeAttribute("src"); audio.load(); this.env.revokeUrl(url); settle();
    });
  }
  load() { /* release happens atomically in removeAttribute */ }
}
