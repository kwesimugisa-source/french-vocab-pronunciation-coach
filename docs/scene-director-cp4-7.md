# CP4.7 — Scene-aware Theatre Director

## Starting state and architecture audit

Started on `main` at `42cd93da9ae6b85df818c3604ab576ef27c9e06a`, equal to `origin/main` and remote main, with a clean tree. CP4.6 baseline: 630 tests.

Existing CP3 already sent the complete `parseTheatreItems` result in one bounded `gpt-5.4-mini` Responses request. Its scene mood/situation/relationships/arc were prose, with tone/pace/intensity on each item. CP4.4.2 added Clarté/Naturel, fixed provider voice identity and adjacent-line context, including short utterances. Casting was resolved before three concurrent TTS workers. Stable item IDs, exact source text, narrator routing, three-component synchronized chorus and all-or-nothing generation were already established.

Generated Theatre metadata supplies speaker IDs, display labels and voice presentation, not a pre-existing relationship/objective model. Imported Theatre already has canonical parser output. The Director consumes this canonical structure; it does not parse or normalize text again. Generated identity labels are propagated, but voice presentation is not supplied as psychological evidence. Casting continues to use the original validated metadata independently.

Existing analysis reuse used opaque references, a source hash, 16 process-local entries and a 30-minute TTL. Client identity includes document ID/revision/canonical text. The audit found that the client only forwarded a reference when ambience was confidently known. CP4.7 corrects that condition: successful analysis can be reused independently of ambience confidence.

## Implementation

One extended existing analysis request returns the original metadata, ambience and an optional locally accepted `director` plan. No second analysis service or per-line analysis requests.

Both Theatre styles prepare/cache the shared scene plan. Only **Naturel character dialogue** applies the Director. **Clarté uses exactly the existing instruction construction**, retaining its pedagogical articulation. This makes Clarté → Naturel → speed changes reuse one interpretation. It does add schema/output work to the initial shared analysis, including when playback starts in Clarté.

`lib/theatre-director.ts` contains types, bounded strict schema, local validation, the analysis prompt extension and concise context compilation. It performs no provider calls, parsing, casting or playback.

### Scene model

- `version: 1`.
- `setting`: location, social environment, relevant time, privacy (unknown/public/private/semi-private), noise (unknown/quiet/noisy). Each fact carries exact source evidence; unsupported facts use `unknown`.
- `relationships[]`: known `from`/`to` speakers, `since` source ID, constrained relationship kind and stance, evidence. Directional changes are supported. The latest applicable entry replaces only its ordered pair.
- `beats[]`: chronological source position, recent event, full present-character snapshot with evidence, changed character states. Presence snapshots can represent entrances/leaves. Unnamed crowds remain social/event context rather than invented actors.
- Character state: objective, knowledge, restrained/moderate intensity, bounded emotion, confidence, openness, urgency and evidence. Knowledge describes supported new information, uncertainty or concealment, not invented history.
- `lines[]`: exactly one entry per character dialogue, canonical item ID, optional addressee, known hearers, constrained intention, short subtext, pace, conversational/soft/projected tendency, audience awareness and evidence. No narrator or chorus entries.

Validation rejects extra keys, unknown enums, oversized fields/arrays, invented IDs/speakers, duplicate/missing lines, fabricated excerpts, punctuation-only evidence, future citations, nonchronological beats and unsupported listener membership. State transitions require fresh cited evidence since the preceding beat. Line order is restored from canonical IDs. Setting facts and relationship assertions need evidence unless unknown.

Most prose fields are at most 160 characters; evidence quotes at most 240. Evidence arrays hold at most four distinct source items. The schema bounds relationships/beats to 128 each, speakers per snapshot to 32 and character lines to 256. The conservative output budget currently admits up to 226 total parsed items for an extended Director plan. These are **analysis bounds, not playback limits**.

### Sequential performance

For each Naturel character line, the compiler selects only beats/relationships at or before that source item and carries that character's last state forward. It supplies setting, relevant directional relationships (at most eight), latest event, current state and line intent/subtext/listeners. Evidence excerpts and the complete scene plan are not repeated into each TTS instruction.

