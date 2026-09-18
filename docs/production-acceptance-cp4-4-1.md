# CP4.4.1 completion report

## 1. Starting state

Repository: `C:/Users/Kwesi/Downloads/french-vocab-pronunciation-coach-complete`. Before edits, branch `main`, HEAD, origin/main and remote main all equalled `ff0c6e4fb2ecb26ca6b673d803f9fb5b84b6cd6d`; working tree was clean.

## 2–3. Casting root cause and historical comparison

CP4.3.2 deliberately required affirmative script descriptions and ignored conventional personal names. Unspecified speakers consumed the first unused inventory voices. Replaying the original implementation against the exact train fixture produced CLARA = alloy and MARC = ash, both unspecified. The application had no positive female-pool selection for Clara. Perceived vocal presentation requires human listening; these are application categories, not provider gender declarations.

At `fbcd47b`, encounter-order rotation through onyx/nova/fable/alloy produced apparent variety without grounded character identity. Later sorted inventory rotation likewise did not establish identity. This checkpoint replaces that weakness with evidence-based casting, without restoring old clip limits.

## 4. Files changed

Production files:

- `app/api/generate-article/route.ts`: structured Theatre generation and cast validation.
- `app/api/read-passage/route.ts`: validates and forwards Theatre cast metadata.
- `lib/content-document.ts`: optional validated generated-Theatre metadata.
- `lib/generation-contracts.ts`: Theatre structured cast instructions.
- `lib/reading-playback.ts`: forwards document casting metadata.
- `lib/theatre-characters.ts`: schema and complete cast validator (new).
- `lib/name-conventions.ts`: centralized French casting data (new).
- `lib/voice-casting.ts`: bracket descriptors, optional varied fallback and explicit exclusions.
- `lib/theatre-casting.ts`: Theatre evidence hierarchy and stable reservations.
- `lib/theatre-generation.ts`: validated metadata into casting.
- `lib/theatre-structure.ts`: shared standalone direction predicate (new).
- `lib/theatre.ts`: structural bracket direction ownership.
- `lib/smart-import.ts`: shared directions and contextual pagination normalization.
- `lib/semantic-audio.ts`: typed semantic registry and provider abstraction (new).
- `lib/procedural-ambience.ts`: existing procedural beds plus station (new).
- `lib/theatre-ambience.ts`: classification-to-registry adapter.
- `lib/ambience-playback.ts`: registry gain/loop and cancellable async resolution.

Tests/fixtures:

- New `tests/acceptance-cp4-4-1.test.cjs`, `tests/semantic-audio.test.cjs`, `tests/last-train-fixture.cjs`, `tests/pagination-theatre-fixture.cjs`.
- Updated `tests/voice-conversation.test.cjs`, `tests/content-routes.test.cjs`, `tests/scene-ambience.test.cjs`, `tests/chorus-import.test.cjs`, `tests/theatre.test.cjs`.
- This report: `docs/production-acceptance-cp4-4-1.md`.

## 5–8. Casting behavior

Priority: explicit script information; validated generated cast metadata; strong French conventional names; narrow unambiguous named-subject context; deterministic varied fallback. Conflicting explicit descriptions abstain rather than falling back to a contradictory name. Explicit negative descriptions exclude the contradicted voice pool without inventing a binary identity.

The editorial data contains 108 entries with normalized name, presentation, French locale and strong/ambiguous confidence. Normalization handles accents, case, surrounding whitespace and punctuation; visible names are preserved. Extend the centralized data and tests. App perceptual pools remain centralized in voice-casting.ts and can be revised after listening.

New Theatre generation returns title/text/characters. Each character has speakerId, displayName and voicePresentation (female-presenting, male-presenting, unspecified). Validation requires complete, unique parsed character coverage and matching canonical identities; excludes narrator/chorus; caps generated metadata at 32 characters. Metadata cannot rewrite text. It travels through ContentDocument and the reading request to TTS casting. Legacy documents without metadata continue to work; malformed generated metadata fails safely.

Unknown names remain unspecified. Fallback alternates available presentation pools while consuming unused voices before reuse. Ambiguous context recognition is intentionally narrow, not general-purpose coreference or an additional model call. Narrator and chorus voices remain reserved. Sorted identities and deterministic evidence keep voices stable across speeds and unchanged-document interactions. Conversation retains its existing structured behavior and does not adopt Theatre name inference.

## 9–11. Narrator repair and exact train fixture

The parser recognized whole-line parentheses only. A square-bracket direction after dialogue entered continuation handling and inherited that character. Smart Import also recognized only parentheses. Prior tests used parentheses and the generation prompt requested parentheses, so they missed the real production shape.

The original train fixture yielded 36 logical items, only one stage item, with 11 bracket directions swallowed into dialogue. Shared structural recognition now accepts complete standalone square brackets and parentheses before continuation logic. Inline parenthetical dialogue is untouched. Directions are narrator-owned at parsing, not patched at audio playback.

The exact user-supplied Le Dernier Train scene now produces **47 logical items: 12 narrator directions, two chorus items and 33 character turns**. Imported and generated real API handlers with mocked providers feed the playback controller at all four speeds. Tests verify unchanged words/order, distinct Clara/Marc pools, dedicated narrator, synchronized three-component chorus, 47 completions, pause/resume/replay/practice stability, ambience reuse and resource release. No paid TTS is required for these structural tests.

## 12–15. Station ambience and semantic audio

Station classification already worked; its provider was missing. The new local deterministic 8-second PCM bed combines filtered ventilation texture and quiet mechanical rumble, without speech, announcements or discrete train effects. It requires no recordings, licences, downloads or credentials. Signal tests verify deterministic nonzero energy and no clipping. Actual audibility and subjective suitability remain human acceptance tasks.

