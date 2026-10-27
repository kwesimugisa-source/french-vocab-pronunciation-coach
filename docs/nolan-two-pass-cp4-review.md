# Nolan two-pass CP4 — controlled production cutover review

Baseline: `fa11f325940d45ee3ed37e0669f8120a5d0a41b2` (CP1/CP2/CP3 accepted). Validation began 2026-10-26; live-control review completed 2026-10-27.

## Integration seam and rollback

The Theatre branch of `/api/read-passage`, after existing input/style/character validation and before `prepareTheatrePlan()`, dispatches through server-owned `preparationStrategy()`. The existing monolithic implementation remains intact. New `prepareProductionResponse()` adapts CP3 orchestration to HTTP without changing CP1/CP2/CP3 contracts.

`lib/theatre-preparation-strategy.ts` explicitly defaults to MONOLITHIC. TWO_PASS is the alternative. Unknown values throw, and request fields/text cannot choose a strategy. There was no existing feature-flag mechanism; no environment variable, credential or dashboard setting was invented. Activation requires a separately reviewed repository change selecting TWO_PASS and the normal deployment process. No manual deployment is performed here. Deliberate rollback selects MONOLITHIC for subsequent fresh requests; partial two-pass continuations fail closed rather than being interpreted by the legacy path. There is no automatic fallback.

## HTTP lifecycle and client compatibility

One provider pass per HTTP request. Accepted Pass 1 returns `mode: theatre-preparation` and an encrypted preparation-v1 continuation. The reading session performs at most one continuation request within the same user action, with a new opaque request ID. This is advancement of an accepted stage, not retry of a failure. It remains in preparation until the final existing incremental-v1 manifest arrives. No playback consumer needs pass-specific state.

Genuine ambiguity returns the existing `pronunciation-clarification` shape plus continuation metadata; no Pass 2 or audio starts. Only unresolved entries are shown. Owner answers use the same UI and CP2 clarification validation; established decisions cannot be overwritten. Invalid answers preserve the form for correction. Source, revision, style, character metadata, production identity, epoch and lineage bind continuation validation.

Technical failures return THEATRE_ANALYSIS_FAILED with the existing French message, safe reason and retryability. A retained authenticated continuation allows explicit Pass-2 retry without repeating Pass 1 or replacing its authority. A Pass-1 failure has no accepted upstream work and an explicit retry starts Pass 1 again. A declared lexical-inventory gap requires fresh preparation, not repeated Pass 2. Expired or mismatched continuations require a fresh user action. No automatic provider retry is added.

Continuations remain private session memory, never localStorage, diagnostics or audio authority. Document invalidation/authority reset clears them; source/style keys prevent reuse across replacements. Existing AbortController/current-session checks reject late responses.

## Cache and identity

The adapter owns one process-local CP2 PreparationCaches instance. Its existing bounds and validation remain unchanged. A private server-keyed HMAC production identity over canonical input scope permits exact cache reuse across fresh requests; it is never emitted to diagnostic records. Opaque preparation/request correlation IDs remain random and independent. Cache misses resume authenticated accepted artifacts directly from preparation-v1. Stage-2 cache identity retains exact production and pronunciation digest/revision binding. The monolithic cache is untouched.

## Recorder and privacy

The existing beta route wrapper can delegate recorder ownership to CP3. TWO_PASS uses CP3's lineage recorder directly; it does not create a duplicate wrapper terminal record or duplicate the 64-record budget. Responses carry the matching safe receipt and request ID. MONOLITHIC retains its existing wrapper recorder. Early HTTP input/transport rejection before CP3 is not represented as completed Director analysis. Server cancellation still aborts the per-pass operation and releases the request gate.

No diagnostic schema or retention bound changes: 1,024 characters/record, 64 records/invocation, 1,000-entry journal and 30-minute expiry. No text, names, targets, evidence, raw outputs, tokens, private HMAC identities or chain-of-thought are added to logs. Existing hosting-log retention limitations remain unchanged. Private fabricated control artifacts are retained outside the repository, never committed.

## Authorization and compatibility

