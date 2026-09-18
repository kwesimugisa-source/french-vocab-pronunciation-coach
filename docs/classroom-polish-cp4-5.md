# CP4.5 — Classroom beta polish and observability audit

## 1. Starting verification

Repository `C:/Users/Kwesi/Downloads/french-vocab-pronunciation-coach-complete`; main; clean tree. HEAD, origin/main and remote main all equalled `95f252052af5e04db24afb87030d919b68537c03` before edits. Remote verification required the approved network permission after the sandbox connection failed. Resumed work preserved the current tree; no reset, checkout, Undo or discarded checkpoint work.

## 2–13. UI audit and changes

The existing light cards, rounded corners and slate palette were retained. The audit found uniform Theatre paragraphs, equal-weight controls, an ambiguous recording label, excess width pressure from fixed minimum control widths, and result copy implying sound measurement. Existing component structure was sufficient; no framework was installed.

Theatre now uses a dedicated presentation branch in ArticleTextPanel while reusing the existing parser's item IDs/source lines. Speaker labels are bold, compact anchors above dialogue. No gender colors, voice IDs or character-specific palette are used. Directions remain visible, smaller, italic and inset. Chorus has a restrained slate border/background and the explicit label “Chœur · ensemble.” Active/paused position has a green border and “Point d’écoute”; practice has amber treatment and “Réplique en pratique.” Text labels and aria-current communicate state without relying only on color. No auto-scroll was introduced.

The visible words come from original canonical physical lines, not reconstructed TTS strings. Word buttons retain original canonical offsets, including labels, repeated words and multiline dialogue. This avoids changing vocabulary sentence context. Stage-direction colons are not mistaken for visual character labels. Parser, import normalization and speech text are unchanged. The reading measure is centered and bounded at 68ch; desktop side-panel layout remains familiar.

“Préparer et écouter” groups setup controls. The responsive grid uses one/two/four columns with flexible minimum widths, keeping speed and Clarté/Naturel separate. “Écouter le texte” replaces the former typo. The recording card now says “À vous de parler” and explicitly describes record → stop → analyse. Buttons say “Commencer l’enregistrement” and “Arrêter l’enregistrement”; lifecycle handlers are unchanged. Results retain the two-column desktop/stacked mobile concept. Weak-point copy now describes transcription differences and French priority labels, with no claim of acoustic sound measurement.

Ambience availability copy says it is available and pauses automatically during recording, rather than implying it is always currently suspended. This changes wording only. Green preparation remains an indeterminate status, and completion remains a count of logical items.

Native controls and keyboard buttons remain. Global focus-visible outlines were added. Non-word buttons, selects and summaries have a 44px minimum height. Word buttons remain inline to preserve prose density and text selection; there are no new hover-only actions. Breakable text and min-width-zero grid children reduce overflow. No independent screen-reader or physical-device certification is claimed.

## 3. Files changed

- `app/globals.css`: focus outlines, control heights and wrap safeguards.
- `app/page.tsx`: transcript state props, layout containment and enum-only style-selection event.
- `components/article-reader/ArticleTextPanel.tsx`: Theatre visual hierarchy and exact-offset word rendering.
- `components/article-reader/ReadingSetupBar.tsx`: flexible grid, section heading and clearer copy.
- `components/article-reader/ReadingControls.tsx`: microphone action labels and workflow copy.
- `components/article-reader/TheatreControls.tsx`: touch height and current-line presentation.
- `components/pronunciation/WeakPointsPanel.tsx`: truthful transcription wording and French priority labels.
- `components/BetaDiagnostics.tsx`: concise local aggregate summary and server-counter caveat.
- `lib/beta-events.ts`: validated performanceStyle metadata, theatre_style event and station category.
- `lib/reading-playback.ts`: metadata-only style context and station diagnostics category; no playback lifecycle changes.
- `lib/theatre-ambience.ts`: availability wording only.
- `tests/classroom-ui.test.cjs`: presentation, vocabulary offsets, nine-mode and privacy tests.
- `tests/render-classroom-preview.cjs`: developer-only static component fixture renderer.
- This report.

## 14–24. Observability audit

CP4.4 already implemented a strict metadata schema, bounded in-memory journal, preparation/playback events, SDK invocation counters, random sessions, duplicate guards, process-local rate limits and safe categories. It did not contain a collector, durable database or owner dashboard.

### What can be observed today

