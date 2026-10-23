# Theatre preparation flight recorder — Aya review

## Scope and baseline

Baseline: `849aaa489c34ecc4d220bbac9711c78c44e823fe`.

This extends the existing beta event validation, journal, protected-route wrapper,
and Theatre diagnostic UI. It does not introduce a database, service, endpoint,
dependency, or client telemetry upload. No provider calls are used for validation.
No commit, push, deployment, or CP1.2B promotion is authorized in this checkpoint.

## Implementation

| File | Change |
| --- | --- |
| `lib/beta-events.ts` | Versioned closed preparation-record contract, fixed configuration, validated counts/timings/dispositions, safe observer callback, bounded records in the existing BetaJournal. |
| `lib/beta-server.ts` | Request-scoped recorder, server build identity, stage/total timing, immediate structured hosting-log emission, terminal ownership, one possible ignored late-result record and correlated HTTP receipt. Existing aggregate logging remains unchanged. |
| `lib/theatre-direction.ts` | Director/provider invocation, response presence/parsing, dramatic/Director/pronunciation validation and deadline observations; provider request arguments and fallback behavior unchanged. |
| `lib/theatre-generation.ts` | Carries the optional observer to the existing whole-scene analysis. No scheduling change. |
| `lib/theatre-pronunciation-authority.ts` | Observes existing pronunciation, inventory, evidence/occurrence and authority checks. Acceptance policy and authored data unchanged. |
| `lib/theatre-pronunciation.ts` | Pure count-only summary of validated proposal resolution statuses; no linguistic decisions, names or targets enter diagnostics. |
| `app/api/read-passage/route.ts` | Enables whole-scene diagnostics and passes the observer; observes owner-answer authority validation and response construction. |
| `lib/reading-playback.ts` | Transmits the existing preparation UUID; validates and retains the last safe failure and successful/clarification receipts separately. Without a failure receipt, retains only the failed request ID, without inventing a server cause. |
| `components/article-reader/TheatreDebugPanel.tsx` | Shows a preparation receipt/reference after failure even without the debug query flag or a prepared queue; reuses the existing JSON display/copy/download controls. Successful receipts and content-bearing delivery export remain debug-only. |
| `tests/theatre-preparation-recorder.test.cjs` | Mocked pipeline, correlation, race, privacy, retention, logger-failure and UI-copy regressions. |
| `tests/theatre-observability.test.cjs` | Existing panel mocks implement the new read-only receipt accessors. Playback assertions retained. |
| `docs/theatre-preparation-flight-recorder-aya-review.md` | This review, exact contract/enums, recovery procedure, retention limitations and validation evidence. |

## Exact diagnostic contract

Each `beta_theatre_preparation` hosting-log entry uses the following closed schema.
All fields are required except the three explicitly optional fields. Extra fields
at either the top level or inside counts are rejected:

| Field | Constraint |
| --- | --- |
| `timestamp` | Integer Unix milliseconds, 0 through 10^15. |
| `build` | Server-derived `VERCEL_GIT_COMMIT_SHA`, accepted only as 40 lowercase hexadecimal characters; otherwise literal `unknown`. No client build value is accepted. |
| `requestId` | UUID v4. Client creates a fresh ID for each preparation; server validates it and generates a replacement when missing/invalid. |
| `stage` | One of the fixed values below. |
| `outcome` | One of the fixed values below. |
| `reason` | One of the fixed values below. |
| `retryable` | Boolean. Meaningful for terminal receipts; false for intermediate records. |
| `schemaVersion` | Literal `2` (diagnostic contract). |
| `provider` | Literal `openai`. |
| `model` | Literal `gpt-5.4-mini`; the Director request uses the same approved configuration constant. |
| `directorSchemaVersion` | Literal `1`. |
| `pronunciationSchemaVersion` | Literal `1`. |
| `pronunciationPolicyVersion` | Literal `2`. |
| `elapsedMs` | Integer, 0–3,600,000; elapsed since the most recent start of this stage, zero if no start was observed. |
| `totalElapsedMs` | Integer, 0–3,600,000; elapsed since request recorder construction. |
| `counts` | Optional object with only the keys below; each value an integer 0–100,000. |
| `authorityRevision` | Optional integer 1–10,000; no authority digest or production/content identity. |
| `disposition` | Required on terminal records and prohibited on intermediate records; exact mapping below. |

