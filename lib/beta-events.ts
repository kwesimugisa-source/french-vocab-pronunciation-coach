/** Privacy boundary: no free-form strings, source IDs, error messages or content.
 * Journals are bounded and ephemeral. Theatre preparation records also go to
 * hosting logs through beta-server; no client transport or public inspection API. */
export const EVENTS = ["document_created", "document_imported", "document_reinterpreted", "operation", "playback", "pronunciation_attempt", "pronunciation_retry", "theatre_replay", "theatre_practice", "virelangue_listen", "virelangue_practice", "ambience", "provider", "rate_limit", "theatre_style"] as const;
export const OPERATIONS = ["generation", "reading", "vocabulary", "pronunciation", "direction", "tts", "transcription"] as const;
export const STATUSES = ["started", "completed", "failed", "cancelled", "paused", "resumed", "analyzed_no_ambience", "detected_available", "detected_unavailable", "analysis_unavailable", "playback_failed"] as const;
export const ERRORS = ["RATE_LIMITED", "INVALID_INPUT", "PROVIDER_FAILED", "PLAYBACK_FAILED", "ANALYSIS_UNAVAILABLE", "CAPABILITY_UNAVAILABLE", "MICROPHONE_UNAVAILABLE"] as const;
type EnumValue<T extends readonly string[]> = T[number];
export type BetaData = {
  name: EnumValue<typeof EVENTS>; operation?: EnumValue<typeof OPERATIONS>; status?: EnumValue<typeof STATUSES>;
  contentType?: "news" | "opinion" | "creative" | "conversation" | "academic" | "everyday-life" | "poetry" | "theatre" | "tongue-twisters" | "unknown";
  origin?: "generated" | "imported"; level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";
  performanceStyle?: "clarte" | "naturel";
  speed?: "very-slow" | "slow" | "normal" | "fast";
  documentId?: string; revision?: number; operationId?: string; durationMs?: number; logicalItems?: number;
  requests?: number; ttsCharacters?: number; inputTokens?: number; outputTokens?: number;
  code?: EnumValue<typeof ERRORS>; environment?: "none" | "neutral_room" | "office" | "rain" | "station" | "other";
};
export type BetaEvent = BetaData & { eventId: string; sessionId: string; timestamp: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PREPARATION_STAGES = ["request", "director", "provider", "provider_evidence", "structured_response", "director_validation", "dramatic_validation", "pronunciation_validation", "inventory", "occurrence_evidence", "authority", "response"] as const;
export const PREPARATION_OUTCOMES = ["started", "present", "absent", "passed", "rejected", "fallback", "reused", "ignored", "succeeded", "failed", "cancelled", "clarification"] as const;
export const PROVIDER_RESPONSE_REASONS = ["provider_output_limit", "provider_content_filter", "provider_incomplete_unknown", "provider_response_failed", "provider_response_cancelled", "provider_response_nonterminal", "provider_status_unknown", "provider_refusal"] as const;
export type ProviderResponseReason = typeof PROVIDER_RESPONSE_REASONS[number];
export const PREPARATION_TOKEN_FIELDS = ["requestedMaxOutputTokens", "outputTokens", "reasoningTokens"] as const;
// Boundary evidence is emitted separately, never accumulated into a terminal receipt.
const fieldStates = ["missing", "invalid", "valid"] as const;
export const PREPARATION_BOUNDARY_RULES = {
  scene: {items:100_000, dialogue:100_000, stage:100_000, chorus:100_000, silence:100_000, characters:100_000, speakers:100_000, inputBytes:1_000_000},
  usage: {usage:fieldStates, inputState:fieldStates, outputState:fieldStates, reasoningState:fieldStates, totalState:fieldStates,
    inputTokens:1_000_000, outputTokens:1_000_000, reasoningTokens:1_000_000, totalTokens:1_000_000},
  output: {textState:fieldStates, itemsState:fieldStates, contentState:fieldStates, chars:10_000_000,
    items:10_000, messages:10_000, reasoning:10_000, functions:10_000, otherItems:10_000, textParts:10_000, refusals:10_000, otherParts:10_000},
  config: {maxState:fieldStates, echoedMax:1_000_000, maxMatch:["same","different","unavailable"]},
} as const;
type BoundaryRules = typeof PREPARATION_BOUNDARY_RULES;
export type PreparationBoundary = {[K in keyof BoundaryRules]: {kind:K} & {
  -readonly [F in keyof BoundaryRules[K]]?: BoundaryRules[K][F] extends number ? number : BoundaryRules[K][F] extends readonly string[] ? BoundaryRules[K][F][number] : never
}}[keyof BoundaryRules];
export function validatePreparationBoundary(value:unknown): asserts value is PreparationBoundary {
  if(!value || typeof value!=="object" || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) throw new Error("Invalid boundary");
  const v=value as Record<string,unknown>;
  // Check data descriptors before reading kind or any value.
  if(Reflect.ownKeys(v).some(k=>typeof k!=="string" || !Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,"value"))) throw new Error("Invalid boundary");
  if(typeof v.kind!=="string" || !Object.hasOwn(PREPARATION_BOUNDARY_RULES,v.kind)) throw new Error("Invalid boundary");
  const rules=PREPARATION_BOUNDARY_RULES[v.kind as keyof BoundaryRules] as Record<string,number|readonly string[]>;
  if(Reflect.ownKeys(v).some(k=>k!=="kind"&&!Object.hasOwn(rules,k))) throw new Error("Invalid boundary");
  for(const [key,rule] of Object.entries(rules)) {
    if(typeof rule==="number") {
      if(v[key]===undefined && v.kind!=="scene") continue;
      if(!Number.isSafeInteger(v[key]) || (v[key] as number)<0 || (v[key] as number)>rule) throw new Error("Invalid boundary count");
    } else if(!rule.includes(v[key] as string)) throw new Error("Invalid boundary category");
  }
}
export const PREPARATION_REASONS = ["none", ...PROVIDER_RESPONSE_REASONS, "provider_failure", "timeout", "cancelled", "incomplete_response", "structured_response_missing", "parse_rejected", "validation_rejected", "invalid_dramatic_analysis", "output_missing", "evidence_mismatch", "inventory_incomplete", "missing_cast_coverage", "invalid_established_decision", "unbound_occurrence", "authority_rejected", "linguistic_ambiguity", "analysis_unavailable", "analysis_rejected", "director_plan_missing", "director_plan_rejected", "late_result_ignored", "input_budget", "output_budget", "empty_scene", "invalid_request", "rate_limited", "preparation_failed"] as const;
export const PREPARATION_DISPOSITIONS = ["READY", "CLARIFICATION_REQUIRED", "TECHNICAL_HOLD", "CANCELLED"] as const;
export const PREPARATION_CONFIGURATION = {schemaVersion:2,provider:"openai",model:"gpt-5.4-mini",directorSchemaVersion:1,pronunciationSchemaVersion:1,pronunciationPolicyVersion:2} as const;
export const PREPARATION_COUNT_FIELDS = ["established", "ambiguous", "conflicting", "unknown", "rejected", "accepted", "unbound"] as const;
export type PreparationCounts = Partial<Record<typeof PREPARATION_COUNT_FIELDS[number], number>>;
export type PreparationMetadata = {counts?:PreparationCounts; authorityRevision?:number; boundary?:PreparationBoundary} & Partial<Record<typeof PREPARATION_TOKEN_FIELDS[number],number>>;
export type PreparationStage = typeof PREPARATION_STAGES[number];
export type PreparationReason = typeof PREPARATION_REASONS[number];
export type PreparationOutcome = typeof PREPARATION_OUTCOMES[number];
export type PreparationRecord = { timestamp: number; build: string; requestId: string; stage: PreparationStage; outcome: PreparationOutcome; reason: PreparationReason; retryable: boolean;
  elapsedMs:number; totalElapsedMs:number; disposition?:typeof PREPARATION_DISPOSITIONS[number] } & typeof PREPARATION_CONFIGURATION & PreparationMetadata;
