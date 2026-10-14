# Jouer un rôle — implementation CP1

Enable Jouer un rôle on a Theatre document, select a canonical character, and
choose Commencer la scène. The app performs the other items. At Votre tour,
speak the displayed canonical line and choose Continuer la scène. CP1 does not
record, analyze, score or synthesize the learner's line on demand.

## Ownership and boundaries

TheatrePlaybackController remains the only queue, cursor and advancement owner.
The role run binds canonical speaker, document ID/revision, Theatre session ID,
style, speed and generation. The immutable held-turn object is the Continue action
token; replaced/consumed tokens do nothing. Completion uses provenance learner.
The UI additionally ignores the second click of a pointer double-click.

Role choices come from canonical character items, in first-speaking order, with
reserved NARRATOR and chorus excluded. Selection is checked before requests and
again against the accepted, independently validated canonical scene.

The synchronous boundary in playItem runs before preparation or media construction,
including when an item's audio is already cached. The only lookahead change is
an eligibility check excluding learner items. Its six canonical positions are
unchanged; the window is not extended. The incremental loader, two-job limit,
promotion, deduplication, retry, caching and audio validation are unchanged.
No fake audio, hidden pending jobs, second cursor or filtered scene is introduced.
Director sees the complete scene. Narrator, chorus and semantic pauses retain their
normal paths. Continue calls the existing canonical advancement implementation.

## Lifecycle and UI

Changing mode/character stops the old scene. Choices are scoped to document and
revision; replacement documents do not inherit role mode. Existing document/unmount
cancellation remains authoritative. Role-mode style/speed changes stop the run and
require an explicit new Start. Ordinary Theatre speed/style behavior is unchanged.
The active role run counts as busy while held. Ambience retains the active-scene
behavior used by practice/paused Theatre. Microphone and feedback controls, and
out-of-order réplique practice, are unavailable in role mode for this checkpoint.
There is no score/recording requirement for Continue.

## Validation and limitations

Mocked 50-item integration scenes prove zero learner TTS, complete canonical order,
one existing scene analysis and bounded partner/chorus generation in both styles.
Tests cover the six-position window, first/final/consecutive holds, exact multiline
text, narrator, silence, chorus, stale actions, cached audio and page lifecycle.
No paid provider calls are made. Diagnostics add no dialogue/audio/credentials;
existing advancement events report the learner reason.

Human acceptance: import a scene with first/consecutive/final learner lines and a
narrator, [Silence.] and chorus; select the learner; verify every held line and
Continue transition. Try a double-click, switch character/style/speed and import a
new document. Disable role mode and confirm normal Theatre replay/practice remains
available. Browser audio/autoplay behavior still needs human acceptance.
Existing two-hour scene tickets and process-local Director cache limits remain.
Recording, pronunciation, model listening and own-recording playback are CP2 work.