The new plan replaces the old whole-arc summary and previous/next raw-text hints for directed character lines. That prevents the old per-line annotation from contradicting the coherent state and avoids explicitly showing a future adjacent utterance. Short utterances inherit the same state and provider voice as longer ones.

Stage directions can provide evidence for state changes but remain narrated by the existing narrator. Chorus does not receive the Director's per-character instructions; its original synchronized ensemble instructions and three-component logical item remain unchanged. Ambience keeps its existing validator, registry, status and gain controls. A previously validated ambience decision is passed to the shared analyzer unchanged.

### Restraint and exactness

Strong vocal actions (shouting, whispering, crying, panic, rage, extreme excitement/fear and exaggerated sarcasm) are intentionally unavailable as structured choices in version 1. Intensity is restrained or moderate. Soft/projected tendency additionally requires prior contextual evidence; soft means conversational intimacy, not whispering. The prompt forbids indirect extreme-effect instructions and using punctuation/capitals alone as emotion commands.

Subtext, such as defensive denial after visible nervous behavior and teasing, is non-spoken context. `item.text` remains the sole TTS input. No dialogue rewriting, added interjections, phonetic spelling or text normalization is introduced. The existing French pronunciation wrapper still surrounds performance instructions at the actual speech request boundary. Numeric speed and actor identity remain independently authoritative.

Structural validation proves source identity, boundedness and temporal consistency; it does **not prove semantic entailment** of every model inference. The model may cite a real excerpt yet misinterpret it. Prompt instructions and conservative defaults reduce this risk, but production listening remains required. Tests do not claim to prove acoustic quality or live model interpretation.

## Reuse, fallback, status and costs

Cache scope binds canonical source, document ID, revision, generated identity labels and Director version. Speed/style do not alter the interpretation. Different revisions/identity/source reject old references. Cache reads clone data. Playback/replay/practice use already generated audio; replay performs no new scene or TTS calls.

The cache is bounded functional memory, not telemetry or durable storage. It is **not shared or durable across serverless workers/redeployments**. Expiry, eviction, a different worker or page/session loss can cause a later full-play request to reanalyze. No durable infrastructure or authentication has been added.

- Invalid/missing Director with valid CP3 analysis: keep original CP3/ambience and use exactly pre-Director Naturel instructions.
- Failed/timed-out/malformed complete response: existing neutral/adjacent-context fallback, preserving every clip request and exact words.
- Oversized Director output estimate or more than 32 known characters: request the complete legacy scene analysis instead, in the same single request. No prefix slicing or dropped script items.
- Existing total input/output bounds still apply to legacy analysis; exceeding them falls back for the whole scene.
- Late analysis responses cannot replace the already selected fallback.

Internal response metadata is `direction.director = {version:1,status,reason,directedItemCount}`. Status is `applied`, `fallback` or `not_applied` (Clarté). Fallback reasons are `analysis_unavailable`, `invalid_or_missing_plan` or `plan_budget`; the existing `direction.fallbackReason` gives whole-analysis failures. The plan/prose is not added to the client response or diagnostics. No technical Director error is added to learner UI.

Provider model, store=false, truncation disabled, 20-second analysis deadline and zero automatic analysis retries remain. Extended output allowance is `4096 + itemCount * 512`, within the existing 120,000-token ceiling; legacy allowance is `2048 + itemCount * 192`. Input remains bounded to 120,000 UTF-8 bytes. More structured output can increase initial cost/latency and timeout risk; there are still at most one analysis call per uncached scene and exactly the existing TTS job count. No paid live-model/audio evaluation was run.

## Files and validation

Production changes:

- `lib/theatre-director.ts`: new typed, validated Director metadata and context compiler.
- `lib/theatre-direction.ts`: evolve existing analysis schema/request, budget downgrade and Naturel instruction application.
- `lib/theatre-generation.ts`: Director status and revision/configuration-bound reuse.
- `lib/theatre-analysis-cache.ts`: optional scope binding with existing TTL/capacity.
- `lib/reading-playback.ts`: send successful analysis reference independently from ambience confidence.
- `app/api/read-passage/route.ts`: activate extended Theatre analysis and pass validated identity.

Tests:

