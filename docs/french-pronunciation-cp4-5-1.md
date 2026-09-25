# CP4.5.1 — Persistent French pronunciation

## Starting state and diagnosis

Started on clean main at fbcbc26cf39bd5cd8b493e9e930fe3287f83f2ec; origin/main and remote main matched. No partial checkpoint existed.

The code-level defect was missing document language authority. Generated French content and imported content carried genre, identity and casting metadata, but no language. Each theatre item and conversation turn is a separate speech request. Ordinary/poetry/exercise requests had no pronunciation instructions. Theatre asked for the input's "original language", with only incidental French diction guidance; conversation mentioned French dialogue but had no persistent authority. Ambiguous fragments therefore reached the provider without an explicit shared rule against independent English inference. English scene/acting descriptions were not explicitly distinguished from spoken-language authority.

This establishes the architectural gap, not the acoustic cause of any particular production recording. No production audio or paid TTS was generated or evaluated. Casting has not been changed.

## Full path audit and implementation

| Path | Authority and preservation |
| --- | --- |
| Generated documents / initial demo | Existing French generation intent is now represented by language: fr in generatedDocument. No model-generated language guess. |
| Smart Import | importDocument attaches the French-learning application's default fr. Import detects content type, not language; this is a policy default, not proof imported content is French. Genre override/revision reconstruction retains that default. Canonicalization is unchanged. |
| Active document | ContentIdentity carries optional typed DocumentLanguage for backwards compatibility. New documents persist fr. Missing legacy metadata resolves to fr; unsupported explicit metadata fails validation. |
| Reading request | ReadingPlaybackSession resolves language once and includes it in every /api/read-passage body, including legacy identity-free listening. |
| Server | Validates language before analysis/synthesis; captures it in the per-request synthesis closure. No global language state. |
| Theatre | Every dialogue, narrator and chorus component passes through speechToBase64 with the same document authority. Existing acting context is retained; ambiguous "original language" wording is replaced. |
| Conversation | Same boundary anchors each turn; labels remain excluded and voices remain unchanged. |
| Ordinary / news / opinion / creative / academic / everyday / poetry | Existing one-blob response, voice and speed remain. Only shared non-spoken pronunciation instructions are added. No theatre processing. |
| Virelangues | ExercisePracticeSession.listen passes the whole document identity while requesting only exact selected exercise text. Target sound and recording reference remain unchanged. |
| Individual réplique / replay | Per-item TTS uses the scene authority. Replay/practice reuses those accepted audio bytes, with no new provider inference or changed text. There is no separate réplique synthesis endpoint. |
| Style/speed | Restarts use the current document; Clarté/Naturel instructions and numeric speed remain independent. Stale request cancellation/queue teardown are unchanged. |
| Pronunciation reference | Page selects canonical passage, conversation spoken turns or exact practice target. PronunciationSession sends that reference to transcript-based analysis. No new synthesized reference, rewritten word or acoustic scoring claim. |

lib/document-language.ts centralizes the typed authority, compatibility default, validation and non-spoken instructions. Both actual speech.create call sites use it. Language does not participate in casting. There is no synthesized server audio cache; replay reuses the session's accepted audio, while new sessions regenerate. Existing scene-analysis cache is semantic and independent of pronunciation; only fr is accepted, so no cross-language cache variant is possible.

## Provider contract and limitation

The installed OpenAI SDK SpeechCreateParams supports instructions for gpt-4o-mini-tts and has no speech language field. The existing model is retained. Instructions are separate from input: no phonetic spelling, word substitution, translation or appended spoken context.

Verified against the [official text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech) on 2026-09-25: instructions can steer accent and delivery; the guide notes voices are optimized for English. This is model steering, not a deterministic pronunciation guarantee. Mocked request tests establish application intent, not actual phonetics. Human production listening remains required.

## Conservative switching decision

Deliberately deferred. All accepted documents, including complete foreign sentences embedded in a French document, remain French anchored. Neither punctuation, names, quotations nor provider inference can change application authority. Explicit non-fr language metadata is rejected rather than silently accepted/ignored. Supporting intentional multilingual pronunciation later requires trustworthy document/passage author metadata and a scoped return-to-document-language contract. No heuristic detector or word/name list was added.

## Validation and privacy

New tests exercise generated/imported identities across all nine modes; legacy/default and invalid metadata; both theatre styles at all four speeds; dialogue/narrator/chorus instructions and stable character voice IDs; all requested short fragments plus unrelated examples; exact provider input; conversation labels/casting; replay/practice bytes and reference; style/speed restarts; individual exercise listen/record; and the foreign-passage limitation.

Existing ordinary/exercise provider assertions now require the exact shared pronunciation instructions instead of no instructions. They still require no dramatic analysis, unchanged voice and speed. Client request-shape assertions also require the new language field while retaining exact text/speed and playback checks. No existing test was removed.

No logging, telemetry, storage, credentials, learner text capture or durable analytics was added. Existing privacy-safe diagnostics and transcript-based scoring boundaries remain. No UI, casting, microphone, ambience, chorus timing or playback-controller changes.

Validation: focused run 92/92 passed; complete suite 597/597 passed (576 baseline + 21 new tests), zero failures/skips. Typecheck passed. Production build passed; non-blocking warnings concerned stale Browserslist data and webpack dependency cache snapshots. git diff --check passed. All provider calls in tests were mocked; no paid synthesis or acoustic acceptance was performed.

## Human production acceptance (required)

Use freshly generated audio after deployment; an already open session may retain old clip bytes.

1. La Dernière Table: listen to Élise's "Thomas.", Julien's "Thomas !" and "Silence" or a similarly ambiguous word. Confirm French pronunciation and stable character identity relative to longer lines.
2. Le Dernier Train: Clara's "Marc." and "Marc..." must sound like the same Clara voice using French pronunciation. Replay each and practise a réplique, then continue to the following line.
3. Repeat with Naturel + Normal, Clarté + Normal, and at least one slower/faster speed. Confirm no language drift, omissions or added spoken instructions.
4. Listen to an imported/generated ordinary French passage containing an ambiguous name/word. Confirm French pronunciation and unchanged ordinary playback.
5. Spot-check individual Virelangue listening and Conversation labels/voices. Record/analyze a practice target and confirm its displayed reference is exact.
6. An intentional English sentence remains French anchored in this checkpoint; do not treat genuine switching as supported.

Stop after CP4.5.1. No Universal Practice, Director Engine, Scene Partner or sound library work.
