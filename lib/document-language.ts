/** Document authority, not fragment-level detection. Imports and legacy identities
 * use the French-learning application's default. Intentional switching is deferred. */
export type DocumentLanguage = "fr";
export const DEFAULT_DOCUMENT_LANGUAGE: DocumentLanguage = "fr";

export function documentLanguage(value: unknown): DocumentLanguage {
  if (value === undefined || value === "fr") return DEFAULT_DOCUMENT_LANGUAGE;
  throw new Error("Langue du document non prise en charge.");
}

/** Non-spoken provider context only; never modify the speech input. */
export function pronunciationInstructions(language: DocumentLanguage, performance?: string): string {
  documentLanguage(language);
  return [
    "Document language: French (fr). Maintain French pronunciation and phonology throughout this document and every individual utterance.",
    "Pronounce names, ambiguous words, cognates and interjections within the French linguistic context, including very short or isolated utterances. Do not infer English from a fragment, punctuation, quotation marks or capitalization.",
    "Speak only the exact supplied input. Never translate, paraphrase, add or omit words. These instructions are non-spoken. The language of acting directions or surrounding context does not change the document language.",
    performance,
    "The document's French pronunciation authority applies throughout, including quoted or foreign passages; do not switch pronunciation language. Preserve the assigned voice, delivery style and requested speed.",
  ].filter(Boolean).join("\n");
}
