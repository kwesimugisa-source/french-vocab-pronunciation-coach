import { assignVoices, TTS_VOICES } from "./voice-casting";
import type { Voice } from "./voice-casting";

export type ConversationTurn = { id: string; speakerId: string; speakerLabel: string; spokenText: string; order: number };
export type ConversationClip = ConversationTurn & { voice: Voice; speed: number; audioBase64: string };
export type ConversationResponse = { mode: "conversation"; version: 1; clips: ConversationClip[] };
const labelPattern = /^[\p{L}][\p{L}\p{M}\d ’'\-]{0,39}$/u;
const identity = (label: string) => label.normalize("NFC").replace(/[’‘]/g, "'").toLocaleUpperCase("fr");

/** Only the first colon separates a label. Remaining punctuation is dialogue.
 * Labelled input must be completely structured: fail instead of losing a line
 * or accidentally speaking a malformed label. Plain legacy passages stay whole. */
export function conversationTurns(text: string): ConversationTurn[] {
  const lines = text.split(/\r\n|\r|\n/u).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Conversation vide.");
  const matches = lines.map(line => line.match(/^([^:：]+)\s*[:：]\s*(.*)$/u));
  const labelled = matches.some(match => match && labelPattern.test(match[1].trim()));
  if (!labelled) return [{ id: "turn-1", speakerId: "speaker", speakerLabel: "", spokenText: text.trim(), order: 0 }];
  return lines.map((_line, order) => {
    const match = matches[order];
    if (!match || !labelPattern.test(match[1].trim()) || !match[2].trim())
      throw new Error("Conversation mal structurée : utilisez une ligne « Nom : dialogue » par tour de parole.");
    const speakerLabel = match[1].trim();
    return { id: `turn-${order + 1}`, speakerId: identity(speakerLabel), speakerLabel, spokenText: match[2].trim(), order };
  });
}
export function conversationReference(text: string): string {
  return conversationTurns(text).map(turn => turn.spokenText).join("\n");
}
export function conversationVoices(turns: readonly ConversationTurn[]) {
  // No demographic evidence in the turn contract. In particular a French name
  // is never used as proof of presentation. No model, scene or global cache.
  return assignVoices(turns.map(turn => turn.speakerId), new Map());
}

export const CONVERSATION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["title", "turns"],
  properties: { title: { type: "string" }, turns: { type: "array", minItems: 2,
    items: { type: "object", additionalProperties: false, required: ["speakerLabel", "spokenText"],
      properties: { speakerLabel: { type: "string" }, spokenText: { type: "string" } } } } },
};
export function structuredConversation(value: unknown): { title: string; text: string } {
  const v = value as { title?: unknown; turns?: unknown } | null;
  if (!v || typeof v.title !== "string" || !v.title.trim() || !Array.isArray(v.turns) || v.turns.length < 2)
    throw new Error("Conversation générée invalide.");
  const text = v.turns.map(turn => {
    if (!turn || typeof turn.speakerLabel !== "string" || !labelPattern.test(turn.speakerLabel.trim()) ||
      typeof turn.spokenText !== "string" || !turn.spokenText.trim() || /[\r\n]/u.test(turn.spokenText) ||
      /[\r\n]/u.test(turn.speakerLabel)) throw new Error("Tour de parole invalide.");
    const prefix = turn.spokenText.match(/^([^:：]+)[:：]/u)?.[1].trim();
    if (prefix && identity(prefix) === identity(turn.speakerLabel.trim())) throw new Error("Étiquette répétée dans le dialogue généré.");
    return `${turn.speakerLabel.trim()} : ${turn.spokenText.trim()}`;
  }).join("\n");
  conversationTurns(text);
  return { title: v.title, text };
}

export function assertConversationResponse(value: unknown, text: string, speed: number): asserts value is ConversationResponse {
  const data = value as ConversationResponse | null, expected = conversationTurns(text), voices = conversationVoices(expected);
  const invalid = () => { throw new Error("Réponse audio de conversation incomplète ou invalide."); };
  if (!data || data.mode !== "conversation" || data.version !== 1 || !Array.isArray(data.clips) || data.clips.length !== expected.length) return invalid();
  expected.forEach((turn, i) => {
    const clip = data.clips[i];
    if (!clip || Object.entries(turn).some(([key, value]) => clip[key as keyof ConversationTurn] !== value) ||
      !TTS_VOICES.includes(clip.voice) || clip.voice !== voices.get(turn.speakerId) || clip.speed !== speed ||
      typeof clip.audioBase64 !== "string" || !clip.audioBase64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(clip.audioBase64)) invalid();
  });
}