- `tests/director-fixtures.cjs`: bounded constructed La Dernière Table acceptance excerpt. The complete play was not present; this fixture is explicitly not a reproduction of it.
- `tests/theatre-director.test.cjs`: evidence/schema/state/relationships/subtext/listeners/restraint, the existing Le Dernier Train fixture, text/casting/narrator/chorus, fallback, budget downgrade, scope and speed stability.
- `tests/director-integration.test.cjs`: mocked real API/TTS boundary, French anchoring at all speeds, generated/imported metadata, Clarté→Naturel→replay/practice→speed with uncertain ambience, private cache behavior and all non-Theatre modes.

Existing tests are preserved unchanged. Required Theatre parsing/routing/casting/narrator/chorus/ambience/performance/language/Universal Practice/Conversation/Virelangues/ordinary playback regressions remain part of the complete suite. Privacy review: no new content logs, telemetry fields, recording access, public lookup route or durable infrastructure. Source evidence exists only in bounded functional analysis memory and the required provider operation; it is not diagnostic data.

## Exact human production acceptance plan

After the deployment corresponding to the final commit is ready, use the same canonical documents and unchanged casting. Compare **Clarté + Normal** with **Naturel + Normal**. Confirm the deployed request reports Director `applied` for Naturel before attributing differences to this feature; inspect status/counts only, without copying learner content into diagnostics.

### La Dernière Table

1. THOMAS: **“Je ne suis pas nerveux.”** after repeated napkin folding and teasing. Context should yield restrained defensive denial, not cartoonish nervousness. Words must remain exact.
2. ÉLISE: **“Tu n'as pas changé.”**, then **“Toi non plus. C'est inquiétant.”**. Listen for relationship continuity rather than an unrelated dramatic declaration.
3. THOMAS: **“Toi.”** in the proposal sequence. It should reflect the buildup and intimacy, maintaining Thomas's established voice and French pronunciation.
4. THOMAS: **“Euh... j'avais beaucoup plus de mots dans la version trois.”**. The authored interjection must remain, and his state should continue after Élise's response rather than reset at a new TTS item.

### Le Dernier Train

5. Compare CLARA's **“Marc.”** with **“Marc...”**. Delivery may differ with context; Clara's assigned voice, exact text and French pronunciation must remain consistent.
6. Listen around the missing blue bag/passport revelation. Emotional progression should arise from the revelation, not punctuation alone.

### Preservation checks

7. Repeat Naturel at Très lent/Lent/Normal/Rapide: listening speed changes, while objectives, relationship interpretation and actor identity remain stable when the cached plan is reused. Replay a short line repeatedly: no regeneration; return from practice correctly and complete the scene.
8. Check narrator ownership, synchronized chorus as one logical item, station/office ambience detection and gain/microphone muting. No new sound effects should replace directions.
9. Smoke-test ordinary reading, Conversation, Virelangues, poetry and Universal Practice; exact pronunciation targets, recording and French anchoring should remain unchanged.
10. If a Director request falls back, confirm Theatre still completes without learner-facing technical alarms. Record only safe status/error categories. Human acoustic acceptance is pending this production exercise; automated contract tests do not replace it.

Stop after Director. No Jouer un rôle/Scene Partner, roleplay recording, SFX library, Universal Practice redesign or new analytics infrastructure.

## Completed local validation

- Focused preservation/Director regression run: **527 passed, 0 failed**.
- Complete regression suite: **679 passed, 0 failed** (630 existing + 49 new; none skipped).
- `npm run typecheck`: passed.
- `npm run build`: passed, including compilation, lint/type validation, page generation and build traces.
- Build emitted non-blocking webpack cache snapshot and outdated Browserslist data warnings. No dependency upgrade was included in this scoped checkpoint.
- `git diff --check`: passed. Reviewed all six production source changes, all three new test files and this document. No unrelated tracked changes or existing-test modifications.
- Privacy review: the new implementation adds no logging/telemetry sink. Only the existing required whole-scene provider call sees source content; cache contents remain bounded functional memory. Director response metadata contains status/categories/counts, not scene analysis prose.
- Production acoustic acceptance remains pending. The suite uses mocked provider output and verifies contracts, propagation and playback, not subjective live delivery.
