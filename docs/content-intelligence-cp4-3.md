# CP4.3 — Content intelligence, Smart Import and nine-mode integrity

## Starting state and scope

Verified repository: `C:\Users\Kwesi\Downloads\french-vocab-pronunciation-coach-complete`.
Branch `main`; HEAD and local `origin/main` both `f100b25bc950e71361fbf45c9d9dce1ba6122b97`; working tree clean before edits.

This checkpoint adds document identity, conservative import preparation, scoped generation contracts, lifecycle protection and bounded transcript feedback. It does not implement CP4.4, analytics, Scene Partner, progress percentages, an acoustic engine or an ambience redesign.

## Active document and boundaries

`ContentDocument` extends the display article with:

- `documentId`, `revision`, `origin` (`generated` or `imported`).
- `originalText` and canonical `text`.
- `contentType`: the nine supported modes or `unknown`.
- `typeSource`: `generated`, `detected`, `learner-override`, or `unknown`.
- Detection confidence, candidate genres and evidence.
- Normalization actions, warnings and a canonical-line-to-original-lines map.
- Stored passage `level`, separate from the next-generation selector. Imports leave it undefined.

Generated responses are complete documents with a server-created UUID, requested type and requested CEFR. Model-supplied provenance and level cannot override these. Both the API and page validate document shape before rendering. Validators check type/provenance values, identity, level, line-map bounds/order and accounting for every original line. Playback and vocabulary requests carry document ID, revision and effective type. Their existing/new request guards prevent obsolete responses from updating a replacement document.

Changing the generation type, CEFR or speed selector leaves the displayed document unchanged. Successful replacement and explicit imported-text reinterpretation stop playback, reset pronunciation and cancel vocabulary work. Reinterpretation rebuilds from the original source under the same document ID with a higher revision. Failed generation preserves the current document. No imported text or recording is persisted.

## Nine generation contracts and detection

| Mode | Generation contract | Conservative import evidence |
| --- | --- | --- |
| News | Concise informational headline/body; educational fiction, no fabricated authentic reporting | Attribution/reporting signals; explicit news heading plus evidence can confirm |
| Opinion | Thesis, reasons, examples and conclusion | Viewpoint/argument signals; explicit opinion heading plus evidence can confirm |
| Creative | Literary narrative with optional embedded dialogue | Narrative signals; explicit story heading plus evidence can confirm |
| Conversation | Natural labelled turn-taking | Entirely labelled turns with distinct speakers; labels alone do not imply theatre |
| Academic | Formal explanation, headings/definitions; no invented authentic citations | Expository signals; explicit course/academic heading plus evidence can confirm |
| Everyday life | Practical familiar language and tasks | Practical-document signals; explicit heading plus instruction evidence can confirm |
| Poetry | Three stanzas, three to four lines each, deliberate line breaks | Explicit poem label with verse; ambiguous short lines remain candidates |
| Theatre | Two to four stable characters, varied drama, `Name: dialogue`, parenthesized directions, optional `LE CHŒUR:` | Speaker structure plus act/scene, chorus or stage evidence |
| Tongue twisters | Five to ten separated exercises, phonetic variety, repetitions and line breaks | Explicit phonetic exercise labels or selected well-known tongue-twister patterns |

Only the selected contract is included in the generation prompt. Theatre instructions no longer appear in unrelated prompts. Runtime shape checks do not certify literary quality or every model-produced formatting instruction; human acceptance remains necessary.

Semantic genre can be ambiguous. Weak evidence yields `unknown` with candidates, not a fabricated definitive classification. An explicit `unknown` document always receives generic playback. Identity-free legacy requests alone may fall back to deterministic detection. Known conversation cannot enter theatre analysis, casting, ambience or controls even if its text contains speaker labels.

## Smart Import

The pipeline is raw text → deterministic structural inspection → confidence/candidates → conservative normalization → validated document. No model classification call is added. The learner can import without selecting a genre, inspect the retained original and adjustments, and explicitly reinterpret the result afterward.

### Theatre structure