export type PreparationObserver = (stage: PreparationStage, outcome: Exclude<PreparationOutcome,"succeeded"|"failed"|"cancelled"|"clarification"|"ignored">, reason?: PreparationReason, metadata?:PreparationMetadata) => void;
export function isPreparationId(value: unknown): value is string { return typeof value === "string" && value.length === 36 && uuid.test(value); }
/** Closed contract: no arbitrary text, content-derived IDs, or optional payloads. */
export function validatePreparationRecord(value: unknown): asserts value is PreparationRecord {
  const plain=(x:unknown):x is Record<string,unknown>=>!!x && typeof x==="object" && [Object.prototype,null].includes(Object.getPrototypeOf(x));
  if (!plain(value)) throw new Error("Invalid preparation record");
  const v = value as Record<string, unknown>;
  const required=["timestamp","build","requestId","stage","outcome","reason","retryable","elapsedMs","totalElapsedMs",...Object.keys(PREPARATION_CONFIGURATION)];
  if (Reflect.ownKeys(v).some(k=>typeof k!=="string" || ![...required,"counts","authorityRevision","disposition","boundary",...PREPARATION_TOKEN_FIELDS].includes(k) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)!,"value")) || !required.every(k => Object.hasOwn(v,k)) ||
    !Number.isSafeInteger(v.timestamp) || (v.timestamp as number) < 0 || (v.timestamp as number) > 1e15 ||
    typeof v.build !== "string" || !(v.build === "unknown" || (v.build.length === 40 && /^[0-9a-f]{40}$/.test(v.build))) || !isPreparationId(v.requestId) ||
    !PREPARATION_STAGES.includes(v.stage as PreparationStage) || !PREPARATION_OUTCOMES.includes(v.outcome as PreparationOutcome) ||
    !PREPARATION_REASONS.includes(v.reason as PreparationReason) || typeof v.retryable !== "boolean" ||
    Object.entries(PREPARATION_CONFIGURATION).some(([k,x])=>v[k]!==x) ||
    [v.elapsedMs,v.totalElapsedMs].some(x=>!Number.isInteger(x)||(x as number)<0||(x as number)>3_600_000))
    throw new Error("Invalid preparation record");
  for(const key of PREPARATION_TOKEN_FIELDS) if(v[key]!==undefined && (!Number.isSafeInteger(v[key]) || (v[key] as number)<0 || (v[key] as number)>1_000_000)) throw new Error("Invalid token count");
  if(v.authorityRevision!==undefined && (!Number.isInteger(v.authorityRevision)||(v.authorityRevision as number)<1||(v.authorityRevision as number)>10000)) throw new Error("Invalid revision");
  if(v.counts!==undefined && (!plain(v.counts) || Reflect.ownKeys(v.counts).some(k=>typeof k!=="string" || !PREPARATION_COUNT_FIELDS.includes(k as typeof PREPARATION_COUNT_FIELDS[number]) || !Object.hasOwn(Object.getOwnPropertyDescriptor(v.counts,k)!,"value")) || Object.values(v.counts).some(n=>!Number.isInteger(n)||(n as number)<0||(n as number)>100000))) throw new Error("Invalid counts");
  if(v.boundary!==undefined) {
    validatePreparationBoundary(v.boundary);
    if(v.stage!=="provider_evidence" || v.outcome!=="present" || v.reason!=="none") throw new Error("Invalid boundary event");
  }
  const terminal: Record<string,string> = {succeeded:"READY",failed:"TECHNICAL_HOLD",cancelled:"CANCELLED",clarification:"CLARIFICATION_REQUIRED"};
  if(terminal[v.outcome as string] ? v.disposition!==terminal[v.outcome as string] : Object.hasOwn(v,"disposition")) throw new Error("Invalid disposition");
  if(JSON.stringify(v).length>1024) throw new Error("Oversized preparation record");
}
export function copyPreparationRecord(record:PreparationRecord):PreparationRecord { return {...record,...(record.boundary?{boundary:{...record.boundary}}:{}),...(record.counts?{counts:{...record.counts}}:{})}; }
/** Instrumentation callbacks cannot change learning behavior, even if a sink fails. */
export function observePreparation(observer: PreparationObserver | undefined, stage: PreparationStage, outcome: Parameters<PreparationObserver>[1], reason: PreparationReason = "none", metadata?:PreparationMetadata) {
  try { observer?.(stage, outcome, reason, metadata); } catch { /* Never log rejected payloads. */ }
}
const enums: Record<string, readonly string[]> = {
  name: EVENTS, operation: OPERATIONS, status: STATUSES, code: ERRORS,
  contentType: ["news", "opinion", "creative", "conversation", "academic", "everyday-life", "poetry", "theatre", "tongue-twisters", "unknown"],
  origin: ["generated", "imported"], level: ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"],
  performanceStyle: ["clarte", "naturel"],
  speed: ["very-slow", "slow", "normal", "fast"], environment: ["none", "neutral_room", "office", "rain", "station", "other"],
};
const ids = ["documentId", "operationId", "eventId", "sessionId"];
const numbers = ["revision", "durationMs", "logicalItems", "requests", "ttsCharacters", "inputTokens", "outputTokens", "timestamp"];
export function validateBetaEvent(value: unknown): asserts value is BetaEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid beta event");
  const v = value as Record<string, unknown>;
  if (!["name", "eventId", "sessionId", "timestamp"].every(k => Object.hasOwn(v,k))) throw new Error("Invalid beta event");
  for (const [key, item] of Object.entries(v)) {
    if (enums[key]) { if (typeof item !== "string" || !enums[key].includes(item)) throw new Error("Invalid category"); }
    else if (ids.includes(key)) { if (typeof item !== "string" || !uuid.test(item)) throw new Error("Invalid opaque ID"); }
    else if (numbers.includes(key)) { if (typeof item !== "number" || !Number.isSafeInteger(item) || item < 0 || item > 1e15) throw new Error("Invalid count"); }
    else throw new Error("Prohibited telemetry field");
  }
}
export class BetaJournal {
  private session = crypto.randomUUID();
  private born: number;
  private events: BetaEvent[] = [];
  private preparations: PreparationRecord[] = [];
  constructor(private now = Date.now) { this.born = now(); }
  reset() { this.events = []; this.preparations = []; this.session = crypto.randomUUID(); this.born = this.now(); }
  recordPreparation(record: PreparationRecord) {
    try { validatePreparationRecord(record); this.sessionId(); this.preparations.push(copyPreparationRecord(record)); if(this.preparations.length > 1000) this.preparations.shift(); } catch { /* Privacy boundary. */ }
  }
  inspectPreparations() { this.sessionId(); return this.preparations.map(copyPreparationRecord); }
  sessionId() { if (this.now() - this.born >= 30 * 60_000) this.reset(); return this.session; }
  emit(data: BetaData) {
    // Strictly validate even runtime callers. Failure cannot break a lesson.
    try {
      const event = { ...data, eventId: crypto.randomUUID(), sessionId: this.sessionId(), timestamp: this.now() };
      validateBetaEvent(event); this.events.push(event); if (this.events.length > 1000) this.events.shift();
    } catch { /* No payload logging. */ }
  }
  inspect() { this.sessionId(); return this.events.map(e => ({ ...e })); }
  aggregate() {
    const events = this.inspect(), counts: Record<string, number> = {}, latencies: number[] = [];
    const byMode: Record<string, Record<string, number>> = {};
    let requests = 0, ttsCharacters = 0, inputTokens = 0, outputTokens = 0;
    for (const e of events) {
      for (const key of ["name", "operation", "status", "contentType", "level", "speed", "performanceStyle", "code", "environment"] as const) {
        if (e[key]) { const label = `${key}:${e[key]}`; counts[label] = (counts[label] ?? 0) + 1; }
      }
      if (e.contentType) {
        const mode = byMode[e.contentType] ??= {};
        const action = `${e.name}:${e.operation ?? "none"}:${e.status ?? "recorded"}`;
        mode[action] = (mode[action] ?? 0) + 1;
        if (e.code) mode[e.code] = (mode[e.code] ?? 0) + 1;
      }
      if (e.name === "operation" && e.status === "completed" && e.durationMs !== undefined) latencies.push(e.durationMs);
      requests += e.requests ?? 0; ttsCharacters += e.ttsCharacters ?? 0; inputTokens += e.inputTokens ?? 0; outputTokens += e.outputTokens ?? 0;
    }
    latencies.sort((a,b) => a-b);
    return { storage: "ephemeral-memory-only", events: events.length, sessions: new Set(events.map(e=>e.sessionId)).size,
      responsesWithTokenUsage: events.filter(e=>e.name==="provider" && (e.inputTokens!==undefined || e.outputTokens!==undefined)).length,
      counts, byMode, requests, ttsCharacters, inputTokens, outputTokens,
      meanPreparationMs: latencies.length ? latencies.reduce((a,b)=>a+b,0)/latencies.length : null,
      medianPreparationMs: latencies.length ? (latencies[Math.floor((latencies.length-1)/2)] + latencies[Math.floor(latencies.length/2)])/2 : null };
  }
}
export const betaJournal = new BetaJournal();
const documents = new Map<string, string>();
export function resetBetaDiagnostics() { betaJournal.reset(); documents.clear(); }
export function betaContext(doc?: { documentId?: string; revision?: number; contentType?: unknown; origin?: unknown; level?: unknown }, speed?: string): Partial<BetaData> {
  const data: Partial<BetaData> = {};
  if (doc?.documentId) {
    if (!documents.has(doc.documentId)) { if (documents.size >= 128) documents.clear(); documents.set(doc.documentId, crypto.randomUUID()); }
    data.documentId = documents.get(doc.documentId)!;
  }
  if (Number.isSafeInteger(doc?.revision) && doc!.revision! > 0) data.revision = doc!.revision;
  for (const key of ["contentType", "origin", "level"] as const) if (enums[key].includes(doc?.[key] as string)) Object.assign(data,{[key]:doc![key]});
  if (speed && enums.speed.includes(speed)) data.speed = speed as BetaData["speed"];
  return data;
}
export function betaHeaders() { return { "X-Beta-Session": betaJournal.sessionId() }; }
