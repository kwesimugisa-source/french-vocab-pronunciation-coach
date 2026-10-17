# CP2: optional assistance inside the held learner turn

Baseline: `9fe8c3d085827691819e587d8c43cbf8ae7a544e`.

## Behavior and ownership

The canonical learner line and Continue remain prominent. A collapsed optional
assistance panel provides record/stop, own-recording listening, model listening,
transcript/text comparison, and another recording attempt. Recording and feedback
never gate Continue. Feedback displays recognized text and possible word differences,
not the legacy pronunciation score or claims about acoustic/acting performance.

`HeldTurnAssistance` owns resources for one exact immutable `LearnerTurn`, not a
scene queue. All entry points check the token by reference; asynchronous media work
also checks an epoch. `PronunciationSession` captures the canonical text, document,
revision, session, speaker and item at recording time and rejects stale permission,
recorder and analysis callbacks. Continue cancels assistance synchronously and then
delegates to the existing `continueLearner(turn)` method. Stop/replacement/unmount
release tracks, audio handlers, object URLs and capture ownership. Disposed
coordinators reject further actions.

The shared capture boundary mutes ambience and excludes partner speech while
recording or listening. Releasing it never resumes the scene. Only one assistance
audio source can exist. Re-recording stops listening and releases the previous
recording. Media errors and blocked play promises leave the hold intact and allow
retry or Continue.

## Model listening

Automatic preparation still excludes learner lines. Only an explicit model-listen
action calls the existing incremental loader for the current held item. It uses
the same scene ticket, accepted plan, casting, style, speed, canonical text and
3,800-character instruction budget. Repeated listens reuse the loader cache.

Cancelling a listening consumer invalidates its result; it does not cancel the
shared scene loader or change its scheduling. An already-requested component may
finish and remain cached in the same scene, but cannot start late playback.
Stop/document/style/speed replacement disposes the entire existing loader as before.
No changes to the six-position lookahead, two-job limit, cursor, advancement,
narrator, chorus, silence, Director or TTS instruction builder.

## Recording format and privacy

The shared recorder chooses a format supported by `MediaRecorder.isTypeSupported`,
or lets the browser choose. Blob type comes from the actual recorder/chunk, and
MP4/OGG/WebM uploads use the corresponding filename. This also corrects the former
WebM assumption for ordinary recording; its reference and service remain unchanged.

Recording is held in memory only. Own playback stays local. Only explicit Compare
uploads the recording and canonical reference to the existing comparison endpoint.
No new analytics, persistence, credentials, model/provider, or automatic uploads.
Cancellation aborts the client request; provider work already accepted by the
existing server endpoint may still finish. No promise of upstream cancellation.

## Validation and reproducible browser fixture

`tests/held-turn-assistance.test.cjs` covers holds, single-use Continue, stale actions,
resource cleanup across six asynchronous phases and four lifecycle exits, permission
failure, format negotiation, recording/self/model exclusion, autoplay rejection,
comparison retry, exact reference identity, explicit-only learner TTS, cached model
listening and ordinary/model request-body equivalence in both styles.

The existing regression suite covers partner scheduling, replacement by style/speed,
casting, Director, chorus, semantic silence, Universal Practice, Virelangues,
Conversation, ordinary recording and transcript-reference analysis.

Validation: 78 focused tests passed before the final additional capture-exclusion
test; final full suite 846/846 passed (840 committed tests plus six untouched
untracked CP1.2B tests), including 35 new CP2 tests. Typecheck, production build,
privacy review and diff checks passed. No paid provider calls. The first sandboxed
suite encountered temporary-file rename restrictions in existing experiment tests;
the final run outside that sandbox passed. A new disposal snapshot regression found
and fixed stale displayed recording state after resource cleanup.

Run `node scripts/held-turn-browser-fixture.cjs`, then open `http://localhost:3102`.
This loopback-only standalone fixture renders the actual components and coordinator;
it is not a Next route and is never imported by production. Recording, permission,
provider responses and autoplay denial are simulated; the browser plays a real
synthetic WAV blob. No microphone or provider access is used. It supports testing
390/430/768/1280 px layouts, keyboard Continue, denial/retry, recording playback,
comparison, model rejection/retry, completion during capture and restart.

Browser acceptance at those widths found no horizontal overflow. Simulated denial,
capture, self playback, comparison, blocked model playback/retry, keyboard Continue,
final-turn Continue during capture, and restart passed. This is not physical iOS or
Android microphone acceptance.

## Human production acceptance

1. Import a scene with first, consecutive and final learner turns plus partner,
   narrator, chorus and silence items. Select a role. Without opening assistance,
   speak and Continue through the scene; verify the accepted CP1 flow.
2. At a hold, deny microphone permission. Verify the error and usable Continue.
   Allow access for a subsequent attempt; record, stop, listen to yourself, then
   record again. Verify the prior recording is replaced and the microphone stops.
3. Listen to the model twice. Verify the chosen character voice, current style and
   speed, no overlap, and unchanged hold. Repeat for Clarté and Naturel. This does
   not assert deterministic proper-name pronunciation.
4. Compare a recording. Check the exact displayed canonical line against the
   recognized text and word suggestions; verify no acoustic/acting score is shown.
   Retry after a failed comparison and Continue without waiting for feedback.
5. Continue or Stop during permission, capture, self/model listening, model loading
   and comparison. Replace the document or change role/style/speed. Verify no late
   audio/result, no old recording on the next turn, and no duplicate advancement.
6. Finish on a learner turn, then restart. Verify the first hold and no old feedback.
7. Repeat recording/self playback on real Safari/iOS and Chrome/Android, including
   interrupted/blocked playback, plus keyboard operation at 390/430/768/1280 px.

## Experiment handling and deferred work

The three pre-existing untracked CP1.2B files remain untouched and excluded from this
commit: `docs/role-play-cp1-2b-experiment.md`,
`scripts/theatre-lexical-ab-experiment.cjs`, and
`tests/theatre-lexical-ab-experiment.test.cjs`. No lexical guidance is production-enabled
and no generated experiment audio is included. Their six mocked tests may appear in
local full-suite totals; they are not part of the committed CP2 test baseline.

Deferred: hands-free/automatic continuation, adaptive partners, acoustic or acting
assessment, arbitrary seek/exchange rewind, durable recordings/history, dashboards,
cross-device resume, pronunciation experiments/new providers, and SFX. No CP3 work.
