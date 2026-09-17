/** Privacy boundary: no free-form strings, source IDs, error messages or content.
 * Bounded ephemeral diagnostics ONLY. No transport or durable storage configured.
 * A durable adapter/admin deployment requires the owner's infrastructure decision. */
export const EVENTS = ["document_created", "document_imported", "document_reinterpreted", "operation", "playback", "pronunciation_attempt", "pronunciation_retry", "theatre_replay", "theatre_practice", "virelangue_listen", "virelangue_practice", "ambience", "provider", "rate_limit"] as const;
export const OPERATIONS = ["generation", "reading", "vocabulary", "pronunciation", "direction", "tts", "transcription"] as const;
export const STATUSES = ["started", "completed", "failed", "cancelled", "paused", "resumed", "analyzed_no_ambience", "detected_available", "detected_unavailable", "analysis_unavailable", "playback_failed"] as const;
export const ERRORS = ["RATE_LIMITED", "INVALID_INPUT", "PROVIDER_FAILED", "PLAYBACK_FAILED", "ANALYSIS_UNAVAILABLE", "CAPABILITY_UNAVAILABLE", "MICROPHONE_UNAVAILABLE"] as const;
type EnumValue<T extends readonly string[]> = T[number];
export type BetaData = {
  name: EnumValue<typeof EVENTS>; operation?: EnumValue<typeof OPERATIONS>; status?: EnumValue<typeof STATUSES>;
  contentType?: "news" | "opinion" | "creative" | "conversation" | "academic" | "everyday-life" | "poetry" | "theatre" | "tongue-twisters" | "unknown";
  origin?: "generated" | "imported"; level?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";
  speed?: "very-slow" | "slow" | "normal" | "fast";
  documentId?: string; revision?: number; operationId?: string; durationMs?: number; logicalItems?: number;
  requests?: number; ttsCharacters?: number; inputTokens?: number; outputTokens?: number;
  code?: EnumValue<typeof ERRORS>; environment?: "none" | "neutral_room" | "office" | "rain" | "other";
};
export type BetaEvent = BetaData & { eventId: string; sessionId: string; timestamp: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const enums: Record<string, readonly string[]> = {
  name: EVENTS, operation: OPERATIONS, status: STATUSES, code: ERRORS,
  contentType: ["news", "opinion", "creative", "conversation", "academic", "everyday-life", "poetry", "theatre", "tongue-twisters", "unknown"],
  origin: ["generated", "imported"], level: ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"],
  speed: ["very-slow", "slow", "normal", "fast"], environment: ["none", "neutral_room", "office", "rain", "other"],
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
  constructor(private now = Date.now) { this.born = now(); }
  reset() { this.events = []; this.session = crypto.randomUUID(); this.born = this.now(); }
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
      for (const key of ["name", "operation", "status", "contentType", "level", "speed", "code", "environment"] as const) {
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
