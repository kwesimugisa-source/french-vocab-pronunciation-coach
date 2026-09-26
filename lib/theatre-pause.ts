import type { PlaybackAudio, PlaybackEnvironment } from "./theatre-playback";

/** A timed logical item, not an empty audio file. Uses the same pause/replay/
 * stale-event lifecycle as media; duration is independent of speech speed. */
export class TheatrePause implements PlaybackAudio {
  currentTime = 0;
  ended = false;
  onended: PlaybackAudio["onended"] = null;
  onerror: PlaybackAudio["onerror"] = null;
  ontimeupdate: PlaybackAudio["ontimeupdate"] = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = 0;
  private epoch = 0;
  constructor(private durationMs: number, private env: PlaybackEnvironment) {}
  get duration() { return this.durationMs/1000; }
  play() {
    if(this.timer !== null) return Promise.resolve();
    const epoch=++this.epoch;
    this.started=Date.now();
    this.timer=this.env.setTimer(()=>{
      if(epoch!==this.epoch) return;
      this.timer=null; this.currentTime=this.durationMs/1000; this.ended=true;
      this.onended?.(new Event("ended"));
    }, Math.max(0,this.durationMs-this.currentTime*1000));
    return Promise.resolve();
  }
  pause() {
    this.epoch++;
    if(this.timer!==null) {
      this.currentTime=Math.min(this.durationMs/1000,this.currentTime+(Date.now()-this.started)/1000);
      this.env.clearTimer(this.timer); this.timer=null;
    }
  }
  removeAttribute() { this.pause(); }
  load() {}
}
