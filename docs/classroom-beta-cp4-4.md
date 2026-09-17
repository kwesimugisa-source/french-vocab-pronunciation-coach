# CP4.4 — Classroom beta readiness

## 1. Starting state and scope

Repository: `C:\Users\Kwesi\Downloads\french-vocab-pronunciation-coach-complete`.
The checkpoint began on clean `main`, with HEAD and origin/main at
`4bc57a687dfe272f9c61856b26a43c0a7d4a8eae`. After the usage interruption, work
resumed from the existing 24-file diff. No reset, rollback or restart occurred.
The owner explicitly chose infrastructure-independent completion: no new database,
analytics service, authentication system or credential-dependent service.

## 2. Architecture audit and interrupted-diff review

The app has document/revision identity and separate generation, reading,
vocabulary and recording lifecycles. Ordinary reading uses one audio blob;
Conversation uses an independently validated sequential queue; Theatre uses its
existing logical-item controller and synchronized chorus; Virelangues delegates
one selected sentence to ordinary reading. Pronunciation remains a captured
reference plus transcription comparison. Ambience is an independent local loop.

Existing cancellation/epoch guards were useful, but preparation feedback and
safe diagnostics were incomplete. The repository had no account identity,
durable analytics backend, admin access control or distributed request limiter.
No new dependencies were required.

Every interrupted source edit was reviewed. Corrections included an unreachable
abort call, premature Conversation preparation completion, raw reading-error
display, missing-provider ambience being misreported as playback failure, and
generation rate errors being classified generically. Full regression also caught
five existing privacy-contract failures: the initial cache approach returned
dramatic summaries to the browser. That approach was replaced with a bounded
server-only cache and an opaque reference; the existing tests were preserved.

## 3. Files changed

API and page wiring:

- `app/api/analyze-pronunciation/route.ts`
- `app/api/analyze-word/route.ts`
- `app/api/generate-article/route.ts`
- `app/api/read-passage/route.ts`
- `app/page.tsx`

Components:

- `components/BetaDiagnostics.tsx` (new)
- `components/article-reader/PreparationNotice.tsx` (new)
- `components/article-reader/ReadingControls.tsx`
- `components/article-reader/TheatreControls.tsx`
- `components/article-reader/TongueTwisterPractice.tsx`

Lifecycle, diagnostics and audio:

- `lib/ambience-playback.ts`
- `lib/beta-events.ts` (new)
- `lib/beta-provider.ts` (new)
- `lib/beta-server.ts` (new)
- `lib/conversation-playback.ts`
- `lib/exercise-practice.ts`
- `lib/preparation.ts` (new)
- `lib/pronunciation-session.ts`
- `lib/reading-playback.ts`
- `lib/safe-errors.ts` (new)
- `lib/theatre-ambience.ts`
- `lib/theatre-analysis-cache.ts` (new)
- `lib/theatre-direction.ts`
- `lib/theatre-generation.ts`
- `lib/theatre-playback.ts`
- `lib/theatre.ts`
- `lib/vocabulary-session.ts`

Tests and report:

- `tests/beta-ambience.test.cjs` (new)
- `tests/beta-readiness.test.cjs` (new)
- `tests/content-page.test.cjs`
- `tests/pronunciation-session.test.cjs`
- `docs/classroom-beta-cp4-4.md` (this report)

## 4–6. Preparation architecture, coverage and progress

`Preparation` is a subscribable store with request UUID, opaque document ID,
revision, operation and start time. Starting another operation cancels the old
one; only the matching request can complete/fail/clear its state. Existing abort,
document and media-ownership guards remain authoritative. Replacement and
reinterpretation invalidate pending work and functional ambience context.

Immediate green, local, accessible status notices cover generation, ordinary
reading, Theatre preparation, Conversation preparation and delayed turn starts,
individual Virelangues listening, pronunciation analysis and vocabulary analysis.
There is no blocking overlay and no invented percentage. The spinner respects
reduced motion. Conversation media-start feedback uses actual pending play state.

Theatre alone shows measured completed logical items / queue length. A
multi-voice chorus is one item. This is playback completion, not provider/TTS
generation progress. Preparation latency is elapsed request preparation time;
playback lifecycle duration starts at the controller's start event and includes
pauses/turn preparation, so it is not a measurement of audible speech duration.

## 7–9. Ambience status, reuse and office sound

