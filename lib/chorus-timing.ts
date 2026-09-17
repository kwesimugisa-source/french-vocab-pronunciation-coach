/** Conservatively identify only near-digital padding, not linguistic phonemes.
 * Keep 40ms before the first sample above -100dBFS; never trim internal silence. */
export const CHORUS_RATE_MIN = 0.96;
export const CHORUS_RATE_MAX = 1.04;
export const CHORUS_PREROLL = 0.04;
export const CHORUS_START_LEAD = 0.05;
export type PcmBuffer = Pick<AudioBuffer, "length" | "sampleRate" | "numberOfChannels" | "duration" | "getChannelData">;
export type ChorusTiming = { onset: number; end: number; offset: number; rate: number; delay: number };
export function audibleBounds(buffer: PcmBuffer) {
  if (!buffer.length || !buffer.sampleRate || !Number.isFinite(buffer.duration)) throw new Error("Invalid chorus buffer");
  let first = buffer.length, last = -1;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      if (!Number.isFinite(samples[i])) throw new Error("Invalid chorus samples");
      if (Math.abs(samples[i]) > 0.00001) { first = Math.min(first, i); last = Math.max(last, i); }
    }
  }
  if (last < first) throw new Error("Silent chorus component");
  return { onset: first / buffer.sampleRate, end: (last + 1) / buffer.sampleRate };
}
export function planChorusTiming(buffers: readonly PcmBuffer[]): ChorusTiming[] {
  if (buffers.length !== 3) throw new Error("A chorus requires three components");
  const bounds = buffers.map(audibleBounds);
  const durations = bounds.map(b => b.end - b.onset);
  const target = [...durations].sort((a,b) => a-b)[1];
  return bounds.map((b,i) => {
    const rate = Math.max(CHORUS_RATE_MIN, Math.min(CHORUS_RATE_MAX, durations[i] / target));
    const offset = Math.max(0, b.onset - CHORUS_PREROLL);
    // Align measured audible onsets, including clips with less than 40ms padding.
    const delay = CHORUS_PREROLL / CHORUS_RATE_MIN - (b.onset - offset) / rate;
    return { ...b, offset, rate, delay: Math.max(0, delay) };
  });
}