Existing station classification maps to `environment.train_station`. Registry entries contain typed ID, category, provider availability/resolver, default gain, loop behavior, label, aliases and tags. Existing environment selections map deterministically to registry IDs. Untrusted filenames, paths and URLs do not resolve. Provider functions are trusted application code.

Ambience is looping background audio; SFX is a separate nonlooping category; narration remains spoken stage text. Eight future SFX IDs are defined, with no production providers. A test-only provider proves the extension boundary. Adding a future ambient asset/provider and registry data does not change parsing. Future event-triggered SFX scheduling still needs its own tested implementation.

Resolvers support local procedural, bundled and approved-remote implementations, synchronously or asynchronously. Async completion is guarded against stale document/Off/replacement state. There is no remote storage implementation. Off/Low/Medium remain gains 0/0.08/0.16; Low-to-Medium changes gain only. Classification reuse, office ambience and microphone muting remain covered.

## 16–19. Pagination repair and provenance

The previous normalizer required blank physical lines on both sides of a marker and punctuation on the preceding line. PDF extraction without blank boundaries and bracket-closing directions defeated those conditions. The playback parser intentionally preserved remaining isolated numbers; deletion at playback would lose real content.

The Theatre normalizer now examines neighboring nonempty logical boundaries. Bare markers need sequential corroboration, a completed preceding unit and a following speaker/direction/scene boundary; blank physical separators are no longer required. Explicit Page/dashed markers remain supported. Question/awaiting-speaker answers and numbered-list contexts are protected. This combines several signals without requiring every possible PDF signal.

The realistic second fixture removes markers 12/13/14 and retains two choruses, four bracket directions, a spoken answer 2, ACTE/SCENE numbering, year, time, quantity, route, address, phone, price and list items. A lone ambiguous bare number remains, with a warning. The exact complete real imported PDF was not supplied here; its remaining uncertain numbers must be checked in human acceptance rather than promised deleted indiscriminately.

originalText retains all removed markers. Each deletion records its original line in normalization actions; surviving canonical sourceMap entries retain their original lines. Tests account for every source line through mapping or recorded deletion. Removed markers never become TTS clips.

## 20–23. Preserved regressions

The entire suite covers chorus aliases/import routing and native synchronization, one logical item per chorus, complete ordered long scenes, failures and stale callbacks. Conversation remains sequential with visible/unspoken labels, stable voices, label-free pronunciation targets and no Theatre analysis/controller/ambience. Virelangues retains dedicated targets, sentence listening/replay, recording, analysis and retry routing.

CP4.4 preparation feedback, request ownership/cancellation, measured progress, explicit ambience statuses, decision reuse, safe errors, provider counters, duplicate protection, content-free telemetry validation and process-local rate limits all remain passing. Ordinary playback, word analysis and pronunciation ownership tests remain passing. No acoustic scoring or transcript/audio analytics persistence was introduced.

Existing beta diagnostics and server limits remain bounded/process-local and are not durable or distributed across serverless workers/redeployments. There is no durable private production dashboard. Durable analytics would require a separately chosen authenticated persistent sink and retention policy; none was added.

## 24–27. Validation

60 new tests were added: casting/metadata/structural lifecycle/pagination and semantic registry/provider behavior. Existing assertions were updated for the deliberate Theatre name-policy and varied-fallback changes; no tests were removed. Conversation's no-name-inference assertions remain.

- Focused parser/casting/chorus/registry/acceptance run: 85 passed.
- Entire regression suite: **541 passed, zero failures** (baseline 481).
- Typecheck: passed (`tsc --noEmit --incremental false`).
- Production build: passed (`next build`), including compile, lint/type validation, static generation and traces. Nonblocking webpack cache snapshot and stale Browserslist-data warnings were emitted.
- Diff review: changes limited to this checkpoint; whitespace check passed.

## 28–30. Release record

The final response records the resulting commit hash, push outcome, HEAD/origin/main/remote equality and clean-tree verification. No release success is inferred from local build success. The commit containing this report is the CP4.4.1 implementation; no self-referential hash is embedded here.

## 31. Human production acceptance

1. Confirm the deployment uses the reported CP4.4.1 commit. Import the exact train fixture, then also generate Theatre. Check immediate green preparation feedback. Listen through the train: Clara female-presenting, Marc male-presenting, stable distinct narrator for all 12 directions, both choruses synchronized. Pause/resume, replay and practice; resume at the correct following item.
2. Confirm gare is detected and available. Compare Off, Low and Medium: silence, subtle audible bed, stronger bed behind speech. Change speed and replay; no unnecessary reclassification. Check on classroom speakers and headphones.
3. Import the real play. Confirm Theatre and LE CHOEUR routing, narrator directions, removal of high-confidence PDF markers and preservation of meaningful numbers. Review uncertain-number warnings and original source.
4. Generate/import Conversation: labels visible but not spoken, distinct stable sequential voices, correct pronunciation targets.
5. Select Virelangues target, listen/replay one sentence, record, analyze and retry. Confirm preparation feedback and no Theatre controls/routing.

These listening/deployment checks have not been claimed as completed by automated mocked-provider tests.

## 32. Deferred work

Not implemented: large ambience/SFX catalogue, AI semantic stage-event interpretation, SFX scheduling/replacement of narration, Narration/Performance/Enhanced mode selection, object storage/CDN, sound packs, Scene Partner, real-time acting, durable analytics, accounts, subscriptions, payments, acoustic pronunciation engine or UI redesign.

Future direction: stage semantics -> validated canonical ID -> trusted registry/provider -> explicitly designed event playback. Parsing retains narrator ownership until a future mode deliberately changes presentation. Current directions always remain narrated.
