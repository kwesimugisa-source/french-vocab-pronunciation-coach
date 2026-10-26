# Nolan two-pass CP2 review

Baseline: `b2aee2b8d58cdaa20c3c32e2dc6370f00f29c1f8` (accepted CP1).

## Scope

Application protocol only. No provider builders, new endpoints, client cutover, real provider/TTS calls, or manual deployment. CP1 contracts and pure composer are unchanged. The current monolithic preparation request remains production behavior.

Changed/new files:

- `lib/theatre-preparation-protocol.ts`: validated immutable lifecycle and continuation operations.
- `lib/theatre-preparation-token.ts`: authenticated continuation and new READY transport.
- `lib/theatre-preparation-cache.ts`: independent bounded stage caches.
- `lib/theatre-scene-ticket.ts`: explicit new-ticket dispatch, retaining legacy encoding/decoding.
- `lib/beta-events.ts`: closed two-pass metadata/stages and intermediate dispositions.
- `lib/beta-server.ts`: optional lineage and two-pass terminal semantics in the existing recorder.
- `tests/theatre-preparation-protocol.test.cjs`: state, continuation, token, cache, binding and actual mocked clip-route authorization tests.
- `tests/theatre-two-pass-recorder.test.cjs`: lifecycle, correlation, privacy and bounds tests.
- `tests/two-pass-protocol-fixtures.cjs`: fabricated deterministic fixture adapted from CP1.
- This review document.

## Lifecycle

| State | Allowed next states |
|---|---|
| PASS1_PENDING | PASS1_TECHNICAL_HOLD, CLARIFICATION_REQUIRED, PASS1_READY, CANCELLED |
| PASS1_TECHNICAL_HOLD | PASS1_PENDING (explicit new attempt), CANCELLED |
| CLARIFICATION_REQUIRED | PASS1_READY (valid owner answers), CANCELLED |
| PASS1_READY | PASS2_PENDING, CANCELLED |
| PASS2_PENDING | PASS2_TECHNICAL_HOLD, PASS2_READY, CANCELLED |
| PASS2_TECHNICAL_HOLD | PASS2_PENDING (explicit new attempt), CANCELLED |
| PASS2_READY | READY (successful CP1 composition), CANCELLED |
| READY / CANCELLED | None |

Every operation validates its incoming snapshot and its resulting state. A Pass-1 hold cannot become clarification through an acceptance operation. An explicit retry must first create a new pending attempt. Partial states require the appropriate upstream artifacts and reject impermissible downstream artifacts. READY requires successful deterministic composition; it is terminal.

Clarification reuses the existing ambiguity-only policy and owner-answer validator. The protocol rebinds the legacy authority helper's freshly allocated identity to the already-established production identity and recomputes its existing digest format; it does not change CP1 or linguistic policy. Established entries cannot be answered again or overwritten. Clarification advances authority revision, request ID and epoch; dependent performance remains absent. The accepted Pass-1 artifact is retained exactly.

Pass-2 retry retains exact accepted Pass 1 and authority, changes request ID and increments epoch, and clears downstream performance. There is no automatic retry or provider invocation.

## Transport and authorization

Preparation token: `preparation-v1.<base64url ciphertext>`; envelope version 1, purpose `preparation-v1`.

New READY ticket: `ready-v3.<base64url ciphertext>`; envelope version 3, purpose `ready-v3`.

Both use AES-256-GCM with distinct purpose-derived keys and AAD. Purpose prefixes are only dispatch hints; cryptographic authentication enforces separation. Both retain the existing two-hour lifetime, 1,000,000-byte uncompressed payload bound and 450,000-character token bound. Decompression is bounded. Oversize continuation fails explicitly with `PREPARATION_TOO_LARGE`.

The envelope contains issued/expiry timestamps, language, preparation state, opaque preparation ID/epoch/request ID, protocol/contract/schema/policy/prompt/model versions, exact canonical source/scope, accepted artifacts and authority where state permits. READY additionally binds speed. Source text is stored once; canonical items, casting and canonical/source digests are reconstructed on open and checked against the artifact bindings. Accepted evidence/decisions remain encrypted transport content, never diagnostic data.

`openPreparation()` requires an expected current canonical scope, lineage ID and epoch supplied by the future orchestrator. Wrong source, document/revision, lineage, epoch, purpose, version, authentication or expiry fails closed. Cache absence does not prevent continuation within payload bounds.

`openScene()` explicitly dispatches only `ready-v3.` to the new verifier. Legacy version-2 tickets retain their existing key, AAD, format, sealing and acceptance path. No legacy ticket is reinterpreted as two-pass. There is no production caller of the new sealer.

The new READY verifier reconstructs canonical state, validates Pass-1 and Pass-2 bindings, validates accepted authority and its provenance, and recomposes the final plan. It never trusts a serialized pre-composed plan. `/api/theatre-clip` itself is unchanged and still checks pronunciation authority before synthesis.

Mocked route tests prove that pending, clarification, Pass-1-ready, Pass-2-pending/hold and Pass-2-ready preparation tokens cannot reach synthesis. An authenticated READY wrapper around a partial state is also rejected. Only a valid composed READY ticket reaches the mocked existing synthesis boundary. Wrong upstream/authority/source bindings fail before synthesis.

## Caches

