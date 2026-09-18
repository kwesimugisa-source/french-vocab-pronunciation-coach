# CP4.4.2 — Natural Theatre performance

## 1. Verified starting state

Repository: `C:/Users/Kwesi/Downloads/french-vocab-pronunciation-coach-complete`. Before editing: branch main, clean working tree, HEAD = origin/main = remote main = `fffc6e64de0cadac3393262dc3a3fa8bc46ae6be`. Work resumed from that audit without resets, Undo or discarded changes.

## 2–3. Clara diagnostic: facts and limits

The exact Le Dernier Train fixture has 16 Clara lines. At the starting commit, every one resolved to canonical speaker CLARA, female-presenting category and provider voice coral. The short `Marc...` item is `line-85`, logical index 42. Normal dialogue speed was 1.0 for both short and long lines. The mocked real API boundary confirms the same provider voice; no recasting occurs for this line.

Casting is fixed before concurrent TTS jobs. Each job looks up the same scene cast by speaker/role. Authored text becomes TTS input without prepended names. Full-scene analysis supplies item-specific tone/pacing/intensity, so delivery instructions can legitimately differ by item. Without analysis, the baseline role instructions were identical for the short and long Clara lines. There was no special short-line continuity context.

There is no shared audio lookup that substitutes another character's clip. Replay/practice use the accepted scene queue; the chorus decode cache is session-local and cleared on stop. The server cache contains dramatic analysis only, not speech audio.

**The code does not recast Clara on Marc... . The perceptual cause is not proven.** No production request/audio pair was supplied. Short-utterance synthesis and limited performance continuity are plausible explanations, addressed through non-spoken context while retaining coral. These tests cannot establish how the reported production audio actually sounded.

## 4. Changed files

- `lib/theatre-performance.ts` (new): validated style type, default and delivery instructions.
- `lib/theatre-direction.ts`: style-aware direction, fixed voice identity, bounded surrounding context and faithful interjection instructions.
- `lib/theatre-generation.ts`: style validation/propagation, response identity and dialogue speed mapping.
- `lib/theatre.ts`: optional response performanceStyle for backward-compatible Clarté clients.
- `app/api/read-passage/route.ts`: Theatre-only style validation and forwarding.
- `lib/reading-playback.ts`: session style, cancellation/restart lifecycle and response-style validation.
- `components/article-reader/ReadingSetupBar.tsx`: compact French style selector beside speed.
- `app/page.tsx`: current-document Theatre-only control wiring and recording safeguards.
- `tests/performance-cp4-4-2.test.cjs` (new): 22 diagnostic, matrix, lifecycle, playback and practice tests, including the exact requested interjection fixture.
- `tests/theatre.test.cjs`: updates the legacy slow-dialogue clamp assertion to the actual selected speed.
- This completion report.

## 5–10. Performance architecture

Styles are the validated enum clarte/naturel, displayed as Clarté/Naturel. An omitted value means Clarté; invalid Theatre values return 400 before analysis/TTS. Style is session state separate from document identity, casting and the existing speed selector. It is shown based on the current document's effective Theatre type, not the next-generation type selector. No new setting applies to Conversation or Virelangues.

Clarté asks for excellent acting with unusually clear articulation, careful pronunciation and learner-friendly rhythm, without mechanical word separation. Naturel asks for conversational phrasing, connected speech, reaction timing and emotional variation while retaining intelligibility and exact words. Neither asks for invented fillers, paraphrases, contractions or laughter syllables. Both respect the requested speed.

The audit found that the old Theatre dialogue path clamped 0.7 and 0.85 to 0.95. Dialogue and chorus now receive the selected 0.7/0.85/1.0/1.15, identically in both styles. The existing narrator offset remains: max(0.65, selected speed minus 0.15). Style does not change either mapping. Existing speed controls remain intact; changing speed does not change style. As before, a speed selection applies when a reading is prepared; it does not retime an already-playing clip.

The existing whole-scene mechanism still supplies mood, situation, relationships, arc, and each item's tone/pacing/intensity. Naturel character lines receive previous/next script excerpts (bounded to 300 characters each) and scene position. Short character utterances of at most four whitespace-delimited words receive this context in both styles. This is a general rule, with no special-case Clara, title or interjection list.

Context is serialized as untrusted, non-spoken data in instructions. The actual TTS input remains exclusively the authored logical item's text. Each request separately identifies the fixed speaker, role and provider voice, and asks for stable vocal identity/resonance across short reactions and longer lines. Acting state is separate from voice identity. Narrator never receives character-neighbor acting context; chorus retains its synchronization-specific delivery restrictions. If analysis is unavailable, the whole scene still receives the established safe fallback plus the selected style and structural context.

The train matrix tests assert context reaches the actual mocked provider request at all eight style/speed combinations. They validate structured performance direction, not whether model-generated emotions sound convincing. Human listening must assess Clara's progression through uncertainty, concern, urgency and suspense.

## 11–14. Interjection audit and exact references

Before performance edits, end-to-end diagnostic tests passed through Smart Import, canonical text, parser, logical item, actual read-passage handler, captured TTS input, returned clip, playback Blob bytes, replay and practice target. No interjection deletion was reproduced. The exact requested six-line fixture and minimal reactions Euh..., Ah !, Oh..., Hein ?, Hum..., Ben..., uppercase EUH… and unlisted Pff ! remain dialogue, with original wording/punctuation and speaker ownership.

