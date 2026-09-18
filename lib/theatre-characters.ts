import { parseTheatreItems } from "./theatre";
import { isChorusSpeaker, speakerIdentity } from "./theatre-speakers";
import type { Presentation } from "./voice-casting";
export type TheatreCharacter = { speakerId: string; displayName: string; voicePresentation: Presentation };
export const THEATRE_GENERATION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["title", "text", "characters"],
  properties: { title: { type: "string" }, text: { type: "string" }, characters: {
    type: "array", maxItems: 32, items: { type: "object", additionalProperties: false,
      required: ["speakerId", "displayName", "voicePresentation"], properties: {
        speakerId: { type: "string" }, displayName: { type: "string" },
        voicePresentation: { type: "string", enum: ["female-presenting", "male-presenting", "unspecified"] },
      } },
  } },
};
/** Exact complete cast coverage, with no authority to rewrite source dialogue. */
export function validateTheatreCharacters(value: unknown, text: string): TheatreCharacter[] {
  const expected = new Set(parseTheatreItems(text).filter(i => i.type === "dialogue" && !isChorusSpeaker(i.speaker)).map(i => i.speaker));
  const invalid = () => { throw new Error("Métadonnées des personnages invalides."); };
  if (!Array.isArray(value) || value.length !== expected.size || value.length > 32) return invalid();
  const seen = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== "object" || Object.keys(entry).length !== 3 ||
      typeof entry.speakerId !== "string" || typeof entry.displayName !== "string" || !entry.displayName.trim() || entry.displayName.length > 40 ||
      entry.speakerId !== speakerIdentity(entry.displayName) || !expected.has(entry.speakerId) || seen.has(entry.speakerId) ||
      !["female-presenting", "male-presenting", "unspecified"].includes(entry.voicePresentation)) return invalid();
    seen.add(entry.speakerId);
    return { speakerId: entry.speakerId, displayName: entry.displayName, voicePresentation: entry.voicePresentation };
  });
}
