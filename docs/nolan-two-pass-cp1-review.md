# Nolan two-pass CP1 review

Baseline: `bf12fd1baf0239673e811a538c88cb29d54d430e`.

This checkpoint adds an isolated deterministic foundation. No existing production
source is edited and no live consumer imports the new module. It does not address
the live timeout by changing execution, and makes no performance or audible-quality
claim. Provider, protocol, cache, ticket and client integration remain future work.

## Files

- `lib/theatre-two-pass.ts`: contracts, application-owned bindings, validation,
  temporal context projection and pure compatibility composition.
- `tests/theatre-two-pass.test.cjs`: 80 deterministic tests, with a provider mock
  that throws if constructed.
- This review document.

## Ownership and API

`createCanonicalPreparation()` derives exact canonical items and application-owned
casting from source, identity metadata and delivery style. Its source digest uses
the existing pronunciation source-digest function. Its separate canonical digest
binds items, character metadata and casting. Revalidation reconstructs this state
and rejects edited source, document/revision scope or casting.

`ProductionDirectionData` owns the existing scene summaries, global Director
setting/relationships/beats, ambience and pronunciation proposal. Production
language remains in the existing pronunciation context. There are no speculative
artistic fields, line annotations, casting or accepted authority in this payload.

`PerformanceDirectionData` owns only version, base item annotations and character
delivery lines. Additional fields are rejected; an explicit lexical-gap field
returns a closed failure rather than mutating the pronunciation inventory.

`acceptProductionDirection()` and `acceptPerformanceDirection()` validate payloads,
create application-owned bindings and return frozen copies. Revision is an explicit
application argument, not a model field. `validateProductionDirection()` and
`validatePerformanceDirection()` recheck payloads, versions and bindings.

`AcceptedPronunciationMap` preserves the existing `PronunciationAuthority` type.
The composer verifies READY acceptance, production/source identity, language,
revision, legacy authority digest and exact canonical occurrences. Automatically
accepted entries must still equal the validated Pass-1 decisions; only unresolved
entries can use the existing owner-confirmed resolution semantics.

`composeTheatrePlan()` returns the existing TheatrePlan shape:

| Output | Owner |
| --- | --- |
| items / casting / style | canonical application preparation |
| analysis.scene / ambience | Pass 1 |
| analysis.director.setting / relationships / beats | Pass 1 |
| analysis.director.lines | Pass 2 |
| analysis.items | Pass 2 |
| pronunciation | accepted authority |

The analysis retains Pass-1 pronunciation proposal provenance; it is not a second
accepted authority. The existing speech compiler continues to consume the accepted
map. The optional analysis cache reference remains undefined: the pure composer
does not write a cache. Existing Director status metadata is derived for
Clarté/Naturel. Independent existing dramatic and Director validators check the
composed analysis before it is returned.

## Binding and rejection model

Bindings include kind, production identity, source/canonical digests, document and
revision scope, artifact revision, contract/schema/policy versions and artifact
digest. Pass 2 additionally binds the exact Pass-1 and pronunciation digests and
revisions. JSON object keys are sorted deterministically; arrays retain meaningful
order. SHA-256 is domain-separated by artifact kind. Legacy authority hashing is
unchanged. These hashes provide integrity/lineage checking, not authentication;
future encrypted transport must establish artifact authenticity.

Payloads cannot supply binding/digest/revision ownership fields. Accepted artifacts
are copied and frozen. Model-echoed bindings are never promoted into acceptance.

Rejections contain only stage, closed reason, fixed expected/actual structural
categories, internally constructed structural path and optional numeric indices.
They contain no authored text, names, source digests, pronunciation targets, raw
exceptions or model output. Accessors/custom serialization are rejected before
artifact inspection. There is no logging, network, provider invocation or recorder
extension in this module.

Reason families cover malformed structure, ownership, canonical references,
characters, duplicate/missing coverage, role eligibility, evidence linkage,
chronology, presence/listeners, upstream/source mismatch, authority, inventory,
ambience and independent legacy compatibility rejection. None produces a
pronunciation clarification response.

## Chronology and exact existing semantics

- Relationship evidence cannot occur after its `since` anchor.
- Beat event and presence evidence cannot occur after `at`.
- State evidence cannot occur after its beat; at least one citation must be newer
  than the immediately previous beat, not merely newer than that character's last
  state update. This intentionally matches the existing implementation.
- Beat anchors strictly increase.
- Character-line evidence cannot occur after that line.
- Non-default projection needs at least one strictly earlier citation.
- Effective relationships/states are derived through the existing
  `directorDelivery()` projection and cannot be supplied by Pass 2.
- Listener/addressee and speaker presence match the existing rules. When no prior
  beat exists, the existing validator allows a speaker with no listeners; it does
  not invent presence. Where a beat exists, its snapshot governs presence.
- Whole-production setting evidence may come from anywhere in the production.
  No artificial early-anchor rule was added.
- Relationships normalize by `since`, as in the existing validator, before
  downstream effective-context lookup.

The two retained Stage 10B failures are represented by minimized deterministic
fixtures: relationship evidence element 1 points to canonical index 2 from anchor
1, and beat-presence evidence element 1 does the same. No generated diagnostic
prose or retained output files are promoted into the repository.

Pronunciation ambiguity may remain in a validated Pass-1 proposal. It cannot
compose until the existing authority is READY. Ambience uses the existing safe
no-ambience interpretation and validates evidence and non-none acceptance without
altering the live ambience classifier.

## Compatibility and validation

The tests prove exact legacy plan keys, item/casting preservation, canonical order,
immutable composition, matching legacy TTS instruction strings, Clarté/Naturel
metadata, narrator/chorus/silence preservation, accepted owner resolution, lineage
rejection and content-free diagnostics. Legacy consumers are also checked for the
absence of imports of the new module.

Validation completed:

- New isolated tests: **80 passed**.
- Focused two-pass, timeout, Director, pronunciation and recorder suites:
  **350 passed**, zero failures/skips.
- Full regression: **1,097 passed**, zero failures/skips (baseline 1,017).
- Typecheck: passed.
- Production build: passed.
- Existing production-source diff against baseline: empty.
- Privacy review: no authored data in rejection diagnostics; no logger/network/
  environment access in the new module; acceptance digests remain private data.
- CP1.2B content hashes remain identical to their pre-checkpoint values.

The first sandboxed typecheck reported its existing tsconfig unreadable even
though the file was present and unchanged. Typecheck passed with normal filesystem
access; final validation ran after the full suite to avoid temporary-file fixture
contention. No production source repair was needed.

No provider/TTS calls, live Theatre run, configuration change or CP1.2B modification
is part of CP1. The existing 60-second full-analysis timeout, zero retries,
monolithic schema/prompt/request, optional legacy Director fallback, cache,
ticket, recorder and playback implementation remain unchanged.

## Scope limits

This module is server-side deterministic infrastructure, not a new public endpoint
or a READY ticket protocol. Required two-pass failures are strict only inside its
new acceptance/composition API. The live optional Director fallback is untouched.
No new model-facing schemas, prompts, feature flags, auto-retries, cache policies,
Notebook UI or orchestration have been added.
