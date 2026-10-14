# Jouer un rôle CP1.1

Learner holds now invoke the existing prefetch after publishing the canonical held turn. The session and held-turn identity guard prevents synchronous stop/replacement from starting old preparation. Lookahead remains six canonical positions and preparation remains two active logical jobs; chorus components remain sequential within each job. Learner dialogue remains excluded, and advancement, priority promotion, deduplication, retry and caching are unchanged. This uses available learner thinking time; it cannot guarantee that slow provider audio is ready after rapid Continue.

## Failure diagnostics

The existing session-local preparation trace retains at most 1,024 events, with a dropped-event count. Existing fields are index, component (when known), session, attempt, phase and at. Failure events additionally carry failureCategory and, where available, an integer HTTP status from 100 to 599 as httpStatus. Categories: http_failure, rate_limited (429), ticket_expired (410), network_failure, malformed_response, validation_invalid, cancelled, stale and internal_failure. Internal failures cover local setup/validator exceptions without guessing provider causes. No exception message, text, token, body, credentials or URL is added. Diagnostics remain non-durable and use the existing Theatre debug export.

These categories diagnose the next failure; the cause of the prior production narrator failure remains unknown. User-facing errors and retry policy are unchanged.

## French guidance

The existing generic Theatre instruction boundary now asks for conventional French name pronunciation, with pronounced/silent final consonants and silent letters appropriate to the particular word. It expressly does not claim all final consonants are silent. Exact spoken input, voices, models, speed and Director context are unchanged. This is a defensive instruction experiment, not proof of perceptual pronunciation quality.

## Human acceptance

1. In La Dernière Table, select THOMAS in Jouer un rôle. Check the first and consecutive held turns, wait briefly, then use Continue both slowly and rapidly. Partner/narrator items should play in order; THOMAS dialogue must remain held without automatic audio.
2. Confirm the narrator direction “[Thomas prend une longue inspiration.]” remains eligible. Check semantic silence and chorus behavior. A slow request may still buffer; retry must preserve prepared components.
3. Listen to other characters saying “Thomas” and narrator directions containing the name in both Clarté and Naturel. Compare with ordinary Theatre. Authored questions must remain questions. Automated mocks cannot certify audible pronunciation.
4. Stop or replace the document/character while held/preparing; no old result should attach.
5. If preparation fails, export the existing local Theatre debug trace immediately. Inspect index/component/attempt, failureCategory and httpStatus without sharing scene tokens or credentials.

No CP2 recording, pronunciation-analysis integration, model listening, improvisation or SFX work is included.

## Automated validation

19 new mocked tests; 99 focused/related tests passed; full suite 788/788 (769 baseline); typecheck passed. Tests cover exact ordinary/role-play request equivalence in both styles, hold prefetch, six-position bounds, concurrency, pending-job promotion/joining, rapid Continue ordering, replacement/cancellation, diagnostic categories and privacy/bounds. Existing focused coverage also verifies chorus, semantic silence, component retry/cache preservation and audio validation. No paid provider calls were made.
`npm run build` also passed; its only warning was outdated Browserslist data. Privacy and diff reviews passed.
