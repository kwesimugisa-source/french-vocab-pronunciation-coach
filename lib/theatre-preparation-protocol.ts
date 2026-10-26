/** Dormant server protocol. No provider invocation, route or client orchestration. */
import { createHash, randomUUID } from "node:crypto";
import { createCanonicalPreparation, validateProductionDirection, validatePerformanceDirection, composeTheatrePlan, TWO_PASS_VERSIONS } from "./theatre-two-pass";
import type { CanonicalPreparation, ProductionDirection, PerformanceDirection, AcceptedPronunciationMap } from "./theatre-two-pass";
import { draftPronunciation, acceptPronunciation } from "./theatre-pronunciation-authority";
import type { TheatrePlan } from "./theatre-generation";
import { isPreparationId } from "./beta-events";

export const PROTOCOL_VERSIONS = Object.freeze({ ...TWO_PASS_VERSIONS, protocol: 1, pass1Prompt: 1, pass2Prompt: 1, model: "gpt-5.4-mini" });
export const PREPARATION_TRANSITIONS = {
  PASS1_PENDING: ["PASS1_TECHNICAL_HOLD", "CLARIFICATION_REQUIRED", "PASS1_READY", "CANCELLED"],
  PASS1_TECHNICAL_HOLD: ["PASS1_PENDING", "CANCELLED"],
  CLARIFICATION_REQUIRED: ["PASS1_READY", "CANCELLED"],
  PASS1_READY: ["PASS2_PENDING", "CANCELLED"],
  PASS2_PENDING: ["PASS2_TECHNICAL_HOLD", "PASS2_READY", "CANCELLED"],
  PASS2_TECHNICAL_HOLD: ["PASS2_PENDING", "CANCELLED"],
  PASS2_READY: ["READY", "CANCELLED"],
  READY: [], CANCELLED: [],
} as const;
export type PreparationState = keyof typeof PREPARATION_TRANSITIONS;
export type Preparation = {
  version: 1; versions: typeof PROTOCOL_VERSIONS; preparationId: string; epoch: number; requestId: string;
  state: PreparationState; canonical: CanonicalPreparation;
  production: ProductionDirection | null; authority: AcceptedPronunciationMap | null; performance: PerformanceDirection | null;
};
export function protocolError(): never { throw new Error("INVALID_PREPARATION"); }
export function freezePreparation<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freezePreparation); Object.freeze(value); }
  return value;
}
export function stableProtocol(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableProtocol).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableProtocol((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function transitionAllowed(from: PreparationState, to: PreparationState): boolean {
  return Object.hasOwn(PREPARATION_TRANSITIONS, from) && (PREPARATION_TRANSITIONS[from] as readonly string[]).includes(to);
}
/** Reuse existing ambiguity policy with a minimal internal plan view, never an audio ticket. */
function authorityPlan(p: CanonicalPreparation, production: ProductionDirection): TheatrePlan {
  return { items: p.items, casting: p.casting, performanceStyle: p.performanceStyle,
    pronunciationCharacters: p.characters, analysis: { version: 1, scene: production.data.scene, items: [],
      pronunciation: production.data.pronunciation, ambience: production.data.ambience },
    pronunciation: undefined, analysisCacheKey: undefined, ambience: production.data.ambience,
    direction: { version: 1, model: "gpt-5.4-mini", status: "analyzed", fallbackReason: null,
      expectedItemCount: p.items.length, annotatedItemCount: 0, fallbackItemCount: 0 } };
}
function draft(p: CanonicalPreparation, production: ProductionDirection): AcceptedPronunciationMap {
  const result = structuredClone(draftPronunciation(authorityPlan(p, production), p.sourceDigest));
  // The protocol owns the production identity; the legacy helper creates its own.
  result.productionId = p.productionId;
  if (result.status === "ready") result.digest = createHash("sha256").update(JSON.stringify({ ...result, digest: undefined })).digest("hex");
  return result;
}
function verifyAuthority(p: CanonicalPreparation, production: ProductionDirection, a: AcceptedPronunciationMap) {
  const original = draft(p, production);
  if (a?.status === "needs-clarification") {
    if (stableProtocol(a) !== stableProtocol(original)) protocolError();
    return;
  }
  let expected = original;
  if (original.status !== "ready") expected = acceptPronunciation(original, { inventoryReviewed: true,
    entries: a?.entries?.filter(e => !original.automaticIds.includes(e.id)), excludedIds: a?.excludedIds }, authorityPlan(p, production));
  // Revisions belong to the application protocol, not owner answers.
  expected = { ...expected, revision: a?.revision, digest: "" };
  if (!Number.isSafeInteger(expected.revision) || expected.revision < 1 || expected.revision > 10000) protocolError();
  expected.digest = createHash("sha256").update(JSON.stringify({ ...expected, digest: undefined })).digest("hex");
  if (stableProtocol(a) !== stableProtocol(expected)) protocolError();
}
export function validatePreparation(s: Preparation): Preparation {
  try {
    if (!s || Object.keys(s).sort().join() !== ["version", "versions", "preparationId", "epoch", "requestId", "state", "canonical", "production", "authority", "performance"].sort().join() ||
      s.version !== 1 || stableProtocol(s.versions) !== stableProtocol(PROTOCOL_VERSIONS) || !isPreparationId(s.preparationId) || !isPreparationId(s.requestId) ||
      !Number.isSafeInteger(s.epoch) || s.epoch < 1 || s.epoch > 10000 || !Object.hasOwn(PREPARATION_TRANSITIONS, s.state)) protocolError();
    const p = s.canonical;
    const rebuilt = createCanonicalPreparation(p.text, { productionId: p.productionId, documentId: p.documentId, documentRevision: p.documentRevision,
      ...(p.characters.length ? { characters: p.characters } : {}), ...(p.narratorVoice ? { narratorVoice: p.narratorVoice } : {}), performanceStyle: p.performanceStyle });
    if (!rebuilt.ok || stableProtocol(rebuilt.value) !== stableProtocol(p)) protocolError();
    if (s.production && !validateProductionDirection(p, s.production).ok) protocolError();
    if (s.authority) { if (!s.production) protocolError(); verifyAuthority(p, s.production, s.authority); }
    if (s.performance && (!s.production || !s.authority || !validatePerformanceDirection(p, s.production, s.authority, s.performance).ok)) protocolError();
    if (["PASS1_PENDING", "PASS1_TECHNICAL_HOLD"].includes(s.state) && (s.production || s.authority || s.performance)) protocolError();
    if (s.state === "CLARIFICATION_REQUIRED" && (!s.production || s.authority?.status !== "needs-clarification" || s.performance)) protocolError();
    if (["PASS1_READY", "PASS2_PENDING", "PASS2_TECHNICAL_HOLD", "PASS2_READY", "READY"].includes(s.state) && (!s.production || s.authority?.status !== "ready")) protocolError();
    if (["PASS1_READY", "PASS2_PENDING", "PASS2_TECHNICAL_HOLD"].includes(s.state) && s.performance) protocolError();
    if (["PASS2_READY", "READY"].includes(s.state) && !s.performance) protocolError();
    if (s.state === "READY" && !composeTheatrePlan(p, s.production!, s.authority!, s.performance!).ok) protocolError();
    return freezePreparation(structuredClone(s));
  } catch { return protocolError(); }
}
export function beginPreparation(canonical: CanonicalPreparation, requestId = randomUUID(), preparationId = randomUUID()): Preparation {
  return validatePreparation({ version: 1, versions: PROTOCOL_VERSIONS, preparationId, epoch: 1, requestId,
    state: "PASS1_PENDING", canonical, production: null, authority: null, performance: null });
}
function move(s: Preparation, state: PreparationState, update: Partial<Preparation> = {}): Preparation {
  validatePreparation(s);
  if (!transitionAllowed(s.state, state)) protocolError();
  return validatePreparation({ ...s, ...update, state });
}
export function acceptPass1(s: Preparation, production: ProductionDirection): Preparation {
  if (s.state !== "PASS1_PENDING" || !validateProductionDirection(s.canonical, production).ok) protocolError();
  const authority = draft(s.canonical, production);
  return move(s, authority.status === "ready" ? "PASS1_READY" : "CLARIFICATION_REQUIRED", { production, authority });
}
export function clarifyPreparation(s: Preparation, answer: unknown, requestId = randomUUID()): Preparation {
  validatePreparation(s);
  if (s.state !== "CLARIFICATION_REQUIRED" || !isPreparationId(requestId) || requestId === s.requestId) protocolError();
  const authority = { ...acceptPronunciation(s.authority!, answer, authorityPlan(s.canonical, s.production!)), revision: s.authority!.revision + 1, digest: "" };
  authority.digest = createHash("sha256").update(JSON.stringify({ ...authority, digest: undefined })).digest("hex");
  return move(s, "PASS1_READY", { authority, performance: null, requestId, epoch: s.epoch + 1 });
}
export function beginPass2(s: Preparation, requestId: string): Preparation {
  if (!isPreparationId(requestId) || requestId === s.requestId) protocolError();
  return move(s, "PASS2_PENDING", { requestId, epoch: s.epoch + 1, performance: null });
}
export function retryPass1(s: Preparation, requestId: string): Preparation {
  if (s.state !== "PASS1_TECHNICAL_HOLD" || !isPreparationId(requestId) || requestId === s.requestId) protocolError();
  return move(s, "PASS1_PENDING", { requestId, epoch: s.epoch + 1 });
}
export function holdPreparation(s: Preparation): Preparation {
  if (s.state !== "PASS1_PENDING" && s.state !== "PASS2_PENDING") protocolError();
  return move(s, s.state === "PASS1_PENDING" ? "PASS1_TECHNICAL_HOLD" : "PASS2_TECHNICAL_HOLD");
}
export function acceptPass2(s: Preparation, performance: PerformanceDirection): Preparation {
  return move(s, "PASS2_READY", { performance });
}
export function completePreparation(s: Preparation): Preparation { return move(s, "READY"); }
export function cancelPreparation(s: Preparation): Preparation { return move(s, "CANCELLED"); }
/** Caller supplies current authenticated lineage, not values copied out of an old token. */
export type ContinuationScope = { preparationId: string; epoch: number; canonical: CanonicalPreparation };
export function assertContinuation(s: Preparation, expected: ContinuationScope) {
  validatePreparation(s);
  if (s.preparationId !== expected.preparationId || s.epoch !== expected.epoch || stableProtocol(s.canonical) !== stableProtocol(expected.canonical) ||
    s.state === "CANCELLED" || s.state === "READY") protocolError();
}
