# Nolan provider-boundary evidence — Aya review

Baseline: a292b71c1b6a7ff2da344f744fcc31a7d7667d79. Uncommitted implementation, mocked validation only.

## Scope

Instrumentation only. The model, prompts, schemas, Structured Output configuration, max_output_tokens formula, reasoning effort, deadlines, retries, completed-status gate and downstream generation/acceptance behavior are unchanged. No casting, scheduler, playback, TTS, pronunciation-authority or CP2 edits. No provider request identifiers are added. No real provider calls or Theatre replay.

## Existing recorder extension

New closed stage: provider_evidence. Each evidence event uses outcome present and reason none, with one flat boundary object. boundary.kind is one of scene, usage, output, config. Existing schemaVersion 2 is extended additively.

A normal fresh preparation adds four records: one scene projection and three response projections. A transport failure has no response projections because no response was supplied. These use the existing request ID, server-derived build, timing, BetaJournal and immediate hosting-log sink. They count toward the existing 62 intermediate + 1 terminal + 1 optional late-result maximum (64 total).

Boundary data is deliberately not merged into terminal metadata. Evidence events do not replace the active failure stage or originating cause. Terminal HTTP receipts stay compact and keep existing token diagnostics. To inspect the new evidence, filter existing private hosting logs by the receipt requestId and stage provider_evidence. No new endpoint, UI redesign, persistence service or secondary recorder is added.

## Exact boundary fields

All numerical fields are nonnegative safe integers. Invalid/oversized provider values are omitted and described by a closed state; they are never converted to zero.

| Kind | Fields | Bounds / meaning |
|---|---|---|
| scene | items, dialogue, stage, chorus, silence, characters, speakers | Each <=100,000. dialogue includes chorus; stage includes semantic silence. chorus is recognized by existing theatreRole. silence means canonical pauseMs is present/truthy. characters counts distinct character-role labels; speakers counts all distinct canonical speaker labels, including narrator/chorus. No labels retained. |
| scene | inputBytes | <=1,000,000. UTF-8 byte length of the exact serialized scene JSON passed to the analyzer. Excludes system prompt/schema transport overhead. |
| usage | usage, inputState, outputState, reasoningState, totalState | missing / invalid / valid. usage describes the object container, not full provider-schema validity. |
| usage | inputTokens, outputTokens, reasoningTokens, totalTokens | Each <=1,000,000; only present if directly supplied as a valid number. |
| output | textState, itemsState, contentState | missing / invalid / valid. No message items means contentState missing. |
| output | chars | <=10,000,000; SDK output_text UTF-16 length, no text retained. Empty string is valid zero. |
| output | items, messages, reasoning, functions, otherItems | Each <=10,000; known output item types are message, reasoning, function_call; everything else is counted as otherItems without retaining the unknown type. |
| output | textParts, refusals, otherParts | Each <=10,000; content types output_text/refusal/other counted only. Malformed/over-budget content arrays omit these partial totals and set contentState invalid. |
| config | maxState | missing / invalid / valid for SDK response.max_output_tokens. |
| config | echoedMax | <=1,000,000; absent if the SDK response did not supply a valid number. |
| config | maxMatch | same / different / unavailable. Compares only requested and returned max_output_tokens, not model identity or other configuration. |

Requested maximum output tokens remain in existing provider-start/provider-pass and terminal fields. The unchanged installed SDK exposes response.max_output_tokens optionally; an absent value is not manufactured.

Missing means undefined/absent; explicitly null or wrong-type values are invalid. Numeric zero is valid. Accessor properties are not invoked. Known SDK JSON fields are projected into new plain diagnostic objects.

## Bounds and privacy evidence

Maximum serialized new event sizes with the largest allowed numeric values, longest enum values, 40-character build, full request ID, maximum timing and timestamp:
- scene: 576 characters
- usage: 644 characters
- output: 664 characters
- config: 503 characters

All are below the unchanged 1,024-character record limit. Output inspection is bounded to 10,000 output items and 10,000 content parts; over-budget arrays are marked invalid rather than traversed fully or reported as complete partial counts.

A stress regression sends repeated evidence events, completes with an originating failure and then a late provider result: exactly 64 records, exactly one terminal record, one shared correlation ID, preserved cause. Terminal boundary attachment is rejected. Normal success/failure flows also assert size/count limits.

Validation rejects unknown keys (including nonenumerable keys), unknown categories, getters, custom serialization and invalid numbers. Copies isolate nested boundary objects from journal/sink mutation. Exceptions from diagnostic extraction or observers cannot change generation. No authored text, names, targets, evidence, model/refusal output, prompts, content hashes, document IDs, provider IDs, raw payloads or arbitrary errors enter this extension.

Existing retention remains unchanged: bounded process-local journal (1,000 records, lazy 30-minute reset) plus hosting logs. Hosting-log retention/configuration is still unverified. Hard-killed invocations and unavailable/expired hosting logs remain limitations. The exhausted historical specimen is not reinterpreted or regenerated.

## Changed files

- lib/beta-events.ts: closed boundary schema/types/validation and isolated copying; new evidence stage.
- lib/beta-server.ts: accept evidence metadata without accumulating it into receipts or changing failure stage.
- lib/theatre-direction.ts: scene and response instrumentation hooks; reuse the same input byte computation.
- lib/theatre-provider-evidence.ts: new bounded content-free projection helper.
- tests/theatre-preparation-recorder.test.cjs: extraction, privacy, response-state, budget, copy, numeric and lifecycle regressions.
- docs/nolan-provider-boundary-evidence-aya-review.md: this report.

## Validation

Focused tests: 132 passed, 0 failed.
Typecheck: passed.
Full regression suite: 988 passed, 0 failed, 0 skipped (22 new tests over the 966 baseline).
Production build: passed; existing outdated Browserslist-data warning only.
Privacy review, maximum-record-size verification, lifecycle stress tests and git diff --check: passed.
Initial sandbox suite failures were EPERM process-spawn and temporary-fixture rename restrictions; the permitted outside-sandbox rerun passed without source changes.
Production/test source was unchanged after the successful focused tests, typecheck and build. Only this review document was finalized afterward.
CP1.2B file hashes match their pre-validation values.

The interrupted test fixture contained a Windows-encoded chorus character; only the fixture was repaired with an ASCII Unicode escape. No chorus routing change was needed.

No staging, commit, push or deployment. The three CP1.2B files remain untracked and unchanged.
