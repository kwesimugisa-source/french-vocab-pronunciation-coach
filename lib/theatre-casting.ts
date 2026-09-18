import type { TheatreItem } from "./theatre";
import { isChorusSpeaker } from "./theatre-speakers";
import { TTS_VOICES, PRESENTATION_VOICES, assignVoices, sourcePresentation } from "./voice-casting";
import type { PresentationEvidence } from "./voice-casting";
import { nameConvention } from "./name-conventions";
import type { TheatreCharacter } from "./theatre-characters";

// Built-in gpt-4o-mini-tts inventory, verified against SDK 6.34.0 and the
// official speech guide. Do not infer vocal gender or aliases from names.
export const THEATRE_VOICES = TTS_VOICES;
export type TheatreVoice = typeof THEATRE_VOICES[number];
export type TheatreRole = "character" | "narrator" | "chorus";
export type CastMember = { speaker: string; role: TheatreRole; voice: TheatreVoice; presentation?: PresentationEvidence["presentation"]; evidence?: string[]; excludedVoices?: readonly TheatreVoice[]; castingSource?: string };
export type TheatreCasting = {
  version: 1;
  narrator: { voice: TheatreVoice };
  chorus: { voice: TheatreVoice; voices: TheatreVoice[] };
  members: CastMember[];
  reusedCharacterVoices: boolean;
};

// Cedar is quality-recommended in the speech guide. Depth/composure are
// requested through instructions, not an undocumented guarantee of pitch.
export const DEFAULT_NARRATOR_VOICE: TheatreVoice = "cedar";
export const CHORUS_VOICE: TheatreVoice = "echo";

export function theatreRole(item: TheatreItem): TheatreRole {
  if (item.type === "stage") return "narrator";
  return isChorusSpeaker(item.speaker)
    ? "chorus" : "character";
}

export function createTheatreCasting(
  items: readonly TheatreItem[], narratorVoice: TheatreVoice = DEFAULT_NARRATOR_VOICE, metadata: readonly TheatreCharacter[] = []
): TheatreCasting {
  if (!THEATRE_VOICES.includes(narratorVoice) || narratorVoice === CHORUS_VOICE) {
    throw new Error("Narrator must use a supported voice distinct from chorus.");
  }
  const chorusVoices = (["echo", "fable", "onyx", "ash"] as TheatreVoice[]).filter((voice) => voice !== narratorVoice).slice(0, 3);
  const characters = [...new Set(items.filter((item) => theatreRole(item) === "character").map((item) => item.speaker))].sort();
  const chorus = [...new Set(items.filter((item) => theatreRole(item) === "chorus").map((item) => item.speaker))].sort();
  const descriptions = items.filter(item => item.type === "stage").map(item => item.text);
  const evidence = new Map(characters.map(speaker => [speaker, theatrePresentation(speaker, descriptions, metadata)]));
  const voices = assignVoices(characters, evidence, [narratorVoice, ...chorusVoices], true);
  return {
    version: 1, narrator: { voice: narratorVoice },
    chorus: { voice: CHORUS_VOICE, voices: chorusVoices },
    reusedCharacterVoices: new Set(voices.values()).size < characters.length,
    members: [
      ...(items.some((item) => item.type === "stage")
        ? [{ speaker: "NARRATOR", role: "narrator" as const, voice: narratorVoice }] : []),
      ...characters.map((speaker) => ({ speaker, role: "character" as const, voice: voices.get(speaker)!, ...evidence.get(speaker)! })),
      ...chorus.map((speaker) => ({ speaker, role: "chorus" as const, voice: CHORUS_VOICE })),
    ],
  };
}

/** Theatre-only policy. Conversation retains its existing casting contract. */
function theatrePresentation(speaker: string, descriptions: readonly string[], metadata: readonly TheatreCharacter[]): PresentationEvidence & { castingSource: string } {
  const explicit = descriptions.map(text => sourcePresentation(speaker, [text])).filter(e => e.evidence.length);
  const denied = descriptions.filter(text => /n['’]est\s+(?:pas|jamais)/iu.test(text))
    .map(text => ({text, result:sourcePresentation(speaker,[text.replace(/n['’]est\s+(?:pas|jamais)/iu,"est")])}))
    .filter(entry => entry.result.evidence.length);
  const excludedVoices = [...new Set(denied.flatMap(entry => [...PRESENTATION_VOICES[entry.result.presentation]]))];
  if (explicit.length) {
    const conflict = new Set(explicit.map(e => e.presentation)).size > 1 || denied.some(d => d.result.presentation === explicit[0].presentation);
    return { presentation: conflict ? "unspecified" : explicit[0].presentation, evidence: explicit.flatMap(e => e.evidence), castingSource: conflict ? "conflicting-script" : "explicit-script", ...(excludedVoices.length ? {excludedVoices} : {}) };
  }
  if (denied.length) return {presentation:"unspecified",evidence:denied.map(d=>d.text),excludedVoices,castingSource:"explicit-script-constraint"};
  const generated = metadata.find(c => c.speakerId === speaker);
  if (generated && generated.voicePresentation !== "unspecified") return { presentation: generated.voicePresentation, evidence: [], castingSource: "generated-metadata" };
  const convention = nameConvention(speaker);
  if (convention?.confidence === "strong") return { presentation: convention.presentation, evidence: [], castingSource: "name-convention-fr" };
  // Unambiguous named-subject context only, never infer from occupation or mood.
  const escaped = speaker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const context = descriptions.filter(text => new RegExp(`^[\\[(]\\s*${escaped}\\s+(?:sourit|attend|entre|hésite|s'assoit)[.!]\\s*(Elle|Il)\\s+[^.!?]+[.!]?[\\])]$`, "iu").test(text));
  const presentations = new Set(context.map(text => /[.!]\s*Elle\s/iu.test(text) ? "female-presenting" as const : "male-presenting" as const));
  if (presentations.size === 1) return { presentation: [...presentations][0], evidence: context, castingSource: "named-subject-context" };
  return { presentation: "unspecified", evidence: [], castingSource: "varied-fallback" };
}
