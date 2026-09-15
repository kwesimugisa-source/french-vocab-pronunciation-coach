import { assertCompleteTheatreResponse, parseTheatreItems } from "./theatre";
import type { TheatreClip, TheatreItem, TheatreResponse } from "./theatre";
import { createTheatreCasting, theatreRole } from "./theatre-casting";
import type { TheatreVoice } from "./theatre-casting";
import { dramaticInstructions, prepareDramaticDirection } from "./theatre-direction";
import type { SceneAnalyzer } from "./theatre-direction";

// Three workers keep service pressure modest while avoiding fully serial TTS.
// This bounds requests per scene, not aggregate traffic from multiple users.
export const THEATRE_TTS_CONCURRENCY = 3;

type SpeechInput = { text: string; voice: TheatreVoice; speed: number; instructions: string };
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

export async function generateTheatreResponse(
  text: string,
  playbackSpeed: number,
  synthesize: (input: SpeechInput) => Promise<string>,
  options: { analyze?: SceneAnalyzer; narratorVoice?: TheatreVoice; analysisTimeoutMs?: number } = {}
): Promise<TheatreResponse> {
  const items = parseTheatreItems(text);
  const casting = createTheatreCasting(items, options.narratorVoice);
  const { analysis, metadata: direction } = await prepareDramaticDirection(items, options.analyze, options.analysisTimeoutMs);
  // Casting and complete validated direction are fixed before concurrent TTS.
  const jobs = items.map((item) => ({
    item,
    voice: casting.members.find((member) => member.speaker === item.speaker && member.role === theatreRole(item))!.voice,
    instructions: dramaticInstructions(item, analysis),
    speed: item.type === "stage" ? Math.max(0.65, playbackSpeed - 0.15) : Math.max(0.95, playbackSpeed),
  }));
  const clips: TheatreClip[] = new Array(items.length);
  const failedItems: FailedItem[] = [];
  let nextIndex = 0;
  let generatedClipCount = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      const { item, voice, speed, instructions } = jobs[nextIndex++];
      try {
        const audioBase64 = await synthesize({ text: item.text, voice, speed, instructions });
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
    direction,
    casting,
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
