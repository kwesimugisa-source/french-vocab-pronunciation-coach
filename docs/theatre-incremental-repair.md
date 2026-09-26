# Theatre incremental preparation repair

## Confirmed production cause

The user supplied Vercel evidence: `/api/read-passage` reached `FUNCTION_INVOCATION_TIMEOUT` at 300.1 seconds, after one scene-analysis request and approximately 50 speech requests. Later duplicate/rate-limit responses were separate from this original failure. This repair does not increase the hosting timeout.

## Request architecture

1. `/api/read-passage` parses the complete canonical Theatre document and resolves the existing casting, CP4.7 scene analysis, Clarté/Naturel style and ambience. It returns an `incremental-v1` manifest with the full ordered canonical item list, fixed voices/speeds and **no synthesized audio**. The existing bounded analysis cache remains in use.
2. The manifest includes a two-hour authenticated encrypted scene token containing the accepted plan. AES-256-GCM uses a domain-separated key derived server-side from the already configured API credential. No new credential, database or external service is needed. The plan can be recovered by another worker without another Director call. Tokens are POST-body data, never URLs, analytics or localStorage; responses are `no-store`. Rotation of the existing server credential invalidates outstanding tokens.
3. `/api/theatre-clip` accepts only that token, a canonical item ID and component index. It derives exact input, fixed voice, speed, French anchor and performance instructions from the authenticated plan. It performs **one TTS SDK call maximum**. Ordinary/narrator items need one component; chorus requires three separate component requests and remains one logical playback item.
4. The browser has one serialized component request at a time, deduplicates pending loads and normally prepares at most two logical items ahead. Playback starts as soon as the first logical item is ready. It waits visibly at missing items; ready later items cannot bypass them.
5. Successfully received audio remains in the active scene's client memory. A failed chorus component does not discard earlier components. Retry requests only missing audio. Replay of ready items requires no new requests. There is no automatic infinite retry or provider burst.

The former whole-scene generator remains a library fixture/compatibility utility for existing integrity tests; no production route invokes it. Conversation, ordinary full reading and independent Universal Practice TTS keep their existing paths.

## Bounds and recovery

- Theatre preparation: zero TTS calls; existing 20-second scene-analysis deadline/fallback.
- Audio request: one component, explicit 55-second SDK timeout, zero SDK retries, 65-second enclosing server deadline including body reads.
- Per-scene client TTS concurrency: one. Separate process-local component gate: four active requests globally, 240/minute globally, 120/minute per anonymous session, and no concurrent duplicate reading operation in one session. Existing whole-read rate budgets remain unchanged.
- Aborted requests race cancellation; the request gate releases idempotently even if a mocked/failed handler ignores cancellation. Request cancellation is passed to scene analysis and individual TTS calls. Deadlines also release the gate. No timeout increase or IP identity is introduced.
- Stop/document replacement/style change cancels the loader. Playback attempt/session checks reject late responses. Speed/style changes use a new audio scene; the existing same-document analysis reference remains reusable.
- Partial preparation errors remain item-specific. The UI offers `Réessayer cet élément`; completed audio is retained. Expired tokens request a scene restart. A single oversized utterance still obeys the existing 4096-character TTS limit; component audio is capped at 2.5 MB to keep the encoded response below the host response limit.
- No new recording or pronunciation target path: réplique practice uses the existing canonical item. Out-of-order practice preserves its playback bookmark, and a pending model stays silent during microphone capture.

## Director and preservation

Whole-scene analysis runs at preparation, not in the component route. The encrypted token carries the same immutable analysis/casting for all subsequent component requests, including different workers. Naturel retains contextual direction; Clarté retains its pedagogical instructions. Narrator ownership, three-voice synchronized chorus, ambience registry/gains, exact authored dialogue/interjections and the document's French pronunciation authority remain unchanged.

The process-local analysis cache still expires/evicts and is not durable across workers. A new full preparation after cache loss may analyze again, but the ongoing token-based scene never reanalyzes per clip. The token and client audio expire/disappear with their lifecycle; this is not durable storage or a production analytics dashboard.

