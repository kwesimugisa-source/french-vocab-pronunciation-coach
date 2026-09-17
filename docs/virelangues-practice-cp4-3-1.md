# CP4.3.1 — Virelangues practice and routing

## Starting state

Verified before editing: repository `C:\Users\Kwesi\Downloads\french-vocab-pronunciation-coach-complete`, branch `main`, HEAD and `origin/main` both `616cc89aefe4184c34a6b6463b19056820298bc4`, working tree clean.

## Routing investigation: confirmed findings and limits

At the starting commit, a known `tongue-twisters` document was already authoritative: the page passed its identity, `/api/read-passage` bypassed detection for a supplied type, and the playback client rejected a theatre JSON response for a non-theatre identity. A known Virelangues-to-Theatre transition could not be reproduced in that source. Selecting the NEXT generation type also intentionally does not reinterpret an existing document.

The learner supplied a real generated sample with eight phonetic groups and 24 sentences. Three prose sentences contain colons before quotations, including `Chloé chuchote : « Ce choix change tout. »`. Running that exact sample through the actual `detectReadingMode` function from commit `f100b25` returns `theatre`: the pre-CP4.3 rule classified any two colon-bearing lines as theatre. Current explicit and identity-free fallback routes both return `standard` (ordinary audio). This confirms the old classifier's textual trigger, but does not establish which build the production browser/server was running. No production URL or deployed bundle was supplied, so stale deployment/browser state remains unverified rather than asserted as fact.

A separate reproducible fallback defect did remain in CP4.3: detection checked apparent theatre structure before explicit exercise structure. An identity-free exercise sheet with sound labels such as `R:` and `TR:` plus a parenthesized instruction could therefore become theatre. Explicit phonetic exercise structure now takes precedence when there is no act/scene or chorus evidence. Known types still bypass all heuristics. The explicit routing rule now has a single testable owner, `lib/content-routing.ts`; explicit `unknown` retains CP4.3's generic behavior, while identity-free requests can still detect theatre.

No narrow exception for a particular sentence or play was introduced. Tests include misleading colon labels, short-line layouts, quoted prose and the complete supplied sample.

## Document and generation structure

`ContentDocument` now optionally includes `tongueTwisters` for that mode:

```text
tongueTwisters: {
  target: { id, label, phonemes },
  exercises: [{ id, index, text, start, end, target }],
  warnings: string[]
}
```

Exercise IDs are derived from their canonical source offset (`exercise-<start>`), and scoped by document ID/revision. Validators enforce exact text slices, unique IDs, ordered nonoverlapping offsets and valid target metadata. No temporary playback state is stored in the document. Origin, original text, canonical text, CEFR and CP4.3 source mapping are retained.

The generation API requests strict JSON `{ title: string, exercises: string[] }` with 5–10 distinct sentences. Runtime validation rejects malformed lists, duplicate entries, heading/instruction entries, multiline text, colon-style speaker entries, nonletter-only text and oversized sentences. Canonical text is the exact ordered strings joined with blank lines. IDs, offsets and target metadata are supplied by application code; they are not invented by the model. The other eight modes retain their existing response contracts.

The prompt requests meaningful French, deliberate sound repetition, CEFR suitability where practical and increasing challenge, without fake characters or stage directions. The selected target reaches the API and prompt. Changing the NEXT target does not change the active document or its exercises. Model phonetic suitability is still a human acceptance item; it is not acoustically certified by this implementation.

## Sound choices and custom input

The selector appears for Virelangues generation:

- Mixte
- R
- U / OU
- É / È
- AN / EN
- ON
- IN / AIN / EIN
- CH / J
- S / Z
- Groupes de consonnes
- Liaisons courantes
- Autre son…

Curated metadata distinguishes actual sounds from spelling variants. For example, AN/EN targets a nasal vowel rather than claiming these spellings are a contrast; liaison guidance avoids forbidden liaisons. Regional variation is acknowledged in generation guidance.

