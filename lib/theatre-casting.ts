import type { TheatreItem } from "./theatre";
import { isChorusSpeaker } from "./theatre-speakers";
import { TTS_VOICES, assignVoices, sourcePresentation } from "./voice-casting";
import type { PresentationEvidence } from "./voice-casting";

// Built-in gpt-4o-mini-tts inventory, verified against SDK 6.34.0 and the
// official speech guide. Do not infer vocal gender or aliases from names.
export const THEATRE_VOICES = TTS_VOICES;
export type TheatreVoice = typeof THEATRE_VOICES[number];
export type TheatreRole = "character" | "narrator" | "chorus";
export type CastMember = { speaker: string; role: TheatreRole; voice: TheatreVoice; presentation?: PresentationEvidence["presentation"]; evidence?: string[] };
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
  items: readonly TheatreItem[], narratorVoice: TheatreVoice = DEFAULT_NARRATOR_VOICE
): TheatreCasting {
  if (!THEATRE_VOICES.includes(narratorVoice) || narratorVoice === CHORUS_VOICE) {
    throw new Error("Narrator must use a supported voice distinct from chorus.");
  }
  const chorusVoices = (["echo", "fable", "onyx", "ash"] as TheatreVoice[]).filter((voice) => voice !== narratorVoice).slice(0, 3);
  const characters = [...new Set(items.filter((item) => theatreRole(item) === "character").map((item) => item.speaker))].sort();
  const chorus = [...new Set(items.filter((item) => theatreRole(item) === "chorus").map((item) => item.speaker))].sort();
  const descriptions = items.filter(item => item.type === "stage").map(item => item.text);
  const evidence = new Map(characters.map(speaker => [speaker, sourcePresentation(speaker, descriptions)]));
  const voices = assignVoices(characters, evidence, [narratorVoice, ...chorusVoices]);
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