| Question | Existing mechanism and limit |
| --- | --- |
| Content modes, CEFR, origins | Browser operation/document events with validated categories; selected CEFR is observed when used, not every dropdown change. |
| Reading starts/completions/failures | Browser playback and preparation events; Theatre logical-item counts are recorded on lifecycle events. |
| Theatre style | Added enum-only selection events and style context on Theatre preparation/playback. Clarté default use is visible on reading events without requiring a selection event. |
| Reading speeds | Existing speed category attached to operation contexts, not continuously tracked slider/dropdown interaction. |
| Replay/practice and pronunciation | Existing theatre_replay/theatre_practice, pronunciation_attempt/retry and pronunciation operation events. |
| Virelangues | Existing listen/practice and reading/pronunciation events. |
| Ambience | Existing availability/failure categories; station now has a separate enum instead of other. Remaining unsupported detailed categories remain other. |
| Generation/direction/TTS/transcription/analysis calls | Server provider events by operation, started/completed/failed. Counts SDK invocations, not invisible retry HTTP traffic. |
| Safe errors | RATE_LIMITED, INVALID_INPUT, PROVIDER_FAILED, PLAYBACK_FAILED, ANALYSIS_UNAVAILABLE, CAPABILITY_UNAVAILABLE and MICROPHONE_UNAVAILABLE; operation adds context. Cancellation is a status, not a raw exception. |
| Approximate sessions | Each browser journal reports its current random session only. Server journal sessions identify process journals, not learners. No reliable class-wide session total exists. |

Provider counters capture supplied TTS character counts and nonnegative integer input/output token usage when present in the provider result. No prompts, arguments, output_text or recordings are copied. Missing usage is unknown, not zero-cost. There is no bill-grade cost calculation, price table or exact chorus-component counter. Chorus components are separate TTS calls, but current provider aggregates do not label them separately. Completed Theatre item counts are not equivalent to billable provider request counts. Hosting logs contain periodic cumulative snapshots; do not sum repeated snapshots as independent usage.

The existing `BetaDiagnostics` details panel renders only in development. Refresh is manual, avoiding a diagnostics-driven rendering loop; clear resets the journal. It now states the local session/event counts and explains that server counters are separate. Production exports no inspection route. `serverDiagnostics()` is a server-local function. Production request completion can emit a content-free aggregate to owner-controlled hosting logs, at most once per minute per process; this is not scheduled centralized collection.

### Privacy boundary

Every field is allowlisted. Categories are enums, identifiers must be opaque UUIDs and counts must be bounded nonnegative integers. Unknown fields cause the event to be discarded. Emit catches validation/storage errors without logging rejected payloads. New tests explicitly reject text, transcript, audio, word/vocabularyWord, prompt/rawPrompt, IP and email fields, plus free-form values masquerading as styles/environments. Existing tests retain failure-safe instrumentation and provider-result numeric-only extraction. No text, transcript, audio, clicked vocabulary, raw prompt, personal information or error message is added to telemetry.

Application API requests still necessarily send their functional text/audio to the existing provider paths; that is separate from diagnostics. Hosting-provider request logs and retention are governed by the hosting account and were not reconfigured in this checkpoint. No IP fingerprinting or learner identity was added.

### Session lifetime and storage

The journal generates a random UUID in memory; no localStorage, sessionStorage, cookie or persistent cross-device identifier is introduced. New page load/refresh/tab/browser runtime creates a new session. Explicit clear resets it. Thirty minutes after creation, the next session/inspection access lazily clears events and rotates the UUID. At most 1,000 events are retained. Idle memory can remain until that access or process disposal; there is no background deletion timer. Serverless workers have separate journals and lose them on restart/redeploy. Browser events are not sent to a central collector. The existing request header uses the random session for process-local duplicate/rate protection only, not authenticated identity.

### Durable storage and owner authorization decision

Audit of routes, dependencies, libraries and documentation found no durable analytics store, database adapter, protected owner route, account/authentication framework, owner authorization or implemented durable retention policy. Existing server-only provider credentials do not constitute dashboard authorization. Hosting-log access is outside this app and controlled by the hosting account. Consequently **no production dashboard was safe to add**. No new infrastructure, credentials or public /admin route was created.

Smallest future decision: choose one server-side aggregate sink with bounded retention (for example 30 days, explicitly approved before deployment), plus an existing trusted owner access boundary. A metadata-only ingest adapter should enforce the same runtime schema, body/rate limits, no content fields and bounded aggregation. Prefer the sink's existing authenticated owner console/export before building any dashboard. Define deletion, rotation, access policy and serverless-safe aggregation before enabling collection. Client sessions remain random/short-lived; no individual student profiles are needed. Consent/notice and hosting retention should be reviewed with the classroom owner as part of that separate decision. This architecture is documented, not implemented.

