import type { PlaybackAudio, PlaybackEnvironment, GroupPosition } from "./theatre-playback";
import { CHORUS_START_LEAD, planChorusTiming } from "./chorus-timing";
import type { ChorusTiming } from "./chorus-timing";

export type ChorusContext = Pick<AudioContext, "currentTime" | "state" | "destination" | "onstatechange" |
  "decodeAudioData" | "createBufferSource" | "createGain" | "resume" | "close">;
type Part = { audioBase64: string };
type Prepared = { buffers: AudioBuffer[]; timing: ChorusTiming[] };
export type ChorusBufferCache = Map<readonly Part[], Promise<Prepared>>;
type Voice = { node: AudioBufferSourceNode; gain: GainNode; index: number; when: number; offset: number };

/** Chorus-only decoded playback. Every attempt uses one clock and three distinct
 * sources. One-shot nodes are recreated; decoded buffers remain scene-cached. */
export class SynchronizedChorus implements PlaybackAudio {
  onended: PlaybackAudio["onended"] = null;
  onerror: PlaybackAudio["onerror"] = null;
  ontimeupdate: PlaybackAudio["ontimeupdate"] = null;
  private context: ChorusContext;
  private prepared: Prepared | null = null;
  private ready: Promise<Prepared>;
  private voices: Voice[] = [];
  private positions: GroupPosition;
  private initialized = false;
  private disposed = false;
  private playing = false;
  private epoch = 0;
  private tick: ReturnType<typeof setTimeout> | null = null;

  constructor(parts: readonly Part[], private env: PlaybackEnvironment, cache: ChorusBufferCache) {
    this.positions = parts.map(() => ({ time: 0, ended: false }));
    this.context = env.createChorusContext!();
    this.context.onstatechange = () => {
      if (this.playing && this.context.state !== "running") { this.pause(); this.onerror?.(new Event("error")); }
    };
    let ready = cache.get(parts);
    if (!ready) {
      ready = Promise.all(parts.map(part => Promise.resolve().then(() => {
        const bytes = Uint8Array.from(atob(part.audioBase64), c => c.charCodeAt(0));
        return this.context.decodeAudioData(bytes.buffer);
      }))).then(buffers => ({ buffers, timing: planChorusTiming(buffers) }));
      cache.set(parts, ready);
      const pending = ready;
      void ready.catch(() => { if (cache.get(parts) === pending) cache.delete(parts); });
    }
    this.ready = ready;
    // Observe rejection even if paused/disposed before the first play call.
    void this.ready.catch(() => {});
  }
  get ended() { return this.positions.every(p => p.ended); }
  get currentTime() { return this.capturePosition().reduce((sum,p) => sum + p.time, 0) / this.positions.length; }
  set currentTime(time: number) {
    this.pause();
    this.initialized = time !== 0;
    this.positions = this.positions.map(() => ({ time, ended: false }));
  }
  capturePosition(): GroupPosition {
    const result = this.positions.map(p => ({ ...p }));
    if (this.prepared && this.playing) for (const voice of this.voices) {
      const elapsed = Math.max(0, this.context.currentTime - voice.when);
      result[voice.index].time = Math.min(this.prepared.buffers[voice.index].duration,
        voice.offset + elapsed * this.prepared.timing[voice.index].rate);
      result[voice.index].delay = Math.max(0, voice.when - this.context.currentTime);
    }
    return result;
  }
  restorePosition(position: GroupPosition) {
    this.pause(); this.positions = position.map(p => ({ ...p })); this.initialized = true;
  }
  async play() {
    if (this.disposed || this.playing) return;
    const epoch = ++this.epoch;
    try {
      // Request activation immediately; decoding and activation are both barriers.
      const [prepared] = await Promise.all([this.ready, this.context.resume()]);
      if (this.disposed || epoch !== this.epoch) return;
      if (this.context.state !== "running") throw new Error("Chorus context unavailable");
      this.prepared = prepared;
      if (!this.initialized) {
        this.positions = prepared.timing.map(t => ({ time: t.offset, ended: false, delay: t.delay }));
        this.initialized = true;
      }
      this.playing = true;
      // Create/connect every source BEFORE scheduling any. All scheduling calls
      // use this single future clock anchor, never sequential media play promises.
      const anchor = this.context.currentTime + CHORUS_START_LEAD;
      for (let index = 0; index < prepared.buffers.length; index++) {
        const position = this.positions[index];
        if (position.ended) continue;
        if (position.time >= prepared.buffers[index].duration) { position.ended = true; continue; }
        const node = this.context.createBufferSource();
        let gain: GainNode;
        try { gain = this.context.createGain(); }
        catch (error) { node.disconnect(); throw error; }
        const voice = { node, gain, index, offset: position.time,
          when: anchor + (position.delay ?? 0) };
        this.voices.push(voice);
        node.buffer = prepared.buffers[index]; node.playbackRate.value = prepared.timing[index].rate;
        gain.gain.value = 1 / prepared.buffers.length;
        node.connect(gain); gain.connect(this.context.destination);
        node.onended = () => {
          if (this.disposed || epoch !== this.epoch || !this.playing || position.ended) return;
          position.time = prepared.buffers[index].duration; position.ended = true;
          if (this.ended) { this.playing = false; this.clearTick(); this.onended?.(new Event("ended")); }
        };
      }
      for (const voice of this.voices) voice.node.start(voice.when, voice.offset);
      if (this.ended) { this.playing = false; this.onended?.(new Event("ended")); return; }
      this.progress(epoch);
    } catch (error) {
      if (!this.disposed && epoch === this.epoch) { this.pause(); throw error; }
    }
  }
  private clearTick() { if (this.tick !== null) this.env.clearTimer(this.tick); this.tick = null; }
  private progress(epoch: number) {
    this.tick = this.env.setTimer(() => {
      if (this.disposed || epoch !== this.epoch || !this.playing) return;
      this.ontimeupdate?.(new Event("timeupdate"));
      if (!this.disposed && epoch === this.epoch && this.playing) this.progress(epoch);
    }, 200);
  }
  pause() {
    this.positions = this.capturePosition();
    this.epoch++; this.playing = false; this.clearTick();
    for (const {node, gain} of this.voices) {
      gain.gain.value = 0; node.onended = null;
      try { node.stop(); } catch { /* an already-ended source is harmless */ }
      node.disconnect(); gain.disconnect(); node.buffer = null;
    }
    this.voices = [];
  }
  removeAttribute(_name: string) {
    if (this.disposed) return;
    this.pause(); this.disposed = true; this.prepared = null;
    this.context.onstatechange = null;
    try { void this.context.close().catch(() => {}); } catch { /* already unavailable */ }
  }
  load() { /* no Object URLs are allocated for decoded chorus buffers */ }
}
