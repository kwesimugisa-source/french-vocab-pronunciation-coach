import type { ContentDocument } from "./content-document";
import type { WordInsight } from "./types";
import { getWordInsight } from "./getWordInsight";

/** Offsets refer to canonical display text, including every whitespace character. */
export function sentenceAt(text: string, offset: number): string {
  if (!Number.isInteger(offset) || offset < 0 || offset >= text.length) return "";
  let start = offset; let end = offset;
  while (start > 0 && !/[.!?\n]/u.test(text[start - 1])) start--;
  while (end < text.length && !/[.!?\n]/u.test(text[end])) end++;
  return text.slice(start, end < text.length && text[end] !== "\n" ? end + 1 : end).trim();
}
export function textBlocks(text: string) {
  let offset = 0;
  return text.split("\n\n").map(block => {
    const tokens = block.split(/(\s+)/u).map(word => { const token = { word, offset }; offset += word.length; return token; });
    offset += 2; return tokens;
  });
}
export class VocabularySession {
  private request: AbortController | null = null;
  cancel() { this.request?.abort(); this.request = null; }
  async analyze(document: ContentDocument, word: string, offset: number, fetcher: typeof fetch = fetch): Promise<WordInsight | null> {
    this.cancel();
    const request = new AbortController(); this.request = request;
    const current = () => this.request === request && !request.signal.aborted;
    const sentence = sentenceAt(document.text, offset);
    try {
      const response = await fetcher("/api/analyze-word", { method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal,
        body: JSON.stringify({ word, sentence, level: document.level ?? "unknown", contentType: document.contentType, documentId: document.documentId, revision: document.revision }) });
      if (!current()) return null;
      if (!response.ok) throw new Error("Analyse indisponible");
      const result = await response.json();
      if (!current()) return null;
      if (!result || typeof result.word !== "string" || Object.values(result).some(v => typeof v !== "string")) throw new Error("Analyse invalide");
      return { ...result, word, sentence };
    } catch {
      if (!current()) return null;
      const local = getWordInsight(word);
      return local ? { ...local, word, sentence } : { word, sentence, usage: "Analyse indisponible pour le moment. Réessayez." };
    } finally { if (this.request === request) this.request = null; }
  }
}
