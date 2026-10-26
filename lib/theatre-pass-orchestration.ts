/** Internal server entry points, one bounded provider stage per invocation.
 * No route/client imports this module. Caller supplies current trusted scope. */
import type OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { acceptProductionDirection, acceptPerformanceDirection, composeTheatrePlan } from "./theatre-two-pass";
import type { CanonicalPreparation, ProductionDirectionData, PerformanceDirectionData, TwoPassRejection } from "./theatre-two-pass";
import { beginPreparation, acceptPass1, beginPass2, acceptPass2, completePreparation, clarifyPreparation, holdPreparation, cancelPreparation } from "./theatre-preparation-protocol";
import type { Preparation, ContinuationScope } from "./theatre-preparation-protocol";
import { openPreparation, sealPreparation, sealTwoPassScene } from "./theatre-preparation-token";
import { PreparationCaches } from "./theatre-preparation-cache";
import { TheatrePreparationRecorder } from "./beta-server";
import { PREPARATION_REASONS, isPreparationId } from "./beta-events";
import type { PreparationRecord, PreparationReason, PreparationStage } from "./beta-events";
import { pronunciationDiagnosticCounts, PronunciationPreparationError } from "./theatre-pronunciation";
import { requestPass, PassFailure } from "./theatre-pass-provider";
import type { PassTimers } from "./theatre-pass-provider";

type Options = { client: OpenAI; secret: string; requestId?: string; signal?: AbortSignal; caches?: PreparationCaches;
  sink?: (record: PreparationRecord) => void; timers?: PassTimers; now?: () => number };
export type PreparationResult = { preparation: Preparation; token: string | null; receipt: PreparationRecord | null;
  reason: PreparationReason; retryable: boolean; upstreamRevisionRequired?: boolean };
