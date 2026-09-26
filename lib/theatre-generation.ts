import { theatreStyle } from "./theatre-performance";
import { assertCompleteTheatreResponse, parseTheatreItems } from "./theatre";
import type { TheatreClip, TheatreItem, TheatreResponse } from "./theatre";
import { createTheatreCasting, theatreRole } from "./theatre-casting";
import type { TheatreVoice } from "./theatre-casting";
import { dramaticInstructions, prepareDramaticDirection, withinDirectorBudget } from "./theatre-direction";
import type { SceneAnalyzer } from "./theatre-direction";
import { noAmbience, validateAmbience } from "./theatre-ambience";
import { validateTheatreCharacters } from "./theatre-characters";
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

export type TheatreGenerationOptions = { performanceStyle?: unknown; theatreCharacters?: unknown; analyze?: SceneAnalyzer; narratorVoice?: TheatreVoice; analysisTimeoutMs?: number; analysisCacheKey?: unknown; ambienceDecision?: unknown; skipAnalysis?: boolean; directorEnabled?: boolean; documentId?: string; revision?: number };

export async function prepareTheatrePlan(text: string, options: TheatreGenerationOptions = {}) {
  const performanceStyle = theatreStyle(options.performanceStyle);
  const items = parseTheatreItems(text);
  const metadata = options.theatreCharacters === undefined ? [] : validateTheatreCharacters(options.theatreCharacters, text);
  const casting = createTheatreCasting(items, options.narratorVoice, metadata);
  // Speed and delivery style do not reinterpret the scene. Canonical source,
  // revision, generated identity labels and Director version do bind reuse.
  const cacheScope = options.directorEnabled ? JSON.stringify({ directorVersion: 1,
    documentId: options.documentId ?? null, revision: options.revision ?? null,
    characters: metadata.map(({speakerId,displayName}) => ({speakerId,displayName})) }) : "";
  const reuse = theatreAnalysisCache.get(options.analysisCacheKey, text, cacheScope);
  const prior = validateAmbience(options.ambienceDecision, items);
  const ambienceDecision = prior.confidence === "high" ? prior : undefined;
  const { analysis, metadata: direction } = await prepareDramaticDirection(items,
    reuse ? async () => reuse : options.skipAnalysis ? undefined : options.analyze, options.analysisTimeoutMs, ambienceDecision,
    options.directorEnabled ? { characters: metadata.map(({speakerId,displayName}) => ({speakerId,displayName})) } : undefined);
  if (analysis && ambienceDecision) analysis.ambience = ambienceDecision;
  if (options.directorEnabled || analysis?.director) direction.director = {
    version: 1, status: performanceStyle === "clarte" ? "not_applied" : analysis?.director ? "applied" : "fallback",
    reason: performanceStyle === "clarte" || analysis?.director ? null : !analysis ? "analysis_unavailable" : !withinDirectorBudget(items) ? "plan_budget" : "invalid_or_missing_plan",
    directedItemCount: performanceStyle === "naturel" ? analysis?.director?.lines.length ?? 0 : 0,
  };
  return { items, casting, analysis, direction, performanceStyle,
    analysisCacheKey: analysis ? theatreAnalysisCache.put(text, analysis, cacheScope) : undefined,
    ambience: ambienceDecision ?? analysis?.ambience ?? noAmbience() };
}
export type TheatrePlan = Awaited<ReturnType<typeof prepareTheatrePlan>>;

export async function generateTheatreResponse(
  text: string, playbackSpeed: number, synthesize: (input: SpeechInput) => Promise<string>,
  options: TheatreGenerationOptions = {}
): Promise<TheatreResponse> {
  const plan = await prepareTheatrePlan(text, options);
  const { items, casting, analysis, direction, performanceStyle } = plan;
  // Casting and complete validated direction are fixed before concurrent TTS.
  const jobs = items.flatMap((item) => (theatreRole(item) === "chorus" ? casting.chorus.voices :
    [casting.members.find((member) => member.speaker === item.speaker && member.role === theatreRole(item))!.voice]).map((voice, componentIndex) => ({
    item,
    voice, componentIndex,
    instructions: dramaticInstructions(item, analysis, performanceStyle, {voice, items}),
    speed: item.type === "stage" ? Math.max(0.65, playbackSpeed - 0.15) : playbackSpeed,
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
    const speed = item.type === "stage" ? Math.max(0.65, playbackSpeed - 0.15) : playbackSpeed;
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
    performanceStyle,
    direction,
    ...(plan.analysisCacheKey ? { analysisCacheKey: plan.analysisCacheKey } : {}),
    casting,
    ambience: plan.ambience,
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
