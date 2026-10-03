# PRACTICE-007B — finite session duplicate integrity

## Observed bug and baseline

The reported finite Practice session showed Question 3 `butan-2-ol` / Naming and Question 4 `butan-2-ol` / Naming. The original session seed is unavailable, so that exact session cannot be replayed.

Baseline was `main` at `99171cbe5024555a24f6ca87b2af2d9ea9a3a765`, clean before edits. Direct Node test execution reported 2,138 pass, 2 fail, 5 skip out of 2,145: the pre-existing static assertion in `formula-candidate-integration.test.mjs` and `rendered-html.test.mjs`, which could not find `dist/server/index.js` before a Sites artifact build. ESLint reported 0 errors and 11 existing warnings. The direct `vinext build` completed; its environment and chunk-size warnings are recorded in the task report.

## Root cause and reproduction

Finite Practice and Exam already retained all finite keys. The gap was the identity source: the shared selector keyed only on cached `question.reference.structuralIdentity` and never checked that value against the final `question.molecule` the user would see. If a reconstruction or question-construction path supplied the same graph with stale or representation-dependent identity metadata, the selector could treat the repeated graph as new. The exact user run cannot be attributed to this path without its seed or saved questions.

The deterministic boundary regression uses butan-2-ol represented as `CC(O)CC` and `CCC(O)C`. The chemistry oracle identifies both as the same graph (its English display string is `2-butanol`). The second candidate is given a deliberately stale cached identity. Before the fix, the old key `["naming", reference.structuralIdentity]` differed and the candidate could be accepted. The regression now records the graph-derived key, rejects generation indices 1–4 as duplicates, and returns safe finite exhaustion. This reproduces the verified identity-drift defect class; it is not a replay of the unavailable user seed.

## Identity and fixed flow

The session selector now derives target identity from the final question molecule with the existing `exerciseStructuralIdentity` implementation. That path exports isomeric SMILES and obtains OpenChemLib's canonical IDCode with a fixed parser seed. Atom IDs, insertion order, coordinates, layout, translation, rotation, and graph reconstruction do not define identity. Formula and localized names are not keys. Bond order, formal charge, and explicit E/Z remain represented; equivalent nitro serializations normalize through OpenChemLib.

The selector then combines the scheduled question type with the graph identity. Before accepting a new key, it verifies that cached `reference.structuralIdentity` agrees with the graph identity used by attempts and reconstruction. A stale identity is skipped safely; a graph already used by that type is rejected even when its cached identity differs.

Finite Practice and complete Exam plans share this selector and retain every accepted key. Naming X plus Naming X is rejected. Naming X plus Build X or MCQ X remains allowed. Endless still retains only its previous eight accepted keys. Correction Loop and Session Review reconstruct accepted questions and do not deduplicate them.

Duplicate skips remain deterministic and bounded: four ordinary candidates or twelve MCQ candidates. The accepted question keeps its real `generationIndex`; display ordinals remain contiguous. Exhaustion does not lower the requested count, change type/category, create attempts, or accept a duplicate. Generator version and seed derivation are unchanged.

## Sweeps and browser check

The deterministic Alcohol Naming sweep covered three seeds at each suggested count. Results are aggregated here; `candidate skips` counts generation calls beyond accepted questions, and includes bounded duplicate retries.

| Mode | Type / categories | Sessions | Requested | Accepted | Candidate skips | Duplicate questions accepted | Exhaustions |
|---|---|---:|---:|---:|---:|---:|---:|
| Practice | Naming / Alcohol / 10 | 3 | 30 | 26 | 7 | 0 | 1 |
| Practice | Naming / Alcohol / 15 | 3 | 45 | 45 | 12 | 0 | 0 |
| Practice | Naming / Alcohol / 20 | 3 | 60 | 59 | 32 | 0 | 1 |
| Practice | Naming / Alcohol / 30 | 3 | 90 | 50 | 35 | 0 | 3 |
| Practice | Naming / Alcohol / 37 | 3 | 111 | 55 | 48 | 0 | 3 |

The 37-question runs safely exhausted after 18, 22, and 15 accepted questions respectively. A separate 32-session sweep of 10-question Naming-only Alcohol sessions also found no repeated accepted names. None of these sweeps reproduced the unavailable original session. Existing Phase 9.1 tests additionally cover finite Practice and Exam at 5/15/30 questions, all four type configurations, two seeds each; 37-question mixed plans; and Session Review at 5/15/37.

The browser run used seed `PRACTICE-007B-SWEEP`, finite Naming-only Alcohol, 15 questions. It completed all 15; every displayed reference name was distinct. The session included `butan-2-ol` once at Question 8. A mixed Practice and mixed Exam browser run remain unverified.

## Regressions and limits

The new regression covers the reported butan-2-ol graph under two SMILES representations, stale cached identity, atom-ID/order/layout invariance, positional isomers, bond order, charges/nitro serialization, E/Z, same-type Naming/MCQ/Build rejection, and allowed cross-type reuse. Existing suites cover retry determinism, finite history, display ordinal and real generation index, reconstruction/corrections, locale, Class Seed, safe exhaustion, Endless bounded history, Session Review, PRACTICE-008, and REASON-UNSAT-001.

The identity is scoped to the generator's supported molecule domain and the existing OpenChemLib serialization policy. This report does not claim that the original user seed was reproduced or that every possible finite configuration was exhaustively enumerated.

No Difficulty, chemistry expansion, persistence redesign, or unrelated UX change is included.
