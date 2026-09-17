import { assertCompleteTheatreResponse, parseTheatreItems } from "./theatre";
import type { TheatreClip, TheatreItem, TheatreResponse } from "./theatre";
import { createTheatreCasting, theatreRole } from "./theatre-casting";
import type { TheatreVoice } from "./theatre-casting";
import { dramaticInstructions, prepareDramaticDirection } from "./theatre-direction";
import type { SceneAnalyzer } from "./theatre-direction";
import { noAmbience, validateAmbience } from "./theatre-ambience";
import { theatreAnalysisCache } from "./theatre-analysis-cache";

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
  options: { analyze?: SceneAnalyzer; narratorVoice?: TheatreVoice; analysisTimeoutMs?: number; analysisCacheKey?: unknown; ambienceDecision?: unknown; skipAnalysis?: boolean } = {}
): Promise<TheatreResponse> {
  const items = parseTheatreItems(text);
  const casting = createTheatreCasting(items, options.narratorVoice);
  const reuse = theatreAnalysisCache.get(options.analysisCacheKey, text);
  const prior = validateAmbience(options.ambienceDecision, items);
  const ambienceDecision = prior.confidence === "high" ? prior : undefined;
  const { analysis, metadata: direction } = await prepareDramaticDirection(items,
    reuse ? async () => reuse : options.skipAnalysis ? undefined : options.analyze, options.analysisTimeoutMs, ambienceDecision);
  if (analysis && ambienceDecision) analysis.ambience = ambienceDecision;
  // Casting and complete validated direction are fixed before concurrent TTS.
  const jobs = items.flatMap((item) => (theatreRole(item) === "chorus" ? casting.chorus.voices :
    [casting.members.find((member) => member.speaker === item.speaker && member.role === theatreRole(item))!.voice]).map((voice, componentIndex) => ({
    item,
    voice, componentIndex,
    instructions: dramaticInstructions(item, analysis),
    speed: item.type === "stage" ? Math.max(0.65, playbackSpeed - 0.15) : Math.max(0.95, playbackSpeed),
  })));
  const components: { voice: string; audioBase64: string }[][] = items.map(() => []);
  const clips: TheatreClip[] = new Array(items.length);
  const failedItems: FailedItem[] = [];
  let nextIndex = 0;
  let generatedClipCount = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      const { item, voice, speed, componentIndex, instructions } = jobs[nextIndex++];
      try {
        const audioBase64 = await synthesize({ text: item.text, voice, speed, instructions });
        if (!audioBase64.trim()) throw new Error("Empty theatre audio");
        components[item.index][componentIndex] = { voice, audioBase64 };
      } catch {
        // Do not expose upstream error bodies or discard the failed item's identity.
        if (!failedItems.some((failed) => failed.index === item.index)) {
          failedItems.push({ id: item.id, index: item.index, sourceLines: item.sourceLines });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(THEATRE_TTS_CONCURRENCY, jobs.length) }, worker));
  // A component failure fails its logical chorus and the scene explicitly.
  // Never publish a partial chorus or advance an incomplete logical item.
  for (const item of items) {
    if (failedItems.some((failed) => failed.index === item.index)) continue;
    const parts = components[item.index];
    const speed = item.type === "stage" ? Math.max(0.65, playbackSpeed - 0.15) : Math.max(0.95, playbackSpeed);
    clips[item.index] = { ...item, ...parts[0], speed,
      ...(theatreRole(item) === "chorus" ? { chorus: { components: parts } } : {}) };
    generatedClipCount++;
  }
  if (failedItems.length) {
    failedItems.sort((a, b) => a.index - b.index);
    throw new TheatreGenerationError(failedItems, items.length, generatedClipCount);
  }

  const response: TheatreResponse = {
    mode: "theatre",
    direction,
    ...(analysis ? { analysisCacheKey: theatreAnalysisCache.put(text, analysis) } : {}),
    casting,
    ambience: ambienceDecision ?? analysis?.ambience ?? noAmbience(),
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
