/** Server-side deterministic foundation only. No provider, cache, ticket or route integration. */
import { createHash } from "node:crypto";
import { parseTheatreItems } from "./theatre";
import type { TheatreItem } from "./theatre";
import { createTheatreCasting, theatreRole } from "./theatre-casting";
import type { TheatreVoice } from "./theatre-casting";
import { validateTheatreCharacters } from "./theatre-characters";
import type { TheatreCharacter } from "./theatre-characters";
import type { TheatreStyle } from "./theatre-performance";
import { DRAMATIC_ANALYSIS_MODEL, DRAMATIC_ANALYSIS_SCHEMA, validateDramaticAnalysis } from "./theatre-direction";
import type { DramaticAnalysis, DramaticAnnotation } from "./theatre-direction";
import { DIRECTOR_SCHEMA, validateDirector, directorDelivery } from "./theatre-director";
import type { DirectorPlan } from "./theatre-director";
import { AMBIENCE_SCHEMA, validateAmbience } from "./theatre-ambience";
import type { AmbienceRecommendation } from "./theatre-ambience";
import { PRONUNCIATION_SCHEMA, inspectPronunciationProposal, pronunciationInventory, pronunciationOccurrences } from "./theatre-pronunciation";
import type { PronunciationProposal, PronunciationAuthority } from "./theatre-pronunciation";
import { pronunciationSourceDigest, assertPronunciationAuthority, isEstablishedPronunciation } from "./theatre-pronunciation-authority";
import type { TheatrePlan } from "./theatre-generation";

export const TWO_PASS_VERSIONS = Object.freeze({ contract: 1, schema: 1, policy: 1, pronunciationPolicy: 2 });
export const TWO_PASS_REASONS = {
  malformed_structure: ["closed_structure", "invalid_structure"],
  unauthorized_ownership: ["owned_fields_only", "forbidden_field"],
  unknown_reference: ["canonical_reference", "reference_not_found"],
  unknown_character: ["known_character", "character_not_found"],
  duplicate_coverage: ["unique_coverage", "duplicate_entry"],
  missing_coverage: ["complete_coverage", "missing_entry"],
  role_ineligible: ["character_dialogue", "ineligible_role"],
  evidence_missing: ["required_evidence", "empty_evidence"],
  evidence_mismatch: ["exact_source_excerpt", "excerpt_not_linked"],
  chronology_future: ["evidence_at_or_before_anchor", "future_evidence"],
  chronology_order: ["strictly_increasing_beats", "non_increasing_anchor"],
  chronology_progression: ["new_state_evidence_since_previous_beat", "no_new_evidence"],
  projection_evidence: ["strictly_prior_evidence", "no_prior_evidence"],
  presence_violation: ["accepted_presence", "absent_participant"],
  listener_violation: ["valid_distinct_listeners_and_addressee", "invalid_participant_set"],
  upstream_mismatch: ["exact_upstream_binding", "binding_mismatch"],
  source_mismatch: ["exact_canonical_source_scope", "source_mismatch"],
  authority_violation: ["ready_source_bound_authority", "authority_not_ready_or_invalid"],
  inventory_incomplete: ["complete_pronunciation_inventory", "inventory_incomplete"],
  lexical_inventory_gap: ["pass1_owned_complete_inventory", "reported_inventory_gap"],
  pronunciation_invalid: ["validated_pronunciation_proposal", "invalid_proposal"],
  ambience_invalid: ["validated_ambience", "invalid_ambience"],
  legacy_rejected: ["existing_runtime_acceptance", "runtime_rejection"],
} as const;
export type TwoPassReason = keyof typeof TWO_PASS_REASONS;
type Stage = "canonical" | "production" | "performance" | "authority" | "composition";
export type TwoPassRejection = {
  stage: Stage; reason: TwoPassReason; path: string;
  expected: typeof TWO_PASS_REASONS[TwoPassReason][0]; actual: typeof TWO_PASS_REASONS[TwoPassReason][1];
  index?: number; anchorIndex?: number;
};
export type TwoPassResult<T> = { ok: true; value: T } | { ok: false; error: TwoPassRejection };
const fail = (stage: Stage, reason: TwoPassReason, path: string, index?: number, anchorIndex?: number): TwoPassResult<never> => ({
  ok: false, error: { stage, reason, path, expected: TWO_PASS_REASONS[reason][0], actual: TWO_PASS_REASONS[reason][1],
    ...(index === undefined ? {} : { index }), ...(anchorIndex === undefined ? {} : { anchorIndex }) },
});

