# Checkpoint 4.2 — chorus synchronization

## Diagnosis before production edits

Baseline: clean main at `58becc8a14eed312dd1909bbf939ff0dde87364e`.
CP4.1 classification works and is unchanged. The old chorus uses three HTMLAudio
elements, waits for all canplay events, then calls play without sequential awaits.
It does not inspect encoded padding or active speech duration. canplay establishes
media readiness, not audible speech onset or a common sample clock.

Three local browser baseline trials, using the actual old ChorusAudio class and
synthetic WAV components, measured play-call spreads of 1.0/0.2/0.2ms and playing
event spreads of 0.8/0.2/0ms. Every component had readyState 4. These observations
do NOT establish browser startup as the principal production problem. Event
timestamps also are not direct speaker-output measurements.

The fixtures encode onsets of 50/280/480ms and active durations 2000/2120/1900ms.
The old player leaves that 430ms onset separation and 220ms duration spread
untouched. This demonstrates a timing-correction gap, not proof that those exact
values occur in production. No stored production TTS audio was available; no paid
TTS calls were made. Actual voice padding, relative pacing and word-level drift
remain to be evaluated in the human production ear test.

## Architecture

Chorus only uses SynchronizedChorus, implementing the existing logical media
handle. All three clips are fully decoded and context activation must complete
before any source is scheduled. Independent AudioBufferSourceNodes use one future
AudioContext clock anchor (50ms scheduling lead). Measured onset corrections use
at most 41.67ms relative delay; there is no random/voice-specific delay. All three
distinct generated voices and the exact source text remain unchanged.

Ordinary dialogue/narration, reading, poetry and ambience keep their HTMLAudio
paths. The old ChorusAudio remains available for injected environments lacking a
Web Audio factory; the production browser environment selects Web Audio and
fails explicitly if it is unavailable, rather than silently degrading voices.

API scheduling and source lifetime follow the
[Web Audio specification](https://www.w3.org/TR/webaudio/#AudioBufferSourceNode).

## Padding and pacing

Each decoded channel is scanned for samples exceeding amplitude 0.00001
(-100dBFS). All channels participate. A 40ms margin before the first such sample
is retained. Only preceding near-digital padding is skipped; internal pauses and
the entire tail remain. No sample data is modified, no phoneme/word assumptions
are made, and no script-specific timing constants exist. Silent/invalid components
fail the entire logical item. Noise or a breath can conservatively prevent
padding removal; this is preferable to cutting quiet initial speech.

Active duration (last detected sound minus first) is compared with the median
of the three components. Playback rate is duration/median, clamped to 0.96–1.04.
This reduces modest drift without large stretching. Web Audio resampling is not
pitch-preserving: the maximum pitch change is approximately 0.7 semitone. The
generated voices remain distinct; subjective naturalness requires an ear test.
This local relative correction does not change requested TTS/global reading
speed values. Chorus instructions additionally request steady ensemble pacing,
brief punctuation pauses and no exaggerated hesitation, while retaining exact text.

This is duration alignment, NOT forced word alignment. Different internal pause
patterns and large duration outliers can still diverge. The rate bound deliberately
prioritizes intelligibility/naturalness over forcing extreme clips into unison.

## Lifecycle and safety

Decoded buffers/timing are cached by component-array identity for the scene.
Replay creates new one-shot source nodes and contexts, reusing those decoded
buffers without generation or decode requests. Stop/replacement clears the cache.
Pause immediately mutes gains, captures per-source raw offsets and any remaining
scheduled delay, stops/disconnects every source and cancels progress timers.
Resume recreates unfinished sources together from that bookmark. Already-ended
components stay ended; a paused non-current practice return never calls play.

Epoch checks invalidate stale decode/resume/end callbacks. Completion requires
every component exactly once. Any decode, activation, node/start or context
interruption failure uses the existing theatre error state without advancing.
The existing 30-second watchdog bounds stalled decode/activation. Progress ticks
use the audio clock and refresh it only while audio actually progresses.

Stop, completion, errors, replacement and unmount disconnect sources/gains,
remove callbacks, clear timers, drop node buffer references and close contexts.
No chorus Object URLs are allocated. Native decode work cannot be cancelled,
but its late result cannot restart a disposed attempt or replace a newer scene.
The CP4 capture gate synchronously stops/mutes the group before microphone access;
release restores eligible ambience only, never dialogue.

## Validation and limits

Deterministic tests cover preparation/activation barriers, same-clock scheduling,
padding/guard and rate math, early scheduled pauses, cached 20-fold replay,
bookmarks, all-source completion, stale events, failures, watchdog and recording
ordering. Existing CP4/4.1 tests remain unchanged.

Native AudioContext validation demonstrated stable pause positions, resumed
progress, 20 replays with only three decodes, one logical completion, and all 21
contexts closed. OfflineAudioContext rendered the timing plan on three separate
channels: measured onset spread 0.125ms and active-end spread 59ms, versus fixture
baseline 430ms/220ms. These are synthetic-signal results, not live TTS measurements.

The native-browser ReadingPlaybackSession/controller check also imported the
permanent CP4.1 scene fixture, with synthetic WAV responses through the actual
generation path. Low ambience and the microphone capture lease were exercised:
all chorus sources stopped and ambience was paused at zero volume. Returning
from non-current practice preserved the paused state without starting sources.
Resume and two controller replays completed all seven logical items exactly once
(line-3, line-6, line-9, line-12, line-14, line-18, line-21), with one scene request
and eleven initial synthetic TTS calls, unchanged by Replay. After completion and
Stop, all five contexts were closed, all sources stopped, six created Object URLs
were revoked, and the controller was idle. The temporary browser validation page
was removed; the permanent automated fixtures/tests remain.

Final validation (2026-09-17): `npm test` passed all 209 tests (33 new; zero
failures, cancellations, skips or TODOs; 17357.9366ms). `npm run typecheck` and
`npm run build` passed. The build route list contains no validation route.
Standalone lint was skipped: `next lint` is listed, but no ESLint configuration
exists, so it would request interactive setup. No lint configuration was changed.
Build warnings about stale Browserslist data and webpack dependency-snapshot
caching were non-fatal; dependencies and configuration were left unchanged.

Remaining limitations: no physical microphone/output-device test, no paid TTS
or production-browser ear test, possible noise-obscured onset, internal pacing
differences, bounded correction of extreme duration variation, autoplay/device
restrictions, and additional decoded PCM memory retained until scene Stop or
replacement. No Scene Partner work is included.
