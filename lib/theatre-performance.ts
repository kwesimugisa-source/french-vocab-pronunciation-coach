/** Performance affects delivery only, never casting, authored text or speed. */
export const THEATRE_STYLES = ["clarte", "naturel"] as const;
export type TheatreStyle = typeof THEATRE_STYLES[number];
export function theatreStyle(value: unknown): TheatreStyle {
  if (value === undefined) return "clarte";
  if (value === "clarte" || value === "naturel") return value;
  throw new Error("Style théâtral invalide.");
}
export function performanceInstructions(style: TheatreStyle): string {
  return style === "clarte"
    ? "Clarté: perform like an excellent actor speaking deliberately for a French learner. Use unusually clear articulation, careful pronunciation and learner-friendly rhythm, with expressive phrasing rather than mechanical word-by-word separation."
    : "Naturel: give a living theatrical performance with natural conversational rhythm, connected phrasing, reaction timing and emotional variation appropriate to the scene. Avoid excessive separation between words. Remain intelligible at the selected speed. Convey hesitation, humour, urgency or surprise through intonation and pauses only; never add fillers, contractions, laughter syllables or other unauthored words.";
}
