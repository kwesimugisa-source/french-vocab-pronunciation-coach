import type { PronunciationIssue } from "./types";

export type PronunciationTarget = {
  text: string;
  documentId?: string;
  revision?: number;
  itemId?: string;
  speaker?: string;
  sessionId?: number;
};
export type PronunciationFeedback = {
  summary: { overall: string; clarity: string; rhythm: string; priority: string } | null;
  score: { overall: number; pronunciation: number; fluency: number | null; intonation: number | null } | null;
  weakPoints: PronunciationIssue[];
  transcript?: string;
};
export type PronunciationSnapshot = {
  status: "idle" | "requesting-microphone" | "recording" | "stopping" | "recorded" | "analyzing" | "analyzed" | "error";
  recording: { blob: Blob; target: PronunciationTarget } | null;
  target: PronunciationTarget | null;
  feedback: PronunciationFeedback | null;
  error: string | null;
};
export type RecordingEnvironment = {
  getUserMedia(): Promise<MediaStream>;
  createRecorder(stream: MediaStream): MediaRecorder;
  fetch: typeof fetch;
};
const browserRecordingEnvironment: RecordingEnvironment = {
  getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  createRecorder: (stream) => new MediaRecorder(stream),
  fetch: (...args) => fetch(...args),
};
const emptySnapshot = (): PronunciationSnapshot => ({
  status: "idle", recording: null, target: null, feedback: null, error: null,
});

/** The existing recording -> /api/analyze-pronunciation flow, with a reference
 * text captured at recording time. This is shared by full passages and répliques;
 * transcription, missed-word analysis and scoring remain on the existing route.
 */
export class PronunciationSession {
  private snapshot = emptySnapshot();
  private listeners = new Set<() => void>();
  private epoch = 0;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private analysis: AbortController | null = null;
  private releaseCapture: (() => void) | null = null;

  constructor(private environment: RecordingEnvironment = browserRecordingEnvironment,
    private beforeCapture?: () => (() => void)) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<PronunciationSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private releaseRecorder() {
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.releaseCapture?.();
    this.releaseCapture = null;
  }
  reset() {
    this.epoch++;
    this.analysis?.abort();
    this.analysis = null;
    this.releaseRecorder();
    this.snapshot = emptySnapshot();
    this.update({});
  }
  dispose() { this.reset(); this.listeners.clear(); }
  isBusy() {
    return ["requesting-microphone", "recording", "stopping", "analyzing"].includes(this.snapshot.status);
  }

  async start(target: PronunciationTarget) {
    if (this.isBusy()) return;
    this.reset();
    const epoch = this.epoch;
    const capturedTarget = { ...target };
    this.update({ status: "requesting-microphone", target: capturedTarget });
    try {
      this.releaseCapture = this.beforeCapture?.() ?? null;
      const stream = await this.environment.getUserMedia();
      if (epoch !== this.epoch) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const recorder = this.environment.createRecorder(stream);
      this.recorder = recorder;
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (epoch === this.epoch && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (epoch !== this.epoch) return;
        const blob = new Blob(chunks, { type: "audio/webm" });
        this.releaseRecorder();
        this.update({ status: "recorded", recording: { blob, target: capturedTarget } });
      };
      recorder.onerror = () => {
        if (epoch !== this.epoch) return;
        this.epoch++;
        this.releaseRecorder();
        this.update({ status: "error", error: "Impossible de terminer l’enregistrement." });
      };
      recorder.start();
      this.update({ status: "recording" });
    } catch {
      if (epoch !== this.epoch) return;
      this.releaseRecorder();
      this.update({ status: "error", error: "Impossible d’accéder au microphone." });
    }
  }
  stop() {
    if (!this.recorder || this.snapshot.status !== "recording") return;
    this.update({ status: "stopping" });
    this.recorder.stop();
  }
  async analyze() {
    const recording = this.snapshot.recording;
    if (!recording || this.isBusy()) return;
    const epoch = this.epoch;
    const analysis = new AbortController();
    this.analysis = analysis;
    this.update({ status: "analyzing", error: null });
    const formData = new FormData();
    formData.append("audio", recording.blob, "reading.webm");
    formData.append("text", recording.target.text);
    if (recording.target.itemId) formData.append("itemId", recording.target.itemId);
    if (recording.target.speaker) formData.append("speaker", recording.target.speaker);
    if (recording.target.sessionId !== undefined) formData.append("sessionId", String(recording.target.sessionId));
    try {
      const response = await this.environment.fetch("/api/analyze-pronunciation", {
        method: "POST", body: formData, signal: analysis.signal,
      });
      if (epoch !== this.epoch || analysis.signal.aborted) return;
      if (!response.ok) throw new Error("Analysis failed");
      const data: PronunciationFeedback = await response.json();
      if (epoch !== this.epoch || analysis.signal.aborted) return;
      this.update({ status: "analyzed", feedback: {
        ...data, summary: data.summary ?? null, score: data.score ?? null, weakPoints: data.weakPoints ?? [],
      } });
    } catch {
      if (epoch === this.epoch && !analysis.signal.aborted) {
        this.update({ status: "error", error: "Impossible d’analyser la prononciation. Réessayez." });
      }
    } finally {
      if (this.analysis === analysis) this.analysis = null;
    }
  }
}
