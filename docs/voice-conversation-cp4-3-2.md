# CP4.3.2 — Voice casting and natural Conversation playback

## Starting checkpoint

Verified repository `C:\Users\Kwesi\Downloads\french-vocab-pronunciation-coach-complete`, branch `main`, clean working tree, and both HEAD and origin/main at `46bb9f27ec337412b6e8aa83166a6a4b647641ba` before editing. Scope is CP4.3.2 only.

## Voice audit and root cause

The previous path was `read-passage` → `generateTheatreResponse` → `parseTheatreItems` → `createTheatreCasting`, followed by `prepareDramaticDirection` and concurrent TTS. Character speakers were normalized, deduplicated and alphabetically sorted. Each was assigned the next voice from a fixed array, wrapping for large casts. Character descriptions had no influence. Names affected alphabetical ordering, but were not explicitly used to infer gender.

Dramatic analysis returns overall mood, situation, relationships and arc; per-item tone, pacing and intensity; and grounded ambience metadata. It has no character presentation field. Casting is fixed before that analysis and did not consume any of its descriptions. Imported and generated theatre use the same path. That disconnect is the source-level cause of inappropriate presentation assignments; the report does not claim to have measured the actual sound of the user's production recordings.

The inventory was already all 13 supported voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin and cedar. It was not an exclusively male-labelled inventory. The first small-cast assignments were alloy, ash and ballad, regardless of source descriptions. Narrator cedar and primary chorus echo were reserved, leaving 11 character candidates. Reserving the narrator was appropriate. The secondary chorus voices fable and onyx were not reserved from characters, permitting overlap.

