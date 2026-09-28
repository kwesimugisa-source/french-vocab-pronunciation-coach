# Theatre linguistic hardening and objective audio validation

Session 7 demonstrated no queue omission. This change leaves the scheduler,
concurrency (2), lookahead (6), ordering and playback controller unchanged.

Theatre-only instructions now use concise French pronunciation authority for
short dialogue and all spoken narration, and preserve local question semantics
where question punctuation occurs. Canonical input, casting, model, speed and
Director interpretation are unchanged. Shared ordinary-reading guidance is unchanged.

New component responses are decoded in an isolated OfflineAudioContext before
being cached/prepared. No output is connected and rendering/playback never starts.
Decoded data is scanned once and then released; this adds local decode/scan work
(and chorus may decode again for playback), not provider calls or persistent storage.
Only undecodable supported audio, absent frames/positive finite duration,
non-finite samples or entirely zero samples are rejected. There is no minimum
length, loudness threshold or speech recognition. Quiet nonzero audio is valid.

Absent APIs/codec support, context construction failure and non-EncodingError
browser decoder failures report validation_unavailable and retain prior behavior.
EncodingError reports validation_invalid and uses the existing component retry
path. Successfully cached components survive. Cancellation is checked after
asynchronous decoding, before any cache assignment. Native decoding itself is not
abortable; late results are discarded. No scheduler code is changed.

Bounded preparation diagnostics add validation_valid, validation_invalid or
validation_unavailable with the existing session/item/component/attempt identity.
They contain no samples, dialogue, credentials or scene tokens.

Automated tests use mocked provider responses and decoder fixtures; no paid calls.
These tests prove request instructions and validation decisions, not perceptual
French pronunciation, spoken-word completeness or cross-browser codec behavior.
A valid nonzero clip can still omit words, use the wrong pronunciation, or contain
quiet noise. Browser acceptance should confirm valid MP3 decode, unsupported
fallback, quiet/short audio acceptance and failed-component retry. Later human
acceptance should compare short names, narration and questions in both styles;
never treat completion counters as proof that every word was audible.