Five typed statuses have distinct French messages:

| Status | Meaning |
|---|---|
| `analyzed_no_ambience` | Valid analysis confidently chose no ambience |
| `detected_available` | Valid environment with a local provider |
| `detected_unavailable` | Environment recognized; no local sound implementation |
| `analysis_unavailable` | Analysis failed, was unavailable, or evidence was uncertain/rejected |
| `playback_failed` | An available provider could not play; speech continues |

The active browser document caches its validated ambience decision, keyed by
document ID, revision and exact text. Successful decisions survive full Play,
cached-line replay and speed changes; replacement/revision invalidates them.
Failed decisions retry only on explicit Play after 30 seconds. Plays during that
cooldown do not extend it. Off/Low/Medium never trigger classification.

Full dramatic summaries and annotations stay server-side in a functional cache:
at most 16 entries, 30-minute expiry checked on access, opaque random references,
and exact-source SHA-256 binding. This is not telemetry. Entries are copied on
read/write, can be cleared, and are lost on worker eviction/redeploy. A cache hit
avoids another model analysis. A different worker or expired entry may need fresh
dramatic analysis; it receives the previously validated ambience decision, is
instructed not to reclassify, and the server preserves that decision even if the
new analysis disagrees or fails. No public cache-inspection endpoint exists.

The catalogue still has 26 environments, with actual local providers only for
neutral room, office and rain. Unsupported environments remain silent and retain
their unavailable status. Playback failure can recover through Off then Low or
Medium. Capture immediately mutes/pauses the loop; releasing capture restores
ambience only, never speech.

Office now uses a stronger filtered ventilation bed, gentle modulation and soft
120/240 Hz mechanical texture instead of the neutral-room waveform. Audio is
original procedural PCM, with no downloaded/licensed assets or speech. Existing
master gains remain Off=0, Low=0.08, Medium=0.16; speech gain is unchanged. Tests
verify distinct nonzero energy and no clipping. Human production acceptance must
judge actual audibility and whether it remains sufficiently unobtrusive.

## 10–12. Analytics identity and exact privacy boundary

No account system exists or was added. Each browser journal uses a random UUID
session and separately generated event/operation UUIDs. Source document IDs are
mapped to opaque random IDs in a bounded in-memory map (128 entries). Nothing is
fingerprinted: no IP, cookies, device ID, user agent identity or covert matching.
The request session header is an anonymous limiter hint, not authentication.

The whitelist accepts only these fields:

- Required: `name`, `eventId`, `sessionId`, numeric `timestamp`.
- Optional enum categories: `operation`, `status`, `contentType`, `origin`,
  `level`, `speed`, `code`, `environment`.
- Optional UUIDs: `documentId`, `operationId`.
- Optional bounded nonnegative integers: `revision`, `durationMs`, `logicalItems`,
  `requests`, `ttsCharacters`, `inputTokens`, `outputTokens`.

Event families are document created/imported/reinterpreted; operation lifecycle;
playback lifecycle; pronunciation attempts/retries; Theatre replay/practice;
Virelangues listen/practice; ambience; provider calls; rate limiting. Every new
recording attempt is counted; retry is an additional marker for the same captured
document/revision/item. Its content type identifies Virelangues retries.

Runtime validation rejects extra fields as well as content smuggled into enum,
numeric or ID fields. Telemetry does not store imported/generated text, scripts,
dialogue, exercise sentences, clicked words, transcripts, recordings, audio,
answers, prompts, provider response bodies, raw errors, credentials or PII.
Functional text/audio/recording/analysis memory is separate from telemetry.
Existing provider requests still carry the content necessary for the learning
feature. Responses calls use `store: false`; this is not a claim about every
aspect of the provider's own retention policy.

## 13–15. Storage, retention, inspection and limitations

**There is no durable classroom analytics store or private production dashboard.**
No browser analytics upload/collector was added. Browser and server journals are
separate, each bounded to the latest 1,000 events and a 30-minute session. Expiry
is checked on access; it is not a background deletion timer. Idle process memory
can remain until accessed or destroyed. A reload clears the browser journal;
worker restart/redeployment clears that worker's server journal. Events can also
be explicitly cleared with `resetBetaDiagnostics()`; the development panel has
an “Effacer les diagnostics” button. No localStorage/sessionStorage/database is
used. The opaque document map is bounded and cleared by explicit reset/reload.

