# Nolan two-pass CP3 — final acceptance closeout

Final validation date: 2026-10-26. Baseline/commit parent: `ce97e3b26ac344e4f692bc211215569989503e46`.
This closeout supersedes the historical stop points preserved below and in `cp3-character-reference-repair-review.md`. Replacement Pass 1 was accepted; the separately authorized single Pass-2 control passed. No implementation changes were made during the Pass-2 control checkpoint. Commit/push is authorized after final validation with message `Theatre: add two-pass Nolan provider orchestration`.

## Pass-2 preflight and live result

The exact retained Pass-1 artifact and READY pronunciation map were revalidated, with unchanged revisions/digests, exact case-sensitive character references and no normalization. The accepted-context projection binds those artifacts. Pass 2 owns only version/items/lines; its closed lexical-gap alternative fails preparation rather than redefining global authority.

| Measurement | Value |
|---|---:|
| Canonical / character-dialogue items / characters | 3 / 2 / 2 |
| Serialized input / schema / instructions bytes | 3,358 / 2,092 / 3,014 |
| Requested / echoed output allowance | 2,752 / 2,752 |
| Application / SDK timeout | 60,000 / 60,000 ms |
| Retries | 0 |
| HTTP / status / SDK | 200 / completed / resolved |
| Elapsed | 3,787 ms |
| Input / output / reasoning / total tokens | 1,894 / 235 / 0 / 2,129 |
| Output characters / messages / text parts / refusals | 813 / 1 / 1 / 0 |

Configuration remained gpt-5.4-mini, reasoning none, truncation disabled, store false. JSON parsing, exact request-specific schema and CP1 PerformanceDirection validation all passed. Exact canonical coverage, character membership, chronology/evidence, presence/listener/addressee, Pass-1 binding and pronunciation binding passed. No global or pronunciation override occurred.

## Composition and authorization

PASS2_READY, pure composition, final whole-plan validation and READY-v3 passed using the accepted artifacts without another provider call. Pass 1 supplies scene, ambience, setting, relationships and beats/states; Pass 2 supplies base item annotations and line delivery; the application supplies canonical items, casting, accepted pronunciation and lineage. Deep-equality ownership checks passed. Existing TheatrePlan keys remain items, casting, analysis, direction, performanceStyle, pronunciation, pronunciationCharacters, analysisCacheKey and ambience.

Mocked actual clip-route checks rejected preparation-v1 tokens for PASS1_READY and PASS2_READY with HTTP 410, and accepted the final READY-v3 ticket with HTTP 200 and exactly one mocked synthesis. Real TTS calls: zero.

## Recorder and privacy

The retained control recorder has 19 records, a maximum serialized record length of 668 characters and exactly one terminal READY outcome. Pass 2 uses a distinct request ID in the same opaque preparation lineage. Request/upstream reuse, provider, structured response, performance validation, composition, ticket and terminal success are reconstructable. Pending/accepted intermediate states are represented by lifecycle boundaries, not literal state labels on every record; the protocol snapshots were independently validated.

No authored content, raw response, evidence excerpts, tokens or content-derived digests are included in the recorder or this report. Fabricated raw control evidence remains in local temporary storage outside the repository. No new logging subsystem or retention policy was introduced.

## Final validation and boundaries

- Focused tests: 250 passed, zero failures/skips.
- Full suite: 1,185 passed, zero failures/skips.
- Typecheck: passed.
- Production build: passed. Final whitespace and privacy review: passed; no raw control payload or secret is included in the intended commit.
- All pre-existing tracked production files remain unchanged. No app/component imports the new internal orchestration; normal production remains monolithic with its existing 60-second timeout, zero retries and legacy v2 support.
- Cumulative CP3 provider calls: three (initial rejected A, accepted replacement A, accepted B). This continuation made only B; no retries. Real TTS calls: zero.
- The three CP1.2B files remain excluded, untracked and hash-identical.
- Six intended files: lib/theatre-pass-provider.ts; lib/theatre-pass-orchestration.ts; tests/theatre-pass-orchestration.test.cjs; tests/theatre-character-reference.test.cjs; docs/nolan-two-pass-cp3-review.md; docs/cp3-character-reference-repair-review.md.

Limitations: the live proof uses a tiny fabricated production, not a production-scale scene. No audible pronunciation acceptance is claimed. No client cutover, manual deployment or CP4 work occurred. Historical failed-control evidence below is preserved rather than rewritten.

---
# Nolan two-pass CP3 — Aya review / stopped at controlled Call A

Baseline, current HEAD, local origin/main and verified remote main:
`ce97e3b26ac344e4f692bc211215569989503e46`.
Parent: `b2aee2b8d58cdaa20c3c32e2dc6370f00f29c1f8`.