Stages:

```text
request, director, provider, structured_response, director_validation, dramatic_validation,
pronunciation_validation, inventory, occurrence_evidence, authority, response
```

Outcomes:

```text
started, present, absent, passed, rejected, fallback, reused, ignored,
succeeded, failed, cancelled, clarification
```

Reasons:

```text
none, provider_failure, timeout, cancelled, incomplete_response,
structured_response_missing, parse_rejected,
validation_rejected, invalid_dramatic_analysis, output_missing, evidence_mismatch,
inventory_incomplete, missing_cast_coverage, invalid_established_decision,
unbound_occurrence, authority_rejected, linguistic_ambiguity, analysis_unavailable,
analysis_rejected, director_plan_missing, director_plan_rejected, late_result_ignored,
input_budget, output_budget, empty_scene, invalid_request, rate_limited,
preparation_failed
```

Terminal dispositions and their exact outcome mapping:

```text
succeeded     -> READY
clarification -> CLARIFICATION_REQUIRED
failed        -> TECHNICAL_HOLD
cancelled     -> CANCELLED
```

Allowed count keys:

```text
established, ambiguous, conflicting, unknown, rejected, accepted, unbound
```

Resolution-status counts describe structurally validated Director proposals, not
proof of linguistic correctness. `rejected` counts distinct rejected entries (or
invalid established decisions at that boundary); global contract failures can
have zero entry counts. `unbound` counts entries with no bound occurrence.
`accepted` remains zero until authority acceptance: it then counts automatically
accepted entries during a clarification hold, or all accepted entries when ready.
Counts are stage-specific, and terminal records retain the latest safe summary.

The first blocking rejection determines a failed terminal reason. Later broad
fallback observations cannot relabel that terminal cause. Subsequent validation
observations remain available, including valid dramatic data alongside rejected
pronunciation data. Reasons reflect executed checks, not inferred linguistic
causes. Generic unexpected failures retain the last observed stage with
`preparation_failed`; a budget/unavailable fallback does not falsely record a
provider invocation. A legacy plan missing accepted analysis is reported at the
authority boundary as `analysis_unavailable`, without reconstructing lost details.

Terminal outcomes are `succeeded`, `failed`, `cancelled`, or `clarification`.
The route wrapper owns exactly one terminal record for each activated invocation
that completes. After termination, one provider settlement may emit a nonterminal
`ignored / late_result_ignored` record; all other late observations are discarded.
It cannot change the terminal disposition. Client
cancellation and the wrapper deadline are distinguished; the existing Director
deadline is recorded as timeout before its internal abort fires.

## Director lifecycle

A typical fresh successful preparation records:

```text
request started
director started
provider started -> passed
structured_response started -> present -> passed
dramatic_validation started -> present
pronunciation_validation started -> present -> passed (status counts)
director_validation started -> passed
dramatic_validation passed
director passed
pronunciation_validation started -> passed (rechecked at authority boundary)
inventory started -> passed
authority started
occurrence_evidence started -> passed
authority passed (accepted count and revision)
response started
response succeeded / READY (one terminal record)
```

Cache reuse and sealed accepted-plan reuse produce `reused` events rather than
inventing a new provider invocation. The existing optional dramatic delivery-plan
fallback remains intact: missing/invalid optional Director delivery metadata is
recorded as `absent / director_plan_missing` or `fallback / director_plan_rejected`.
That does not change the previously accepted legacy dramatic fallback policy.
Invalid base dramatic analysis and technical pronunciation failures still HOLD.

Stage durations use the fixed stage keys, not arbitrary labels. They are integer
milliseconds, clipped at one hour and clamped to zero on clock regression. A
zero duration may mean synchronous work completed within one millisecond, or a
reused/absent boundary without a start. These are wall-clock diagnostics, not CPU
profiling. Timing and logging never make a Director/authority acceptance decision.

## Correlation and transport

The existing client `Preparation.requestId` travels in `X-Theatre-Request-Id`.
Known Theatre requests also send `X-Theatre-Preparation: 1` so early request-gate
failures can be recorded before body parsing. Explicit Theatre bodies activate
diagnostics without that hint; the existing server routing decision also activates
diagnostics for inferred Theatre. Unknown requests rejected before they can be
identified as Theatre cannot be retrospectively classified as Theatre.

