> Historical repair-stage review. The later authorized Pass-2 control passed; final validation and closeout are recorded in [nolan-two-pass-cp3-review.md](nolan-two-pass-cp3-review.md). Earlier no-commit/Call-B-not-run statements below describe that earlier checkpoint.

# CP3 exact canonical character-reference repair — Aya review

Baseline remains `ce97e3b26ac344e4f692bc211215569989503e46`.
The existing uncommitted CP3 implementation is preserved. No commits, pushes, deployment, client cutover or TTS calls.

## Pre-edit audit

Classification: A = exact IDs constrained by schema; B = prompt guidance plus exact runtime validation; C = runtime-only identity constraint.

| Provider-output field | Before | Before-repair constraint | Repair |
|---|---|---|---|
| Pass 1 `director.relationships[].from` | B | Generic bounded string; prompt says distinct known characters; CP1 exact membership | Request-local canonical-ID enum |
| Pass 1 `director.relationships[].to` | B | Same | Request-local canonical-ID enum |
| Pass 1 `director.beats[].present[]` | B | Generic bounded strings; prompt says known present characters; CP1 exact membership | Request-local canonical-ID enum |
| Pass 1 `director.beats[].states[].speaker` | B | Generic bounded string; prompt says known present speaker; CP1 exact membership | Request-local canonical-ID enum |
| Pass 2 `performance.lines[].hearers[]` | B | Generic bounded strings; prompt says distinct known present characters excluding speaker; CP1 exact membership/presence | Request-local canonical-ID enum |
| Pass 2 `performance.lines[].addressee` | B | Nullable bounded string; prompt says null or a hearer; CP1 exact membership/presence | Canonical-ID enum plus null |

No character-reference output site was already schema-enumerated. Base annotations and Director lines identify their canonical item through `id` / `itemId`; speaker identity is derived from that item, not a separate model-owned speaker field. Evidence `itemId`, relationship `since` and beat `at` are canonical **item** references, not character identifiers, and are unchanged.

Pronunciation `entries[].id` is an independent lexical machine identifier. `name` and `aliases` are authored lexical names, not canonical character-ID fields. Pronunciation/cast coverage remains an existing runtime inventory cross-check; no new cast-link field was introduced. These fields and their schemas remain unchanged. Descriptive prose/evidence may mention names but does not establish character identity.

## Exact repair changes

- `lib/theatre-pass-provider.ts`: derives exact IDs from the same canonical character-role items CP1 uses; clones request schemas and constrains all six sites; adds a `canonicalCharacterIds` input list; appends explicit exact-copy instructions; validates responses against the actual request-specific schema.
- `tests/theatre-character-reference.test.cjs`: 11 focused reference/ownership tests.
- `two-pass-cp3-control.cjs`: disposable harness checks the actual emitted request schema rather than the reusable unconstrained base schema.
- This report. Existing CP3 orchestration and historical failure report remain intact.

The prompt explicitly says IDs are opaque, application-owned, case-sensitive identifiers; copy only the supplied IDs exactly and never translate, normalize, title-case, lowercase, uppercase, abbreviate, respell or invent them. It explicitly separates IDs from spoken/display names and pronunciation lexical identities.

Empty casts use zero-entry constraints on relationships, presence/state arrays and character lines rather than an invalid empty enum. Nullable addressee remains null-capable. No character reference can appear in an accepted empty-cast output. Reusable schema objects are not mutated.

No ID normalization, fuzzy matching, alias substitution or post-generation repair was added. CP1 exact validation remains unchanged. A casing mutation rejected by the new schema is independently still rejected by CP1 when tested directly. The captured failure shape still yields `unknown_character` at the existing relationship path.

The current parser emits uppercase canonical IDs. Uppercasing an already exact ID is therefore valid, not a malformed variant. Tests reject lowercase/title-case/unknown variants at every actual reference site, and separately prove an uppercase transformation of a mixed-case opaque enum identifier is rejected.

## Validation before the replacement control

- New exact-reference tests: **11 passed**.
- Existing CP3 mocked integration suite: **35 passed**.
- CP1 + CP2 focused suites: **122 passed**.
- Combined focused run including relevant Director/pronunciation suites: **250 passed**, zero failures/skips.
- Full regression: **1,185 passed**, zero failures/skips.
- Typecheck: passed.
- Production build: passed; existing route list unchanged.
- Privacy review and whitespace/diff checks: passed. New IDs exist only in private provider inputs/schema, never recorder events.
- No pre-existing tracked file differs from baseline: CP1, CP2, existing monolithic route/provider, timeout (60,000 ms), retries (0), lexical identity rules, tickets and playback are unchanged.
- Three CP1.2B file hashes match their pre-repair values; all remain untracked.

## Replacement Call A — accepted

Deterministic preflight using the retained failed control's canonical fixture confirms:

| Field | Replacement request |
|---|---:|
| Canonical items | 3 |
| Original input bytes with new ID list removed | 400 |
| New input bytes | 441 |
| Reusable base schema bytes, unchanged | 8,520 |
| Bound request schema bytes | 8,616 |
| Instruction bytes | 6,974 |
| Requested output allowance, unchanged | 5,408 |
| Pronunciation schema comparison | Identical |

Model, fixture, original instruction text, generation configuration and timeout/retry settings are unchanged. The only request changes are the authorized exact-reference list, enum constraints and appended reference instructions.

The initial evidence-directory permission denial was subsequently identified by the owner as accidental. After renewed permission, exactly one replacement Call A ran on the same fabricated fixture. No implementation changes were made after the control.

| Live evidence | Result |
|---|---|
| HTTP / SDK | 200 / resolved |
| Status / incomplete reason | completed / absent |
| Provider elapsed | 7,432 ms |
| Requested / echoed allowance | 5,408 / 5,408 |
| Input / output / reasoning / total tokens | 2,620 / 1,182 / 0 / 3,802 |
| Usage field states | all valid |
| Output characters | 4,519 |
| Output items / text parts / refusals | 1 / 1 / 0 |
| JSON / exact request schema | passed / passed |
| CP1 ProductionDirection validation | passed |
| Pronunciation validation and authority | accepted, ready without clarification |
| Preparation state / terminal reason | PASS1_READY / none |
| Classification | ACCEPTED |

Private fabricated evidence is retained outside the repository at
`C:\Users\Kwesi\AppData\Local\Temp\nolan-cp3-reference-repair-46ebd5ce-ed5e-4a73-a961-0a0364383309`.
Safe reports and lifecycle records are separate from private generated/continuation data. No credentials, scene tokens or raw generated prose are included in this report.

- Provider calls for this repair: **1**; retries: **0**.
- Cumulative CP3 provider calls: **2** (original failed Call A plus accepted replacement Call A).
- Call B: **not made**.
- TTS calls: **0**.

## Repository and remaining issue

HEAD remains the frozen baseline. The tracked tree is unchanged; the complete CP3 implementation, repair, tests, reports and disposable validation files remain untracked. Nothing was reverted, discarded, staged, committed or pushed.

The exact-reference repair passed the fabricated replacement control through pronunciation-authority readiness. This does not establish production-scale performance, audible pronunciation or Pass-2 live acceptance. Call B remains unperformed. Per the repair checkpoint, work stops for Aya review without commit/push, even though replacement Call A succeeded.