Therefore no stripping/canonicalization repair was justified. The repair is explicit faithful-delivery direction and short-utterance context at synthesis, plus permanent end-to-end coverage. There is no whitelist and no minimum lexical-length rejection added. The parser/importer are unchanged.

Both styles are tested through recording-session construction and the multipart request to pronunciation analysis: the reference is exactly item.text, excludes speaker labels and never contains acting context. Existing recording and analysis behavior is unchanged. Mocked audio embeds input text to prove queue/byte ownership, not provider audibility. Without the reported production recording, an audible omission cannot be attributed conclusively to the provider or declared eliminated.

## 15–16. Cache and style-switch lifecycle

No cross-session synthesized-audio cache exists to which a composite style key can be added. Cached replay bytes and chorus decodes belong to the accepted controller session. Style switching discards that session and regenerates speech; incompatible audio is never reused. New Theatre responses echo performanceStyle; the client validates it before accepting the scene. A missing field means legacy Clarté only and cannot satisfy a Naturel request.

The analysis cache remains keyed by unchanged document/revision/text on the client and source digest/opaque reference on the server. Style and speed are deliberately excluded because this cache contains scene semantics, not audio. Successfully cached station analysis is reused across style and speed changes. Cache expiry, serverless worker changes or interruption before analysis arrives may require analysis again; no distributed persistence is claimed.

Changing style on a prepared or preparing Theatre scene aborts the old request, stops all audio, clears queue/bookmarks, keeps document/revision and selected speed, and starts preparation from the beginning. This restart is explicitly stated beside the selector. Before first playback, the selector only chooses the next style. Existing green preparation feedback is reused. Late old-style completions cannot win, even with a transport ignoring AbortSignal. Mismatched response styles fail visibly. Microphone capture and busy pronunciation analysis block the UI change; accepted style changes clear obsolete pronunciation state rather than attaching an old practice session to new audio.

## 17–22. Preserved behavior

- Narrator remains cedar and distinct from character/chorus reservations. All 12 train directions remain narrator items.
- Chorus remains three components and one logical item. New tests exercise both styles through measured audible-onset alignment, pause/resume, replay and capture. No chorus timing code changed.
- Station remains detected_available. Low/Medium gain and capture muting remain tested. Style changes reuse the completed classification; the semantic audio registry and providers are unchanged.
- Conversation labels, sequential playback, voice stability, speed and pronunciation targets remain covered by the full suite. No Theatre instructions are added to ordinary playback.
- Virelangues retains target selection, exact exercises, sentence listening, recording, analysis/retry and independent speed.
- Smart Import retains chorus detection, narrator ownership, conservative pagination, numeric protections, originalText and mappings; its implementation is unchanged.
- CP4.4 preparation, safe errors, privacy-safe events, provider counters, duplicate protection and bounded process-local controls remain covered. No telemetry payload was expanded to include text, acting context or audio.

## 23–26. Validation

22 new tests; no existing tests removed. One old speed assertion was deliberately updated because it encoded the slow-dialogue clamp now corrected. Focused run: 22/22 passed; earlier combined route/direction/parser run: 70/70 passed.

Entire regression suite: **563 passed, zero failed**, from baseline 541. Typecheck passed. Production build passed compilation, lint/type validation, static page generation and build tracing. Nonblocking webpack cache-snapshot and stale Browserslist-data warnings were emitted. Diff/status review limits changes to CP4.4.2; no dependency or infrastructure changes.

## 27–29. Release verification

Final commit hash, push result, HEAD/origin/main/remote equality and clean working tree are reported in the final response after validation and release. The commit containing this document is the CP4.4.2 release record; a self-referential hash is not embedded here.

## 30. Short human production acceptance sequence

1. Verify the deployed revision matches the final commit. Load the exact Le Dernier Train fixture. Use Clarté + Normal: confirm stable Clara/Marc, separate narrator, both choruses and clear learner-friendly delivery.
2. Switch to Naturel + Normal. Expect green preparation and restart from the beginning. Confirm same cast voices, livelier conversational phrasing and plausible emotional progression, unchanged words, and station ambience. Compare Off/Low/Medium.
3. Specifically compare Clara's Marc... with her longer lines. Try replay and réplique practice. If a perceptual difference remains with identical provider IDs, record it as a possible short-utterance limitation, not evidence of recasting.
4. Select Naturel + Lent and prepare a reading. Confirm easier speed while retaining flowing acting. Then compare Clarté at the same speed.
5. Import the interjection fixture in the test file. In both styles, listen for all six interjections, replay the minimal lines and record/analyze one réplique. Verify exact displayed/reference text. Briefly check Conversation and Virelangues controls remain unchanged.

## 31. Known limitations and scope

Identical provider voice IDs cannot guarantee identical perceived timbre for every independently synthesized short utterance. Instruction adherence, acoustic interjection rendering and subjective naturalness require production listening. No paid synthesis, audio transcription audit or deployment listening was claimed in automated validation. Acting context is bounded; it does not create a persistent acoustic speaker embedding or a continuous scene recording.

Style changes intentionally restart the scene and require fresh TTS. Pending server generation may continue after a client abort under the existing route architecture, but stale results cannot replace current playback. The existing server analysis cache and diagnostic/rate-limit state remain process-local and non-durable across workers/redeployments.

No Scene Partner, SFX library, external audio assets, CDN/storage, accounts, payments, durable analytics, lexical embellishment or unrelated mode redesign was implemented.
