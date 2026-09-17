# Bare chorus headings: production acceptance follow-up

CP4.2 is not accepted until another human production listening test passes.

## Reproduction and cause

At d6c426dbf3c28744d560509dbfa71718640c52b6, the supplied colon-bearing
examples passed the real route/controller tests. The subsequently supplied
"LA RAISON" text instead contains bare `LE CHOEUR` and `LE CHŒUR` headings.
Before the fix, the first heading and its following text were appended to
L'AGENT's dialogue before generation: "Ta raison n’a pas de raison, si j’ai bien
entendu? LE CHOEUR LA RAISON N’A PAS DE RAISON, IL A RAISON."
Eight bare-heading pipeline cases failed before the production edit.

The parser recognized only colon-bearing labels. An unmatched bare heading took
the continuation branch, so no pending chorus speaker was established. Blank
lines themselves did not clear pending state. CP4.1 and CP4.2 have identical
parser, speaker normalization, import UI, API route and generation sources: this
is an uncovered input-format gap also present in CP4.1, not evidence that Web
Audio introduced a routing change. Earlier fixtures always supplied colons.

## Path and fix

Import trims outer whitespace, stores article.text, and ReadingPlaybackSession
POSTs that text to /api/read-passage. The route detects theatre, parses source,
assigns casting, and generates three components for a chorus. The client checks
the returned manifest against the same source parser before accepting it. The
controller selects SynchronizedChorus when the generated item has chorus parts.
No persistent generated-scene cache was found in this path; the chorus PCM cache
is scene-local and downstream of classification. No deployed runtime was inspected.

The only production change is in parseTheatreItems: an exact shared chorus alias
on its own line establishes a pending speaker, including without a colon. The
following applicable dialogue starts a new chorus item. Blank lines and stage
directions retain pending identity. Arbitrary uppercase text and alias substrings
are not promoted to headings. Spoken text and physical source-line IDs are kept.

No synchronization, casting, ambience, UI, API or pronunciation code was changed.
The 40ms guard, 50ms anchor, 0.96–1.04 rates, preparation barrier, cached replay,
pause/resume, capture gate and one-item completion semantics remain intact.

## Validation scope

New tests call the actual API POST handler from ReadingPlaybackSession, replacing
only external OpenAI and browser media boundaries. They assert independent
expected manifests BEFORE acceptance/playback and then exercise synchronized
controller routing. Four chorus passages (both original excerpts and both
LA RAISON passages) run through nine typography/newline variants. An additional
test covers all six exact aliases, pending state across a stage direction, and
non-alias negative cases.

A temporary native-browser harness imported the two LA RAISON chorus passages
with adjacent ordinary dialogue. Its displayed pre-playback manifest had speakers
L'AGENT / CHŒUR / LE JOUEUR / CHŒUR, source IDs line-1/4/6/9, and generated
component counts 1/3/1/3. Real AudioContext playback created two chorus contexts,
used eight synthetic synthesis responses, and completed all four IDs once.
The browser harness used the real parser/generator/session with synthetic WAVs;
the actual API route boundary was covered by automated tests. It was not a
production TTS test or an end-to-end deployed-app test. The temporary route and
its generated Next type stub were removed after validation.

The exact full production import and deployed audio still require the user's
human acceptance test. CP4.3 and Scene Partner were not started.

Final automated validation: all 246 tests passed (37 added; zero failures,
cancellations, skips or TODOs; 17763.8857ms). Typecheck passed. Standalone lint
was not run because the existing next lint command has no ESLint configuration
and would prompt for setup; no lint configuration was added. The production
build passed and its route list contains no temporary validation page. Existing
Browserslist-age and webpack-cache warnings were non-fatal.
