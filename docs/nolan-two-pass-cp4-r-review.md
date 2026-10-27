# CP4-R — deterministic Pass-1 evidence provenance / Aya review

Date: 2026-10-27. Frozen repository baseline: `fa11f325940d45ee3ed37e0669f8120a5d0a41b2`.
The uncommitted CP4 cutover is preserved. The prior failed live result and disposable control harness are unchanged; no attempt was made to convert that rejected result into accepted evidence. This repair is mocked validation only. No provider/TTS calls, commit, push or deployment are authorized here.

## Exact repair files

- `lib/theatre-pass1-evidence.ts` — new bounded catalogue, provider schema adapter, exact resolver and evidence instructions.
- `lib/theatre-pass-provider.ts` — Pass-1-only catalogue input/schema/prompt wiring and resolution before existing CP1 orchestration.
- `tests/pass1-evidence-fixtures.cjs` — test-only wire adapter for hand-authored fixture scenarios; not a production repair/fallback.
- `tests/theatre-pass1-evidence.test.cjs` — 32 new deterministic provenance regressions.
- `tests/theatre-pass-orchestration.test.cjs` — mocked Pass-1 responses select the actual request catalogue; acceptance assertions unchanged.
- `tests/theatre-character-reference.test.cjs` — retain lexical/schema assertions except the intentionally replaced provider evidence representation.
- `tests/theatre-production-cutover.test.cjs` — only mocked provider wire construction updated; CP4 continuation, retry, READY and playback assertions unchanged.
- This review document, `docs/nolan-two-pass-cp4-r-review.md`.

No CP4 route, server adapter, client continuation, strategy, cache or recorder implementation was edited by CP4-R. Existing uncommitted CP4 changes remain present.

## Catalogue and bounds

Catalogue v1 contains `{version, scope, entries}`. Each immutable entry is `{ref, itemId, index, start, end, quote}`. Quotes come ONLY from canonical `item.text.slice(start,end)`. Offsets use zero-based UTF-16 units with end exclusive. Speaker labels and character metadata never generate catalogue spans.

For an item of at most 120 UTF-16 units, the whole text is eligible if it contains a letter. Longer items are partitioned deterministically at sentence boundaries where available, otherwise whitespace boundaries within 120 units. An overlong unbroken token is split at a safe UTF-16 boundary; surrogate pairs are not cut. Boundary whitespace is excluded by offsets, never rewritten. Letter-free pieces are not evidence because CP1 rejects letter-free quotations. Canonical source text and items remain untouched.

This is a linear partition, not every possible substring. Maximum 1,024 entries and 80,000 serialized catalogue bytes; existing complete request limit remains 120,000 bytes. Overflow fails closed with retryable `input_budget` before a provider call. No truncation or partial catalogue is sent.

References use `e_<scope>_<ordinal>`. Scope is a SHA-256 binding over catalogue version, opaque request/preparation IDs, epoch and the exact canonical preparation. Ordinals are deterministic base-36 indices. IDs are stable within an identical request, unique within its catalogue, and cannot be reused across changed request/source/revision/style/lineage/epoch scopes. Neither the binding nor IDs enter diagnostics.

Artistic evidence retains exact sentences/short passages rather than individual decontextualized words. The full canonical production remains in the request for interpretation. The common 120-unit bound also fits pronunciation's stricter quote limit; Director's existing maximum is not expanded. This finite catalogue intentionally does not expose every possible phrase crossing a span boundary. If no eligible span supports an assertion, the model must leave it unknown/omit an optional state; it must not invent a citation. This is a remaining granularity tradeoff, not a claim that every possible artistic assertion has a selectable exact span.

## Provider schema and resolution

Only the request-local Pass-1 schema is adapted. All eleven evidence/presenceEvidence array sites now contain strings with request-scoped ID syntax and 68–70-character bounds, rather than `{itemId,quote}` objects. Existing array limits and required/strict-object fields remain intact. The schema constrains syntax; the resolver checks exact finite membership. Unknown syntactically valid ordinals still fail. Large repeated enum catalogues and cross-field schema assumptions are avoided.

The schema uses supported string pattern constraints; it does not add the previously incompatible negative-lookahead form. Official reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). No live provider compatibility claim is made for this new adapter.

`buildPassRequest(..., pass1)` creates the catalogue and schema from validated preparation. After the completed-status gate, JSON parse and exact provider-schema validation, `resolvePass1Evidence()` rebuilds the trusted catalogue from the same preparation and maps each selected ID to its existing exact `{itemId,quote}`. CP3 then calls unchanged `acceptProductionDirection()` and existing authority handling.

