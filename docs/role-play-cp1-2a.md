# CP1.2A — Instruction budget and controlled listening

Baseline: b8d606a028bf0033dad6f53fbdb4ee4777fedc3e.

## Production repair

The active `/api/theatre-clip` route now constructs its final instructions with `theatreSpeechInstructions`. The provider input remains the exact canonical item; model, cast voice, speed, request options and playback lifecycle are unchanged. Ordinary reading and the legacy generation helper are unchanged.

The final instruction budget is **3,800 UTF-16 code units**, conservatively below the documented 4,096-character limit. Instructions are assembled from structured data, never by slicing a final string. Mandatory blocks preserve French language, exact input/interjections, local question semantics, fixed identity, style, role, speed, generic name guidance and the preceding silent beat. Naturel retains the validated character state and current delivery (addressee, intent, subtext, pace, projection, audience) together. Invalid oversized mandatory identity/essential context fails closed before synthesis.

Remaining space admits whole recent-event, setting, relationship and listener entries in that order. Without Director, item tone/pacing/intensity and scene facts precede whole neighbouring script entries. Oversized optional entries are omitted, never cut mid-word, mid-sentence or mid-JSON. The accepted scene plan is not rewritten. Existing authored-question protection is retained without mandatory rising pitch. No name-specific branch or lexicon is added.

The instruction wording is compact for all active Theatre component requests, reducing redundancy rather than continually stacking prompts. Debug metadata records the exact final compact request. There are no scheduler, casting, role ownership, cache mechanics or speech-input changes.

## Validation and limits

Boundary tests cover maximum-size accepted Director fields/lists, pathological optional/essential input, exact-input preservation, deterministic construction, style/question authority, narrator/chorus/silence and actual route metadata. Existing role-play tests cover holds, prefetch bounds, no learner synthesis, cancellation and ordinary/role-play request equivalence.

This repair prevents oversized instruction requests; it does not guarantee audible pronunciation or prove why an earlier clip sounded English. Optional context can be omitted under the budget. The ordinary-reading instruction path is not changed.

## Controlled experiment

Owner authorized at most 36 TTS calls and explicitly approved a locally validated fixture because the production scene capture is unavailable. The fixture is not a reconstruction of production Director metadata. The fixture analysis is deterministic and validated locally; no Director/model analysis call is made.

`scripts/theatre-pronunciation-experiment.cjs --prepare <external-directory>` freezes one plan, casting and 36 request bodies offline: six contexts × Clarté/Naturel × three repetitions. It rejects artifact storage inside the repository and refuses to overwrite a package. It shuffles anonymous clip IDs; audio filenames, listening HTML and blank CSV ratings contain no case/style/repetition answer key. The separate `answer-key` directory contains the fixture plan, manifest and aggregate summary.

`--generate` is a paid operation requiring separate explicit authorization. It uses sequential TTS, timeout 55 seconds and zero SDK retries. An exclusive local lock and persist-before-call ledger bound attempts to 36. Previously attempted clips, including failures, never repeat. Transient Windows rename retries affect only local artifact writes, never provider calls. A crash may leave an attempted clip without a saved response; it is not regenerated automatically.

Safe metadata includes exact input/request body, case/style/repetition, instruction count/hash, request hash and resulting audio hash/filename. No headers, credentials, scene tokens or raw provider errors are saved. Generated artifacts remain outside Git.

## Human listening

Open LISTEN.html and rate clips in its randomized order using listening-sheet.csv. Choose French, English or uncertain/other for the name; rate question delivery yes/no/N/A. Do not inspect answer-key until ratings are complete. Then join ratings by clip ID to compare repetitions, style, input length and name position. Different audio hashes alone do not prove different pronunciation. Identical request hashes with differing human pronunciation ratings support provider variability; case/style clusters support context sensitivity. This small fixture experiment cannot establish production incidence rates or isolate every contextual variable.

Stop after this checkpoint for human review. No lexicon, provider/model migration, CP1.2B, CP2 or SFX work.

Official reference: https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create (instructions maximum 4,096 characters).

## Completed validation and experiment

17 new tests; 104 focused/relevant tests passed; full suite 805/805 (788 baseline); typecheck and production build passed. Privacy/diff review passed. Build warning: outdated Browserslist data. An initial mock-run failure exposed transient Windows ledger rename locks; the bounded local-file retry was added and all validation rerun as applicable.

Exactly 36 paid TTS calls completed, with 36 saved clips, zero failures, zero retries and zero paid Director calls. All 36 saved audio and request hashes were independently rechecked. The approved fixture resolved JULIEN to ash for both styles; model gpt-4o-mini-tts and speed 1 stayed fixed. Each of the 12 case/style groups has one request hash across three repetitions and three distinct audio hashes. Human pronunciation ratings are pending; no pronunciation-nondeterminism conclusion is drawn.

| Context | Clarté before → after | Naturel before → after |
|---|---:|---:|
| Isolated exclamation | 3322 → 1794 | 3659 → 1860 |
| Isolated question | 3764 → 2055 | 4096 → 2116 |
| Short sentence | 3412 → 1884 | 3659 → 1860 |
| Longer sentence | 2383 → 1328 | 3074 → 1590 |
| Name at beginning | 2381 → 1326 | 3074 → 1590 |
| Name at end | 2383 → 1328 | 3074 → 1590 |

Lengths above describe the fixed experiment fixture, not recovered production requests. Within each case/style group, request bodies are identical. Across cases, text and applicable linguistic/context blocks differ; across styles, delivery context differs intentionally. These differences limit causal conclusions from between-group comparisons.
