# CP4.7.x — Theatre diagnostics and linguistic guards

Starting HEAD: `77253724fa9327c73554647d8279e1f1ef3e6571`.

## Retrieve the next production trace

1. Open the current production URL with `?theatreDebug=1` appended (use `&theatreDebug=1` if it already has a query). Reload **before** starting the scene. This is an explicit local debug mode, not an authentication bypass or a public telemetry dashboard.
2. Prepare a fresh La Dernière Table scene in **Naturel / Normal** and reproduce the issue. No extra synthesis is performed for diagnostics: capture accompanies the normal component requests.
3. Immediately after the bad line, **pause**. Do not stop, replace the scene or reload yet. Expand **Diagnostic théâtre — mode debug local** below the Theatre controls.
4. Click **Afficher la trace**, then **Copier le JSON affiché** or **Télécharger le JSON affiché**. The textarea is also selectable if clipboard permission is unavailable. This export omits dialogue, real speaker names, audio, scene tokens, provider credentials and document titles.
5. Select the affected **Élément** number (the UI uses one-based positions; JSON indexes are zero-based). Select **Composante 1** for an ordinary line; chorus has components 1–3. Click **Afficher la direction et la requête TTS (contient du texte)**, then copy/download that JSON separately. Repeat for Thomas !, Thomas ? and Elle a dit oui ?, plus the comparison line. **This selected-item export contains authored input and scene-context excerpts. Review it before sharing.**
6. Remove the query flag and reload when finished. Nothing is automatically uploaded, logged as content, stored in browser storage, or retained in a cloud analytics service.

The trace and selected-item payload are separate exports. Error/completion leaves the current capture available. Stop retains one content-free trace snapshot, marked cancelled, but discards the selected-item payloads. Reload loses all captures. A new scene uses a new local session ID. Capture cannot recover a run made before enabling the flag.

## What is captured

### Content-free lifecycle trace

- Scene-local session ID; separate preparation attempt and playback attempt/call numbers.
- Canonical zero-based item index, safe item label, physical source line, type and scene-local pseudonymous speaker label; chorus component indexes.
- Queued/request/prepared/cached/failed preparation, plus cancellation and observed stale response events.
- Playback request (`play`) and promise resolution (`play_resolved`) are separate from **`media_started`**. HTML media confirms through `playing`; media-clock progress is a fallback and supplies the Web Audio chorus observation. Neither confirms audible words or the listener's device output.
- Metadata/currentTime/duration, throttled progress (at most once per media second within an attempt), ended/media error, stale callbacks, and advancement reason (`audio` or explicit `practice`). A silent stage beat is identified as `timed_pause`, not audible media.
- Bounded arrays: 4,096 playback events, 1,024 preparation events, 2,048 item descriptors. Counts of dropped events are exported, preventing eviction from being mistaken for missing playback. The source queue/playback itself is not truncated.

Progress/event timing is browser evidence, not speech recognition. A nonempty MP3 can contain silent, wrong or incomplete speech. An ended event cannot prove lexical correctness. A very short chorus may end before the next clock sample; absence of a start sample is not proof that it was never audible.

### Selected-item accepted direction / request

Only debug-mode component responses include the selected component's exact `speech` object used in `audio.speech.create`: model, fixed voice, exact input, speed and complete instructions. The accepted Director context uses the **same pure projection function** that constructs the instruction string; no reanalysis or post-hoc invented interpretation is used. It includes the actual setting/relationships/recent event/state/delivery fields when applied. Director fallback/Clarté yields `director: null` with the actual direction status; the final instructions remain available.

`requestOutcome` distinguishes SDK invocation, receipt of audio bytes and a safe numeric provider error status. Invocation is not proof that the provider received a failed request; audio receipt is not proof of correct pronunciation. Client capture adds its session, preparation attempt, index and component for correlation. The latest returned request payload for a component replaces its previous payload after retry.

Capture is limited to 256 component records, 32,000 serialized characters per record and 2,000,000 serialized characters total, evicting oldest records. Silent pauses have no TTS payload. Requests blocked before the handler, lost to a connection failure, or aborted before a response cannot provide a returned debug payload. The UI reports unavailable capture rather than fabricating one.

The component endpoint remains protected by the existing encrypted scene capability and rate limits. Responses with debug content are `no-store`. No endpoint lists other scenes, exposes the full encrypted token or returns provider credentials. The optional debug query flag merely exposes local controls for the user's own scene.

## Linguistic guards

- For dialogue ending in question punctuation (including closing quotation marks), append explicit non-spoken guidance preserving French interrogative phrasing regardless of Director intent. `question`, `respond` and `unknown` are all tested. Natural, context-sensitive French prosody is requested, **not exaggerated mandatory rising intonation**. Acting intent, emotion, addressee, subtext and projection remain intact.
- Dialogue of one to three lexical words receives non-spoken French-context guidance for ambiguous words and internationally shared names: French vowel/consonant/rhythm conventions, no English lexical stress or diphthongs inferred from isolated spelling. This is not a Thomas-specific replacement table. Thomas, Alice, Paul, Rose, Marc and an interjection are tested. Canonical input/spelling, voices and speed are unchanged; no carrier sentence or visible respelling is introduced.
- These guards constrain Theatre delivery in both styles. Ordinary full reading, Universal Practice, Conversation and Virelangues keep their existing paths. Actual perceptual improvement still requires human production listening.

## Scheduler and verification

The six-item lookahead, two active jobs, pending-request deduplication, required-item promotion, chorus sequencing and retry policy are unchanged. Loader changes add observational metadata and optional response capture only. One component request still performs at most one TTS SDK call; debug capture adds none.

Regression coverage checks final real-route payloads against the mocked SDK call, actual accepted context, question intents, short names, exact text/casting, capture opt-in, failed request metadata, bounded storage, cancellation/stale events, attempt versus confirmed start, duration/progress, advancement reason, privacy separation, and debug export controls. Existing long-scene order/exact-once, Director, casting, French, playback, practice, ordinary-mode, import and pronunciation regressions passed. **727 tests passed (709 baseline + 18 new), zero failures/skips.** Typecheck, production build, privacy review and diff checks passed. Existing nonblocking Browserslist/webpack cache warnings remain. No paid provider calls were used. Git identity is recorded in the completion report.

Stop after CP4.7.x. No Jouer un rôle or SFX work.
