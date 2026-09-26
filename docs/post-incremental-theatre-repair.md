# Post-incremental Theatre production repair

Starting commit: `8720f5c5da472aed0c6509120ec51eeecad09694`, clean `main`.

## Findings and limits of the diagnosis

**Increasing pauses:** the previous loader had one serial logical job and only two items of lookahead. A short sequence can consume audio faster than the next component is generated; a chorus occupies that worker for three requests. The player correctly waits at the generation frontier, but the pipeline lacks throughput. Retrying a failed item could also wait behind already queued speculative jobs. These are reproduced code-level causes of buffering, not proof of the precise production delay after `ÉLISE : Apparemment.`. No production audio/request timings or full La Dernière Table text were provided in this repair.

**Reported missing dialogue:** not reproduced and its production cause is not established. Inspection and tests find no path that advances because audio is unprepared, generation fails, or a later response arrives first. Advancement follows the current attempt's ended event (or explicit completion of current-item practice). Stale attempts cannot advance; failures retain the current index. Existing completion records deduplicate IDs, so those records alone cannot prove playback happened exactly once. New tests additionally inspect actual mock media starts/ends, decoded mock audio text, preparation events and advancement order. This proves transport/controller integrity under the tested conditions; it cannot prove that a real provider spoke every word in a returned recording. The full affected script and the omitted line's production audio/timing remain needed to distinguish a source-specific parsing issue from provider/audio behavior. No speculative dialogue-removal fix was made.

**Spoken silence:** every stage direction previously used narrator TTS. `[Silence.]` therefore became speech. French authority was already present in the component route; no missing French-instruction branch was found. English-like pronunciation in actual provider output cannot be diagnosed from mocks. The repair removes semantic silence from TTS structurally and verifies French authority for other short narrated directions.

## Minimal changes

- Six logical items of lookahead; maximum two active preparation jobs per scene. A job requests chorus components sequentially, so this is also a maximum of two simultaneous component HTTP/TTS calls per scene. A required item/retry/practice target is promoted ahead of waiting speculative jobs, without interrupting an in-flight request.
- Initial playback still waits only for its first logical item. The controller, not preparation completion order, owns playback order. Missing required audio displays the existing buffering state and resumes that same item. Successful components remain cached through failures/retries.
- `/api/read-passage` still makes zero TTS calls. `/api/theatre-clip` still makes at most one TTS call, with the existing timeout and zero SDK retries. The process-local component gate permits two concurrent operations per anonymous session and four globally per worker. Ordinary request duplicate protection remains one. This is not a distributed global provider limit.
- Exact silence/pause/temps directions, with narrowly supported articles/adjectives and punctuation, receive canonical `pauseMs: 900`. They remain `stage` items with unchanged text, source lines, ID and index. They carry empty audio and play through a timed, cancellable media adapter. Pause/resume/replay and stale timer guards use the existing controller lifecycle. The 900 ms duration is independent of style and speed; browser background throttling can delay timer delivery.
- Silence is excluded from both the legacy library synthesizer and production component endpoint. The endpoint also recognizes silence in still-valid pre-repair encrypted tokens. Ordinary actions such as `[Élise se fige.]`, `[Thomas prend une longue inspiration.]` and `[La pluie devient plus forte.]` keep narrator TTS.
- The Director still receives the entire canonical scene, including silence. The following reply receives a non-spoken continuity reminder about that beat; full Naturel Director context, stable casting, narrator ownership, Clarté, speed, chorus, ambience and the existing Director cache remain intact.
- No changes to UI layout, segmentation, Universal Practice, Conversation, Virelangues, import or pronunciation-reference paths.

## Local integrity inspection

`ReadingPlaybackSession.getTheatreDiagnostics()` returns logical/spoken counts and two bounded event lists (up to 1,024 events each):

- preparation: item index, component index, queued/request/prepared/cached/failed phase and time;
- playback: item index, logical/ready/buffering/play/ended/advance/failed phase and time.

These are memory-only inspection methods, not a public endpoint, persistent telemetry, console content log or dashboard. No dialogue, speaker identity, recording, voice credential, scene token or provider response body is included. Playback traces reset on stop; the loader is discarded with the scene. Very long sessions can evict old events, so this is bounded debugging, not a durable audit ledger.

## Mocked measurement and regression evidence

The shared route harness now uses AsyncLocalStorage to count TTS calls by invocation accurately even when two requests overlap. It does not infer per-request counts from a global counter difference.

Sixty canonical items (59 spoken plus one silence; over 1,000 words), one-second playback per spoken item:

| Mock generation duration | Buffering after first start | Peak concurrent TTS |
| --- | ---: | ---: |
| 0.5 seconds | 0 ms | 2 |
| 1.0 second | 0 ms | 2 |
| 1.6 seconds | 600 ms | 2 |
| 3.0 seconds | 30,200 ms | 2 |

The fixture includes one deliberately slower request to produce out-of-order readiness. At 1.6-second generation, the previous one-worker/two-item configuration buffered for **35,020 ms**, versus **600 ms** after the repair; both started at **1,600 ms**. These are deterministic mock measurements, not production speed promises. When generation remains slower than playback capacity, safe visible buffering is still required.

Every run asserts all 59 exact spoken texts start and finish exactly once in order, all 60 logical items end/advance in order, every speakable item has a prepared component, zero preparation-route TTS calls, one component-route TTS call and one Director analysis. The exact supplied Apparemment/Non/fiançailles/Silence/Oh sequence also completes in order in both styles. Existing 50-item chorus, retry, partial-success, cancellation, replacement, style/speed, practice, French, Director and ordinary-mode tests remain in the suite.

Additional regressions cover semantic-vs-narratable directions, silence timer pause/replay/cancellation, legacy-token rejection, short narrator French anchoring, fixed narrator voice, required-job priority and unchanged ordinary duplicate protection. All automated provider calls are mocked. The full suite passed **709 tests, zero failures/skips** (694 baseline plus 15 new). The final 15-test integrity run also passed after strengthening expectations independently of the parser. Typecheck and production build passed; only nonblocking existing Browserslist/webpack cache warnings remained. Privacy and diff reviews passed. Git identity is recorded in the completion report.

## Human production acceptance

1. After deployment, reload the app to obtain the new client and prepare a fresh scene. Existing pre-repair scenes may need restarting.
2. Play the complete original La Dernière Table in Clarté and Naturel, checking each authored dialogue and the final line. Pay particular attention to the delay after `Apparemment.`.
3. Confirm `[Silence.]` remains visible, is never spoken and creates a short beat before `Oh.`. Confirm other stage actions retain the same French narrator.
4. Confirm Network shows small component requests with no more than two active from this scene; pause/resume, repeat a réplique, practise a later item, and return to the original position.
5. Interrupt connectivity and retry, then replace the document/change style or speed during preparation. No earlier scene audio should attach. If a line is still missing, retain its exact source text, item position and affected audio/request timing for diagnosis; an ended media event does not establish the lexical content of provider audio.

Stop after this repair. No Jouer un rôle or SFX work.
