/** Original deterministic PCM beds. No recordings, speech or external assets. */
export function localNoise(kind: "rain" | "room" | "office" | "station"): Blob {
  const rate = 16000, samples = rate * (kind === "station" ? 8 : 4);
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const label = (offset: number, text: string) => [...text].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0); });
  label(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); label(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, "data"); view.setUint32(40, samples * 2, true);
  let seed = 12345, smooth = 0;
  for (let i = 0; i < samples; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    smooth = smooth * 0.65 + (seed / 0xffffffff * 2 - 1) * 0.35;
    const fade = Math.min(1, i / 800, (samples - 1 - i) / 800);
    const t = i / rate;
    // Office: a fuller ventilation bed plus soft periodic mechanical texture.
    // No voices, identifiable recordings, startling transients or licensed assets.
    const office = smooth * (9000 + 1800 * Math.sin(2*Math.PI*0.5*t)) +
      Math.sin(2*Math.PI*120*t) * 900 + Math.sin(2*Math.PI*240*t) * 350;
    // Distant ventilation/rolling rumble; no announcements or discrete train SFX.
    const station = smooth * (10500 + 2200 * Math.sin(2*Math.PI*0.25*t)) +
      Math.sin(2*Math.PI*65*t) * 1500 + Math.sin(2*Math.PI*130*t) * 500 +
      Math.sin(2*Math.PI*390*t) * (100 + 100*Math.sin(2*Math.PI*0.5*t));
    const sample = kind === "station" ? station : kind === "office" ? office : kind === "rain" ? smooth * 7000 : smooth * 900 + Math.sin(i * 2 * Math.PI * 100 / rate) * 180;
    view.setInt16(44 + i * 2, Math.round(sample * fade), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