**Not committed or pushed.** Deterministic validation passed, but the authorized live control exposed a character-reference contract failure. Per the checkpoint stop rule, Call B was not made and the implementation was not patched after this result. No production cutover or manual deployment.

## Implementation files

All are new, untracked files; no pre-existing tracked source was changed:

- `lib/theatre-pass-provider.ts`: separate schemas/prompts, compact upstream projection, request construction, exact schema gates, independent application/SDK timeouts and safe provider observations.
- `lib/theatre-pass-orchestration.ts`: separate internal Pass-1 / Pass-2 invocations, CP2 lifecycle/cache/token use, clarification, explicit retry, CP1 composition and READY-v3 issuance.
- `tests/theatre-pass-orchestration.test.cjs`: 35 mocked integration tests.
- This review document.

Disposable `two-pass-cp3-control.cjs` and validation logs (`two-pass-cp3-focused.log`, `two-pass-cp3-suite.log`, `two-pass-cp3-build.log`) remain untracked for review. No changes were discarded after the live result. The harness has an exclusive per-call claim in its fixed temporary evidence directory; only `A.claimed` exists.

## Pass ownership and budgets

Pass 1 outputs only `version`, `scene`, global `director` (setting, relationships, beats), `ambience` and `pronunciation`. It reuses existing field schemas/enums and excludes base item annotations, delivery lines, casting and accepted authority. The focused prompt teaches relationship evidence <= since; beat event/presence/state evidence <= at; strictly increasing anchors; at least one state citation after the immediately previous beat; persistent state; and no future knowledge. Whole-production setting evidence remains unrestricted by early anchors. Existing ambiguity-only pronunciation instructions are reused, including contextual auto-acceptance and foreign-name preservation.

Pass-1 allowance: **4096 + 96 × canonical items + 512 × distinct character speakers**, with **32,768** maximum and the existing 32-character structural bound. The fixed allowance reserves summary/setting/ambience and lexical overhead; per-item and per-character terms reserve sparse global transitions and character/lexical context. This is a bounded operational budget, not a promise that every maximum-length expansion permitted by the schema can fit. Above-ceiling work fails before generation; output-limit responses fail closed. It does not inherit the monolithic 64,000 allowance.

Pass 2 owns only base annotations and eligible character delivery entries. The strict transport envelope has `performance` containing either `{version, items, lines}` or the closed fail-only `{lexicalGaps: "upstream_revision_required"}`. The latter reaches CP1's existing lexical-gap rejection and returns technical hold with an upstream-revision-required indication. It cannot authorize audio or invent a pronunciation. No accepted CP1/CP2 semantics were changed.

Pass-2 allowance: **2048 + 64 × canonical items + 256 × eligible dialogue items**, maximum **49,152**. The base reserve covers the envelope; per-item terms distinguish compact base annotations from larger character delivery/evidence entries. Above-ceiling requests fail closed rather than truncate coverage.

The nested alternative avoids a root-level `anyOf`; strict objects have required properties and no additional properties. Official API guidance consulted: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). No model migration or production schema change was made.

Both builders use the approved `gpt-5.4-mini`, reasoning none, truncation disabled, store false, SDK timeout 60,000 ms, an independent aborting 60,000-ms application deadline and zero retries. Serialized input is bounded at 120,000 bytes. No fallback or automatic provider retry is introduced.

## Accepted-context projection and orchestration

Pass 2 receives every canonical item, character metadata, accepted scene/setting, sparse beats/presence/state changes, directional relationships, production language, a compact accepted pronunciation projection, and application-owned upstream bindings. Accepted evidence excerpts are omitted from this compact projection; original canonical text remains available for exact line-level evidence. Deterministic per-item indices identify the applicable beat, persistent speaker state and effective relationships. Model-echoed hashes are neither requested nor trusted.

`runProductionPass()` performs at most one provider call, validates schema and CP1 production direction, applies CP2 pronunciation acceptance, and returns either a non-playable clarification/Pass-1-ready token or a technical hold. It never calls Pass 2 within that invocation.

`runPerformancePass()` is a separate internal invocation. It decrypts and validates current source/document/revision/epoch, optionally accepts unresolved owner answers, or resumes a Pass-2 hold. It uses a new request ID with the same preparation lineage. It calls only Pass 2, validates coverage/chronology/presence/upstream identity, composes through CP1, validates READY through CP2, and issues READY-v3 only after all checks. A composition/ticket failure retains the accepted upstream snapshot in a non-playable hold. Optional cache failure cannot destroy a valid accepted result.

