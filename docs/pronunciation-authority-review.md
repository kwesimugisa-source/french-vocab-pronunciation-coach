# Accepted production pronunciation authority — updated Aya review

## Outcome and boundaries

The mandatory owner-review policy has been replaced with an **ambiguity-only clarification gate**. An established Director interpretation is accepted automatically; a complete empty inventory also proceeds automatically. The presence of a proper name alone does not trigger the form.

Working baseline remains `7503044dca808bde1d99b3fa7a5b1fd475f23a86` on `main`. All implementation changes remain uncommitted. No push, deployment, paid Director call or paid TTS call was made. The rejected CP1.2B experiment remains untouched and unpromoted.

This checkpoint establishes application decisions and consistent request metadata. It does **not** establish audible pronunciation success or prove the Director's linguistic judgments correct.

## Revised decision policy

The existing single whole-scene analysis call returns a separate structured pronunciation interpretation:

- Production language inferred from the complete authored play, plus inventory completeness.
- Stable lexical identity, aliases, classification, intended language, non-spoken target and exact source excerpts.
- Per-name resolution: established / ambiguous / conflicting / unknown, supporting basis, local dialogue language and bounded rationale.

The prompt considers document-language hints, actual production and surrounding dialogue language, character identity, conventional pronunciation, explicit declarations and established foreign identity together. An isolated name inherits supported surrounding context; its spelling, punctuation or capitalization does not itself establish a language switch. The Director must report uncertainty when materially plausible alternatives remain.

The server automatically accepts a name only when:

1. Its resolution is `established`, with a nonempty target, valid language and source-linked evidence/rationale.
2. Its classification and basis agree. Conventional readings require the intended language to match the supported local dialogue language. Declared readings require authored evidence; preserved foreign readings require authored or established-identity evidence.
3. It binds to actual spoken source occurrences without overlapping distinct lexical identities.

This is a validated semantic decision contract, not an independent linguistic verifier. Source quotes are checked against canonical items; the model remains responsible for interpreting their meaning correctly.

A complete inventory whose entries all satisfy these conditions becomes ready automatically. A complete empty inventory becomes ready automatically, including in a mixed-language play.

## Clarification is exceptional and scoped

- Unknown/invented readings, ambiguity, conflicting evidence or unresolved lexical identity remain held. No TTS/prefetch starts for the scene until required decisions are resolved.
- The clarification response contains **only unresolved entries**. Established entries remain inside the sealed draft; the client cannot overwrite or exclude them through an unrelated clarification answer.
- Overlapping entities do not force review of unrelated established names.
- Missing, malformed or incomplete analysis is an explicit failure/incompleteness path, not permission to infer names or pronunciation from absent output. Already established decisions remain retained where valid; the owner can complete the missing inventory. A valid empty inventory is distinct from missing analysis.
- The form is labelled **Prononciation à clarifier**. It asks for the outstanding decisions, supports correction/exclusion and missing names, and merges the answer with established decisions without another analysis call.
- Invalid answers, cancellation, replacement and stale responses retain their existing safeguards. A policy-version mismatch requires explicit restart rather than silently reusing old policy authority.

## Required examples covered by mocked route tests

| Context | Accepted result | Owner form |
|---|---|---|
| French play and French dialogue, `Thomas` | Conventional French reading | Absent |
| English play and English dialogue, `Thomas` | Conventional English reading | Absent |
| Clear English dialogue within a French play, `Thomas` | Context-supported English reading | Absent |
| Mother explicitly chose an English name/pronunciation | Authored English reading | Absent |
| Established foreign identity, `James Joyce` in French dialogue | Intended foreign reading retained | Absent |
| Invented/unestablished name | Unresolved | Shown only for that decision |
| Materially ambiguous or conflicting evidence | Unresolved | Shown only for those decisions |
| Complete empty inventory | Ready, no lexical entries | Absent |

The first five cases run in both Clarté and Naturel. Additional generic-name fixtures (`Camille`, `Émile`, `Alice`, `Paul`) exercise the same policy. No production code contains a Thomas-specific branch or lexical entry.

Theatre's observed production context is retained on the authority. An established English play uses English production guidance in the Theatre adapter; accepted foreign/local name readings take precedence for their mapped occurrences. Shared app document-language metadata and ordinary-reading behavior remain unchanged: this is not a new app-wide English document mode.

## Architecture preserved

- Immutable, frozen accepted map with source/revision binding, production identity, digest, entries and exact canonical occurrence spans.
- Policy version **2**, with `director-established` versus `owner-confirmed` provenance and retained automatic-entry IDs. Policy/cache versioning prevents accidental reuse of the previous mandatory-review policy.
- Authenticated encrypted version-2 tickets; no worker affinity or new infrastructure.
- Same accepted authority for every actor, narrator, chorus component, role-play partner and explicit learner model listening.
- Exact authored TTS input; fixed casting, voice/model/speed, interrogative protection and the 3,800-character instruction budget.
- Required pronunciation guidance cannot be silently truncated to fit a request. Invalid oversized mandatory instructions fail before TTS.
- Component/manifest digest compatibility before caching; cached replay reuses the existing bytes. Style/speed changes retain the accepted decision without reanalysis.
- No changes to the six-position/two-request scheduler, queue, advancement, learner ownership or CP2 recording/feedback behavior.
- Legacy authority-bearing generation continues to use the shared adapter and reject missing required authority. The non-public older fixture compatibility path remains.

