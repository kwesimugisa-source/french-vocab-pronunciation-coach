# CP4.6 — Universal Practice

## Starting state / audit

Started on main at b2c6ca59a97edc823fd52f1ddb299f3ce3167524 with matching origin/main and a clean working tree. Baseline: 597 tests. No earlier CP4.6 work was discarded.

Theatre practice uses logical dialogue items, an audio bookmark and cached clip replay in TheatrePlaybackController. The page passes that target to the shared PronunciationSession. Virelangues uses ExercisePracticeSession to choose a canonical exercise and coordinate the same recording and reading controllers. Ordinary listening uses one audio blob. Conversation resolves stable speaker voices from the complete dialogue and sequences its turns. PronunciationSession already provides recording epochs, microphone cleanup, abortable analysis and exact reference capture. These are reused, not duplicated.

## Shared architecture

- PracticeUnit holds stable range-based ID, index, exact text and canonical start/end offsets; Conversation uses its existing turn ID and visible speaker label.
- practiceUnits is content-aware and consumes the active document type. It never redetects imported genre or rewrites the document.
- PracticeSession owns the selected document/unit and coordinates existing ReadingPlaybackSession and PronunciationSession. It has no scoring engine, microphone implementation or independent audio player.
- New UI uses PracticeControls plus existing ArticleTextPanel, ReadingControls, PronunciationSummary and WeakPointsPanel.
- Theatre and Virelangues retain their accepted specialized controllers and UI. There is no generalization of their performance logic.
- Conversation practice adds an optional conversationTurnId on the existing reading route. The server validates the complete dialogue and resolves the selected turn's voice from the full cast, then synthesizes only its spoken text. Shared conversation delivery instructions remain identical. Full-dialogue requests keep their existing JSON response and sequencing.

## Supported content and segmentation

| Content | Practice unit |
| --- | --- |
| Actualités, Opinion, Créatif, Académique, Vie quotidienne | Conservative sentence ranges within paragraphs |
| Ordinary imported / unknown genre | Same prose adapter; authoritative imported type is preserved |
| Poésie | Each nonempty canonical line; stanza gaps and all punctuation remain visible |
| Conversation | Existing spoken dialogue turn; speaker label remains visible outside the selected spoken range |
| Théâtre | Existing logical réplique workflow, unchanged; no stage/chorus conversion to generic practice |
| Virelangues | Existing sound-targeted exercises and cards, unchanged |

Prose recognizes terminal punctuation and closing quotations while avoiding splits at decimals, common French abbreviations and initials. Ambiguous boundaries stay together rather than creating fragments. Whitespace outside a spoken range remains in the display. All unit text equals canonicalText.slice(start, end).

## UX and lifecycle

Lecture complète / Pratique is available for ordinary modes, poetry and Conversation. Practice adds numbered keyboard/touch selectors inside the readable text, a clear amber selection, previous/next, listen/relisten and stop. Word-analysis buttons retain their canonical offsets. Recording controls move beside practice controls; existing feedback components remain below the reading area. Retry uses the same recording engine.

Mode changes cancel incompatible audio/recording/analysis. Re-entering Practice starts at the first unit. Selecting another unit cancels pending audio, recorder callbacks, microphone permission and analysis through existing request/epoch guards. Import, generation success and type reinterpretation clear practice state; a new document/revision creates new units. Stale responses cannot replace the current target or play old audio. Selecting another unit discards its predecessor's unfinished recording/results intentionally.

Listening retains the existing speed setting. Document ID, revision, type, language and level remain on the active document. Ordinary practice sends exact selected text plus document identity to the same reading route. Conversation sends full canonical dialogue plus turn ID to preserve casting. Every provider request retains CP4.5.1 French instructions. Changing speed changes the next synthesis, not the unit/reference.

PronunciationSession receives the exact unit text and document/revision/item metadata; Conversation speaker labels are not part of the reference. Transcript comparison limitations remain unchanged. No acoustic scoring or phonetic rewriting was introduced.

## Validation