The provider cannot supply replacement quote text, offsets, item IDs or a replacement catalogue through an evidence array. Resolution does not case-fold, normalize, fuzzy-match, deduplicate, substitute or discard citations. Invalid syntax/schema becomes existing `validation_rejected`; an unknown in-scope reference becomes `evidence_mismatch`. Both remain retryable technical holds, never ordinary pronunciation clarification. No diagnostic field/schema was added.

## Chronology and CP1 preservation

Relationship `since` and beat `at` are selected by the provider, so per-output temporal subsets cannot be known when the request is constructed. The catalogue exposes canonical indices, and the prompt explicitly defines those anchors as effective-from points, not scene-start summaries of later events.

The resolver mechanically rejects relationship evidence after `since` and event/presence/state evidence after `at`. It never shifts anchors or evidence. Whole-production setting and pronunciation references have no artificial early-anchor restriction. CP1 independently retains its existing checks for exact text, duplicate item IDs, chronology, progression since the previous beat, presence, semantics and pronunciation authority.

Repeated IDs, including two distinct spans from one item, remain duplicated in the resolved artifact and are rejected by CP1. No CP1 validator, accepted schema, TheatrePlan, pronunciation policy/authority, CP2 contract, READY-v3 or playback/TTS implementation changed. Pass-2 instructions, schema, input projection, output representation and behavior remain unchanged. The model, output-budget formula, timeouts and zero retries are unchanged.

Previously validated cached artifacts retain the same accepted representation and CP1 semantics; no cache/ticket redesign or reinterpretation was introduced. Provider-wire references are transient and are never stored as accepted evidence.

## Local workload measurements

For the existing fabricated 117-item CP4 control (no provider call):

| Measurement | Value |
|---|---:|
| Canonical items / catalogue entries | 117 / 117 |
| Catalogue bytes | 26,071 |
| Complete serialized user input | 46,686 bytes |
| Provider schema | 8,062 bytes |
| Instructions | 8,167 bytes |
| Largest quote | 100 UTF-16 units |
| Reference lengths in this fixture | 68–69 characters |
| Requested output allowance | 17,376, unchanged |

These are deterministic request measurements, not estimates of provider token usage or latency.

## Validation

Focused suite: **315 passed**, zero failures/skips, including 32 new provenance tests and the existing mocked CP4 continuation/READY/playback checks. Final full suite: **1,247 passed**, zero failures/cancellations/skips. Final typecheck and production build both passed. Build emitted only the existing stale Browserslist-data notice. Privacy review passed: no new logging/sink, authored evidence and private bindings remain confined to request processing; errors use existing closed reasons. `git diff --check` passed; new adapter/test/document files also passed explicit trailing-whitespace review. CP1 validators and accepted schemas, pronunciation authority, monolithic preparation and Theatre clip route have no diff. Existing CP4 implementation remains uncommitted and preserved.

New regressions cover deterministic exact resolution; capitalization/free-text injection exclusion; speaker metadata exclusion; all provider evidence sites; unknown/malformed/object/case/stale references; changes to source/revision/style/request/lineage/epoch; duplicate-item rejection; future relationship/event/presence/state evidence; unrestricted whole-production setting; valid multi-reference evidence; pronunciation authority; unchanged CP1 state-progression rejection; Unicode sentence/word spans; catalogue overflow; the 117-item request bound; retryable technical-failure routing; diagnostic privacy; and unchanged Pass-2 evidence transport.

The existing fixture helper selects supplied catalogue spans for synthetic mock scenarios only. It is not reachable from production and is not applied to the retained live output. Assertions for accepted/failed outcomes, continuation, retry, READY-v3, learner ownership, chorus, narrator, silence, prefetch and playback remain in place.

## Call/repository accounting and limitations

CP4 real provider calls remain **1** (the earlier failed live Pass 1); retries **0**; real TTS **0**. CP4-R adds **zero** provider calls. The previous raw evidence remains outside the repository at the original temporary location. No failed artifact was promoted or repaired.

MONOLITHIC remains the explicit uncommitted CP4 default. No activation/deployment occurred. CP1.2B remains untracked and untouched. Stop for Aya review; no live provider retry or commit is part of this checkpoint.

Remaining limitations: mocked acceptance does not establish live provider compliance, latency, artistic quality or audible pronunciation. Unknown IDs or future citations can still be generated and will correctly fail closed. The bounded catalogue increases input size and may reject larger workloads through the existing input-budget path. Application-controlled reference resolution removes text-copy transformations; it does not make model interpretation infallible.

Final repository verification: local HEAD, origin/main and read-only remote main all equal `fa11f325940d45ee3ed37e0669f8120a5d0a41b2`. The three CP1.2B files remain untracked with unchanged pre-checkpoint blob hashes. No files were staged. Prior CP4 files plus this repair and local validation logs remain in the working tree; no commit/push/deployment occurred.
