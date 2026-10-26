/** Independent, bounded, process-local stage caches. No durability promise. */
import { createHash } from "node:crypto";
import { validateProductionDirection, validatePerformanceDirection } from "./theatre-two-pass";
import type { CanonicalPreparation, ProductionDirection, PerformanceDirection, AcceptedPronunciationMap } from "./theatre-two-pass";
import { PROTOCOL_VERSIONS, stableProtocol, protocolError, beginPreparation, acceptPass1 } from "./theatre-preparation-protocol";

export type StageVersions = { model: string; prompt: number; schema: number; policy: number };
export type CacheScope = { pass1: StageVersions; pass2: StageVersions; acceptedAmbience: unknown };
export const DEFAULT_PREPARATION_SCOPE: CacheScope = Object.freeze({
  pass1: Object.freeze({ model: PROTOCOL_VERSIONS.model, prompt: PROTOCOL_VERSIONS.pass1Prompt, schema: PROTOCOL_VERSIONS.schema, policy: PROTOCOL_VERSIONS.policy }),
  pass2: Object.freeze({ model: PROTOCOL_VERSIONS.model, prompt: PROTOCOL_VERSIONS.pass2Prompt, schema: PROTOCOL_VERSIONS.schema, policy: PROTOCOL_VERSIONS.policy }), acceptedAmbience: null,
});
const hash = (v: unknown) => createHash("sha256").update(stableProtocol(v)).digest("hex");
const { pass2Prompt: _pass2Prompt, ...upstreamVersions } = PROTOCOL_VERSIONS;
const p1Key = (p: CanonicalPreparation, scope: CacheScope) => hash([upstreamVersions, p, scope.pass1, scope.acceptedAmbience]);
const p2Key = (p: CanonicalPreparation, a: ProductionDirection, m: AcceptedPronunciationMap, scope: CacheScope) =>
  hash([p1Key(p, scope), scope.pass2, a.binding.digest, a.binding.revision, m.digest, m.revision]);
export class PreparationCaches {
  private first = new Map<string, { expires: number; value: ProductionDirection }>();
  private second = new Map<string, { expires: number; value: PerformanceDirection }>();
  constructor(private now = Date.now) {}
  private put<T>(map: Map<string, { expires: number; value: T }>, key: string, value: T) {
    if (Buffer.byteLength(JSON.stringify(value)) > 1_000_000) throw new Error("PREPARATION_TOO_LARGE");
    for (const [k, entry] of map) if (entry.expires <= this.now()) map.delete(k);
    map.delete(key);
    while (map.size >= 16) map.delete(map.keys().next().value!);
    map.set(key, { expires: this.now() + 30 * 60_000, value: structuredClone(value) });
  }
  private get<T>(map: Map<string, { expires: number; value: T }>, key: string): T | null {
    const entry = map.get(key);
    if (!entry || entry.expires <= this.now()) { map.delete(key); return null; }
    return structuredClone(entry.value);
  }
  putPass1(p: CanonicalPreparation, artifact: ProductionDirection, scope = DEFAULT_PREPARATION_SCOPE) {
    const valid = validateProductionDirection(p, artifact); if (!valid.ok) protocolError();
    // Structural CP1 acceptance alone must not cache a proposal that the
    // authority policy rejects technically. Genuine clarification is cacheable.
    acceptPass1(beginPreparation(p), valid.value);
    this.put(this.first, p1Key(p, scope), valid.value);
  }
  getPass1(p: CanonicalPreparation, scope = DEFAULT_PREPARATION_SCOPE): ProductionDirection | null {
    const value = this.get(this.first, p1Key(p, scope));
    if (!value) return null;
    try { acceptPass1(beginPreparation(p), value); return value; } catch { return null; }
  }
  putPass2(p: CanonicalPreparation, a: ProductionDirection, m: AcceptedPronunciationMap, artifact: PerformanceDirection, scope = DEFAULT_PREPARATION_SCOPE) {
    const valid = validatePerformanceDirection(p, a, m, artifact); if (!valid.ok) protocolError();
    this.put(this.second, p2Key(p, a, m, scope), valid.value);
  }
  getPass2(p: CanonicalPreparation, a: ProductionDirection, m: AcceptedPronunciationMap, scope = DEFAULT_PREPARATION_SCOPE): PerformanceDirection | null {
    const value = this.get(this.second, p2Key(p, a, m, scope));
    return value && validatePerformanceDirection(p, a, m, value).ok ? value : null;
  }
}
