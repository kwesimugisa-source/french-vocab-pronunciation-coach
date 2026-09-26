import type { ContentDocument, EffectiveType } from "./content-document";
import { conversationTurns } from "./conversation";
import type { PronunciationTarget } from "./pronunciation-session";

export type PracticeUnit = {
  id: string; index: number; text: string; start: number; end: number;
  speaker?: string;
};
export function supportsUniversalPractice(type: EffectiveType) {
  return type !== "theatre" && type !== "tongue-twisters";
}

/** Offsets always index the unchanged canonical string. Whitespace between units
 * stays in the document; it is not speech or a new learner reference. */
export function practiceUnits(doc: Pick<ContentDocument, "text" | "contentType">): PracticeUnit[] {
  const { text, contentType } = doc;
  if (!supportsUniversalPractice(contentType)) return [];
  const units: PracticeUnit[] = [];
  const add = (from: number, to: number, id?: string, speaker?: string) => {
    const raw = text.slice(from, to), leading = raw.length - raw.trimStart().length;
    const start = from + leading, end = to - (raw.length - raw.trimEnd().length);
    if (end <= start) return;
    units.push({ id: id ?? `unit-${start}-${end}`, index: units.length, text: text.slice(start, end), start, end, ...(speaker ? { speaker } : {}) });
  };
  if (contentType === "conversation") {
    let cursor = 0;
    for (const turn of conversationTurns(text)) {
      // Match the complete canonical line before locating its dialogue, so a
      // repeated name in the label cannot be mistaken for the spoken fragment.
      if (!turn.speakerLabel) { add(0, text.length, turn.id); continue; }
      const labelAt = text.indexOf(turn.speakerLabel, cursor);
      const colon = text.slice(labelAt).search(/[:：]/u) + labelAt;
      const start = text.indexOf(turn.spokenText, colon + 1);
      add(start, start + turn.spokenText.length, turn.id, turn.speakerLabel);
      cursor = start + turn.spokenText.length;
    }
    return units;
  }
  if (contentType === "poetry") {
    for (const match of text.matchAll(/[^\r\n]+/gu)) add(match.index!, match.index! + match[0].length);
    return units;
  }
  // Paragraph boundaries are reliable; sentence boundaries are conservative.
  // Never split decimals, initials, common French abbreviations or ellipses
  // followed by lowercase continuation. Ambiguous boundaries stay together.
  for (const paragraph of text.matchAll(/[^\r\n]+(?:\r?\n(?!\s*\r?\n)[^\r\n]+)*/gu)) {
    const base = paragraph.index!, value = paragraph[0];
    let start = 0;
    const endings = /[.!?…]+(?:[ \t]*[»”"')\]])*(?=\s|$)/gu;
    for (const match of value.matchAll(endings)) {
      const at = match.index!, end = at + match[0].length;
      const token = value.slice(0, at).match(/[\p{L}.]+$/u)?.[0] ?? "";
      const after = value.slice(end).trimStart();
      if (match[0] === "." && (/^(?:M|Mme|Mmes|MM|Mlle|Mlles|Dr|Dre|Pr|Me|p|pp|av|bd|env|approx|ex|cf|etc)$/iu.test(token) || /^(?:\p{Lu}|(?:\p{L}\.)+\p{L})$/u.test(token))) continue;
      if (after && !/^(?:[«“"'(\[]\s*)*\p{Lu}/u.test(after)) continue;
      add(base + start, base + end); start = end;
    }
    add(base + start, base + value.length);
  }
  return units;
}
export function practiceTarget(doc: ContentDocument, unit: PracticeUnit): PronunciationTarget {
  return { text: unit.text, itemId: unit.id, documentId: doc.documentId, revision: doc.revision,
    contentType: doc.contentType, origin: doc.origin, level: doc.level, ...(unit.speaker ? { speaker: unit.speaker } : {}) };
}