Development-only `BetaDiagnostics` shows aggregate categories, per-mode action
counts, latency mean/median and usage totals for that browser. It renders nothing
in production. No secret or admin credential is shipped. `serverDiagnostics()`
can inspect aggregates in the same server process; calling it in a new process
cannot inspect a deployed worker. Production handlers emit content-free
`beta_aggregate` snapshots to existing server logs at most once per minute, on
requests. Owners can inspect those through their existing hosting-account log
access. No public telemetry/debug route was added.

Log access/retention is governed by the host; no new dashboard was provisioned or
verified. Clearing memory does not delete earlier hosting logs. Snapshots overlap,
and the 1,000-event cap can discard earlier activity: do not sum snapshots as
unique classroom totals. `sessions` describes the current local journal only;
server sessions are worker diagnostic sessions, not unique learners. Browser
mode/completion events are not automatically present in host logs. This supports
local beta testing and limited server diagnosis, not complete classroom reporting.

Smallest future decision: choose one approved durable store with atomic counters
and expiry, its retention/deletion policy, and server-only write credentials.
Then add validated, bounded ingestion plus owner-protected aggregate access
using an existing owner identity/protection mechanism or a server-only access
secret. The same store could support distributed limiter counters. No learner
account system is necessary. That choice and its credentials are deliberately
outside CP4.4.

## 16. Provider usage and cost pressure

All generation, vocabulary, pronunciation, transcription, dramatic-analysis and
TTS SDK calls are metered by operation category. Counters record SDK invocations,
failed invocations, supplied TTS string lengths (JavaScript UTF-16 code units), and returned numeric
input/output token usage when available. `responsesWithTokenUsage` makes coverage
explicit; zero accumulated tokens does not imply zero provider consumption.
Hidden SDK transport retries, streamed-body failures after an SDK response, and
invoice totals are not inferred. Explicit user retries produce new operations.
No prices, estimated dollars or fabricated token counts were added. Bounded local
totals are diagnostic pressure indicators, not an authoritative billing ledger.

## 17–18. Rate protection and duplicates

All four expensive endpoints use the same process-local gate implementation:
120 accepted requests per minute, eight active requests, at most 30 per anonymous
session per minute, and one active request per session/operation. Theatre and
Conversation retain their internal three-worker TTS bound. Limits apply per
loaded server process/module instance, not globally across serverless instances.
Session IDs can be reset/forged; origin checks are only a browser boundary, not
authentication. This reduces accidental bursts and is not distributed abuse or
budget enforcement. Cold starts/redeploys reset counters. Platform/provider
timeouts remain relevant; no new durable job system was introduced.

The gate rejects mismatched supplied origins, checks declared and actual streamed
body size (500,000 bytes, or 10,000,000 for pronunciation), and releases slots in
`finally`. Pronunciation additionally checks an audio file up to 9,000,000 bytes
and reference text up to 60,000 characters. Existing reading/import size rules
remain. Rejection is a safe French 429 with a 60-second Retry-After.

Client guards prevent simultaneous generation, reading preparation, recording,
analysis and repeated same-word vocabulary requests. Virelangues listen is
guarded during pending preparation. A new vocabulary target supersedes the old
request. Reading's existing Stop/cancel control remains available, and line
replays use cached audio without new TTS requests. Cancellation cannot guarantee
already-submitted provider work stops or avoids cost; server protection is still
needed.

## 19–21. Errors, browser behavior and cleanup

Errors use fixed French messages and category codes. Raw provider exception
logging was removed; reading never displays raw HTTP bodies or thrown network
payloads. Rate failures preserve the active document/recording and allow retry.
The telemetry validator fails quietly without delaying learning/provider work.

Current desktop Chromium remains the target. HTML Audio, Blob URLs,
MediaRecorder/getUserMedia and Web Audio chorus behavior keep their existing
ownership/epoch checks and watchdogs. Missing audio/recorder or denied microphone
access produces a safe error. Microphone permission starts only on explicit
recording. Late permission closes tracks; Stop/replacement releases media,
Object URLs, chorus contexts, timers and obsolete recording results. Stale
responses cannot emit successful completion for the current operation or attach
old ambience/audio. No historical-browser compatibility project was added.

## 22–26. Preserved behavior and known issue