Before the existing parser creates IDs, confirmed structural headings use the existing shared speaker identity utility. Ordinary bare uppercase character headings, curly/straight apostrophes, NBSP/narrow spaces, tabs, ASCII/fullwidth colons and chorus aliases are supported. Dialogue following a pending heading is protected from being mistaken for another heading solely because it is uppercase. Parenthesized stage directions, dialogue words, chorus grouping and order remain intact. Canonical physical line numbers feed existing stable IDs; `sourceMap` relates those lines back to the original import.

The raw theatre parser and controller were not rewritten. Stage-direction/narrator behavior remains the existing behavior.

### Pagination

An isolated `Page 2`, `PAGE 2`, `- 2 -` or `— 2 —` between blank boundaries may be removed from canonical text. Bare numbers need sequential markers and a completed preceding section. A preceding speaker-only heading or question protects a possible numeric answer. Uncertain isolated numbers are preserved with a warning.

`PARTIE 2`, `ACTE II`, `SCÈNE 2`, `CHAPITRE 2`, numbered list/exercise items, labelled numeric dialogue, numbers in prose, years and quantities are preserved. Every removal records its original line; original text remains available. This is deliberately not a general-purpose PDF layout engine: unrecognized headers/footers and insufficiently supported page markers remain intact.

### Mechanical wraps and length

Within a known theatre dialogue turn, a limited set of compound prefixes (`non-`, `demi-`, `anti-`, `ex-`) followed immediately by a lowercase continuation can be joined without removing the hyphen. For example `non-\nemploi` becomes `non-emploi`; both original lines are mapped and the action recorded. Blank lines, stage boundaries and unrelated hyphenated verse are not globally joined. Poetry and exercise layout stays intact.

The 50-word minimum is removed. Nontrivial short material with at least three letters is accepted. Imports remain bounded to 2,500 words and 60,000 UTF-16 code units; empty/punctuation-only input is rejected.

## Long audio strategy

Ordinary and poetry playback retain the existing single-blob/one-Audio lifecycle. A new multi-chunk controller was not justified within this preservation-sensitive checkpoint. The server rejects input above 4,096 UTF-16 code units with HTTP 413 and an actionable French message displayed by the client. It never truncates or sends an oversized ordinary request. This is a conservative character bound matching the installed OpenAI SDK's documented 4,096-character speech-input maximum (`node_modules/openai/src/resources/audio/speech.ts`). The imported document remains available for reading and word analysis.

Theatre retains full-scene generation, ordered logical clips, bounded workers and manifests. Each individual speech input is checked before its provider call. An oversized theatre item uses the existing identified failure path and cannot produce a partial-success scene. Stop/replacement guards continue to prevent stale audio. The 60,000-unit document boundary is not a clip-count cap.

## Vocabulary, CEFR and pronunciation

Vocabulary now has an abortable request owner. Rapid clicks, late JSON resolution, errors and document replacement cannot restore stale results. Display tokens carry canonical character offsets; sentence context comes from the clicked occurrence, including repeated words. Requests use the passage's stored type/CEFR, with `unknown` for imported CEFR. Local vocabulary fallback remains available and uses the clicked sentence.

Recording, transcription, the same analysis endpoint, weak-word practice, retry, réplique references and capture protections remain. Starting/stopping model listening on an unchanged passage no longer discards a completed recording. Replacement/reinterpretation still invalidates it. Recording targets retain document identity alongside any theatre item/session identity.

The pronunciation route explicitly limits its prompt and schema to transcript/reference correspondence. Acoustic fluency/intonation fields are null. The response bounds the numeric correspondence score, retains the actual transcript, restricts suggested words to reference words, and replaces unsupported model acoustic claims with cautious transcription wording. The UI displays one estimated correspondence score and states that recognition errors are possible and sounds, fluency and intonation are not measured. This is not an acoustic assessment.

## Theatre UI and ambience

Known theatre documents show a preparation panel before Play. Pause/resume/replay/practice controls require a successfully initialized theatre session. Conversation and other modes do not show these controls. Ordinary reading controls remain available.

Ambience providers, levels, capture muting, analysis and playback behavior remain unchanged. Document ID/revision, original/canonical mapping and structural evidence provide a future cache/context boundary. Changing ambience volume does not invoke content detection. No play-specific setting is hardcoded.