The [official OpenAI speech guide](https://developers.openai.com/api/docs/guides/text-to-speech), checked September 17, 2026, lists these voices but provides no formal gender classifications. It recommends marin and cedar for quality and notes that voices are optimized for English. The app's categories below are perceptual casting configuration, **not provider claims about gender or voice identity**. French auditory acceptance remains necessary.

## Evidence-grounded casting

`lib/voice-casting.ts` centralizes supported voices, presentation pools, explicit evidence recognition and deterministic allocation.

- Female-presenting app pool: coral, nova, shimmer.
- Male-presenting app pool: ash, ballad, onyx, echo, verse, cedar.
- Unspecified path: the entire available inventory, prioritizing unused voices. This means unspecified presentation, not a claim that every voice sounds gender-neutral.
- Theatre excludes the narrator and all three actual chorus component voices before selection. With default reservations, nine character voices remain; the compatible male pool is ash, ballad, verse.
- Established presentations are allocated before unspecified characters. Within the compatible pool, least-used voices win, with deterministic ordering for ties and overflow. `reusedCharacterVoices` reflects actual reuse.

The source evidence recognizer intentionally handles affirmative, named cast descriptions in parsed stage/narration items, such as `(Jean, une femme, entre.)`, `(Sophie est un homme.)`, `(Jean, une jeune femme, entre.)` and explicit sister/brother/parent/spouse descriptions. It retains the exact source evidence in cast metadata. It never classifies from names, occupations, personality, authority or assumed age-related voice qualities. Conflicting, negated, quoted or uncertain descriptions abstain.

This is deliberately **not a general demographic or coreference inference engine**. Ambiguous pronouns, descriptions embedded in character dialogue, and unsupported description syntax remain unspecified. Separate, explicit parenthesized descriptions are requested for generated scenes. Imported scenes use the same evidence rules without rewriting source dialogue.

Casting remains a pure function of unchanged source and configuration, independent of speed and model availability. There is no model-driven reroll or shared mutable casting cache. Cached theatre line replay, pause/resume and réplique practice retain the existing clip voice. Narrator identity, chorus primary identity, three-component generation and synchronized playback remain intact. Scene analysis and its fallbacks remain unchanged.

## Conversation architecture

Conversation remains an authoritative document type. Only explicit `contentType: conversation` requests use its new audio branch; unknown documents retain CP4.3 abstention/generic behavior. It never requests dramatic analysis or a casting model and never loads turns into TheatrePlaybackController.

`conversationTurns` derives `{ id, speakerId, speakerLabel, spokenText, order }` from the canonical passage. Stable IDs are scoped to each independent document playback. Only the first ASCII/fullwidth colon separates a label; internal dialogue colons and exact wording are retained. Speaker identity normalizes case and apostrophes. Labels support accents, apostrophes, spaces and hyphens. Completely unlabelled legacy Conversation passages remain a single intact spoken passage.

Labelled imports require one complete `Name : dialogue` turn per nonempty line. Empty or mixed malformed turns fail with a visible instruction instead of deleting text, guessing continuations or speaking incomplete dialogue. Smart Import detection and normalization are unchanged. The displayed text and `originalText` retain labels. No Conversation-specific display redesign was required.

Generated Conversation now requests a strict JSON schema with `title` and `turns: [{ speakerLabel, spokenText }]`. Local validation rejects missing/empty fields, multiline turns and a duplicate own-speaker label inside spokenText. The validated structure produces canonical labelled text inside the existing active-document architecture; subsequent consumers derive the same turns from that text. No model-generated gender metadata is requested. Conversation uses the unspecified deterministic distinct-voice path, never names as demographic evidence.

Each speaker retains one voice across all turns, repeated playback and all speed settings. Separate documents create separate queues and allocation maps; there is no cross-document cache or inherited speaker state. Identical speaker inventories can deterministically choose the same voices in independent documents.

### Audio contract and reliability

The Conversation API returns:

```ts
{
  mode: "conversation",
  version: 1,
  clips: [{
    id, speakerId, speakerLabel, spokenText, order,
    voice, speed, audioBase64
  }]
}
```

Only `spokenText` is sent as TTS input. All turns are validated before synthesis. Up to three TTS workers fill ordered output slots; a failed or empty clip fails the whole response and identifies failed turn numbers. SDK retry behavior is unchanged; no custom alternate-voice retry silently changes a speaker. Each turn retains the existing 4,096-character TTS limit; the passage retains the 60,000-character request limit. No turn truncation or clip-count cap was introduced.

The client independently derives expected turns and validates count, IDs, order, labels, exact speech, voice, speed and base64 shape before playback. `ConversationPlayback` plays one audio object at a time, advances only on completion, releases URLs and handlers, and guards callbacks by both generation token and audio ownership. Failed loads, play rejection or 45 seconds without progress stop visibly rather than skip. Time progress refreshes the watchdog, so it is not a clip-duration limit. Late responses/events cannot restart a replaced document. Microphone capture cancels pending Conversation generation and stops the queue; releasing capture never resumes speech automatically.

Played IDs are available in the local Conversation snapshot for deterministic integrity tests. They are not analytics or persistent telemetry.

### Pronunciation and speed

Whole-passage Conversation recording uses the same ordered spokenText values joined with newlines. Speaker labels do not enter the reference sent for transcript comparison. Malformed structure is rejected before opening the microphone. Display text, word analysis and the CP4.3 transcript-based scoring limitations are preserved; no acoustic scoring was added.

Conversation uses 0.7, 0.85, 1.0 and 1.15 for Très lent, Lent, Normal and Rapide. Voice allocation does not depend on speed. Conversation audio is regenerated for a new full playback and has no cross-speed cache. Existing theatre speed transformations and scene-owned replay cache remain unchanged. Virelangues retains its contextual speed selector and individual sentence workflow.

## Files changed

- `lib/voice-casting.ts`: provider inventory, documented app presentation pools, conservative source evidence and stable allocation.
- `lib/theatre-casting.ts`: grounded character metadata and complete narrator/chorus reservations.
- `lib/conversation.ts`: turns, generation schema/validation, pronunciation reference and response integrity validation.
- `lib/conversation-generation.ts`: bounded per-turn synthesis, ordered complete response and explicit failure handling.
- `lib/conversation-playback.ts`: independent guarded sequential playback and resource cleanup.
- `lib/reading-playback.ts`: Conversation dispatch, response-mode checks and microphone cancellation integration.
- `lib/generation-contracts.ts`: structured Conversation contract and explicit theatre descriptions.
- `app/api/generate-article/route.ts`: schema selection and validated Conversation canonical text.
- `app/api/read-passage/route.ts`: dedicated Conversation audio branch and validation/errors.
- `app/page.tsx`: label-free Conversation pronunciation reference.
- `tests/voice-conversation.test.cjs`: 42 deterministic casting, generation, contract, queue, speed, failure and race tests.
- `tests/content-page.test.cjs`: Conversation display/reference/microphone wiring regression.
- `tests/content-routes.test.cjs`: new Conversation route contract; retains ordinary replacement coverage.
- `tests/theatre-casting.test.cjs`: nine unreserved character voices and deterministic overflow expectation.
- `docs/voice-conversation-cp4-3-2.md`: this audit and completion report.

## Validation and acceptance

Focused tests passed, then the full suite: **439 passed, zero failed**, up from 396. Typecheck passed. Tests cover explicit mixed 2+2 casting with Jean female-presenting and Sophie male-presenting, unknown-name abstention, imported/generated theatre, repeated lines/replay/speeds, narrator/chorus separation, ordered Conversation synthesis, generated/imported API-to-playback, label-free references, malformed inputs, 3+ speakers, punctuation, replacement, stale callbacks, microphone boundaries and failures. Conversation scripts of 600 and 1,500 words complete in order exactly once over three runs each. Existing long-theatre, chorus synchronization, dramatic direction, ambience, all nine modes and Virelangues regressions all pass.

No paid generation or live recording was used for automated validation. Human acceptance after deployment must confirm French voice presentation/distinction, narrator separation, chorus synchronization, same-voice replay and speed changes, natural Conversation transitions without audible labels, visible labels without theatre controls, and the Virelangues targeted-sentence/speed workflow. The previously supplied deployment URL required Vercel login; these tests do not establish which revision production serves.

The production build passed (Next.js 14.2.5). Existing non-blocking webpack cache-snapshot and outdated Browserslist warnings remain; no dependency/configuration migration was made. Diff whitespace validation passed. Final commit/push/remote/clean-tree verification is recorded in the task completion message; a commit cannot embed its own hash. No CP4.4 work is included.
