# Checkpoint 4.1: imported chorus and contextual ambience

## Reproduction and root cause

Starting commit: `ef7140ce6be90dabd08e93487ca2400475b32d2a`, clean main.
Before production edits, the regression fixture failed: zero chorus items,
expected two. The old parser matched `LE CHŒUR :` but returned immediately when
the text after the colon was empty. It discarded the label. With all labels on
separate lines, the fixture became eight NARRATOR/stage items. With a preceding
inline character turn, subsequent unlabelled lines joined that character's item.
Unicode Œ was already recognized downstream; identity was lost in the parser,
before generation. The three-voice mixer was not broken.

First chorus trace:

| Stage | Before | After |
|---|---|---|
| Raw label, line 10 | LE CHŒUR + NBSP + colon | Same source |
| Label handling | Discarded when spoken text empty | Pending canonical CHŒUR |
| First spoken line | line-12, stage, NARRATOR | line-12, dialogue, CHŒUR |
| Source mapping | [12] | [12] |
| Generation/contract | Cedar primary audio, no chorus | Echo/fable/onyx components, one clip |
| Client playback | One Audio | Existing CP4 ChorusAudio group |

The second chorus becomes one `line-21` item, sourceLines `[21,22]`, with the two
original spoken lines joined by one space (the established continuation rule).
All words, accents and internal typography are preserved. The fixture includes
both user-supplied chorus excerpts, L’AGENT/LE JOUEUR, Unicode spaces and number 2.

## Speaker identity

`theatre-speakers.ts` supplies the central normalization/classification layer
used by parser, casting, contract validation and practice eligibility. Identity
keys use NFKC, explicit Œ/OE folding, apostrophe normalization, collapsed Unicode
whitespace and uppercase. Exact aliases CHŒUR, LE CHŒUR, CHOEUR, LE CHOEUR,
CHORUS and LE CHORUS resolve to CHŒUR. No substring matching; TOUS, TOUTES,
LES VOIX and ENSEMBLE remain ordinary labels. Additional language aliases can
extend the table without touching the language-agnostic mixer.

Spoken text never goes through identity normalization. The original imported
source is not rewritten or persisted. IDs remain based on the first contributing
spoken source line; empty labels and blank lines contribute no text. Inline
labels retain existing IDs. Pending labels survive blank lines and parenthesized
stage items; a newer label replaces a pending empty label.

## Pagination limitation

The old parser spoke `2`; it did not ignore it. A bare number surrounded by blank
lines cannot reliably be distinguished from intentional numeric script content.
No numbers are deleted. Unlabelled isolated numeric content remains a separate
spoken narrator item, avoiding contamination of preceding chorus text. Labelled
numbers and ordinary numeric continuation lines remain dialogue. The fixture
still speaks 2. Removing known page artifacts remains a manual import cleanup;
safe automatic suppression would need layout evidence absent from plain text.

## Contextual ambience

The typed catalogue contains none plus 25 settings covering interior,
nature/weather, public/urban and dramatic/period environments. The existing
whole-scene analysis selects the environment in the same model call. There is
no keyword-only setting classifier. Structured fields are environment,
confidence, basis (explicit/contextual), exact evidence IDs/excerpts, rationale
and a contradiction flag. The prompt requires counter-evidence, negation,
hypotheticals and incompatible setting changes to yield none.

Validation checks catalogue membership, exact fields, high confidence, no
reported contradiction, bounded quotes from distinct existing items and a
nonempty rationale. Explicit recommendations require stage evidence; contextual
recommendations require at least two corroborating items. Le Joueur tests mock
office inference from numbered-client service, employment paperwork and
administrative questioning without the literal word bureau or hard-coded names.

Validation proves provenance/structure, not semantic truth: a model can still
misinterpret valid evidence. Invalid ambience becomes none independently of
otherwise-valid direction. Whole-analysis timeout/failure retains complete-scene
fallback. CP4 legacy rain metadata retains its original strict validator. The
client revalidates ambience evidence against accepted clips.

## Providers and lifecycle

Classification is independent of the provider registry. Original deterministic
demonstration beds exist for rain and neutral room tone; office uses the same
appropriate restrained room-tone bed. Office never becomes rain. Other catalogue
settings return null, show their identified setting with "aucun son disponible",
disable the selector and stay silent. No recordings, downloads, dependencies,
copyrighted assets, one-shot effects or unsupported APIs were introduced.

Off is default, Low/Medium retain gains 0.08/0.16. Independent looping, performance
Pause, cached Replay, practice bookmarks and capture gating remain CP4 behavior.
Stop/replacement/error/completion/unmount release all layers. The existing
pronunciation pipeline suspends app audio before microphone access, stops tracks
before ambience restoration, and never resumes dialogue just because capture
ended. Chorus remains non-practiceable; no Scene Partner implementation.

## Validation boundaries

Tests cover imports through route/generation/client/group playback, alias variants,
false positives, source fidelity, numeric content, contextual/explicit/ambiguous
and invalid ambience, absent providers, capture/bookmarks, replay and cleanup.
Existing tests are retained; route coverage is additive. Local browser validation
uses native HTML audio with synthetic WAV fixtures, not paid TTS or a physical
microphone. Temporary validation files are removed before commit.

Remaining limits: model inference can be wrong; the sound library is a small
demonstration; plain-text pagination is ambiguous; coordinated chorus starts do
not guarantee sample/word alignment. No new script storage, accounts, analytics,
database, unrelated UI redesign or later-checkpoint work is included.
