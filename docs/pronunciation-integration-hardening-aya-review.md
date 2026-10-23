# Live pronunciation integration hardening — Aya review

Baseline: `b942af6b1b3b287c531ac0657cd5bb04bcc3ca22`.

Implementation is local and uncommitted. No paid Director/TTS calls, deployment,
provider/model changes, or CP1.2B promotion. The precise historical live trigger
remains unproven; the reproduced integration defect is the repair target.

## Changes

### One lexical-ID contract

`lib/theatre-pronunciation.ts` defines a single machine-ID pattern, reused by
the Structured Output schema, prompt and runtime validator. IDs contain 1–80
ASCII letters, digits, underscores or hyphens. The end assertion also rejects
trailing line terminators. Authored Unicode names, aliases and evidence are
separate fields; their spelling is not rewritten. Existing name matching and
accepted pronunciation targets are unchanged.

The prompt also distinguishes complete **inventory coverage** from certainty
about an inventoried name. A genuinely uncertain name belongs in a complete
inventory with an uncertain resolution; it does not imply a technical failure.

Official documentation supports string `pattern` in Structured Outputs:
[Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
This checkpoint does not test the schema against the live provider.

### Technical failures cannot become name clarification

`lib/theatre-direction.ts` records pronunciation inspection separately from
base dramatic analysis. Each entry is checked independently; structurally valid,
source-linked entries survive internally when another entry fails. No partial
inventory is accepted. Valid inspections do not add redundant copies of the
inventory to sealed tickets. Invalid base dramatic annotations still invalidate
preparation, even when the pronunciation sibling is valid.

`lib/theatre-pronunciation-authority.ts` gates authority construction on a
successful inspection and trusted coverage. Missing spoken cast entries,
explicitly incomplete inventories, unbound entries and malformed established
decisions fail preparation. These failures do not manufacture uncertain cast
entries for owner approval. Genuine unknown/ambiguous/conflicting entries and
entity-overlap clarification retain the accepted ambiguity policy. Empty complete
inventories and supported conventional names still accept automatically.

`app/api/read-passage/route.ts` returns HTTP 503 with:

```json
{"code":"THEATRE_ANALYSIS_FAILED","reason":"output_missing","retryable":true,"error":"…"}
```

No clarification entries, playable manifest, pronunciation token or scene token
are returned on this path. Safe reason values are:

- `provider_failure`
- `timeout`
- `output_missing`
- `validation_rejected`
- `evidence_mismatch`
- `inventory_incomplete`
- `invalid_dramatic_analysis`

Successful semantic clarification responses carry `reason: linguistic_ambiguity`.
Previously sealed pending drafts also pass through the technical gate before an
owner answer can be accepted. Already accepted immutable authorities retain their
identity and digest.

### Recovery and compatibility

`lib/reading-playback.ts` shows a preparation/analysis failure, releases busy state,
clears failed analysis reuse references and pending pronunciation state, and
prevents the owner-answer error handler from resurrecting a technical-failure
form. Use the existing start/reading control to retry explicitly. There is no
automatic provider retry loop. Existing request-gate cleanup remains unchanged.

`lib/theatre-generation.ts` increments the pronunciation analysis-cache scope to
3, preventing reuse of pre-hardening analysis references. Accepted scene-ticket
authority reuse remains intact across style/speed changes and workers.

## Regression coverage

`tests/pronunciation-integration-hardening.test.cjs` covers:

- accented and punctuated names with independent ASCII machine IDs;
- identical schema/prompt/runtime ID rules, including invalid and trailing-newline IDs;
- the exact synthetic ÉLISE/THOMAS/NADIA/JULIEN failure scenario;
- malformed ID, missing output, provider error/timeout and real local deadline;
- evidence mismatch, incomplete coverage and known-cast omission;
- valid pronunciation paired with invalid dramatic annotations;
- retained valid entries beside a technically rejected entry;
- technical failure responses containing no ordinary clarification or playable ticket;
- explicit retry recovery and client busy-state release;
- automatic French Thomas and clarification limited to a genuinely ambiguous name;
- rejection of an old technical-fallback ticket and no restoration of its form.

Existing authority/policy tests now expect technical failure instead of fallback
manual review. Older route/playback mocks explicitly provide successful inventory
output; they no longer depend on absent/failed analysis being converted into an
owner form. Failed whole-analysis route tests now assert zero synthesis and a
recoverable error. Existing low-level dramatic fallback tests remain intact.

## Validation

- Focused Theatre/Director/authority/playback/role-play/CP2 tests: **227 passed**.
- Final complete `npm test`: **906 passed**, zero failures/skips/cancellations
  (888 starting tests plus 18 new tests). This includes six pre-existing untracked
  CP1.2B mocked tests; those files were not changed or promoted.
- `npm run typecheck`: passed.
- `npm run build`: passed, exit 0. The existing outdated Browserslist-data warning
  remains; no dependency update was made.
- Privacy/source diff review and `git diff --check`: passed.
- Branch remains `main`, HEAD remains the baseline above, and nothing is staged.

The initial sandbox test run could not rename temporary experiment fixture files;
the final complete mocked run used normal temporary-file access. A sandbox
typecheck file-access error was also resolved by rerunning with normal access.

Changed production files: `app/api/read-passage/route.ts`,
`lib/reading-playback.ts`, `lib/theatre-direction.ts`,
`lib/theatre-generation.ts`, `lib/theatre-pronunciation-authority.ts`,
`lib/theatre-pronunciation.ts`.

Updated tests/fixtures: `tests/acceptance-cp4-4-1.test.cjs`,
`tests/chorus-routing-pipeline.test.cjs`, `tests/content-routes.test.cjs`,
`tests/director-integration.test.cjs`, `tests/document-language-cp4-5-1.test.cjs`,
`tests/dramatic-route.test.cjs`, `tests/incremental-fixtures.cjs`,
`tests/performance-cp4-4-2.test.cjs`, `tests/pronunciation-review-fixture.cjs`,
`tests/read-passage.test.cjs`, `tests/theatre-pronunciation-ambiguity.test.cjs`,
`tests/theatre-pronunciation-authority.test.cjs`.
New files: `tests/pronunciation-integration-hardening.test.cjs` and this report.

## Privacy and preserved boundaries

Failure responses expose only fixed reason/code/message/retryability fields.
They contain no names, dialogue, targets, credentials, or encrypted tickets.
Inspect the failed `/api/read-passage` response in DevTools Network and retain only
HTTP status, `code`, `reason`, and `retryable` for a future failure report. This
requires no repeat playback or paid call. No new logging or public telemetry
endpoint was introduced. Existing bounded process-local storage is not durable.

Scheduler, concurrency, lookahead, advancement, audio sequencing, CP2 held-turn
behavior, casting, speech model, question guards, French language authority, and
canonical TTS text are unchanged. Existing tests verify actor/narrator/chorus and
role-play propagation, replay, cache identity, style/speed and source revision.
The three pre-existing untracked CP1.2B experiment files remain untouched.

## Limits and next human acceptance

- Mocked validation proves application contracts and recovery, not actual model
  compliance, historical causation or audible pronunciation.
- Inventory completeness still relies on the model declaration plus the existing
  deterministic spoken-cast cross-check; arbitrary omitted non-cast names cannot
  be proven absent without a separate linguistic analysis.
- Partial valid entries are retained internally, not promoted to a playable
  production or silently merged into a later model attempt. Retry may analyze the
  scene again; automatic synthesis never proceeds after a technical failure.
- Provider variability in audible proper-name pronunciation is unchanged.
- No deployment is authorized here. After review and separately authorized release,
  verify that the ordinary French scene proceeds without a name form; a genuine
  ambiguous name requests only its own decision; and a technical failure displays
  the preparation error with a safe reason and recovers on explicit retry.

Proposed commit message: `Theatre: harden pronunciation analysis integration`