/** Reject accessors/custom serialization before inspecting untrusted artifact data. */
function dataOnly(value: unknown, depth = 0, budget = { left: 200000 }): boolean {
  if (--budget.left < 0 || depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  return Reflect.ownKeys(value).every(key => {
    if (Array.isArray(value) && key === "length") return true;
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    return typeof key === "string" && "value" in descriptor && dataOnly(descriptor.value, depth + 1, budget);
  });
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
const digest = (domain: string, value: unknown) => createHash("sha256").update(`nolan-two-pass:${domain}\0${stable(value)}`).digest("hex");
function immutable<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}
const good = <T>(value: T): TwoPassResult<T> => ({ ok: true, value: immutable(structuredClone(value)) });
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) &&
  Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

export type CanonicalPreparation = {
  version: 1; productionId: string; text: string; documentId: string | null; documentRevision: number | null;
  characters: TheatreCharacter[]; narratorVoice: TheatreVoice | null; performanceStyle: TheatreStyle;
  items: TheatreItem[]; casting: TheatrePlan["casting"]; sourceDigest: string; canonicalDigest: string;
};
type CanonicalOptions = {
  productionId: string; documentId?: string | null; documentRevision?: number | null;
  characters?: TheatreCharacter[]; narratorVoice?: TheatreVoice; performanceStyle?: TheatreStyle;
};
export function createCanonicalPreparation(text: string, options: CanonicalOptions): TwoPassResult<CanonicalPreparation> {
  // Options are application-owned; absent optional properties are intentionally allowed.
  if (typeof text !== "string" || !text.trim() || !options ||
    typeof options.productionId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(options.productionId) ||
    (options.documentId != null && (typeof options.documentId !== "string" || options.documentId.length > 512)) ||
    (options.documentRevision != null && (!Number.isSafeInteger(options.documentRevision) || options.documentRevision < 0)) ||
    (options.performanceStyle !== undefined && !["clarte", "naturel"].includes(options.performanceStyle))) return fail("canonical", "malformed_structure", "canonical");
  try {
    if (options.characters !== undefined && !dataOnly(options.characters)) return fail("canonical", "malformed_structure", "canonical.characters");
    const characters = options.characters === undefined ? [] : validateTheatreCharacters(options.characters, text);
    const items = parseTheatreItems(text);
    if (!items.length) return fail("canonical", "missing_coverage", "canonical.items");
    const casting = createTheatreCasting(items, options.narratorVoice, characters);
    const documentId = options.documentId ?? null, documentRevision = options.documentRevision ?? null;
    return good({ version: 1, productionId: options.productionId, text, documentId, documentRevision, characters,
      narratorVoice: options.narratorVoice ?? null, performanceStyle: options.performanceStyle ?? "clarte", items, casting,
      sourceDigest: pronunciationSourceDigest(text, documentId, documentRevision, characters),
      canonicalDigest: digest("canonical", { items, characters, casting }) });
  } catch { return fail("canonical", "malformed_structure", "canonical"); }
}
function canonicalValid(p: CanonicalPreparation): boolean {
  if (!dataOnly(p) || !exact(p, ["version", "productionId", "text", "documentId", "documentRevision", "characters", "narratorVoice", "performanceStyle", "items", "casting", "sourceDigest", "canonicalDigest"])) return false;
  // Empty metadata is distinct from a supplied incomplete cast list.
  const rebuilt = createCanonicalPreparation(p.text, { productionId: p.productionId, documentId: p.documentId,
    documentRevision: p.documentRevision, ...(p.characters?.length ? { characters: p.characters } : {}),
    ...(p.narratorVoice ? { narratorVoice: p.narratorVoice } : {}), performanceStyle: p.performanceStyle });
  return rebuilt.ok && stable(rebuilt.value) === stable(p);
}