Two maps, each capped at 16 entries, with a 30-minute TTL and a 1,000,000-byte per-artifact ceiling. Values are cloned on write/read and revalidated on hits. Pass-1 cache acceptance also runs the authority policy: a technically invalid established decision cannot be retained merely because structural CP1 validation passed; genuine ambiguity remains cacheable. This is process-local memory, not distributed or durable storage.

Pass-1 key includes the exact canonical/source/document scope, production identity, character metadata/casting, accepted ambience input, upstream contract/policy versions and Pass-1 model/prompt/schema/policy versions. No lossy normalization occurs.

Pass-2 key includes that upstream key plus exact Pass-1 digest/revision, authority digest/revision and Pass-2 model/prompt/schema/policy versions. Pass-2-only version changes do not alter the Pass-1 key. Pass-2 failure does not delete accepted Pass 1. Invalid artifacts cannot enter either cache. Private cache hashes never enter recorder events.

## Existing recorder extension

New closed stages: `pass1_provider`, `pass1_structured_response`, `pass1_validation`, `pass1_accepted`, `pass2_provider`, `pass2_structured_response`, `pass2_validation`, `composition`, `ticket`. Existing pronunciation, inventory, occurrence/evidence, authority and provider-evidence stages are reused.

Optional `lineage` contains only:

- `preparationId`: opaque UUIDv4, shared across attempts;
- `epoch`: integer 1–10,000;
- `pass`: closed `pass1` / `pass2` enum.

Each attempt retains its own existing UUID request ID. Lineage is snapshotted so caller mutation cannot cross-correlate records.

Optional separate `checkpoint` metadata contains bounded integers 0–10,000: `contract`, `prompt`, `schema`, `policy`, `pass1Revision`, `pass2Revision`. It requires lineage and cannot share a record with provider boundary evidence. It is not accumulated into the terminal receipt. Existing bounded authority revision, counts, timings and provider token-presence evidence remain available.

Intermediate successful dispositions `PASS1_READY` and `PASS2_READY` are distinct from playable `READY`. A two-pass attempt without an accepted stage cannot silently finish as READY. A passed ticket boundary is required for final READY reporting. First blocking cause is retained; technical rejection cannot become clarification, even with an inconsistent success HTTP status. Timeout/cancellation and one late provider settlement remain bounded. Legacy recorder behavior without lineage is preserved.

Existing limits remain: 1,024 characters/event; 62 intermediate records plus one terminal and at most one ignored late result; 1,000-record process journal; 30-minute journal expiry. Immediate hosting-log emission remains the existing sink. Logging failure cannot change preparation outcome. Hosting retention is unchanged and is not claimed to be newly verified by this checkpoint.

## Privacy and compatibility

Recorder contracts reject free-form fields, dialogue, names, targets, evidence, output, prompts and source/artifact digests. Only closed enums, bounded numerical metadata and opaque correlation UUIDs are added. No new public diagnostic endpoint or telemetry subsystem exists. Encrypted tokens are sensitive continuation capabilities and must not be logged.

No changes to the provider request construction, model, prompts, schemas, token allowance, 60,000-ms full Nolan timeout, zero SDK retries, pronunciation policy, existing cache, `/api/read-passage`, clip synthesis code, client playback, role-play or CP2 recording behavior. CP1 composer remains unchanged. Legacy-ticket coexistence and existing regression tests verify compatibility.

## Validation

- Final focused CP1 + CP2 suite: **122 passed**, zero failures/skips (80 CP1 + 42 new protocol/recorder tests).
- Final full regression: **1,139 passed**, zero failures/skips, against the 1,097-test CP1 baseline.
- Typecheck: passed (`tsc --noEmit --incremental false`).
- Production build: passed; route list unchanged and no split preparation endpoint introduced.
- Privacy review and `git diff --check`: passed.
- Maximal correlated provider-boundary fixtures: scene 672, usage 740, output 760, configuration 599 characters. Fully populated terminal fixture: 818 characters. All validated under the unchanged 1,024-character limit.
- Saturation test: exactly 64 records including one terminal and one late result. Journal tests retain the 1,000-record / 30-minute limits.
- Original full-suite/build attempts encountered sandbox `EPERM` on temporary fixture renames / `.next` directory creation. Reruns outside the sandbox passed; no fixture, source or dependency workaround was introduced for these environmental restrictions. Existing Browserslist age warning was not addressed outside scope.
- Git comparison confirms unchanged CP1 composer, provider construction, preparation route, legacy cache, clip synthesis route, client playback and scheduler. Full Nolan timeout remains 60,000 ms and retries remain zero.
- The three CP1.2B file hashes remain unchanged and the files remain untracked.
- **Real provider calls: 0. Real TTS calls: 0.** Audio authorization tests use mocked synthesis only. No manual deployment.

## Boundaries for the next checkpoint

No split request builders, routes or client orchestration are enabled. Consequently this checkpoint does not claim to fix live monolithic timeouts or demonstrate live two-pass performance. Future orchestration must supply the current expected lineage/epoch/source rather than blindly trust values extracted from an old token, and reject stale client responses. Stateless encrypted tokens do not provide distributed revocation, one-use consumption or durable cancellation. No such infrastructure is introduced here.

The three pre-existing CP1.2B files remain untracked, unmodified and excluded from the commit. No pronunciation experiment is promoted.
