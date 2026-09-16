import type { TheatreItem } from "./theatre";

export type AmbienceKind = "none" | "rain";
export type AmbienceRecommendation = { environment: AmbienceKind; evidenceItemId: string; evidenceQuote: string };
export const noAmbience = (): AmbienceRecommendation => ({ environment: "none", evidenceItemId: "", evidenceQuote: "" });
export const AMBIENCE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["environment", "confidence", "evidenceItemId", "evidenceQuote"],
  properties: {
    environment: { type: "string", enum: ["none", "rain"] },
    confidence: { type: "string", enum: ["high", "uncertain"] },
    evidenceItemId: { type: "string" }, evidenceQuote: { type: "string" },
  },
};

/** Intentionally narrow: only explicit present rain in a stage direction.
 * Unsupported, ambiguous, speculative or negated environments remain silent. */
export function validateAmbience(value: unknown, items: readonly TheatreItem[]): AmbienceRecommendation {
  if (!value || typeof value !== "object") return noAmbience();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 4 || data.environment !== "rain" || data.confidence !== "high" ||
    typeof data.evidenceItemId !== "string" || typeof data.evidenceQuote !== "string" ||
    !data.evidenceQuote || data.evidenceQuote.length > 400) return noAmbience();
  const item = items.find((entry) => entry.id === data.evidenceItemId && entry.type === "stage");
  if (!item || !item.text.includes(data.evidenceQuote) ||
    /\b(pas|sans|ne|jamais|si|demain|no|not|without|if|tomorrow)\b/i.test(item.text) ||
    !/\b(il pleut|pluie tombe|bruit de la pluie|rain falls|raining)\b/i.test(data.evidenceQuote)) return noAmbience();
  return { environment: "rain", evidenceItemId: item.id, evidenceQuote: data.evidenceQuote };
}

export type AmbienceProvider = (kind: AmbienceKind) => Blob | null;
/** Original procedural demonstration, no external recordings/licensing or API.
 * A quiet filtered noise bed, not a realistic production sound library. */
export const localAmbienceProvider: AmbienceProvider = (kind) => {
  if (kind !== "rain") return null;
  const rate = 16000, samples = rate * 4;
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
    view.setInt16(44 + i * 2, Math.round(smooth * 7000 * fade), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
};