References used for the curated metadata: [OQLF phonetic symbols](https://vitrinelinguistique.oqlf.gouv.qc.ca/22137/la-prononciation/notions-de-base-en-phonetique/les-symboles-de-lalphabet-phonetique-international), [OQLF liaison](https://vitrinelinguistique.oqlf.gouv.qc.ca/23545/la-prononciation/liaisons/changements-phoniques-dans-les-liaisons).

Custom labels are validated in both page and API: nonempty, at most 40 characters and six whitespace-separated words, letters/combining marks and a small set of sound-label separators only. Newlines, markup and instruction delimiters are rejected. Custom text is passed as sound-target data in the user message, with system instructions that it is not an instruction. It cannot override document type or output schema. No arbitrary custom input is interpolated into the system prompt.

## Dedicated practice experience

`TongueTwisterPractice` displays separate numbered exercises. `ExercisePracticeSession` owns selection and coordinates the existing `ReadingPlaybackSession` ordinary-audio branch with the existing `PronunciationSession`. It does not reuse theatre sequencing, add a scorer or introduce ambience/casting/chorus behavior.

- Écouter/Réécouter requests only the chosen sentence; any prior incompatible audio is stopped.
- Répéter selects a sentence and reveals its controls without opening the microphone.
- Enregistrer explicitly starts capture with the exact sentence as the reference.
- Terminer l’enregistrement finishes capture; Analyser ma lecture uses the existing endpoint.
- Réessayer records another attempt of the same sentence.
- Learners may choose any exercise without sequential completion.
- Listening again to the same exercise preserves its completed recording. Switching exercise clears the old recording/feedback to prevent mismatches.
- Replacement and reinterpretation stop audio, cancel stale work, clear selection and release/cancel microphone state using existing guards.

Feedback is shown near the active sentence. It remains transcript/reference comparison; fluency and intonation are unmeasured/null, and intended sound metadata does not claim verified phoneme production. Generic full-document recording/play buttons are hidden for this mode; the original text remains available below for reading and vocabulary.

## Speed and caching

The nearby Vitesse selector and global selector share the same React state and the same four choices: Très lent, Lent, Normal, Rapide. The API receives the existing rates 0.7, 0.85, 1 and 1.15 respectively.

There is deliberately no exercise audio cache in this checkpoint. Every listen/replay requests the chosen sentence at the currently selected speed. Changing speed does not pretend that an already playing buffer has changed; the UI says it applies to the next listen. This avoids stale-speed audio, at the cost of another TTS request on each listen. Validation used mocks, not paid TTS calls.

## Imported Virelangues

Confident detection and explicit learner reinterpretation attach conservative practice units. Complete lines or recognizable numbered items become units; labels/instructions stay in source but are not exercises. Sound headings provide target labels; unrecognized but valid short labels are retained without fabricated phoneme metadata. Uncertain wrapped fragments remain in the source with warnings rather than becoming partial exercises. No wording is corrected or globally joined.

The supplied human sample is a regression fixture: all 24 sentences survive exactly and in order. French quotation endings with spaces are supported, and possessive `Son message…` is not mistaken for a sound heading. All three quoted colon sentences independently take ordinary audio, with no dramatic analysis.

## Files changed

Added:

- `lib/tongue-twisters.ts`: sound metadata, exercise construction/segmentation, validation and exact pronunciation targets.
- `lib/content-routing.ts`: authoritative explicit-type routing with legacy fallback.
- `lib/exercise-practice.ts`: independent exercise selection/listening/recording orchestration.
- `components/article-reader/TongueTwisterPractice.tsx`: individual exercise controls and bounded feedback.
- `tests/tongue-twisters.test.cjs`: deterministic model, route, playback, capture, import and rendering tests.
- `tests/virelangues-acceptance-fixture.cjs`: supplied 24-sentence acceptance example.
- `docs/virelangues-practice-cp4-3-1.md`: this record.

Modified:

- `app/api/generate-article/route.ts`: validated sound target and structured generation.
- `app/api/read-passage/route.ts`: shared explicit routing function.
- `app/page.tsx`: target choice, exercise lifecycle and dedicated-mode rendering.
- `components/article-reader/ReadingSetupBar.tsx`: conditional sound/custom controls and shared speed choices.
- `lib/content-document.ts`: exercise metadata and validation integration.
- `lib/generation-contracts.ts`: sound-targeted structured Virelangues contract.
- `lib/smart-import.ts`: phonetic structure precedence and exercise attachment.
- `tests/content-page.test.cjs`: sound persistence, shared speed, selected recording and replacement.
- `tests/content-routes.test.cjs`: existing nine-mode regression fixture updated for structured Virelangues output.

## Verification and remaining acceptance

Focused tests passed before the full run. Full suite: **396 passed, 0 failed**, including all prior theatre/chorus/casting/direction/ambience/recording/ordinary-reading regressions. Typecheck and the final production build passed. `git diff --check` passed. The build reported non-blocking webpack cache snapshot and stale Browserslist-data warnings; no unrelated dependency or configuration changes were made.

Tests verify all curated targets, custom validation, structured failures, authoritative routing under misleading text, exact exercise text/order/identity, all four speeds, replay and A→B switching, recording retries and exact references, preserved transcript evidence limits, replacement/late-response cleanup, late microphone permission, source-preserving import and rendered practice controls. The actual acceptance sample also runs all 24 independent sentences through the mocked read route.

No live/paid model, TTS or transcription calls were used. A real production browser still needs the requested acceptance flow: generate a chosen sound, listen/replay/change speed, explicitly record/analyze/retry, switch exercises, then generate Conversation and Theatre and confirm their existing experiences. Production build/version identification and actual audio quality remain human checks; a successful Git push is not proof of deployment.

No CP4.4 work, new dependencies, analytics, acoustic scoring or ambience redesign is included.