No endpoint, production route import or client switch was introduced. Current production remains monolithic. CP1/CP2 implementations, legacy ticket semantics, existing provider construction, 60-second timeout, zero retries, TTS, scheduler, pronunciation policy, casting and role-play are unchanged.

## Recorder and privacy

The existing CP2 recorder receives pass-specific provider/structured/validation stages, opaque request and preparation IDs, bounded timing, requested allowance, separate usage/output/config evidence, item counts and artifact revisions. Its first blocking cause remains terminal. Only closed stages/reasons and content-free evidence enter records. No script, names, targets, evidence excerpts, raw output, prompts, hashes or tokens enter telemetry.

The live Call-A lifecycle has **13 records**, **one terminal**, and a **669-character maximum record**. Terminal stage is `pass1_validation`, reason `validation_rejected`, disposition `TECHNICAL_HOLD`. Existing 1,024-character / 64-record / 1,000-record journal / 30-minute expiry bounds remain unchanged. Hosting retention is not newly claimed or reconfigured.

## Mocked validation before the real call

- CP3 integration tests: **35 passed**.
- Combined CP1–CP3 focused suites: **157 passed**.
- Full regression: **1,174 passed**, zero failures/skips, against CP2's 1,139-test baseline.
- Typecheck: passed.
- Production build: passed; existing route list unchanged.
- Privacy review and diff checks: passed. Existing tracked production files have zero diff from baseline.

Mocks cover both provider gates, incomplete/refusal/parse/schema failures, independent timeouts and cancellation without waiting 60 seconds, empty inventory, genuine ambiguity/resume, cache reuse, explicit Pass-2 retry, coverage/future evidence/listener/global/pronunciation rejection, gap hold, composition failure, stale source/revision/epoch/lineage, and safe correlated recorder evidence. CP1/CP2 suites retain binding and mocked clip-authorization coverage.

The valid mocked relationship references used exact canonical labels. Those mocks did not establish that the real model would preserve their spelling/case.

## Controlled provider evidence

Fabricated French fixture only: **3 canonical items, 2 dialogue, 1 stage direction**. No user-authored production scene, Theatre playback or TTS.

| Field | Call A — Pass 1 |
|---|---:|
| Serialized input bytes | 400 |
| Schema bytes | 8,520 |
| Instruction bytes | 6,496 |
| Requested / echoed output allowance | 5,408 / 5,408 |
| Provider elapsed | 7,710 ms |
| HTTP / SDK | 200 / resolved |
| Response status | completed |
| Incomplete reason | absent |
| Input / output / reasoning / total tokens | 2,484 / 1,063 / 0 / 3,547 |
| Usage field states | all valid |
| Output text characters | 4,051 |
| Output items / text parts / refusals | 1 / 1 / 0 |
| JSON parsing | passed |
| Exact Pass-1 schema | passed |
| CP1 production artifact validation | rejected |
| Pronunciation acceptance | not reached |
| Final classification | PASS1_TECHNICAL_HOLD |

Exact rejection:

- Validator: `acceptProductionDirection()` → `productionChecks()` → `identities()`.
- Reason: `unknown_character`.
- Path: `production.director.relationships[0]`.
- Expected: `known_character`; actual: `character_not_found`.
- Both `from` and `to` fail exact canonical-label membership.
- Each has exactly one case-insensitive canonical match. This establishes a casing mismatch in those relationship references without exposing the labels.

This is a completed, schema-valid response rejected at the semantic identity boundary. It is not an output-limit or timeout result. CP1 correctly refuses to accept noncanonical references. No normalization or validator weakening was introduced. Later pronunciation acceptance and Pass-2 behavior remain unproven by this control.

**Call B: not made**, as required when Call A fails. Its proposed three-item allowance was 2,752, but it was never transmitted.

**Real provider calls: 1. Retries: 0. Real TTS calls: 0.**

## Retention, repository status and next decision

Private fabricated evidence is retained locally in:
`C:\Users\Kwesi\AppData\Local\Temp\nolan-cp3-control-9f3feaae-ea19-4154-bd83-ba68aac27af9`.
Safe report/lifecycle files are separate from the fabricated generated payload and continuation state. They are outside the repository; no credentials or raw provider/account identifiers were exported. Do not share continuation tokens.

There is no new commit, parent or commit message for CP3. HEAD/origin/main/remote main remain the frozen CP2 commit. The tracked tree is unchanged; the new CP3 implementation/tests/report and disposable harness/logs are untracked. The three pre-existing CP1.2B files remain untracked and hash-identical.

Open issue for Aya: the new Pass-1 exact-character-reference contract did not hold in the real control. Review that boundary before authorizing a correction or another provider attempt. No implementation adjustment was made after the failure, no Call B was made, and no production/client cutover began.