Malformed imports still produce their existing local error UI; there is no dedicated durable import-error event. Broad provider failures are separated by operation but do not carry raw model errors. Dramatic analysis fallback remains in scene direction metadata; browser ambience-unavailable events provide a coarse signal. These gaps are stated rather than represented as a complete production analytics system.

## 25–29. Performance and preserved engines

Source-line lookup uses a memoized map; parsing and row offsets are recomputed only when document text/type changes. Existing word buttons are reused. No polling, analytics transport, extra provider call, auto-scroll or UI dependency was added. Playback updates change highlight props only. No speech/casting/direction-generation, synchronization, import or pronunciation-engine implementation was changed.

The full regression covers CP4.4.2 Clarté/Naturel, all speeds, Clara/Marc identity, narrator, chorus, interjections, replay/practice, references, station ambience, preparation and stale requests. Conversation stays outside Theatre presentation/routing and retains labels and sequential audio. Virelangues keeps dedicated cards and controls. Ordinary modes and poetry retain their paragraph presentation. Smart Import source/mapping, conservative pagination and meaningful numbers remain unchanged.

## 30–34. Validation and visual evidence

New tests cover 47 train item rows, 12 stage directions/two chorus markers, active/practice labels, exact word-click offsets across modes, eight non-Theatre presentation branches, enum privacy rejection, recording labels and stage-direction colons. Existing tests were retained.

Final full suite: **576 passed, zero failed** (563 baseline + 13 new tests). Typecheck passed. Production build passed compile, lint/type validation, static generation and traces. Nonblocking webpack cache-snapshot and stale Browserslist-data warnings remain. First-load JavaScript is 119 kB versus 118 kB at CP4.4.2; no large dependency was added. Whitespace/diff and privacy reviews passed. The first full run passed 575 tests before the final stage-colon assertion was added.

Real browser checks used 390, 430, 768 and 1280px viewports. Both the live imported Theatre page and populated component fixtures reported no horizontal overflow. All visible non-word controls in the fixture measured at least 44px high. Screenshots were visually reviewed for ordinary reading, Theatre transcript, active/practice highlights, Theatre settings/ambience, green preparation, recording/results and mobile Virelangues. Mobile results stack; tablet controls use two columns; desktop controls fit without collisions. Temporary viewport overrides were reset.

Live UI import was exercised without provider calls. Active/playback and populated results were rendered from the real components with explicit local fixture props; these screenshots are presentation evidence, not a claim of live TTS/microphone acceptance. Existing functional tests verify those lifecycles separately. The preview HTML was removed before build/release; only its developer renderer remains under tests. No production preview route is shipped.

Screenshots are local artifacts: cp45-desktop-theatre.png, cp45-mobile-theatre.png and cp45-mobile-results.png in the task visualization directory. Browser responsive testing is not a substitute for iOS/Android microphone permissions or physical-device audio acceptance.

## 35–38. Release and limitations

Final response records commit hash, push outcome, HEAD/origin/main/remote equality and clean status after validation. No self-referential commit hash is embedded here. Deployment revision is not inferred solely from a successful push.

Known limits: diagnostics remain ephemeral and uncollected; no production owner dashboard or reliable class-wide cost/session total exists. Long ambiguous PDF numbers retain the previous conservative behavior. No speech changes were made to address hypothetical audio issues. Physical classroom devices, screen readers and deployed microphone behavior require the human check below.

## 39. Classroom acceptance after deployment

1. Confirm the deployed commit and main-page hierarchy. Generate a text and import the real play; inspect original source/mapping and meaningful numbers.
2. Read the transcript at desktop and 390–430px widths. Check speaker anchors, visible directions, chorus and intentional reading width. Click repeated vocabulary words and use keyboard focus.
3. Play Theatre in Clarté and Naturel with independent speeds. Check active marker, replay, practice marker, chorus and station Off/Low/Medium. Confirm immediate green preparation and logical-item progress.
4. Record, stop and analyse. Confirm clear microphone actions, mobile result stacking and honest transcript-only feedback.
5. Check Conversation labels/no Theatre controls and Virelangues target, sentence listening, recording, analysis and retry.
6. In local development only, refresh diagnostics: inspect style/speed/mode/status enums and confirm no learner content. Use owner hosting logs for server counters; do not treat snapshots as durable classroom totals.

Stop after CP4.5. No Scene Partner, SFX library, accounts, payments, subscriptions or unrelated features were started.
