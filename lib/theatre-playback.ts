import { assertTheatreManifest, ClipPreparationError } from "./theatre-incremental";
import { assertCompleteTheatreResponse, parseTheatreItems } from "./theatre";
import type { TheatreClip } from "./theatre";
import { ChorusAudio } from "./chorus-audio";
import { SynchronizedChorus } from "./synchronized-chorus";
import type { ChorusContext, ChorusBufferCache } from "./synchronized-chorus";
import { isChorusSpeaker } from "./theatre-speakers";

export type PlaybackState = "idle" | "loading" | "buffering" | "playing" | "paused" | "replaying" | "practising" | "completed" | "error";
export type PracticeTarget = {
  sessionId: number;
  itemId: string;
  index: number;
  speaker: string;
  text: string;
};
export type TheatrePlaybackSnapshot = {
  sessionId: number;
  status: PlaybackState;
  queue: readonly TheatreClip[];
  currentIndex: number;
  currentItemId: string | null;
  automaticAdvancement: boolean;
  practiceTarget: PracticeTarget | null;
  modelPlaying: boolean;
  modelPaused: boolean;
  completions: readonly { itemId: string; via: "audio" | "practice" }[];
  error: { itemId: string | null; index: number; message: string } | null;
};

// Narrow browser boundary allows deterministic media tests without a real device.
export type GroupPosition = { time: number; ended: boolean; delay?: number }[];
export type PlaybackAudio = {
  volume?: number;
  loop?: boolean;
  preload?: string;
  readyState?: number;
  oncanplay?: ((event: Event) => unknown) | null;
  capturePosition?(): GroupPosition;
  restorePosition?(position: GroupPosition): void;
  currentTime: number;
  ended: boolean;
  onended: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  ontimeupdate: ((event: Event) => unknown) | null;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: string): void;
  load(): void;
};
export type PlaybackEnvironment = {
  createChorusContext?(): ChorusContext;
  createAudio(url: string): PlaybackAudio;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  setTimer(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
};

export const browserPlaybackEnvironment: PlaybackEnvironment = {
  createChorusContext: () => new AudioContext(),
  createAudio: (url) => { if(typeof Audio === "undefined") throw new Error("La lecture audio n’est pas disponible dans ce navigateur."); return new Audio(url); },
  createUrl: (blob) => URL.createObjectURL(blob),
  revokeUrl: (url) => URL.revokeObjectURL(url),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (timer) => clearTimeout(timer),
};

const initialSnapshot = (sessionId: number): TheatrePlaybackSnapshot => ({
  sessionId, status: "idle", queue: [], currentIndex: -1, currentItemId: null,
  automaticAdvancement: false, practiceTarget: null, modelPlaying: false, modelPaused: false,
  completions: [], error: null,
});

export function canPractise(clip: TheatreClip): boolean {
  return clip.type === "dialogue" && !isChorusSpeaker(clip.speaker);
}

/** Session-owned, event-driven playback. No suspended per-clip promise loops. */
export class TheatrePlaybackController {
  private snapshot = initialSnapshot(0);
  private listeners = new Set<() => void>();
  private audio: PlaybackAudio | null = null;
  private url: string | null = null;
  private attempt = 0;
  private playCall = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerEpoch = 0;
  private pausedMode: "playing" | "replaying" = "playing";
  private bookmark: { index: number; position: number | GroupPosition; status: PlaybackState } | null = null;
  private captureBlocked = false;
  private loadClip: ((index: number) => Promise<TheatreClip>) | null = null;
  private pendingMode: "playing" | "replaying" | "practising" = "playing";
  private chorusCache: ChorusBufferCache = new Map();

  constructor(private environment: PlaybackEnvironment = browserPlaybackEnvironment) {}
  setCaptureBlocked(blocked: boolean) { this.captureBlocked = blocked; if (blocked) this.pause(); }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<TheatrePlaybackSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private clearWatchdog() {
    this.timerEpoch++;
    if (this.timer !== null) this.environment.clearTimer(this.timer);
    this.timer = null;
  }
  private releaseAudio() {
    this.attempt++;
    this.playCall++;
    this.clearWatchdog();
    if (this.audio) {
      this.audio.onended = this.audio.onerror = this.audio.ontimeupdate = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.url) this.environment.revokeUrl(this.url);
    this.url = null;
  }

  stop() {
    this.loadClip = null;
    this.releaseAudio();
    this.chorusCache.clear();
    this.bookmark = null;
    this.snapshot = initialSnapshot(this.snapshot.sessionId + 1);
    this.update({});
  }
  dispose() { this.stop(); this.listeners.clear(); }
  beginLoading() {
    this.stop();
    this.update({ status: "loading" });
    return this.snapshot.sessionId;
  }
  failGeneration(sessionId: number, message: string) {
    if (sessionId !== this.snapshot.sessionId) return;
    this.update({ status: "error", error: { itemId: null, index: -1, message } });
  }
  acceptScene(sessionId: number, data: unknown, sourceText: string) {
    if (sessionId !== this.snapshot.sessionId || this.snapshot.status !== "loading") return false;
    assertCompleteTheatreResponse(data, parseTheatreItems(sourceText));
    this.update({ queue: data.clips, currentIndex: data.clips.length ? 0 : -1 });
    if (!data.clips.length) this.update({ status: "completed" });
    else this.playItem(0, "playing");
    return true;
  }

  acceptIncremental(sessionId: number, data: unknown, source: string, loadClip: (index: number) => Promise<TheatreClip>) {
    if (sessionId !== this.snapshot.sessionId || this.snapshot.status !== "loading") return false;
    assertTheatreManifest(data, source);
    this.loadClip = loadClip;
    this.update({queue:data.clips,currentIndex:data.clips.length?0:-1});
    if(data.clips.length) this.playItem(0,"playing");
    else this.update({status:"completed"});
    return true;
  }
  private storeClip(index: number, clip: TheatreClip) {
    const expected=this.snapshot.queue[index];
    assertCompleteTheatreResponse({mode:"theatre",integrity:{version:1,parsedItemCount:1,expectedItemIds:[expected.id],generatedClipCount:1},clips:[clip]},[expected]);
    this.update({queue:this.snapshot.queue.map((c,i)=>i===index?clip:c)});
  }
  private prefetch(index: number) {
    const loader=this.loadClip, session=this.snapshot.sessionId;
    if(!loader) return;
    for(let i=index+1;i<=Math.min(index+2,this.snapshot.queue.length-1);i++) {
      if(this.snapshot.queue[i].audioBase64) continue;
      void loader(i).then(clip=>{
        if(session===this.snapshot.sessionId && loader===this.loadClip) this.storeClip(i,clip);
      }).catch(()=>{}); // Required playback retries the missing item, never skips it.
    }
  }

  private fail(item: TheatreClip, message: string) {
    this.releaseAudio();
    this.update({ status: "error", automaticAdvancement: false, modelPlaying: false, modelPaused: false,
      error: { itemId: item.id, index: item.index, message } });
  }
  private armWatchdog(item: TheatreClip, attempt: number) {
    this.clearWatchdog();
    const timerEpoch = this.timerEpoch;
    this.timer = this.environment.setTimer(() => {
      if (attempt === this.attempt && timerEpoch === this.timerEpoch) {
        this.fail(item, "La lecture ne progresse plus. Réessayez cet élément.");
      }
    }, 30_000);
  }
  private invokePlay(item: TheatreClip) {
    const audio = this.audio!;
    const attempt = this.attempt;
    const call = ++this.playCall;
    this.armWatchdog(item, attempt);
    try {
      void audio.play().catch(() => {
        if (attempt === this.attempt && call === this.playCall) {
          this.fail(item, "Impossible de lire cet élément. Réessayez sa lecture.");
        }
      });
    } catch {
      if (attempt === this.attempt) this.fail(item, "Impossible de lire cet élément.");
    }
  }
  private recordCompletion(item: TheatreClip, via: "audio" | "practice") {
    if (!this.snapshot.completions.some((entry) => entry.itemId === item.id)) {
      this.update({ completions: [...this.snapshot.completions, { itemId: item.id, via }] });
    }
  }
  private advance(index: number, via: "audio" | "practice") {
    const item = this.snapshot.queue[index];
    this.recordCompletion(item, via);
    if (index + 1 < this.snapshot.queue.length) this.playItem(index + 1, "playing");
    else {
      this.releaseAudio();
      this.update({ status: "completed", automaticAdvancement: false, modelPlaying: false,
        currentIndex: index, currentItemId: item.id });
    }
  }
  private playItem(index: number, mode: "playing" | "replaying" | "practising", position: number | GroupPosition = 0, startPaused = false) {
    startPaused = startPaused || this.captureBlocked;
    this.releaseAudio();
    const item = this.snapshot.queue[index];
    const attempt = this.attempt;
    if(!item.audioBase64 && this.loadClip) {
      this.pendingMode=mode;
      this.pausedMode=mode==="replaying"?"replaying":"playing";
      this.update({status:mode==="practising"?"practising":startPaused?"paused":"buffering",error:null,
        modelPlaying:mode==="practising"&&!startPaused,modelPaused:mode==="practising"&&startPaused,automaticAdvancement:!startPaused && mode!=="practising",
        ...(mode!=="practising"?{currentIndex:index,currentItemId:item.id}:{})});
      void this.loadClip(index).then(clip=>{
        if(attempt!==this.attempt) return;
        const paused=this.snapshot.status==="paused" || this.snapshot.modelPaused;
        this.storeClip(index,clip);
        this.playItem(index,mode,position,paused);
      }).catch(error=>{if(attempt===this.attempt) this.fail(item,error instanceof ClipPreparationError ? error.message : "Préparation interrompue. Réessayez cet élément; les passages prêts sont conservés.");});
      return;
    }
    this.update({ status: mode === "practising" ? "practising" : startPaused ? "paused" : mode, error: null, modelPlaying: mode === "practising" && !startPaused, modelPaused: mode === "practising" && startPaused,
      automaticAdvancement: !startPaused && mode !== "practising",
      ...(mode !== "practising" ? { currentIndex: index, currentItemId: item.id } : {}) });
    try {
      let audio: PlaybackAudio;
      if (item.chorus) audio = this.environment.createChorusContext
        ? new SynchronizedChorus(item.chorus.components, this.environment, this.chorusCache)
        : new ChorusAudio(item.chorus.components, this.environment);
      else {
        const bytes = Uint8Array.from(atob(item.audioBase64), (char) => char.charCodeAt(0));
        this.url = this.environment.createUrl(new Blob([bytes], { type: "audio/mpeg" }));
        audio = this.environment.createAudio(this.url);
      }
      this.audio = audio;
      if (typeof position === "number") audio.currentTime = position;
      else audio.restorePosition?.(position);
      let lastPosition = audio.currentTime;
      audio.ontimeupdate = () => {
        if (attempt !== this.attempt || this.snapshot.status === "paused" || this.snapshot.modelPaused) return;
        if (audio.currentTime > lastPosition) {
          lastPosition = audio.currentTime;
          this.armWatchdog(item, attempt);
        }
      };
      audio.onerror = () => {
        if (attempt === this.attempt) this.fail(item, "Erreur audio sur cet élément.");
      };
      audio.onended = () => {
        if (attempt !== this.attempt || this.snapshot.status === "paused" || this.snapshot.modelPaused) return;
        this.releaseAudio(); // Invalidate this attempt before any advancement.
        if (mode === "practising") this.update({ status: "practising", modelPlaying: false });
        else if (this.snapshot.automaticAdvancement) this.advance(index, "audio");
      };
      if (startPaused) this.pausedMode = mode === "replaying" ? "replaying" : "playing";
      else this.invokePlay(item);
      if(mode!=="practising") this.prefetch(index);
    } catch {
      this.fail(item, "Audio invalide pour cet élément.");
    }
  }
  pause() {
    if(!this.audio && this.snapshot.status==="buffering") {
      this.update({status:"paused",automaticAdvancement:false});return;
    }
    if(!this.audio && this.snapshot.practiceTarget && this.snapshot.modelPlaying) {
      this.update({modelPlaying:false,modelPaused:true});return;
    }
    if (this.snapshot.practiceTarget) {
      if (!this.audio || !this.snapshot.modelPlaying) return;
      this.playCall++;
      this.clearWatchdog();
      this.audio.pause();
      this.update({ modelPlaying: false, modelPaused: true });
      return;
    }
    if (!this.audio || !["playing", "replaying"].includes(this.snapshot.status)) return;
    this.pausedMode = this.snapshot.status as "playing" | "replaying";
    this.playCall++;
    this.clearWatchdog();
    this.audio.pause();
    this.update({ status: "paused", automaticAdvancement: false });
  }
  resume() {
    if (this.captureBlocked) return;
    if(this.snapshot.practiceTarget && this.snapshot.modelPaused && !this.audio) {
      this.playItem(this.snapshot.practiceTarget.index,"practising");return;
    }
    if (this.snapshot.practiceTarget && this.snapshot.modelPaused && this.audio) {
      this.update({ modelPlaying: true, modelPaused: false });
      if (this.audio.ended) this.audio.onended?.(new Event("ended"));
      else this.invokePlay(this.snapshot.queue[this.snapshot.practiceTarget.index]);
      return;
    }
    if(this.snapshot.status==="paused" && !this.audio) {
      this.playItem(this.snapshot.currentIndex,this.pendingMode);return;
    }
    if (this.snapshot.status !== "paused" || !this.audio) return;
    this.update({ status: this.pausedMode, automaticAdvancement: true });
    if (this.audio.ended) this.audio.onended?.(new Event("ended"));
    else this.invokePlay(this.snapshot.queue[this.snapshot.currentIndex]);
  }
  replay() {
    if (this.captureBlocked) return;
    const target = this.snapshot.practiceTarget;
    if (target) { this.playItem(target.index, "practising"); return; }
    if (this.snapshot.currentIndex < 0 || ["idle", "loading"].includes(this.snapshot.status)) return;
    // A new media attempt starts from zero; cached clip bytes require no new TTS.
    this.playItem(this.snapshot.currentIndex, "replaying");
  }
  enterPractice(itemId: string): boolean {
    if (this.snapshot.practiceTarget || ["idle", "loading"].includes(this.snapshot.status)) return false;
    const item = this.snapshot.queue.find((clip) => clip.id === itemId);
    if (!item || !canPractise(item)) return false;
    this.bookmark = { index: this.snapshot.currentIndex, position: this.audio?.capturePosition?.() ?? this.audio?.currentTime ?? 0,
      status: this.snapshot.status };
    this.releaseAudio();
    this.update({ status: "practising", automaticAdvancement: false, modelPlaying: false, error: null,
      practiceTarget: { sessionId: this.snapshot.sessionId, itemId, index: item.index,
        speaker: item.speaker, text: item.text } });
    return true;
  }
  suspendPracticeAudio() {
    if (!this.snapshot.practiceTarget) return;
    this.releaseAudio();
    this.update({ status: "practising", modelPlaying: false, modelPaused: false, error: null });
  }
  finishPractice() {
    const target = this.snapshot.practiceTarget;
    const bookmark = this.bookmark;
    if (!target || !bookmark) return;
    this.releaseAudio();
    this.bookmark = null;
    this.update({ practiceTarget: null, modelPlaying: false, modelPaused: false, error: null });
    if (target.index === bookmark.index && bookmark.status !== "completed") {
      this.advance(target.index, "practice");
    } else if (bookmark.status === "completed") {
      this.update({ status: "completed", automaticAdvancement: false });
    } else {
      // Out-of-order practice is an excursion, never a seek/skip in the scene.
      this.playItem(bookmark.index, bookmark.status === "replaying" ? "replaying" : "playing", bookmark.position,
        bookmark.status === "paused" || bookmark.status === "error");
    }
  }
}
