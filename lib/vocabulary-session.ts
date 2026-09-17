import type { ContentDocument } from "./content-document";
import type { WordInsight } from "./types";
import { getWordInsight } from "./getWordInsight";
import { Preparation } from "./preparation";
import { betaContext, betaHeaders } from "./beta-events";
import { requestError } from "./safe-errors";

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
  readonly preparation = new Preparation();
  private pendingKey = "";
  private request: AbortController | null = null;
  cancel() { this.request?.abort(); this.request = null; this.pendingKey=""; this.preparation.cancel(); }
  async analyze(document: ContentDocument, word: string, offset: number, fetcher: typeof fetch = fetch): Promise<WordInsight | null> {
    const key=`${document.documentId}:${document.revision}:${offset}:${word}`;
    if(this.request && this.pendingKey===key) return null;
    this.cancel();
    this.pendingKey=key;
    const operationId=this.preparation.begin("vocabulary",betaContext(document));
    const request = new AbortController(); this.request = request;
    const current = () => this.request === request && !request.signal.aborted;
    const sentence = sentenceAt(document.text, offset);
    let rateLimited=false;
    try {
      const response = await fetcher("/api/analyze-word", { method: "POST", headers: { "Content-Type": "application/json",...betaHeaders() }, signal: request.signal,
        body: JSON.stringify({ word, sentence, level: document.level ?? "unknown", contentType: document.contentType, documentId: document.documentId, revision: document.revision }) });
      if (!current()) return null;
      if (!response.ok) { rateLimited=response.status===429; throw new Error("Analyse indisponible"); }
      const result = await response.json();
      if (!current()) return null;
      if (!result || typeof result.word !== "string" || Object.values(result).some(v => typeof v !== "string")) throw new Error("Analyse invalide");
      this.preparation.finish(operationId,"completed");
      return { ...result, word, sentence };
    } catch {
      if (!current()) return null;
      this.preparation.finish(operationId,"failed",rateLimited?"RATE_LIMITED":"PROVIDER_FAILED");
      if(rateLimited) return {word,sentence,usage:requestError(429,"vocabulary")};
      const local = getWordInsight(word);
      return local ? { ...local, word, sentence } : { word, sentence, usage: "Analyse indisponible pour le moment. Réessayez." };
    } finally { if (this.request === request) { this.request = null; this.pendingKey=""; } }
  }
}