function rejected(error: TwoPassRejection, pass: "pass1" | "pass2"): PassFailure {
  if (error.reason === "inventory_incomplete" || error.reason === "lexical_inventory_gap") return new PassFailure(pass === "pass1" ? "inventory" : "pass2_validation", "inventory_incomplete");
  if (error.reason === "evidence_mismatch") return new PassFailure("occurrence_evidence", "evidence_mismatch");
  if (error.stage === "authority") return new PassFailure("authority", "authority_rejected");
  return new PassFailure(`${pass}_validation`, "validation_rejected");
}
function recorder(s: Preparation, pass: "pass1" | "pass2", o: Options) {
  const r = new TheatrePreparationRecorder(s.requestId, o.sink, o.now, { preparationId: s.preparationId, epoch: s.epoch, pass });
  r.activate();
  r.observe("request", "present", "none", { checkpoint: { contract: 1, prompt: 1, schema: 1, policy: 1,
    pass1Revision: s.production?.binding.revision ?? 0, pass2Revision: s.performance?.binding.revision ?? 0 } });
  return r;
}
function checkSignal(signal?: AbortSignal) { if (signal?.aborted) throw new PassFailure("request", "cancelled"); }
function failed(s: Preparation, error: unknown, r: TheatrePreparationRecorder, o: Options): PreparationResult {
  const f = error instanceof PassFailure ? error : error instanceof PronunciationPreparationError && PREPARATION_REASONS.includes(error.reason)
    ? new PassFailure("pronunciation_validation", error.reason) : new PassFailure("response", "preparation_failed");
  r.observe(f.stage, "rejected", f.reason);
  // Preserve the pending snapshot on composition/ticket failure: it contains exact
  // upstream acceptance but no accepted downstream result, so explicit retry is safe.
  const state = f.reason === "cancelled" ? cancelPreparation(s) : holdPreparation(s);
  let token: string | null = null;
  if (state.state !== "CANCELLED") { try { token = sealPreparation(state, o.secret, o.now?.()); } catch { /* Bounded transport can fail closed; never return partial authority as READY. */ } }
  return { preparation: state, token, receipt: r.finish(f.reason === "cancelled" ? 408 : 503, f.reason === "cancelled" ? "cancelled" : undefined),
    reason: r.originatingReason() ?? f.reason, retryable: f.reason !== "cancelled", ...(f.reason === "inventory_incomplete" && s.state === "PASS2_PENDING" ? { upstreamRevisionRequired: true } : {}) };
}
/** Pass 1 stops at clarification or PASS1_READY. Never chains a second provider call. */
export async function runProductionPass(canonical: CanonicalPreparation, o: Options): Promise<PreparationResult> {
  const pending = beginPreparation(canonical, (o.requestId ?? randomUUID()) as Parameters<typeof beginPreparation>[1]), r = recorder(pending, "pass1", o);
  try {
    checkSignal(o.signal);
    let artifact = o.caches?.getPass1(canonical);
    if (artifact) r.observe("pass1_validation", "reused");
    else {
      const raw = await requestPass(o.client, pending, "pass1", r.observe, o.signal, o.timers);
      checkSignal(o.signal); r.observe("pass1_validation", "started");
      const validated = acceptProductionDirection(canonical, raw as ProductionDirectionData);
      if (!validated.ok) throw rejected(validated.error, "pass1");
      artifact = validated.value;
    }
    r.observe("pass1_validation", "passed");
    const accepted = acceptPass1(pending, artifact);
    for (const stage of ["pronunciation_validation", "inventory", "occurrence_evidence"] as const) r.observe(stage, "passed");
    const ambiguous = accepted.state === "CLARIFICATION_REQUIRED";
    r.observe("authority", "passed", ambiguous ? "linguistic_ambiguity" : "none", { authorityRevision: accepted.authority!.revision,
      counts: { ...pronunciationDiagnosticCounts(accepted.authority!.entries), accepted: accepted.authority!.automaticIds.length } });
    checkSignal(o.signal);
    const token = sealPreparation(accepted, o.secret, o.now?.());
    // Cache is optional acceleration; capacity/serialization failure cannot destroy a valid token.
    try { o.caches?.putPass1(canonical, artifact); } catch { /* Already independently accepted above. */ }
    if (!ambiguous) r.observe("pass1_accepted", "passed");
    return { preparation: accepted, token, receipt: r.finish(200), reason: ambiguous ? "linguistic_ambiguity" : "none", retryable: false };
  } catch (error) { return failed(pending, error, r, o); }
}
/** A separate invocation: authenticated continuation, optional owner answer, then Pass 2 only. */
export async function runPerformancePass(token: string, current: ContinuationScope, o: Options & { answer?: unknown; speed: number }): Promise<PreparationResult> {
  let prior = openPreparation(token, o.secret, current, o.now?.());
  const requestId = o.requestId ?? randomUUID();
  if (!isPreparationId(requestId) || requestId === prior.requestId) throw new Error("INVALID_PREPARATION");
  if (prior.state === "CLARIFICATION_REQUIRED") prior = clarifyPreparation(prior, o.answer);
  else if (o.answer !== undefined) throw new Error("INVALID_PREPARATION");
  const pending = beginPass2(prior, requestId), r = recorder(pending, "pass2", o);
  try {
    checkSignal(o.signal);
    r.observe("pass1_accepted", "reused");
    r.observe("authority", "passed", "none", { authorityRevision: pending.authority!.revision });
    let artifact = o.caches?.getPass2(pending.canonical, pending.production!, pending.authority!);
    if (artifact) r.observe("pass2_validation", "reused");
    else {
      const raw = await requestPass(o.client, pending, "pass2", r.observe, o.signal, o.timers);
      checkSignal(o.signal); r.observe("pass2_validation", "started");
      const validated = acceptPerformanceDirection(pending.canonical, pending.production!, pending.authority!, raw as PerformanceDirectionData);
      if (!validated.ok) throw rejected(validated.error, "pass2");
      artifact = validated.value;
    }
    const second = acceptPass2(pending, artifact);
    r.observe("pass2_validation", "passed"); r.observe("composition", "started");
    const composed = composeTheatrePlan(second.canonical, second.production!, second.authority!, second.performance!);
    if (!composed.ok) throw new PassFailure("composition", "validation_rejected");
    const ready = completePreparation(second);
    r.observe("composition", "passed"); checkSignal(o.signal);
    r.observe("ticket", "started");
    const readyToken = sealTwoPassScene(ready, o.speed, o.secret, o.now?.());
    r.observe("ticket", "passed", "none", { checkpoint: { contract: 1, prompt: 1, schema: 1, policy: 1,
      pass1Revision: ready.production!.binding.revision, pass2Revision: ready.performance!.binding.revision } });
    try { o.caches?.putPass2(ready.canonical, ready.production!, ready.authority!, artifact); } catch { /* Optional acceleration. */ }
    return { preparation: ready, token: readyToken, receipt: r.finish(200), reason: "none", retryable: false };
  } catch (error) { return failed(pending, error, r, o); }
}
