# CP4-R.1 — Aya review

Baseline: fa11f325940d45ee3ed37e0669f8120a5d0a41b2. Existing CP4/CP4-R work preserved.

## Exact repair files
- lib/theatre-pass1-evidence.ts
- tests/theatre-pass1-evidence.test.cjs
- docs/nolan-two-pass-cp4-r1-review.md

Provider-only grammar now uses `^e_[0-9a-f]{64}_[0-9a-z]{1,3}$`, with unchanged length bounds 68–70. All eleven evidence sites share this static syntax. The schema parameter is retained for caller compatibility but is no longer used to encode request scope. Opaque IDs, scope generation, catalogue, resolver and CP1 code are unchanged. Exact Map membership, not regex acceptance, remains authoritative: foreign, stale and unknown IDs cannot resolve. JavaScript dollar-anchor edge cases are not security boundaries; exact membership also rejects any appended newline/whitespace. No normalization or repair was added.

Schema metrics for the retained 117-item request: bytes 8062 → 7490; nodes 91; objects 18; properties 73; arrays 17; enum sites 25; enum values 123; largest enum 26; depth 7, all unchanged. Pattern sites remain 12: eleven identical fixed reference patterns plus the unchanged fixed lexical-ID pattern. No request-specific regex remains.

Three new tests cover valid/malformed lexical shapes, identical schema across requests plus foreign/unknown same-shape membership rejection, and minimum schema instances with/without a citation. Existing exact-resolution/CP1, stale IDs, capitalization, speaker exclusion, duplicate and chronology tests remain. Focused tests: 111 passed, zero failures.

Privacy: no new logging, diagnostics, network operation or content propagation. Only provider grammar changed. No model/prompt/budget/timeout/casting/playback/TTS/authority/Pass-2/CP1 changes. Default remains MONOLITHIC. No live provider success claim.

HEAD/origin/main/remote verified at baseline. CP1.2B hashes unchanged and files remain untracked. Cumulative real calls remain 2 provider / 0 retries / 0 TTS. No activation, commit, push or deployment.

Final validation: full suite 1,250 passed / 0 failed / 0 skipped; focused 111 passed; typecheck passed; production build passed (existing stale Browserslist-data notice only). Privacy/diff/whitespace checks passed. Minimum exact-schema instances with and without a catalogue citation validated locally. No files staged. Local validation logs remain untracked alongside preserved prior CP4 artifacts. No provider calls were made during validation.