## Universal Practice UX

`PracticeControls` now renders `selected.text` prominently, with preserved whitespace and wrapping, immediately above its playback buttons. `PracticeSession.listen` and `practiceTarget` already use that same canonical unit. No segmentation or practice-mode behavior changed.

Browser checks used actual rendered components and the live local app, without invoking paid audio or microphone access. At 390, 430, 768 and 1280 px, the selected text remained above controls without horizontal overflow. Fixture buttons retained a minimum 44 px height. Clicking Next in the actual app changed the displayed canonical text and selected-unit identity together. Temporary preview HTML was removed before release.

## Automated evidence

`tests/incremental-theatre.test.cjs` covers:

- 50 logical items in Clarté and Naturel, with over 1,000 words and two choruses: 54 total component calls, **zero per preparation request, at most one per audio request**, peak client concurrency one, one whole-scene analysis, early start and ordered exact-once completion.
- Later-ready items cannot bypass a failed earlier item; successful audio survives retry.
- Partial chorus success, retry of only the failed/missing voice, and no partial chorus playback.
- Both styles recovering from initial clip failure without repeating analysis.
- Stop/replacement, ignored-abort responses, same-document style/speed changes and Director reuse.
- Cross-worker token reuse, expiry/tampering rejection and fixed request options.
- Gate release after abort/deadline despite ignored cancellation.
- Pause/capture while buffering, cached replay, out-of-order practice and bookmark restoration.
- Mismatched component identity/voice/speed rejection.
- Exact canonical Practice display/listening/pronunciation references.

Older content/casting/audio contract tests now use `tests/complete-reading.cjs`, a **test-only collector** that exercises both real routes and assembles their results for existing assertions. It is not a production fallback or the incremental browser transport. The original complete-array/failure-collection assertions remain; raw-route tests above establish the actual incremental semantics. Peak concurrency in the route collection test was deliberately changed from three to one. Each four-speed train scenario has an isolated mock worker to avoid hundreds of zero-latency test calls exceeding the real component rate budget.

Validation: **694 tests passed (679 baseline + 15 new), zero failures/skips**. Typecheck and production build passed. The build reported nonblocking webpack cache and outdated Browserslist warnings. Final git review is recorded in the completion report.

## Privacy and limitations

No paid provider calls were made during validation. No plaintext scene plan, dialogue, recording, token or provider error body is newly logged. Existing bounded aggregate diagnostics remain content-free. Tokens are encrypted and authenticated, use bounded compression/decompression, contain no API credential and expose no public lookup endpoint. Audio/components are retained only in the active browser scene. Request/error handling uses safe categories rather than raw provider diagnostics.

A slow provider can still cause buffering between lines. A failed component requires a retry; preparation is not guaranteed to be gapless. Audio already received survives an item retry, but not a browser reload or deliberate scene replacement. A two-hour token expiry requires restarting the scene. The component rate gate is process-local, not distributed; client serialization and per-request TTS bounds apply independently. Hosting disconnect propagation is platform-dependent, so the server deadline remains necessary.

## Short human acceptance after deployment

1. Reload the deployed app and play the same long Theatre scene that timed out, first Clarté then Naturel. In Network, verify the preparation response arrives before all audio exists, followed by small sequential `/api/theatre-clip` calls. No single request should approach five minutes.
2. Listen through to the final item; confirm source order, fixed voices/French, narrator, chorus synchronization and ambience. Compare the CP4.7 short-line/context examples.
3. Pause during preparation, resume, replay a ready réplique several times and practise an unprepared later réplique. Confirm no skipped items and correct bookmark return.
4. Briefly interrupt connectivity; retry the failed item after reconnection. Confirm completed audio is retained. Stop/replace the document or change style/speed while preparing; old audio must never attach.
5. In Universal Practice, select several units on a phone-width screen. Confirm the prominent text above playback controls matches exactly what is heard and used as the recording reference.

Stop after this repair. No Jouer un rôle, Scene Partner or SFX work.
