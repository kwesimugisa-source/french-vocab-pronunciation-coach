/** Theatre-only inspection. No rendering, output connection, playback or network. */
export type DecodedTheatreAudio = Pick<AudioBuffer, "length" | "duration" | "numberOfChannels" | "getChannelData">;
export type TheatreAudioValidation = { status: "valid" | "invalid" | "unavailable" };
export type TheatreAudioDecoder = (bytes: ArrayBuffer) => Promise<DecodedTheatreAudio | null>;

const browserDecoder: TheatreAudioDecoder = async bytes => {
  let context: OfflineAudioContext;
  try {
    if (typeof OfflineAudioContext === "undefined" || typeof document === "undefined" ||
        !document.createElement("audio").canPlayType("audio/mpeg")) return null;
    context = new OfflineAudioContext(1, 1, 44100);
  }
  catch { return null; }
  if (typeof context.decodeAudioData !== "function") return null;
  try { return await context.decodeAudioData(bytes); }
  catch (error) {
    // Missing codec/API support is not evidence of bad provider audio.
    if ((error as { name?: string })?.name === "EncodingError") throw error;
    return null;
  }
};

export async function validateTheatreAudio(
  base64: string, signal: AbortSignal, decode: TheatreAudioDecoder = browserDecoder
): Promise<TheatreAudioValidation> {
  signal.throwIfAborted();
  let audio: DecodedTheatreAudio | null;
  try {
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    audio = await decode(bytes.buffer);
  } catch {
    signal.throwIfAborted();
    return { status: "invalid" };
  }
  signal.throwIfAborted();
  if (!audio) return { status: "unavailable" };
  if (!Number.isInteger(audio.length) || audio.length <= 0 ||
      !Number.isFinite(audio.duration) || audio.duration <= 0 ||
      !Number.isInteger(audio.numberOfChannels) || audio.numberOfChannels <= 0)
    return { status: "invalid" };
  let nonzero = false;
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    if (samples.length !== audio.length) return { status: "invalid" };
    for (const sample of samples) {
      if (!Number.isFinite(sample)) return { status: "invalid" };
      if (sample !== 0) nonzero = true;
    }
  }
  return { status: nonzero ? "valid" : "invalid" };
}
