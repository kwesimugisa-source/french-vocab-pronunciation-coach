import type { TheatreItem } from "./theatre";

/** Non-spoken linguistic constraints. Dramatic intent and canonical text stay intact. */
export function theatreLinguisticGuidance(item: TheatreItem): string {
  if (item.pauseMs) return "";
  const words = item.text.match(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu) ?? [];
  return [
    item.type === "dialogue" && /[?？]/u.test(item.text)
      ? "Authored linguistic form: interrogative where question punctuation occurs. Preserve French question phrasing for each corresponding question, not for unrelated statements in this item, even when dramatic intent is respond, unknown or rhetorical. Do not flatten a question into a declaration; do not mechanically exaggerate rising intonation. Context determines natural prosody; Director intent, subtext and fixed voice remain unchanged." : "",
    item.type === "stage" || (words.length > 0 && words.length <= 3)
      ? `${item.type === "stage" ? "French-context narration" : "Short French-context utterance"}: prononcez les noms et mots ambigus dans le contexte français, jamais comme une expression anglaise isolée. Use French vowel values, consonants and rhythm, without English lexical stress or diphthongs inferred from spelling. Keep exact input and fixed voice; these directions are not spoken.` : "",
  ].filter(Boolean).join("\n");
}
