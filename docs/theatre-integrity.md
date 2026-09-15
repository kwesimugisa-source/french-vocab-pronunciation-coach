# Theatre integrity foundation (Checkpoint 1)

## Identity and parsing

`lib/theatre.ts` defines the shared parser, item/response types and completeness
validator. A logical item has `id`, zero-based `index`, `type`, normalized
`speaker`, exact parsed `text`, and contributing one-based `sourceLines`.
`line-N` identifies the physical line where an item starts. IDs are deterministic
and unique **within an unchanged scene**, not globally unique or stable across
source edits. A future controller must scope them to its scene/session.

A dialogue turn, including its continuation lines, is one replay/practice unit.
Its `text` can later be submitted with a recording to the existing pronunciation
endpoint. Select practice targets by `type === "dialogue"`; stage items are not
automatic practice targets. Chorus remains one dialogue item.

Existing grammar is preserved: blank lines and empty speaker labels produce no
item; unlabelled continuation lines join the preceding dialogue. Whole-line
parentheses identify stage directions. Inline directions and alternative script
formats are not newly interpreted in this checkpoint. Stage items remain in
source order and are **spoken with the existing narrator voice**.

## Success contract

Existing `mode: "theatre"` and all clip fields remain. Each clip additionally
contains `id` and `sourceLines`. An additive `integrity` object contains:

```json
{
  "version": 1,
  "parsedItemCount": 2,
  "expectedItemIds": ["line-1", "line-3"],
  "generatedClipCount": 2
}
```

All currently parsed items are speakable, including stage directions. Success
requires parsed count = expected-ID count = generated count = clip count, with
unique IDs in exactly the expected order. `index` is the logical item position,
not the physical source line. The shared validator checks counts, identities,
order, item content/source mappings and required clip metadata. The client
independently parses the requested text and validates **before** playing audio,
so even consistently truncated counts cannot disguise a missing scene ending.
Older clients can consume the additive response. The updated client requires the
integrity contract; deploy it together with the backend.

## Generation and failures

`lib/theatre-generation.ts` freezes existing voice assignment in source order,
then uses three workers. Three is a conservative per-scene bound that permits
some overlap without starting every TTS request at once. Results occupy their
original item positions regardless of completion order. No segment cap remains.
The bound covers complete synthesis and audio-body buffering. It does not bound
aggregate traffic across concurrent scenes/users.

Workers account for every expected item, even after another fails. No extra
application retries are layered over the existing SDK retry policy. After all
workers settle, any failure (including an empty audio body) yields HTTP 500:

```json
{
  "error": {
    "code": "THEATRE_GENERATION_FAILED",
    "message": "Theatre audio generation failed for one or more items.",
    "failedItems": [{ "id": "line-3", "index": 1, "sourceLines": [3] }],
    "parsedItemCount": 2,
    "expectedClipCount": 2,
    "generatedClipCount": 1
  }
}
```

No partial `clips`, theatre success `mode`, upstream error body, or credentials
are returned on this failure path. Successful clips from a failed scene are not
cached. Structured failure identity is available in the response; the existing
client still displays its generic audio failure message.

## Validation

- `npm test`: built-in Node test runner with in-memory TypeScript compilation
  using the existing dependency. Mocked speech only; no paid/network calls.
- `npm run typecheck`: TypeScript without output or incremental build files.
- `npm run build`: existing production build.
- `npm run lint`: existing command; requires ESLint/configuration if not installed.

Tests cover parsing/source identity, 39/40/41/60/100 items, interspersed stage
items, multi-line turns, repeated characters, independent word/segment counts,
30 reproducibly randomized completion runs, concurrency, rejected/empty audio,
body-read failure, actual route success/failure contracts, client validation of
corrupt/incomplete scenes, and ordinary/poetry audio and speed regressions.

## Boundaries for Checkpoint 2

No new controller, pause/replay/practice UI, scene analysis, narrator casting,
chorus mixing or pronunciation pipeline is implemented. Existing speed behavior
and non-theatre TTS remain unchanged.

The single request still buffers every clip into one base64 response. Longer
scenes can exceed deployment deadlines or memory/response limits. A long single
item can exceed service input limits; it fails with item identity rather than
being silently skipped. No chunking, deadlines, global admission control, audio
decoding/content verification or cancellation has been added.

Next, use a scene/session-owned controller and playback completion ledger to
address overlapping requests, stale audio events, stop/unmount cleanup and
stalls. Generation integrity does not prove every word was spoken or that every
returned clip was played. Measure deployment limits before choosing resumable
generation/batching; preserve logical item identity if audio chunking is added.
