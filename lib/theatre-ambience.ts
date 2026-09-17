import type { TheatreItem } from "./theatre";

export const AMBIENCE_CATALOGUE = {
  none: "Aucune", neutral_room: "Pièce calme", office: "Bureau", cafe: "Café",
  classroom: "Salle de classe", kitchen: "Cuisine", fireplace: "Cheminée",
  rain: "Pluie douce", thunderstorm: "Orage", wind: "Vent", forest: "Forêt",
  garden_birds: "Jardin et oiseaux", seaside: "Bord de mer", night_insects: "Insectes nocturnes",
  street: "Rue", traffic: "Circulation", market: "Marché", station: "Gare",
  crowd: "Foule", theatre_auditorium: "Salle de théâtre", tavern: "Taverne",
  ballroom: "Salle de bal", church: "Église", distant_battlefield: "Champ de bataille lointain",
  harbour_ship: "Port ou navire", rural_village: "Village rural",
} as const;
export type AmbienceKind = keyof typeof AMBIENCE_CATALOGUE;
export type AmbienceStatus = "analyzed_no_ambience" | "detected_available" | "detected_unavailable" | "analysis_unavailable" | "playback_failed";
export function ambienceStatus(recommendation: AmbienceRecommendation, analyzed: boolean): AmbienceStatus {
  if (recommendation.environment !== "none") return hasLocalAmbienceProvider(recommendation.environment) ? "detected_available" : "detected_unavailable";
  return analyzed && recommendation.confidence === "high" ? "analyzed_no_ambience" : "analysis_unavailable";
}
export function ambienceStatusDescription(status: AmbienceStatus, kind: AmbienceKind): string {
  if (status === "analyzed_no_ambience") return "Aucune ambiance nécessaire pour cette scène.";
  if (status === "analysis_unavailable") return "Analyse de l’ambiance indisponible ou incertaine.";
  if (status === "playback_failed") return "Impossible de lire l’ambiance. La lecture du texte continue.";
  if (status === "detected_unavailable") return `Ambiance détectée : ${AMBIENCE_CATALOGUE[kind].toLocaleLowerCase("fr")}, mais aucun son n’est disponible.`;
  return `Ambiance : ${AMBIENCE_CATALOGUE[kind].toLocaleLowerCase("fr")} — suspendue pendant l’enregistrement.`;
}
type Evidence = { itemId: string; quote: string };
export type AmbienceRecommendation = {
  environment: AmbienceKind; evidenceItemId?: string; evidenceQuote?: string;
  confidence?: "high" | "uncertain"; basis?: "explicit" | "contextual";
  evidence?: Evidence[]; rationale?: string; contradictory?: boolean;
};
export const noAmbience = (): AmbienceRecommendation => ({ environment: "none", evidenceItemId: "", evidenceQuote: "" });
export const AMBIENCE_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["environment", "confidence", "basis", "evidence", "rationale", "contradictory"],
  properties: {
    environment: { type: "string", enum: Object.keys(AMBIENCE_CATALOGUE) },
    confidence: { type: "string", enum: ["high", "uncertain"] },
    basis: { type: "string", enum: ["explicit", "contextual"] },
    evidence: { type: "array", maxItems: 6, items: { type: "object", additionalProperties: false,
      required: ["itemId", "quote"], properties: { itemId: { type: "string" }, quote: { type: "string", minLength: 1, maxLength: 400 } } } },
    rationale: { type: "string", maxLength: 400 }, contradictory: { type: "boolean" },
  },
};

/** Validate evidence identity and structure independently from dramatic direction.
 * Whole-scene semantic reasoning belongs to the analyzer; invalid evidence,
 * uncertainty or reported contradictions cannot enable an ambience provider. */