READY uses CP3's READY-v3 ticket and the existing sceneManifest, including casting, style, ambience, pronunciation digest, canonical clips and role ownership. Clip route, ticket decoder, scheduler, concurrency, lookahead, playback, TTS instructions/provider and CP2 assistance are unchanged. Existing v2 compatibility and rejection of partial/tampered/stale/wrong-binding tickets remain covered by CP2 tests. New mocked integration exercises READY-v3 through actual clip authorization and existing client playback, including chorus, narrator, silence, learner turns, pause/resume, replay and prefetch in both styles.

## Fabricated workload

Deterministic source in `tests/two-pass-production-fixture.cjs`: 117 canonical items, four characters, 39 stage directions, 78 dialogue items (including three chorus entries), six distinct speaker categories including narrator and chorus, no semantic-silence item. Three work phases at items 0, 39 and 78 provide multiple beat opportunities. No production/private play content is used. Mocked plans include three explicit beats and pass existing CP1 validation.

## Validation and control results

**STOPPED at the authorized live Pass-1 acceptance gate. No implementation patch, commit, push or deployment after the failure.**

Deterministic validation passed before the live call: 283 focused tests (30 new CP4 tests), 1,215 full-suite tests, zero failures/skips; typecheck; production build; privacy review; tracked diff check and new-file whitespace review. Build emitted only the existing non-blocking Browserslist-data age notice; no dependency changes were made.

| Live Pass-1 measurement | Observed value |
|---|---:|
| Canonical / dialogue / stage / chorus / silence | 117 / 78 / 39 / 3 / 0 |
| Characters / distinct speakers | 4 / 6 |
| Serialized input / schema / instructions bytes | 20,594 / 8,676 / 6,974 |
| Requested / echoed output allowance | 17,376 / 17,376 |
| Provider elapsed | 17,057 ms |
| HTTP / response status | 200 / completed |
| Input / output / reasoning / total tokens | 7,825 / 2,955 / 0 / 10,780 |
| Output characters | 11,624 |
| Output messages / text parts / refusals | 1 / 1 / 0 |
| JSON / exact request schema | Passed / passed |
| CP1 production validation | Rejected |
| HTTP preparation result | 503 / TECHNICAL_HOLD / evidence_mismatch |
| Recorder count / largest record / terminal outcomes | 13 / 671 characters / 1 |
| Total preparation/control elapsed | 17,432 ms |

Exact content-free rejection: stage `production`; path `production.director.setting.noise.evidence[0]`; expected `exact_source_excerpt`; actual `excerpt_not_linked`. This establishes a runtime evidence-link validation failure after normal provider completion. It does not establish why the model made that citation or that the validator should be weakened.

Pronunciation authority was not reached/accepted in this attempt. Pass 2 was NOT called. No composition, READY-v3 or live-result mocked clip authorization was attempted. Those boundaries passed mocked deterministic tests only.

CP4 provider calls: **1**. Retries: **0**. Real TTS: **0**. Raw fabricated output/request and safe lifecycle evidence are preserved in local temporary directory `C:\Users\Kwesi\AppData\Local\Temp\nolan-cp4-control-XzWZc1`; they are not included in the repository. Do not print its result payload or continuation token. The safe report is `report.json`.

Production default remains MONOLITHIC; no activation or manual configuration change occurred. CP4 remains uncommitted on baseline `fa11f325940d45ee3ed37e0669f8120a5d0a41b2`. The live failure requires Aya review before any correction or another provider call.

The live control may make one Pass-1 call, then one Pass-2 call only if every Pass-1 gate passes and authority is READY without clarification. Zero retries. Any live contract failure stops work without a speculative patch or commit. This section will be updated with the observed result.

## Intended repository files

- app/api/read-passage/route.ts
- lib/beta-server.ts
- lib/reading-playback.ts
- lib/theatre-preparation-strategy.ts
- lib/theatre-preparation-client.ts
- lib/theatre-production-preparation.ts
- tests/theatre-production-cutover.test.cjs
- tests/two-pass-production-fixture.cjs
- docs/nolan-two-pass-cp4-review.md

CP1.2B remains excluded and untouched. Disposable harness/logs and temporary generated evidence are not intended repository changes. No Director's Notebook, audio-reference training, bilingual artistic test or manual deployment is included.