export type ProductionDirectionData = {
  version: 1; scene: DramaticAnalysis["scene"];
  director: Pick<DirectorPlan, "version" | "setting" | "relationships" | "beats">;
  ambience: AmbienceRecommendation; pronunciation: PronunciationProposal;
};
export type PerformanceDirectionData = { version: 1; items: DramaticAnnotation[]; lines: DirectorPlan["lines"] };
export type ArtifactBinding = {
  kind: "production" | "performance"; productionId: string; sourceDigest: string; canonicalDigest: string;
  documentId: string | null; documentRevision: number | null; revision: number; versions: typeof TWO_PASS_VERSIONS;
  upstream: null | { productionDigest: string; productionRevision: number; pronunciationDigest: string; pronunciationRevision: number };
  digest: string;
};
export type ProductionDirection = { binding: ArtifactBinding; data: ProductionDirectionData };
export type PerformanceDirection = { binding: ArtifactBinding; data: PerformanceDirectionData };
export type AcceptedPronunciationMap = PronunciationAuthority;

type Shape = { type: string | string[]; enum?: readonly unknown[]; properties?: Record<string, Shape>; required?: readonly string[];
  items?: Shape; minLength?: number; maxLength?: number; maxItems?: number; pattern?: string; additionalProperties?: boolean };