The response carries `X-Theatre-Request-Id` and
`X-Theatre-Preparation-Receipt` (the exact terminal record as bounded JSON).
Existing status codes, error JSON, clarification payloads and scene tickets are
unchanged. No prompt/body/token is added to logs or receipts.

The client accepts a receipt only after closed-schema validation, matching its
own request ID and a failed/cancelled outcome. Stale requests cannot replace it.
Stop/retry retains the last receipt. Without a valid server failure receipt, a local
reference contains only `requestId`; it makes no claim about the server outcome.

## Bounded storage and privacy

- Each serialized record is at most 1,024 ASCII bytes; unknown or extra fields are rejected.
- Maximum 62 intermediate entries, one terminal and one ignored late result: 64 records per invocation.
- The existing journal retains at most 1,000 preparation records, with its existing
  lazy 30-minute session reset. This is process-local memory, not durable storage.
- Client retention is one last failure receipt, one successful/clarification receipt and one unconfirmed request ID;
  reload/disposal loses it. No localStorage/sessionStorage is introduced.
- Immediate `console.info` records bypass the once-per-minute aggregate throttle.
  Console/sink errors are caught and cannot fail preparation. If the sink fails,
  durability cannot be guaranteed; no additional network fallback is attempted.
- No dialogue, person/name, pronunciation decision/target, raw model response,
  prompt, attachment, content digest, document ID, token, credential, body,
  arbitrary exception string or provider error payload enters the record.
- The only hash-shaped field is the explicitly permitted deployment commit SHA.
- Correlation IDs are operational references, not authentication credentials.
  Log access remains controlled by the hosting account; no public lookup exists.

## Hosting retention findings

Hosting logs are the current durable sink outside the application worker. They
are not an application-controlled durable database and have finite retention.

The accessible repository does not establish this deployment's Vercel plan,
Observability retention, log-drain configuration, or actual runtime-log retention.
Neither `vercel.json` nor `.vercel/project.json` exists in this checkout.
No authenticated Vercel account/log capability is available in this task. The
actual retention window therefore **has not been verified**. No numerical
retention guarantee is claimed. No Vercel setting has been changed.

Before live acceptance, the owner should verify the project's Logs/Observability
retention and access permissions in Vercel, and confirm that build metadata is
available. If unavailable, records deliberately say `build: unknown`; hosting
invocation metadata must identify the deployment. Longer guaranteed retention
would require a separately approved hosting/log-retention decision.

## Recovery procedure after a future failure

1. Do not replay the request to diagnose it. Open **Diagnostic de préparation**
   beneath the Theatre controls. It is available without `?theatreDebug=1`.
2. Choose **Afficher le reçu de préparation (sans contenu)**, then **Copier le JSON affiché**.
   If the response was lost, choose **Afficher la référence de requête** instead.
3. In the authenticated Vercel project Logs view, choose the relevant deployment
   and time range, then search for the copied UUID and `beta_theatre_preparation`.
4. Save the matching terminal record and, when useful, the bounded preceding
   records. They contain only the fields above; no failed response/body is needed.
5. If only a start/intermediate record exists, record an interrupted/incomplete
   invocation and inspect platform metadata. Do not invent a semantic cause.

For successful preparation, enable the existing local debug mode before the run
and use **Afficher le reçu de préparation réussie**. The same server correlation
and copy controls apply. This checkpoint does not authorize a new live run.

`succeeded` means the handler constructed a successful preparation response; it
does not prove that the browser received or accepted it. An abrupt worker/process kill can prevent terminal logging and HTTP receipt
delivery. Existing stage records can locate the last reached boundary, but cannot
prove an unobserved timeout/cause. Log expiry or hosting ingestion loss can also
prevent recovery. This cannot reconstruct the historical failure that predated
the recorder, and does not promise recovery after hosting retention expires.

## Validation

Final results after the exact-length privacy guard, Director-observability
extension and validation-timing adjustment (no production/test edits afterward):

