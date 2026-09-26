import type { TheatreItem } from "./theatre";

/** Non-spoken linguistic constraints. Dramatic intent and canonical text stay intact. */
export function theatreLinguisticGuidance(item: TheatreItem): string {
  if (item.type !== "dialogue") return "";
  const words = item.text.match(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu) ?? [];
  return [
    /[?？][\s»”"')\]]*$/u.test(item.text)
      ? "Authored linguistic form: interrogative. Preserve the French question phrasing of this exact utterance even when dramatic intent is respond, unknown, rhetorical, or another value. Do not flatten it into a declarative statement. Let context determine natural French question prosody; do not mechanically exaggerate rising intonation. Dramatic intent, subtext and fixed voice remain authoritative for acting, not for removing the authored question." : "",
    words.length > 0 && words.length <= 3
      ? "Short French-context utterance: resolve any proper name or cross-language-ambiguous word using its French pronunciation, not an English reading of the isolated spelling. Use French vowel values and French consonant/rhythm conventions; do not introduce English lexical stress or English diphthongs solely because a name is internationally shared. This applies equally to calls, questions and one-word reactions. Keep the exact supplied spelling and words as the spoken input; do not speak these directions, add carrier words, respell aloud, or change the assigned character voice." : "",
  ].filter(Boolean).join("\n");
}
