import type { TheatreItem } from "./theatre";

// Built-in gpt-4o-mini-tts inventory, verified against SDK 6.34.0 and the
// official speech guide. Do not infer vocal gender or aliases from names.
export const THEATRE_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx",
  "sage", "shimmer", "verse", "marin", "cedar",
] as const;
export type TheatreVoice = typeof THEATRE_VOICES[number];
export type TheatreRole = "character" | "narrator" | "chorus";
export type CastMember = { speaker: string; role: TheatreRole; voice: TheatreVoice };
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
  // Preserve the Checkpoint 2 chorus recognition rule.
  return ["CHŒUR", "CHOEUR", "CHORUS"].some((name) => item.speaker.includes(name))
    ? "chorus" : "character";
}

export function createTheatreCasting(
  items: readonly TheatreItem[], narratorVoice: TheatreVoice = DEFAULT_NARRATOR_VOICE
): TheatreCasting {
  if (!THEATRE_VOICES.includes(narratorVoice) || narratorVoice === CHORUS_VOICE) {
    throw new Error("Narrator must use a supported voice distinct from chorus.");
  }
  const pool = THEATRE_VOICES.filter((voice) => voice !== narratorVoice && voice !== CHORUS_VOICE);
  const characters = [...new Set(items.filter((item) => theatreRole(item) === "character").map((item) => item.speaker))].sort();
  const chorus = [...new Set(items.filter((item) => theatreRole(item) === "chorus").map((item) => item.speaker))].sort();
  return {
    version: 1, narrator: { voice: narratorVoice },
    chorus: { voice: CHORUS_VOICE, voices: (["echo", "fable", "onyx", "ash"] as TheatreVoice[]).filter((voice) => voice !== narratorVoice).slice(0, 3) },
    reusedCharacterVoices: characters.length > pool.length,
    members: [
      ...(items.some((item) => item.type === "stage")
        ? [{ speaker: "NARRATOR", role: "narrator" as const, voice: narratorVoice }] : []),
      ...characters.map((speaker, i) => ({ speaker, role: "character" as const, voice: pool[i % pool.length] })),
      ...chorus.map((speaker) => ({ speaker, role: "chorus" as const, voice: CHORUS_VOICE })),
    ],
  };
}