| Check | Final result |
| --- | --- |
| Focused recorder/Director/privacy/integration tests | **155 passed, 0 failed** |
| Complete `npm test` suite | **951 passed, 0 failed, 0 skipped**; 45 added tests over the 906-test starting tree |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; all routes built successfully |
| `git diff --check` | Passed |
| Privacy review | Passed: closed enums, plain data-only records, bounded numeric fields, no private content/exception payloads; client fields cannot select server metadata |
| Diff/scope review | 9 production files, 2 test files, this document; no scheduler/casting/TTS/CP2 implementation edits |
| CP1.2B | All three pre-existing files remain untouched, untracked and unstaged |
| Provider calls | Zero real Director/TTS calls; all provider execution in new tests is mocked |
| Git operations | No staging, commit, push or deployment; branch `main`, unchanged HEAD |

Focused command:

```text
node --test tests/theatre-preparation-recorder.test.cjs tests/theatre-observability.test.cjs tests/pronunciation-integration-hardening.test.cjs tests/theatre-director.test.cjs tests/director-integration.test.cjs tests/beta-readiness.test.cjs
```

The final sandboxed build encountered an EPERM error creating generated `.next`
directories. The authorized unsandboxed rerun passed without source changes.
The build reports an outdated Browserslist data warning; no dependency update was
made. All new tests use mocked provider transports and local fixtures.

Coverage includes each rejection boundary, Director lifecycle/configuration/counts,
successful automatic French-context acceptance, genuine ambiguity/owner confirmation,
automatic acceptance, first-failure preservation, request/HTTP/UI/log correlation,
reverse-order concurrent completion, aggregate-throttle independence, exactly one
terminal outcome, timeout/cancellation and late completion, pre-aborted requests,
invalid/rate-limited requests, schema/privacy limits, bounded journal/log records,
logger failure, late actual provider completion ignored, bounded stage timings,
accepted-plan/cache reuse, strict identifier/control-character rejection,
lost browser response recovery, UI receipt copying without a
queue/query flag, and unchanged ordinary-reading diagnostics behavior.

## Preserved boundaries

No provider/model/prompt/voice/canonical-text changes. No pronunciation-policy,
scheduler, lookahead, concurrency, playback-order, held-turn/CP2 or TTS-cache
changes. The three existing CP1.2B files remain untracked and untouched.

This is a mocked diagnostic-validation checkpoint, not audible pronunciation
acceptance or proof of live Vercel log ingestion. No commit/push/deployment.

The successful preparation receipt retains the parent request ID for a future
explicit TTS-correlation extension. This checkpoint does not add IDs to speech
instructions, tickets, authored input or TTS requests, and does not claim to trace
accepted authority into audible provider output.

## Working-tree evidence

No staged files. HEAD remains `849aaa489c34ecc4d220bbac9711c78c44e823fe`.
The following is the final file scope (the three CP1.2B entries pre-existed):

```text
 M app/api/read-passage/route.ts
 M components/article-reader/TheatreDebugPanel.tsx
 M lib/beta-events.ts
 M lib/beta-server.ts
 M lib/reading-playback.ts
 M lib/theatre-direction.ts
 M lib/theatre-generation.ts
 M lib/theatre-pronunciation-authority.ts
 M lib/theatre-pronunciation.ts
 M tests/theatre-observability.test.cjs
?? docs/role-play-cp1-2b-experiment.md
?? docs/theatre-preparation-flight-recorder-aya-review.md
?? scripts/theatre-lexical-ab-experiment.cjs
?? tests/theatre-lexical-ab-experiment.test.cjs
?? tests/theatre-preparation-recorder.test.cjs
```

`git diff --stat` (Git excludes untracked files from this output):

```text
 app/api/read-passage/route.ts                   | 29 +++++---
 components/article-reader/TheatreDebugPanel.tsx | 23 ++++--
 lib/beta-events.ts                              | 51 ++++++++++++-
 lib/beta-server.ts                              | 98 ++++++++++++++++++++++---
 lib/reading-playback.ts                         | 24 +++++-
 lib/theatre-direction.ts                        | 59 +++++++++++----
 lib/theatre-generation.ts                       |  7 +-
 lib/theatre-pronunciation-authority.ts          | 40 +++++++---
 lib/theatre-pronunciation.ts                    |  6 ++
 tests/theatre-observability.test.cjs            |  4 +-
 10 files changed, 286 insertions(+), 55 deletions(-)
```

The checkpoint additionally adds the test file and this document, both currently
untracked. The three CP1.2B files remain untouched, untracked and unstaged.
