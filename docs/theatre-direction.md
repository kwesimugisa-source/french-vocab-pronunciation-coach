# Checkpoint 3: dramatic direction and stable casting

## Verified API boundary

Verified 2026-09-15 against installed `openai` **6.34.0**, specifically
`resources/audio/speech.d.ts`, `resources/responses/responses.d.ts` and
`internal/request-options.d.ts`, and these official sources:

- [Speech guide](https://developers.openai.com/api/docs/guides/text-to-speech):
  `gpt-4o-mini-tts` accepts separate `instructions` for tone, emotional range,
  intonation and pacing. Spoken script remains in `input`. No invented pitch,
  emotion or acting API parameters are used.
- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini):
  400,000 context tokens, 128,000 maximum output tokens, Responses API and
  structured output support. This is also the application's existing text model.
- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs):
  Responses `text.format` with `json_schema`, `strict: true` and closed objects.

Supported built-in speech inventory: alloy, ash, ballad, coral, echo, fable,
nova, onyx, sage, shimmer, verse, marin, cedar. SDK voice typing includes a
general string; the application narrows this to the verified inventory.

**Narrator: cedar.** The speech guide recommends cedar and marin for quality;
it does not guarantee a particular pitch. We reserve cedar and explicitly ask
for a lower, composed, clear and unobtrusive theatrical register. Narrator voice
can be configured through `generateTheatreResponse`'s `narratorVoice` option.
Configuration rejects unsupported voices and the reserved chorus voice, echo.
No subjective listening evaluation or paid live API call is required by tests.

## Flow and immutable source

1. Parse the entire scene with the unchanged Checkpoint 1 parser.
2. Build a deterministic cast from normalized speaker identities and roles.
3. Serialize every parsed item, including stable ID, speaker, type, exact text,
   index and source lines, into one whole-scene analysis request.
4. Validate the complete response. Require the exact expected ID set once each.
5. Join annotations by ID into original source order; construct all TTS jobs.
6. Run the existing three TTS workers. Each job sends exact `item.text` as
   `input` and delivery direction separately as `instructions`.
7. Validate and return the existing complete ordered clip/integrity contract.

The analyzer receives serialized data rather than mutable parser objects. Its
schema has no script text, speaker, index or source-line replacement fields.
Unknown fields are rejected. It cannot determine queue order or source content.

## Schema and fallback

Version 1 contains scene mood plus brief situation, relationships and emotional
arc (each summary at most 400 characters), and one annotation per stable item ID.
Item tone, pacing and intensity are bounded enums. Instructions combine the
shared scene context with the corresponding item's validated delivery values.
Summaries are advisory descriptions, never spoken script or internal reasoning.

Any invalid annotation rejects the entire analysis, including missing,
duplicate, invented or malformed IDs, unsupported enum values, extra fields,
oversized summaries or wrong version. There is no partially directed scene.
Request failures, incomplete output, refusals/invalid JSON and timeouts also
select safe default delivery for **every** original item. TTS failures retain
Checkpoint 1's identifiable failed-item error instead of partial success.

One request is used when feasible, with `store: false`, no automatic truncation,
no SDK retries and a 20-second abortable deadline. A promise race also bounds
transports that ignore cancellation; late results cannot mutate the chosen plan.

The import UI allows **50–2,500 words**. That alone does not bound serialized
bytes or item count. Analysis therefore uses explicit conservative budgets:

- Complete serialized input: at most 120,000 UTF-8 bytes. Bytes conservatively
  bound text tokens, with ample context headroom for schema, prompt and output.
- Output allowance: `2048 + 192 * itemCount`, at most 120,000 tokens, below the
  model's 128,000 maximum. Compact enum annotations keep usual output far below
  this ceiling. The allowance is a ceiling, not required generated output.
- Over either budget: make no analysis call; return `input_budget` or
  `output_budget` metadata and synthesize **all** items with default direction.

No input is sliced and no logical item is capped or skipped. Tests include
39/40/41/60/100 items, a full 2,500-word/500-item analysis and whole-scene budget
fallbacks. Output exhaustion is also caught by completion-status/ID validation.
Worst-case large scenes may use default delivery; chunked analysis is not added.

## Casting and speed

Parser normalization is unchanged (trim, uppercase, NBSP replacement, apostrophe
normalization). Ambiguous names are not merged or renamed. Ordinary identities
are sorted deterministically and mapped to the 11 remaining supported voices,
excluding narrator and chorus. Exhausted inventories wrap deterministically and
set `reusedCharacterVoices`; every character remains consistent within the scene.
Adding/removing a character may change a new scene's assignment; no cross-scene
voice persistence is promised.

Stage role comes from `item.type`, so a dialogue character literally named
NARRATOR is distinct from narration. Chorus recognition preserves Checkpoint 2's
CHŒUR/CHOEUR/CHORUS name-matching rule, remains identifiable in casting, and uses
one echo voice. No mixing, overlap, chorus practice or role-selection UI is added.

Existing speed formulas are unchanged: stage `max(0.65, selectedSpeed - 0.15)`;
dialogue/chorus `max(0.95, selectedSpeed)`. Directions request expressive phrasing
within that speed rather than silently changing the numeric speed parameter.

## Contract, playback and limitations

Optional response fields preserve compatibility with old cached responses:

- `direction`: version, model, analyzed/fallback status, sanitized fallback reason,
  expected count, validated annotation count, fallback count.
- `casting`: version, narrator/chorus voices, explicit speaker/role/voice entries
  and character-voice reuse indicator.

No raw scene summaries, per-item annotation arrays, model output or private error
details are returned. Existing integrity fields and clip source data are unchanged.
Dramatic metadata never enters playback state. Checkpoint 2 controllers, cached
replay, practice targeting, microphone pipeline, cleanup and completion logic are
unchanged. Analysis is never repeated during replay or practice. Ordinary reading
and poetry bypass dramatic analysis entirely.

TTS remains generative: exact input strings are guaranteed at the API boundary,
not a word-perfect acoustic performance. French delivery and subjective narrator
quality still need listening evaluation; voices are documented as optimized for
English. Existing service errors and per-input speech limits (SDK documents 4,096
characters) remain possible and yield identified TTS failures. This checkpoint
does not split logical items or mix audio to work around those limits. Bounded
concurrency is per scene, not a global service rate limiter. No Scene Partner or
later-checkpoint implementation is included.