## Exact files

Added:

- `lib/content-document.ts` — document types, limits, labels and validators.
- `lib/generation-contracts.ts` — scoped nine-mode prompts.
- `lib/smart-import.ts` — conservative detection, normalization and source mapping.
- `lib/vocabulary-session.ts` — occurrence context, request cancellation and fallback.
- `tests/content-document.test.cjs` — document/import/prompt/context tests.
- `tests/content-page.test.cjs` — actual Page handler wiring with controlled hooks/services.
- `tests/content-routes.test.cjs` — mocked API/playback, identity, limits and trust tests.
- `docs/content-intelligence-cp4-3.md` — this checkpoint record.

Modified:

- `app/page.tsx` — document ownership, lifecycle, import inspection/override, theatre visibility and bounded score UI.
- `app/api/generate-article/route.ts` — validated generated documents and scoped structured output.
- `app/api/read-passage/route.ts` — explicit mode routing and input limits.
- `app/api/analyze-word/route.ts` — identity/context validation and unknown CEFR handling.
- `app/api/analyze-pronunciation/route.ts` — transcript-only evidence contract and bounded output.
- `components/article-reader/ArticleTextPanel.tsx` — exact clicked-token offsets.
- `components/pronunciation/PronunciationSummary.tsx` — evidence-appropriate wording.
- `lib/reading-playback.ts` — identity propagation, response-mode validation and visible size errors.
- `lib/pronunciation-session.ts` — document identity on captured targets; nullable unmeasured scores.
- `tests/load-typescript.cjs` — in-memory TSX/alias loading for component wiring tests.
- `tests/read-passage.test.cjs` — explicit known-type fixtures and updated validation contract.
- `tests/dramatic-route.test.cjs` — explicit theatre/ordinary/poetry route fixtures.
- `tests/pronunciation-session.test.cjs` — bounded transcript-feedback assertions.

## Verification

- Full suite: **352 passed, 0 failed**.
- Typecheck: **passed** (`npm run typecheck`).
- Production build: **passed** (`npm run build`), all four APIs and the page compiled.
- `git diff --check`: passed. Git may report LF/CRLF conversion notices.
- Non-blocking build warnings: stale Browserslist data and webpack cache dependency snapshots. No dependency/config migration was performed.
- No paid/live OpenAI calls were used in validation.

The prior suite's theatre integrity, casting, dramatic direction, chorus synchronization, ambience, playback and microphone protections remain passing. Fixtures formerly depending on colon/stanza guessing now specify their known document mode. Two legacy unknown-speed fallback cases were superseded by explicit invalid-speed rejection tests. Legacy acoustic-score assertions were intentionally replaced with transcript-only assertions.

New tests cover all nine modes, malformed documents, import confidence, exact heading variants, original mapping, protected numbers, safe wraps, short texts, word races, repeated-word context, import/generation/reinterpretation lifecycle, recording retention, response-mode mismatch, long-input errors and cancellation. Scripts around 600 and 1,500 words run three times each through Smart Import → mocked route → controller, checking every returned and completed ID in order. Existing randomized completion and chorus/audio tests also run.

## Remaining limitations and human acceptance

Deterministic genre detection deliberately abstains on ambiguous prose or verse. Unusual scripts and PDF artifacts may need explicit reinterpretation or manual source preparation. The importer does not attempt arbitrary header/footer removal, lexical dehyphenation or general PDF reconstruction. Ordinary audio above 4,096 units requires a shorter imported excerpt; automatic multi-chunk ordinary playback is deferred.

Tests use mocked provider/browser audio. The page tests execute real handlers with controlled hooks/services; they are not a real-browser or acoustic test. Human acceptance should generate one passage per mode, verify formatting/level suitability, import representative real scripts and poems, exercise browser microphone permissions and listen to chorus transitions. Live model quality, production deployment/browser caching and real sound quality were not independently verified here.

CP4.4 work remains separate: ambience reliability/audibility, any analytics/dashboard, Scene Partner and preparation UI. No CP4.4 implementation is included.
