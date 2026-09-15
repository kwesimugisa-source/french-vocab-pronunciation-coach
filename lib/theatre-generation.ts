import { assertCompleteTheatreResponse, parseTheatreItems } from "./theatre";
import type { TheatreClip, TheatreItem, TheatreResponse } from "./theatre";

// Three workers keep service pressure modest while avoiding fully serial TTS.
// This bounds requests per scene, not aggregate traffic from multiple users.
export const THEATRE_TTS_CONCURRENCY = 3;

const CHARACTER_VOICES = ["onyx", "nova", "fable", "alloy"] as const;
type SpeechInput = { text: string; voice: string; speed: number };
type FailedItem = Pick<TheatreItem, "id" | "index" | "sourceLines">;

export class TheatreGenerationError extends Error {
  readonly code = "THEATRE_GENERATION_FAILED";

  constructor(
    readonly failedItems: FailedItem[],
    readonly parsedItemCount: number,
    readonly generatedClipCount: number
  ) {
    super("Theatre audio generation failed for one or more items.");
    this.name = "TheatreGenerationError";
  }
}

function voiceForSpeaker(speaker: string, voices: Map<string, string>): string {
  if (speaker === "NARRATOR") return "shimmer";
  if (["CHŒUR", "CHOEUR", "CHORUS"].some((name) => speaker.includes(name))) return "echo";
  if (!voices.has(speaker)) voices.set(speaker, CHARACTER_VOICES[voices.size % CHARACTER_VOICES.length]);
  return voices.get(speaker)!;
}

export async function generateTheatreResponse(
  text: string,
  playbackSpeed: number,
  synthesize: (input: SpeechInput) => Promise<string>
): Promise<TheatreResponse> {
  const items = parseTheatreItems(text);
  const voices = new Map<string, string>();
  // Freeze casting in source order before any asynchronous work starts.
  const jobs = items.map((item) => ({
    item,
    voice: voiceForSpeaker(item.speaker, voices),
    speed: item.type === "stage" ? Math.max(0.65, playbackSpeed - 0.15) : Math.max(0.95, playbackSpeed),
  }));
  const clips: TheatreClip[] = new Array(items.length);
  const failedItems: FailedItem[] = [];
  let nextIndex = 0;
  let generatedClipCount = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      const { item, voice, speed } = jobs[nextIndex++];
      try {
        const audioBase64 = await synthesize({ text: item.text, voice, speed });
        if (!audioBase64.trim()) throw new Error("Empty theatre audio");
        clips[item.index] = { ...item, voice, speed, audioBase64 };
        generatedClipCount++;
      } catch {
        // Do not expose upstream error bodies or discard the failed item's identity.
        failedItems.push({ id: item.id, index: item.index, sourceLines: item.sourceLines });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(THEATRE_TTS_CONCURRENCY, jobs.length) }, worker));
  if (failedItems.length) {
    failedItems.sort((a, b) => a.index - b.index);
    throw new TheatreGenerationError(failedItems, items.length, generatedClipCount);
  }

  const response: TheatreResponse = {
    mode: "theatre",
    integrity: {
      version: 1,
      parsedItemCount: items.length,
      expectedItemIds: items.map((item) => item.id),
      generatedClipCount,
    },
    clips,
  };
  assertCompleteTheatreResponse(response, items);
  return response;
}
