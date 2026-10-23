# Director response-status diagnostic refinement â€” Aya review

Baseline: 0e3039bd5c3d8488dfcf0bda7678c344f71d1087. Implementation remains uncommitted.

## Scope and safety

The mandatory response.status !== "completed" gate remains. Request model, prompts, schema, output budget, reasoning effort, timeouts and retry configuration are unchanged. No scheduler, playback, TTS, casting, CP2 or pronunciation-policy edits. No real provider calls. CP1.2B files are untouched.

## Closed diagnostic contract

Existing schemaVersion 2 gains additive reasons:
- provider_output_limit: incomplete + max_output_tokens.
- provider_content_filter: incomplete + content_filter.
- provider_incomplete_unknown: incomplete + missing/unrecognized detail.
- provider_response_failed: failed.
- provider_response_cancelled: cancelled.
- provider_response_nonterminal: queued or in_progress.
- provider_status_unknown: missing/unrecognized status.
- provider_refusal: completed response with a message content part whose type is refusal.

Completed missing/blank output_text remains structured_response_missing; malformed JSON remains parse_rejected. Completed valid JSON continues into existing validators. Legacy incomplete_response remains a permitted historical category and internal fallback classification.

Optional numeric fields: requestedMaxOutputTokens, outputTokens, reasoningTokens. Only safe integers from 0 through 1,000,000 are accepted. Invalid/missing usage values are omitted, not guessed or clamped. The requested maximum comes from the actual request argument; usage comes directly from the SDK response. Counts do not influence generation. The existing 1,024-character serialized record limit, 64-record invocation bound and retention/sink behavior remain unchanged.

Unknown statuses/details become fixed enums. Refusal text is never read for classification. No provider output, raw status/detail strings, prompts, authored content, names, targets, tokens or arbitrary errors are retained.

## Propagation

AnalysisFailure retains the existing fallback category plus an optional safe originating reason. Direction metadata carries that reason to the authority technical gate. Structured-response, Director and authority rejection events preserve it. The HTTP analysis failure uses the recorder's earliest validated rejection when available, otherwise the exception's safe reason. The terminal receipt already uses that earliest cause.

This also aligns previously differing HTTP diagnostics such as missing_cast_coverage versus inventory_incomplete, without changing acceptance, retry or clarification behavior. Provider-reported cancelled status is an unsuccessful response/technical HOLD, distinct from actual client cancellation.

## Exact file responsibilities

- app/api/read-passage/route.ts: HTTP reason uses earliest recorder cause.
- lib/beta-events.ts: closed reason and bounded numeric contract.
- lib/beta-server.ts: accepts approved numeric fields; exposes earliest safe reason.
- lib/theatre-direction.ts: response classification, refusal-type check, token extraction and safe cause propagation.
- lib/theatre-pronunciation-authority.ts: preserves originating reason at the no-analysis gate.
- lib/theatre-pronunciation.ts: preparation error accepts the existing closed PreparationReason type.
- tests/theatre-preparation-recorder.test.cjs: status matrix, terminal/HTTP propagation, validator exclusion and privacy/numeric regressions; existing failures assert HTTP/receipt agreement.
- tests/pronunciation-integration-hardening.test.cjs and tests/theatre-pronunciation-ambiguity.test.cjs: expected precise missing-cast HTTP reason, distinct from explicitly incomplete inventory.
- docs/director-response-status-aya-review.md: this review.

## Validation

- Focused recorder/direction/integration tests: 110 passed.
- Focused pronunciation ambiguity tests: 21 passed (131 focused total).
- Complete regression suite: 966 passed, 0 failed, 0 skipped (15 new tests over the 951 baseline).
- Typecheck: passed.
- Production build: passed.
- Privacy and diff review: passed; git diff --check passed.
- Initial sandbox validation hit EPERM on fixture renames and build directories; permitted outside-sandbox reruns completed. One remaining legacy missing-cast HTTP expectation was corrected; the final full suite passed.
- Production source was unchanged after successful typecheck/build; subsequent changes were test expectations and this documentation only.
- Tracked diff: nine files, 106 insertions and 24 deletions; this new review document is additional.
- No staging, commit, push, deployment or real provider calls.

## Limitations

This does not reconstruct the historical provider subtype or fix an unknown generation cause. There are no audible or live-provider acceptance claims. The hosting-log retention configuration remains unverified; this checkpoint does not change persistence. No commit, push or deployment is authorized.