- Theatre: complete ordered scenes, stable IDs/casting, narrator/stage directions,
  synchronized chorus, pause/resume, replay/bookmarks, practice and mic gate.
- Conversation: visible labels excluded from speech/reference, stable distinct
  voices, ordered turns, speed changes; no Theatre analysis/ambience/controller.
- Virelangues: sound selection/validation, separate exercises, individual fresh
  speed-aware audio, explicit recording, transcript feedback and retries.
- Smart Import: identity, original/canonical text, provenance, mapping,
  conservative routing and learner reinterpretation. Import/parsing/casting
  architecture was not redesigned.
- Pronunciation: transcript-based comparison only; no new phoneme/acoustic
  claims, and unmeasured fluency/intonation remain null.
- Known PDF standalone page-number speech remains **deferred to post-4.4
  production-acceptance cleanup**. This checkpoint does not fix it.

## 27–30. Validation

New deterministic coverage exercises preparation/cancellation and stale events;
privacy rejection for every prohibited content family; anonymous identity,
retention and storage failure; provider counters; server/client limits; page
generation errors and duplicates; pronunciation attempts/retries/capability
failure; Conversation/Virelangues pending states; Theatre logical progress;
all ambience statuses, caching, worker loss/expiry, cooldown, gain/capture,
failure recovery, office PCM energy and server-only dramatic summaries.

Final validation:

- Focused readiness, ambience, page, pronunciation and dramatic-contract run:
  **91 passed, 0 failed**.
- Entire `npm test` suite: **481 passed, 0 failed, 0 skipped**. All 439 original
  tests retained, with 42 additions. The five initially failing summary-privacy
  assertions pass after the server-cache correction.
- `npm run typecheck`: passed.
- `npm run build`: passed, including static generation and production traces.
  The build reports webpack cache snapshot warnings and stale Browserslist data;
  neither prevented completion. No dependency/config modernization was attempted.
- `git diff --check`: passed. The complete 32-file scope was reviewed, with no
  unrelated import/pagination work, credentials or generated build artifacts.
- Production static chunks contain no development diagnostics panel labels;
  there is no added public dashboard/telemetry route.

No paid provider calls or subjective production-audio acceptance are represented
by mocked tests. Live deployment revision and human audibility remain acceptance
checks, not claims established by the local build.

## 31–33. Delivery verification

The completion response records the final commit hash, push result, equality of
HEAD/origin/main/remote main, and final working-tree status. No later checkpoint
is included in this commit.

## 34. Short human production acceptance plan

Use the deployed build corresponding to the delivered commit in current desktop
Chromium; verify the deployed revision before testing.

1. **Ordinary:** generate or import a short passage; Play; confirm immediate
   green preparation, audible playback and completion. Repeat with Poetry.
2. **Conversation:** use two/three labelled speakers; labels remain visible but
   unspoken, voices stay distinct, turns complete in order. Replay at another speed.
3. **Virelangues:** choose R, generate, listen to one exercise, change speed,
   listen again, record/analyze/retry. Confirm only the selected sentence is used.
4. **Theatre:** import a mixed-cast scene with narrator and LE CHŒUR; pause/resume,
   replay twice, practice a réplique, finish practice, then change speed on a new
   Play. Confirm chorus and final item complete with accurate logical progress.
5. **Ambience:** use an office scene with grounded stage/context evidence; compare
   Off, Low and Medium. Medium must be clearly stronger but background. Repeat
   Play without changing text; classification must remain stable. Record once
   and confirm ambience is silent during capture.
6. **Failure:** temporarily use browser Network Offline before Play, then restore
   Online. Confirm concise French error, cleared preparation, retained document
   and successful retry; no raw provider data. Do not create a paid request storm.
7. **Diagnostics:** owner inspects safe `beta_aggregate` entries through existing
   private host logs; use the local development panel for browser event aggregates.
   Confirm absence of learner text/transcripts/audio. There is no production
   classroom dashboard or durable cross-worker total to accept in CP4.4.
8. **Import cleanup:** retest the real PDF-derived play and note any remaining
   spoken page numbers for the final cleanup; do not repair them in this run.

## 35. Deferred work

Human audibility/production browser acceptance and concrete bugs it reveals;
the known PDF pagination issue; and an owner-approved infrastructure decision
for durable private classroom analytics/distributed limiting. CP4.4.1 and
Scene Partner/Perform a Role were not started.