function shape(value: unknown, s: Shape): boolean {
  if (s.enum && !s.enum.includes(value)) return false;
  if (value === null) return Array.isArray(s.type) && s.type.includes("null");
  if (s.type === "object") return exact(value, [...s.required!]) && Object.entries(s.properties!).every(([k, child]) => shape(value[k], child));
  if (s.type === "array") return Array.isArray(value) && value.length <= (s.maxItems ?? Infinity) && value.every(v => shape(v, s.items!));
  if (s.type === "boolean") return typeof value === "boolean";
  if (s.type === "integer") return Number.isInteger(value);
  return typeof value === "string" && value.trim().length >= (s.minLength ?? 0) && value.length <= (s.maxLength ?? Infinity) && (!s.pattern || new RegExp(s.pattern).test(value));
}
type Issue = TwoPassResult<never> | undefined;
function evidence(p: CanonicalPreparation, refs: { itemId: string; quote: string }[], stage: Stage, path: string, through = Infinity, required = true): Issue {
  if (required && !refs.length) return fail(stage, "evidence_missing", path);
  const seen = new Set<string>();
  for (const [i, ref] of refs.entries()) {
    const item = p.items.find(v => v.id === ref.itemId), at = `${path}[${i}]`;
    if (!item) return fail(stage, "unknown_reference", at);
    if (seen.has(ref.itemId)) return fail(stage, "duplicate_coverage", at);
    seen.add(ref.itemId);
    if (!/\p{L}/u.test(ref.quote) || !item.text.includes(ref.quote)) return fail(stage, "evidence_mismatch", at);
    if (item.index > through) return fail(stage, "chronology_future", at, item.index, through);
  }
}
function identities(p: CanonicalPreparation, names: string[], stage: Stage, path: string): Issue {
  const known = new Set(p.items.filter(i => theatreRole(i) === "character").map(i => i.speaker));
  if (names.some(n => !known.has(n))) return fail(stage, "unknown_character", path);
  if (new Set(names).size !== names.length) return fail(stage, "duplicate_coverage", path);
}
function productionChecks(p: CanonicalPreparation, data: ProductionDirectionData): Issue {
  if (!dataOnly(data)) return fail("production", "malformed_structure", "production");
  if (!exact(data, ["version", "scene", "director", "ambience", "pronunciation"])) return fail("production", "unauthorized_ownership", "production");
  if (data.version !== 1 || !shape(data.scene, DRAMATIC_ANALYSIS_SCHEMA.properties.scene) ||
    !exact(data.director, ["version", "setting", "relationships", "beats"]) || data.director.version !== 1)
    return fail("production", "malformed_structure", "production");
  for (const key of ["setting", "relationships", "beats"] as const) {
    if (!shape(data.director[key], DIRECTOR_SCHEMA.properties![key])) return fail("production", "malformed_structure", `production.director.${key}`);
  }
  const plan = data.director;
  for (const key of ["location", "social", "time", "privacy", "noise"] as const) {
    const fact = plan.setting[key];
    const issue = evidence(p, fact.evidence, "production", `production.director.setting.${key}.evidence`, Infinity, fact.value !== "unknown");
    if (issue) return issue;
  }
  const relationshipKeys = new Set<string>();
  for (const [i, r] of plan.relationships.entries()) {
    const path = `production.director.relationships[${i}]`, at = p.items.find(v => v.id === r.since);
    if (!at) return fail("production", "unknown_reference", `${path}.since`);
    const identity = identities(p, [r.from, r.to], "production", path); if (identity) return identity;
    const key = stable([r.from, r.to, r.since]);
    if (relationshipKeys.has(key)) return fail("production", "duplicate_coverage", path);
    relationshipKeys.add(key);
    const issue = evidence(p, r.evidence, "production", `${path}.evidence`, at.index, r.kind !== "unknown" || r.stance !== "unknown"); if (issue) return issue;
  }
  let previous = -1;
  for (const [i, beat] of plan.beats.entries()) {
    const path = `production.director.beats[${i}]`, at = p.items.find(v => v.id === beat.at);
    if (!at) return fail("production", "unknown_reference", `${path}.at`);
    if (at.index <= previous) return fail("production", "chronology_order", `${path}.at`, at.index, previous);
    for (const issue of [evidence(p, beat.event.evidence, "production", `${path}.event.evidence`, at.index, beat.event.value !== "unknown"),
      identities(p, beat.present, "production", `${path}.present`),
      evidence(p, beat.presenceEvidence, "production", `${path}.presenceEvidence`, at.index, beat.present.length > 0),
      identities(p, beat.states.map(s => s.speaker), "production", `${path}.states`)]) if (issue) return issue;
    for (const [j, state] of beat.states.entries()) {
      const field = `${path}.states[${j}]`;
      if (!beat.present.includes(state.speaker)) return fail("production", "presence_violation", `${field}.speaker`);
      const issue = evidence(p, state.evidence, "production", `${field}.evidence`, at.index); if (issue) return issue;
      if (!state.evidence.some(e => p.items.find(v => v.id === e.itemId)!.index > previous))
        return fail("production", "chronology_progression", `${field}.evidence`, at.index, previous);
    }
    previous = at.index;
  }
  if (!shape(data.ambience, AMBIENCE_SCHEMA)) return fail("production", "ambience_invalid", "production.ambience");
  const ambienceEvidence = evidence(p, data.ambience.evidence!, "production", "production.ambience.evidence", Infinity, false);
  if (ambienceEvidence) return ambienceEvidence;
  if (data.ambience.environment !== "none" && validateAmbience(data.ambience, p.items).environment !== data.ambience.environment)
    return fail("production", "ambience_invalid", "production.ambience");
  if (!shape(data.pronunciation, PRONUNCIATION_SCHEMA)) return fail("production", "pronunciation_invalid", "production.pronunciation");
  const inspected = inspectPronunciationProposal(data.pronunciation, p.items);
  if (inspected.issues.length) {
    const reason = inspected.issues[0].reason;
    return fail("production", reason === "inventory_incomplete" ? "inventory_incomplete" : reason === "evidence_mismatch" ? "evidence_mismatch" : "pronunciation_invalid", "production.pronunciation");
  }
  if (pronunciationInventory(data.pronunciation, p.items, p.characters).length !== data.pronunciation.entries.length)
    return fail("production", "inventory_incomplete", "production.pronunciation.entries");
}
function binding(p: CanonicalPreparation, kind: ArtifactBinding["kind"], data: unknown, revision: number, upstream: ArtifactBinding["upstream"]): ArtifactBinding {
  const fields = { kind, productionId: p.productionId, sourceDigest: p.sourceDigest, canonicalDigest: p.canonicalDigest,
    documentId: p.documentId, documentRevision: p.documentRevision, revision, versions: TWO_PASS_VERSIONS, upstream };
  return { ...fields, digest: digest(kind, { binding: fields, data }) };
}
export function acceptProductionDirection(p: CanonicalPreparation, data: ProductionDirectionData, revision = 1): TwoPassResult<ProductionDirection> {
  if (!canonicalValid(p)) return fail("canonical", "source_mismatch", "canonical");
  if (!positive(revision)) return fail("production", "malformed_structure", "binding.revision");
  const issue = productionChecks(p, data); if (issue) return issue;
  // Preserve the legacy validator's chronological relationship normalization.
  const normalized = structuredClone(data);
  normalized.director.relationships.sort((a, b) => p.items.find(i => i.id === a.since)!.index - p.items.find(i => i.id === b.since)!.index);
  return good({ data: normalized, binding: binding(p, "production", normalized, revision, null) });
}
export function validateProductionDirection(p: CanonicalPreparation, artifact: ProductionDirection): TwoPassResult<ProductionDirection> {
  if (!dataOnly(artifact) || !exact(artifact, ["binding", "data"]) || !artifact.binding || typeof artifact.binding !== "object") return fail("production", "malformed_structure", "production");
  const checked = acceptProductionDirection(p, artifact.data, artifact.binding.revision);
  if (!checked.ok) return checked;
  if (stable(checked.value.binding) !== stable(artifact.binding) || stable(checked.value.data) !== stable(artifact.data)) return fail("production", "upstream_mismatch", "production.binding");
  return checked;
}
function authorityCheck(p: CanonicalPreparation, production: ProductionDirection, authority: AcceptedPronunciationMap): Issue {
  if (!dataOnly(authority) || !exact(authority, ["version", "policyVersion", "productionLanguage", "automaticIds", "productionId", "sourceDigest", "revision", "digest", "acceptance", "excludedIds", "status", "inventoryReviewed", "entries", "occurrences"]) ||
    !Array.isArray(authority.automaticIds) || !Array.isArray(authority.excludedIds) ||
    authority.sourceDigest !== p.sourceDigest || authority.productionId !== p.productionId ||
    !positive(authority.revision) || authority.productionLanguage !== production.data.pronunciation.context!.productionLanguage)
    return fail("authority", "authority_violation", "pronunciation");
  try { assertPronunciationAuthority({ items: p.items, pronunciation: structuredClone(authority) } as TheatrePlan); }
  catch { return fail("authority", "authority_violation", "pronunciation"); }
  const proposal = production.data.pronunciation;
  // Owner resolution can change readings, not silently introduce a new lexical identity.
  if (authority.entries.some(e => !proposal.entries.some(v => v.id === e.id && v.name === e.name)) ||
    proposal.entries.some(e => !authority.entries.some(v => v.id === e.id) && !authority.excludedIds.includes(e.id)))
    return fail("authority", "authority_violation", "pronunciation.entries");
  const ambiguous = new Set<string>();
  pronunciationOccurrences(proposal.entries, p.items, (a, b) => { ambiguous.add(a); ambiguous.add(b); });
  const automatic = proposal.entries.filter(e => isEstablishedPronunciation(e) && !ambiguous.has(e.id));
  if (stable(authority.automaticIds) !== stable(automatic.map(e => e.id)) ||
    automatic.some(e => stable(e) !== stable(authority.entries.find(v => v.id === e.id))) ||
    new Set(authority.excludedIds).size !== authority.excludedIds.length ||
    authority.excludedIds.some(id => !proposal.entries.some(e => e.id === id) || automatic.some(e => e.id === id) || authority.entries.some(e => e.id === id)) ||
    (authority.acceptance === "director-established" && (automatic.length !== proposal.entries.length || authority.excludedIds.length > 0)))
    return fail("authority", "authority_violation", "pronunciation.acceptance");
}
function performanceChecks(p: CanonicalPreparation, production: ProductionDirection, data: PerformanceDirectionData): Issue {
  if (!dataOnly(data)) return fail("performance", "malformed_structure", "performance");
  if (data && Object.hasOwn(data, "lexicalGaps")) return fail("performance", "lexical_inventory_gap", "performance.lexicalGaps");
  if (!exact(data, ["version", "items", "lines"])) return fail("performance", "unauthorized_ownership", "performance");
  if (data.version !== 1 || !shape(data.items, DRAMATIC_ANALYSIS_SCHEMA.properties.items) || !shape(data.lines, DIRECTOR_SCHEMA.properties!.lines))
    return fail("performance", "malformed_structure", "performance");
  const seen = new Set<string>();
  for (const [i, item] of data.items.entries()) {
    if (!p.items.some(v => v.id === item.id)) return fail("performance", "unknown_reference", `performance.items[${i}].id`);
    if (seen.has(item.id)) return fail("performance", "duplicate_coverage", `performance.items[${i}].id`);
    seen.add(item.id);
  }
  if (seen.size !== p.items.length) return fail("performance", "missing_coverage", "performance.items");
  const expected = p.items.filter(i => theatreRole(i) === "character"), lines = new Set<string>();
  for (const [i, line] of data.lines.entries()) {
    const path = `performance.lines[${i}]`, item = p.items.find(v => v.id === line.itemId);
    if (!item) return fail("performance", "unknown_reference", `${path}.itemId`);
    if (theatreRole(item) !== "character") return fail("performance", "role_ineligible", `${path}.itemId`);
    if (lines.has(item.id)) return fail("performance", "duplicate_coverage", `${path}.itemId`);
    lines.add(item.id);
    const identity = identities(p, [...line.hearers], "performance", `${path}.hearers`); if (identity) return identity;
    if (line.addressee !== null) { const target = identities(p, [line.addressee], "performance", `${path}.addressee`); if (target) return target; }
    if (line.addressee === item.speaker || line.hearers.includes(item.speaker) || (line.addressee !== null && !line.hearers.includes(line.addressee)))
      return fail("performance", "listener_violation", path);
    const issue = evidence(p, line.evidence, "performance", `${path}.evidence`, item.index,
      line.intent !== "unknown" || line.subtext !== "unknown" || line.projection !== "conversational" || line.audience !== "unknown");
    if (issue) return issue;
    const beat = production.data.director.beats.filter(b => p.items.find(v => v.id === b.at)!.index <= item.index).at(-1);
    if ((beat && !beat.present.includes(item.speaker)) || line.hearers.some(s => !beat?.present.includes(s)))
      return fail("performance", "presence_violation", path);
    if (line.projection !== "conversational" && !line.evidence.some(e => p.items.find(v => v.id === e.itemId)!.index < item.index))
      return fail("performance", "projection_evidence", `${path}.evidence`);
  }
  if (lines.size !== expected.length) return fail("performance", "missing_coverage", "performance.lines");
}
export function acceptPerformanceDirection(p: CanonicalPreparation, production: ProductionDirection, authority: AcceptedPronunciationMap,
  data: PerformanceDirectionData, revision = 1): TwoPassResult<PerformanceDirection> {
  const upstream = validateProductionDirection(p, production); if (!upstream.ok) return upstream;
  const auth = authorityCheck(p, production, authority); if (auth) return auth;
  if (!positive(revision)) return fail("performance", "malformed_structure", "binding.revision");
  const issue = performanceChecks(p, production, data); if (issue) return issue;
  const normalized = { ...data, items: p.items.map(i => data.items.find(v => v.id === i.id)!),
    lines: p.items.filter(i => theatreRole(i) === "character").map(i => data.lines.find(v => v.itemId === i.id)!) };
  return good({ data: normalized, binding: binding(p, "performance", normalized, revision, {
    productionDigest: production.binding.digest, productionRevision: production.binding.revision,
    pronunciationDigest: authority.digest, pronunciationRevision: authority.revision }) });
}
export function validatePerformanceDirection(p: CanonicalPreparation, production: ProductionDirection, authority: AcceptedPronunciationMap,
  artifact: PerformanceDirection): TwoPassResult<PerformanceDirection> {
  if (!dataOnly(artifact) || !exact(artifact, ["binding", "data"]) || !artifact.binding || typeof artifact.binding !== "object") return fail("performance", "malformed_structure", "performance");
  const checked = acceptPerformanceDirection(p, production, authority, artifact.data, artifact.binding.revision); if (!checked.ok) return checked;
  if (stable(checked.value.binding) !== stable(artifact.binding)) return fail("performance", "upstream_mismatch", "performance.binding");
  return checked;
}
/** Context is derived from accepted anchors, never accepted from Pass 2/model echoes. */
export function twoPassDelivery(p: CanonicalPreparation, production: ProductionDirection, authority: AcceptedPronunciationMap,
  performance: PerformanceDirection, index: number): TwoPassResult<ReturnType<typeof directorDelivery>> {
  const checked = validatePerformanceDirection(p, production, authority, performance); if (!checked.ok) return checked;
  if (!Number.isInteger(index) || !p.items[index]) return fail("performance", "unknown_reference", "item.index");
  return good(directorDelivery(p.items[index], { ...production.data.director, lines: checked.value.data.lines }, p.items));
}
export function composeTheatrePlan(p: CanonicalPreparation, production: ProductionDirection, authority: AcceptedPronunciationMap,
  performance: PerformanceDirection): TwoPassResult<TheatrePlan> {
  const checked = validatePerformanceDirection(p, production, authority, performance); if (!checked.ok) return checked;
  const analysis: DramaticAnalysis = { version: 1, scene: structuredClone(production.data.scene), ambience: structuredClone(production.data.ambience),
    pronunciation: structuredClone(production.data.pronunciation), director: { ...structuredClone(production.data.director), lines: structuredClone(checked.value.data.lines) },
    items: structuredClone(checked.value.data.items) };
  // Independent compatibility checks; new contracts cannot weaken the live validators.
  try { validateDramaticAnalysis(analysis, p.items); if (!validateDirector(analysis.director, p.items)) return fail("composition", "legacy_rejected", "analysis.director"); }
  catch { return fail("composition", "legacy_rejected", "analysis"); }
  const plan: TheatrePlan = { items: structuredClone(p.items), casting: structuredClone(p.casting), analysis,
    performanceStyle: p.performanceStyle, pronunciation: structuredClone(authority),
    pronunciationCharacters: p.characters.map(({ speakerId, displayName }) => ({ speakerId, displayName })), analysisCacheKey: undefined,
    ambience: structuredClone(production.data.ambience), direction: {
      version: 1, model: DRAMATIC_ANALYSIS_MODEL, status: "analyzed", fallbackReason: null,
      expectedItemCount: p.items.length, annotatedItemCount: p.items.length, fallbackItemCount: 0,
      director: { version: 1, status: p.performanceStyle === "clarte" ? "not_applied" : "applied", reason: null,
        directedItemCount: p.performanceStyle === "clarte" ? 0 : checked.value.data.lines.length } } };
  // structuredClone preserves the existing optional undefined cache-reference property.
  return good(plan);
}
