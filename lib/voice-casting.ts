/** Provider inventory: https://developers.openai.com/api/docs/guides/text-to-speech
 * Presentation pools are REVISIONABLE APP PERCEPTUAL CATEGORIES, not provider
 * gender labels or claims about the identity of a voice. French listening
 * acceptance remains necessary. No occupation/age/personality heuristics. */
export const TTS_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx",
  "sage", "shimmer", "verse", "marin", "cedar",
] as const;
export type Voice = typeof TTS_VOICES[number];
export type Presentation = "female-presenting" | "male-presenting" | "unspecified";
export const PRESENTATION_VOICES: Record<Presentation, readonly Voice[]> = {
  "female-presenting": ["coral", "nova", "shimmer"],
  "male-presenting": ["ash", "ballad", "onyx", "echo", "verse", "cedar"],
  unspecified: TTS_VOICES,
};
export type PresentationEvidence = { presentation: Presentation; evidence: string[] };
export const unspecified = (): PresentationEvidence => ({ presentation: "unspecified", evidence: [] });

/** Intentionally narrow, affirmative cast descriptions only. Names are lookup
 * keys, never evidence. Ambiguous pronouns, dialogue, negation and conflicting
 * descriptions abstain. Operating on source (not model output) makes casting
 * invariant across new TTS requests and analysis successes/failures. */
export function sourcePresentation(speaker: string, descriptions: readonly string[]): PresentationEvidence {
  const normalize = (s: string) => s.normalize("NFC").replace(/[’‘]/g, "'").toLocaleLowerCase("fr").trim();
  const name = normalize(speaker).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^(?:\\(\\s*)?${name}\\s*(?:,|:|—|–|\\best)\\s*(?:(?:un|une|le|la)\\s+)?(?:jeune\\s+)?(femme|homme|fille|garçon|mère|père|sœur|frère|épouse|époux|personnage féminin|personnage masculin)(?=[\\s,.;)]|$)`, "u");
  const found: { presentation: Presentation; evidence: string }[] = [];
  for (const source of descriptions) {
    const text = normalize(source);
    // Avoid quoted/hypothetical/negated character descriptions, even when a
    // positive-looking prefix exists. A missed classification is safe.
    if (/[?«»"]|\b(?:pas|non|jamais|ni|si|serait|semble|peut-être|contrairement)\b/u.test(text)) continue;
    const match = text.match(pattern);
    if (match) found.push({ presentation: ["femme", "fille", "mère", "sœur", "épouse", "personnage féminin"].includes(match[1]) ? "female-presenting" : "male-presenting", evidence: source });
  }
  if (!found.length || new Set(found.map(x => x.presentation)).size !== 1) return unspecified();
  return { presentation: found[0].presentation, evidence: found.map(x => x.evidence) };
}

export function assignVoices(speakers: readonly string[], evidence: ReadonlyMap<string, PresentationEvidence>, excluded: readonly Voice[] = []): Map<string, Voice> {
  const available = TTS_VOICES.filter(v => !excluded.includes(v));
  if (!available.length) throw new Error("Aucune voix disponible.");
  const assigned = new Map<string, Voice>(), uses = new Map<Voice, number>();
  // Reserve compatible voices for established presentations before unknowns.
  const ordered = [...new Set(speakers)].sort().sort((a, b) =>
    Number((evidence.get(a)?.presentation ?? "unspecified") === "unspecified") -
    Number((evidence.get(b)?.presentation ?? "unspecified") === "unspecified"));
  for (const speaker of ordered) {
    const preferred = PRESENTATION_VOICES[evidence.get(speaker)?.presentation ?? "unspecified"].filter(v => available.includes(v));
    const pool = preferred.length ? preferred : available;
    const voice = [...pool].sort((a, b) => (uses.get(a) ?? 0) - (uses.get(b) ?? 0))[0];
    assigned.set(speaker, voice); uses.set(voice, (uses.get(voice) ?? 0) + 1);
  }
  return assigned;
}