- New focused tests: 33/33 passed.
- Full suite: 630/630 passed, zero failures/skips (597 baseline + 33).
- Existing Theatre, Virelangues, Conversation, pronunciation, Smart Import/document identity and CP4.5.1 tests all included and passed without weakening existing tests.
- Typecheck passed.
- Production build passed. Non-blocking warnings: stale Browserslist data and webpack dependency-cache snapshots.
- git diff --check passed.
- Privacy review: no new logs or analytics events, no learner text/transcript/audio logging, no credential changes. New Conversation provider failure uses a generic error.
- All provider tests use mocks. No paid synthesis, live microphone capture or actual acoustic evaluation was performed.

Focused coverage includes segmentation/ranges; abbreviations, decimals and quotations; poetry stanzas; dialogue-label exclusion/casting; every unit's recording reference; four speeds/French authority at the provider boundary; late audio and late analysis JSON; active recorder cleanup and delayed permission; document revisions and mode transitions; retry; vocabulary offsets; UI selection semantics; and content-free diagnostics.

## Responsive/UI verification

Live app checks passed for Lecture complète ↔ Pratique, previous/next, keyboard selection, selected-unit marking, import replacement and poetry structure. Viewport checks at 390, 430, 768 and 1280 px showed no horizontal overflow. Measured document widths were 375, 415, 753 and 1265 px respectively (scrollbar allowance). New practice buttons were 44 px high.

The same real components were also rendered with simulated recorded/recording/feedback states using tests/render-practice-preview.cjs. At all four widths, controls wrapped, stop remained available during recording, retry/analyze fit, selected text stayed visible and feedback remained readable. This was a visual fixture, not a claim of real microphone/provider acceptance. Temporary public/cp46-preview.html was removed before release. The preview generator is development-only and does not create a production route.

## Limitations

- Conservative segmentation may keep uncommon abbreviations or ambiguous adjacent sentences together. It is not a full linguistic parser.
- A very long indivisible sentence/poem line/turn remains subject to the existing 4096-character TTS limit; no text is silently truncated.
- Each listen/relisten synthesizes anew at the selected speed. No durable audio cache or saved practice progress was added.
- French anchoring inherits CP4.5.1's intentional code-switching limitation and provider pronunciation uncertainty.
- Browser/device microphone permissions and actual French audio quality still require human production acceptance.
- Conversation must follow the existing structured-dialogue contract; malformed input reports an error.
- Unknown imported genre uses prose segmentation until the learner chooses the intended type.

## Exact human production acceptance

1. Ordinary generated text: choose Pratique, select sentence 2, listen twice, record, stop, analyze and retry. Confirm only that sentence is spoken/analyzed, punctuation is preserved and feedback has the transcript-only limitation.
2. Change selection while audio prepares, while analysis runs, and while microphone permission is pending. Confirm no old audio, reference or result attaches to the new unit. Try both previous/next and inline keyboard/touch selectors.
3. Switch Lecture complète → Pratique → Lecture complète during preparation/recording. Confirm incompatible work stops and full playback still uses the entire unchanged document.
4. Repeat selected-unit listening at Très lent, Lent, Normal and Rapide. Use a French passage with an ambiguous name/word; confirm French pronunciation and unchanged reference.
5. Import a new text while Practice is active, then reinterpret its genre. Confirm old selection/results disappear and the new document/revision supplies all units.
6. Import poetry; if genre is uncertain select Poésie. Confirm original line/stanza breaks remain, a line with multiple sentences is one practice unit, and exact wording is recorded/analyzed.
7. Conversation: select successive speakers and a later repeated speaker. Confirm visible labels are never spoken/analyzed, and each turn uses the same voice as full Conversation listening.
8. Theatre: smoke-test full cast, narrator, chorus synchronization, ambience, Clarté/Naturel, speed, pause/resume, replay, réplique recording and return to the following line.
9. Virelangues: verify target/custom sound, exercise cards, listen/relisten, record/analyze/retry, exact reference and French pronunciation.
10. At 390, 430, 768 and 1280 px, verify controls/selected text/results fit without horizontal scrolling, keyboard selection works, and stop recording remains reachable.

Stop after Universal Practice. No Director Engine, Jouer un rôle, automatic turn-taking, new sound library or infrastructure work.