export function validateAmbience(value: unknown, items: readonly TheatreItem[]): AmbienceRecommendation {
  if (!value || typeof value !== "object") return noAmbience();
  const data = value as Record<string, unknown>;
  if (Object.hasOwn(data, "basis")) {
    const keys = ["environment", "confidence", "basis", "evidence", "rationale", "contradictory"];
    if (Object.keys(data).length === keys.length && keys.every(key => Object.hasOwn(data,key)) &&
      data.environment === "none" && data.confidence === "high" && data.contradictory === false &&
      ["explicit", "contextual"].includes(data.basis as string) && Array.isArray(data.evidence) && !data.evidence.length &&
      typeof data.rationale === "string" && !!data.rationale.trim() && data.rationale.length <= 400)
      return { environment:"none",confidence:"high",basis:data.basis as "explicit" | "contextual",evidence:[],rationale:data.rationale,contradictory:false };
    if (Object.keys(data).length !== keys.length || !keys.every(key => Object.hasOwn(data, key)) ||
      typeof data.environment !== "string" || !Object.hasOwn(AMBIENCE_CATALOGUE, data.environment) ||
      data.environment === "none" || data.confidence !== "high" || data.contradictory !== false ||
      !["explicit", "contextual"].includes(data.basis as string) ||
      typeof data.rationale !== "string" || !data.rationale.trim() || data.rationale.length > 400 ||
      !Array.isArray(data.evidence) || !data.evidence.length || data.evidence.length > 6) return noAmbience();
    const evidence: Evidence[] = [];
    for (const entry of data.evidence) {
      if (!entry || typeof entry !== "object" || Object.keys(entry).length !== 2 ||
        typeof entry.itemId !== "string" || typeof entry.quote !== "string" ||
        !entry.quote.trim() || entry.quote.length > 400) return noAmbience();
      const item = items.find(item => item.id === entry.itemId);
      if (!item || !item.text.includes(entry.quote) || evidence.some(e => e.itemId === entry.itemId)) return noAmbience();
      evidence.push({ itemId: entry.itemId, quote: entry.quote });
    }
    // Explicit evidence must include narration; contextual inference requires
    // corroboration across distinct items. Semantic assessment is the whole-scene
    // analyzer's job, not a keyword classifier disguised as scene understanding.
    if (data.basis === "explicit" && !evidence.some(e => items.find(i => i.id === e.itemId)?.type === "stage") ||
      data.basis === "contextual" && evidence.length < 2) return noAmbience();
    return { environment: data.environment as AmbienceKind, confidence: "high", basis: data.basis as "explicit" | "contextual",
      evidence, rationale: data.rationale, contradictory: false };
  }
  // Read-only compatibility with CP4's narrowly validated rain contract.
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
function localNoise(kind: "rain" | "room" | "office"): Blob {
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
    const t = i / rate;
    // Office: a fuller ventilation bed plus soft periodic mechanical texture.
    // No voices, identifiable recordings, startling transients or licensed assets.
    const office = smooth * (9000 + 1800 * Math.sin(2*Math.PI*0.5*t)) +
      Math.sin(2*Math.PI*120*t) * 900 + Math.sin(2*Math.PI*240*t) * 350;
    const sample = kind === "office" ? office : kind === "rain" ? smooth * 7000 : smooth * 900 + Math.sin(i * 2 * Math.PI * 100 / rate) * 180;
    view.setInt16(44 + i * 2, Math.round(sample * fade), true);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
// Only appropriate base beds. No phones, speech, printers or one-shot effects.
const localProviders: Partial<Record<AmbienceKind, () => Blob>> = {
  rain: () => localNoise("rain"), neutral_room: () => localNoise("room"), office: () => localNoise("office"),
};
export const hasLocalAmbienceProvider = (kind: AmbienceKind): boolean => Object.hasOwn(localProviders, kind);
export const localAmbienceProvider: AmbienceProvider = kind => hasLocalAmbienceProvider(kind) ? localProviders[kind]!() : null;
export function ambienceDescription(kind: AmbienceKind): string {
  if (kind === "none") return "Aucune ambiance adaptée détectée.";
  return `${AMBIENCE_CATALOGUE[kind]} — ${hasLocalAmbienceProvider(kind)
    ? "ambiance de démonstration, suspendue pendant l’enregistrement."
    : "environnement identifié ; aucun son disponible."}`;
}