## Validation

**Final results: 209 focused tests passed; 888 full-suite tests passed; zero failures. Typecheck, production build, privacy review and `git diff --check` passed.** The full total is 840 committed-baseline tests + 6 pre-existing untracked CP1.2B tests + 42 authority/policy tests. All synthesis and Director behavior in tests is mocked. Build retained the existing outdated Browserslist-data advisory; no dependency change was made.

Focused tests include pronunciation authority/policy, Theatre Director, request instruction budgets, observability, role-play and CP2 assistance. The full suite additionally covers ordinary reading, Universal Practice, Conversation, Virelangues, importing/document identity, casting, recording and pronunciation analysis.

New policy tests cover automatic acceptance in all required contexts, no owner form, complete-empty inventories, non-Thomas names, partial clarification, unchanged established entries, missing/conflicting evidence, known-cast omissions, incomplete inventories, overlapping identities, policy expiry, style reuse, learner holds, narrator and all chorus components. Existing tests retain source/ticket integrity, cancellation, stale-response, cache/replay and budget coverage.

## Privacy and diff review

No additional provider call, dependency, credential, persistence layer or analytics event was added. Names, evidence and resolution rationale use the existing scene-analysis/ticket flow. Aggregate diagnostics remain content-free. Existing opt-in selected-item debug capture retains final safe instructions plus authority version/revision/digest/provenance and production-language context; it does not export encrypted tickets or credentials.

The incremental-loader changes remain authority compatibility/debug allowlisting only. No scheduler or CP2 source was modified for this policy revision. The three pre-existing untracked CP1.2B files remain unpromoted.

## Revision change surface

- `lib/theatre-pronunciation.ts`: context/resolution contract, prompt/schema/validation, generic convention category, occurrence ambiguity reporting.
- `lib/theatre-pronunciation-authority.ts`: automatic acceptance, partial clarification merge, provenance/policy validation.
- `lib/theatre-direction.ts`: whole-scene document-language hint in the existing request.
- `lib/theatre-generation.ts`: pronunciation cache-policy version.
- `app/api/read-passage/route.ts`: unresolved-only clarification response and old-policy rejection.
- `lib/theatre-speech-instructions.ts`: established English production context and language-neutral accepted lexical instruction wording; unchanged French behavior otherwise.
- `app/api/theatre-clip/route.ts`: safe production-context metadata in existing opt-in debug capture.
- `components/article-reader/PronunciationClarification.tsx`: exception-path wording and generic language-convention option.
- `tests/theatre-pronunciation-ambiguity.test.cjs`: new mocked policy regressions.
- `tests/theatre-pronunciation-authority.test.cjs`: updated policy/UI expectations.
- This report.

The earlier uncommitted architecture changes to tickets, playback-session lifecycle, page integration, incremental response validation and regression fixtures remain in the working tree.

## Remaining limitations

- The Director can misinterpret context or miss a name. Schema checks and exact evidence matching do not prove semantic correctness. Automatic acceptance deliberately no longer asks the owner to validate every conventional reading.
- The provider has no binding pronunciation guarantee through this instruction interface. Identical metadata can still produce different audible realizations. CP1.2A's evidence remains relevant; CP1.2B is not promoted.
- Conflicting same-spelling entities remain held; this checkpoint does not add a per-occurrence disambiguation editor or a ready-map history editor.
- Accepted authority remains mounted-session/ticket scoped, not durable across reloads. Ticket expiry is two hours; explicit re-preparation creates a new production identity. Limits remain 64 accepted entries, eight aliases per entry, four evidence excerpts and 120-character targets.
- No paid listening, production deployment or manual multi-viewport acceptance was performed. Mock tests establish branching, propagation and preservation—not audible quality or real-model judgment accuracy.

## Aya acceptance plan

1. Review the automatic/clarification contract and mocked examples; verify no routine owner-review requirement remains.
2. Using mocks, check ordinary French names and a complete empty inventory go directly to preparation. For a scene containing one established name and one ambiguous name, only the latter appears in the form.
3. Confirm that answering/cancelling/replacing the ambiguous scene cannot replace an established decision or attach an old response. Check role-play learner turns remain held and explicit model listening does not advance them.
4. Review the exception form on desktop/mobile before deployment.
5. Only with separate paid-call authorization, evaluate real Director decisions and blind-listen to repeated French, English/local-dialogue and deliberately foreign-name examples across voices, narrator, chorus, styles and replay. Score pronunciation, questions and additions/omissions separately.
6. Do not call audible pronunciation reliable based solely on this mocked architecture validation.
