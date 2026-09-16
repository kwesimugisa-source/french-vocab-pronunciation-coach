# Checkpoint 4: chorus and ambience

## Independent layers

- **Performance:** the existing theatre controller owns one logical item at a time.
  Single voices use the existing Audio path; chorus uses `ChorusAudio`, a group
  implementing the same media boundary. A group retains its own component Audio
  objects, positions, readiness, completion flags and Object URLs.
- **Ambience:** `AmbiencePlayback` owns one independent scene loop. It has no
  authority to advance the queue. `ReadingPlaybackSession` coordinates its
  lifecycle and user setting separately from the performance layer.
- **Capture:** the existing `PronunciationSession` invokes an optional synchronous
  `beforeCapture` policy before requesting microphone access. The returned release
  function runs only after tracks are stopped (or permission fails/cancels).

No ambience is baked into TTS, and no chorus is flattened into a mixed file.

## Chorus generation and contract

Default chorus voices are **echo, fable, onyx**, verified supported by the existing
gpt-4o-mini-tts inventory. Three is a fixed cost bound: each chorus costs two more
TTS requests than before. If the configured narrator reserves onyx/fable, ash
fills the third slot. The narrator is never used in the chorus group. Stable
ordinary-character casting remains unchanged.

Each component receives the exact same parsed text, numeric speed and dramatic
instructions. Flattened component jobs share the existing three-worker limit;
there is no nested concurrency multiplier. Analysis still runs once before TTS.
Components are assembled in casting order regardless of completion order.

Each logical clip keeps its original ID, index, text, speaker, source lines and
primary `voice`/`audioBase64`. Chorus adds `chorus.components`, exactly three
distinct voice/audio entries. The primary fields match the first component for
legacy compatibility. New clients play all components; old single-voice cached
responses are still accepted. Integrity counts remain counts of logical items.

**Failure policy:** any failed or empty component fails the logical chorus and
the scene through the existing identified `THEATRE_GENERATION_FAILED` response.
The failed item appears once even if multiple components fail. Other pending jobs
remain accountable. No partial chorus is returned as successful playback.

## Group playback

All sources preload. Playback waits for every source's `canplay`/readyState,
then issues all `play()` calls in one turn without sequential awaits. This is
coordinated HTML media startup, not sample-accurate Web Audio scheduling.
Each source has gain 1/3 to keep the aggregate level conservative.

Only the final component ending completes the logical item. Duplicate, stale and
disposed-source events cannot advance it. Any media error or current play rejection
stops the entire group and leaves the cursor at the failed item for cached Replay.
The existing watchdog also bounds a group that never becomes ready or stalls.

Pause/Resume affect all unfinished sources and preserve their individual times.
Already-ended sources stay ended. Replay releases the previous group and starts
all cached components from zero without any generation request. A non-current
practice excursion saves each component's time and ended flag; returning to a
paused chorus never briefly calls play. Stop/replacement/unmount release every
source, callback and Object URL. Chorus remains excluded from pronunciation practice.

## Conservative ambience recommendation

The structured analysis schema has an additive `ambience` field:
`environment` (none/rain), `confidence` (high/uncertain), `evidenceItemId`, and
`evidenceQuote`. Old analysis without this field is accepted as none.
Invalid ambience is independently replaced with none; otherwise-valid dramatic
annotations are retained.

Rain requires high confidence, an exact quote from an existing stage-direction
ID, and explicit present-rain wording such as "La pluie tombe" or "Il pleut".
Negation/speculation markers, dialogue about weather, unsupported environments,
invented quotes/IDs and "outdoors" alone produce none. This deliberately narrow
vocabulary avoids guessing birds, crowds or arbitrary soundscapes. The client
rechecks evidence against validated clips before enabling a source.

The response adds only the sanitized recommendation. IDs, source text, ordering,
dramatic delivery and existing integrity validation remain authoritative.

## Audio provider, licensing and controls

No appropriate environmental-audio API or existing assets were found in the
repository. No OpenAI sound-effects capability is assumed or invented.
`AmbienceProvider` is a synchronous local Blob provider boundary, allowing a
future licensed/preloaded asset library without changing the playback controller.

The included **rain demonstration** is original deterministic filtered-noise WAV
generated locally by code, with short edge fades. It contains no speech, external
recording, downloaded asset or commercial sound library. It is intentionally a
small demonstration source, not a realistic production ambience catalogue.

The theatre controls offer **Désactivée / Faible / Modérée** (Off/Low/Medium).
Default is Off. Low and Medium set only ambience gain (0.08 / 0.16); there is no
High option. No-evidence scenes disable the control and state that no appropriate
ambience was detected. User level choice persists within the page session.

An enabled ambience loop persists over item advancement, Replay and practice.
It is independent of the performance Pause button, which pauses voices; use Off
to silence ambience outside recording. This also means a previously paused
performance remains paused when its ambience is restored after capture.
Scene completion, errors, Stop, replacement and unmount release the loop.
Missing-provider/audio failures fail silent and never skip a dialogue item or
trigger repeated automatic retries. Off then re-enabling permits a manual retry.

## Microphone-safe turn boundary

`ReadingPlaybackSession.beginMicrophoneCapture()` synchronously:

1. Mutes and pauses ambience.
2. Blocks theatre Resume/Replay and pauses every performance source, including chorus.
3. Pauses ordinary/poetry audio if present.
4. Returns an idempotent release operation.

Only then does `PronunciationSession` call `getUserMedia` and start its existing
MediaRecorder pipeline. Delayed generation arriving during capture is also held
paused. Nested capture leases keep the gate closed until the last release.
Track cleanup precedes restoration on recording finish, reset, recorder error,
permission denial and disposal. Cancelled late permission results close their
tracks without creating a recorder. Release after Stop cannot restart a scene.

Release restores eligible ambience at the current user level, respecting Off,
and removes the performance gate; it **never automatically resumes dialogue**.
Current/non-current practice semantics remain in the existing controller. The
same hook is available for future role-based turn taking; no role selection,
learner character or Scene Partner state machine is implemented here.

## Validation and limits

Deterministic tests cover grouped readiness, all-source completion, end-at-pause
boundaries, cached Replay, per-source bookmarks, failures, stale callbacks,
resource cleanup, evidence validation, independent loops and capture ordering.
Checkpoint 1–3 tests remain, with only single-source chorus expectations extended
to the intentional three-source contract. Browser inspection uses a temporary
local-audio fixture that is removed before commit; no paid calls are needed.

Limitations: TTS voices may have different durations/prosody; simultaneous starts
do not guarantee word-level alignment. Browser autoplay, decoding and device
behavior can fail safely. No subjective live spoken-chorus quality or physical
microphone acoustic evaluation is claimed by mocked tests. Capture protection
controls this application's audio, not other tabs/apps or room reverberation.
Existing per-item speech limits, base64 response memory/deployment limits and
per-scene (not global) concurrency constraints still apply. The rain demo is the
only ambience source; broader licensed environments remain future work.
