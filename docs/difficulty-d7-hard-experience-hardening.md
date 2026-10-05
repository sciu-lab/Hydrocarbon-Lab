# Difficulty D7 — Hard experience hardening

## A. Baseline

HEAD `d0c19258e5b0629beb57d8db129db21f636863af`, main, initially clean and synchronized with origin/main. D0, D3, D4, D4.2A, D4.2B, D5 and D6 read completely. Current generator 4, supported 1/2/3/4. Historical D6 release baseline: critical 157 PASS; full 2453 PASS, 5 historical skips, 0 FAIL. Fresh D7 baseline: Reviewer/fragments/distractors/Build 83 PASS, 0 FAIL; TypeScript 32 historical diagnostics. No local AGENTS.md.

## B. Architecture / methodology

`practice-review.ts` consumes the frozen question and AttemptRecord, verifies graph/reference identity and uses the real naming analysis. `practice-review-diagnosis.ts` recognizes bounded edits of an official reference; arbitrary/multiple changes retain UNKNOWN_MISMATCH. MCQ uses verified option provenance, rather than parsing a student's intent. `practice-review-i18n.ts` renders message identities/parameters in ES/EN.

`reasoning-name-fragments.ts` copies literal spans from available local names and attaches graph/model provenance. `reasoning-name-links.ts` resolves overlaps without changing the visible name. `page.tsx` already performs explicit CIP inspection while building reasoning steps; D7 reuses that result for the descriptor link, without another chemistry scan.

`practice-distractor-engine.ts` and `practice-distractor-recipes.ts` keep their seeded recipe order, bounded variants, complete naming-model checks, alternative graph validation, reference equivalence guards and bilingual dedupe. `practice-question.ts` assembles four choices and freezes their IDs/order/provenance. `practice-structural-answer.ts` compares constitutional identity plus explicit E/Z independently of drawing IDs/orientation; `session-answer-evaluation.ts` is the shared grading boundary. Neither changes in D7.

Before production edits an ignored audit captured 26 deterministic representative contexts covering all 17 categories and 22 certified families, both languages. It checked correct Review, all selected wrong MCQ options, literal fragments, and a valid incorrect Build mutation. The subsequent focused test adds another seed per category and uses the existing bounded MCQ capability limit where a raw target lacks three safe distractors. Accepted generationIndex is retained; raw capacity rejection is separate from a violation.

## C. Hard coverage

| Category | Certified families covered | Reviewer | MCQ | Build | ES/EN |
|---|---|---|---|---|---|
| alkane | mixed-trialkyl-alkane | PASS | PASS | PASS | PASS |
| alkene | enyne-hydrocarbon | PASS | PASS | PASS | PASS |
| alkyne | enyne-hydrocarbon | PASS | PASS | PASS | PASS |
| halogenated | hydroxy-ketone; amino-alcohol-enyne-bromo | PASS | PASS | PASS | PASS |
| alcohol | diol; amino-alcohol; alkoxy-alcohol; enyne-alcohol; amino-alcohol-enyne-bromo | PASS | PASS | PASS | PASS |
| aldehyde | hydroxy-aldehyde | PASS | PASS | PASS | PASS |
| ketone | dione; hydroxy-ketone | PASS | PASS | PASS | PASS |
| carboxylic-acid | hydroxy-acid; amino-acid; amino-hydroxy-acid; enyne-acid | PASS | PASS | PASS | PASS |
| ether | alkoxy-alcohol | PASS | PASS | PASS | PASS |
| ester | enyne-ester | PASS | PASS | PASS | PASS |
| amine | enyne-amine | PASS | PASS | PASS | PASS |
| amide | enyne-amide | PASS | PASS | PASS | PASS |
| simple-carbocycle | mixed-trialkyl-carbocycle | PASS | PASS | PASS | PASS |
| aromatic | mixed-trialkyl-benzene | PASS | PASS | PASS | PASS |
| ez | mixed-trialkyl-ez | PASS | PASS | PASS | PASS |
| nitrile | enyne-nitrile | PASS | PASS | PASS | PASS |
| nitro | enyne-nitro | PASS | PASS | PASS | PASS |

All 22 families are reached by the real seeded production generator for MCQ, Naming and Build; no manual replacement targets or unsupported-type simulation. The 43 rows are configuration contexts, not complete UI sessions: a Naming configuration plus the supported explicit question-type context keeps the same deterministic chemical identity across types. Public configurations with different type sets have their own seed namespaces. Real finite sessions and capability routing are covered separately by the existing D5 integration suite.

## D. Findings

**DIFFICULTY-D7-BUILD-001 — P2, all Build families.** Reproduce advanced/v4 alkane, seed `D5-FAMILY-CAPABILITY:0`: remove a terminal methyl outside the selected parent and submit the valid graph. Evaluation stores DIFFERENT_ELEMENTS, but Review previously displayed only `review.build.mismatch`. Same loss of evidence occurred for bond-order, connectivity and E/Z comparisons. Fix: localize the existing frozen statuses, preserve the existing issue taxonomy/AttemptRecord and keep generic fallback for unclassified or insufficient stereo evidence. No functional diagnosis is inferred from atom counts. New negative tests fail before the patch and pass afterward.

**DIFFICULTY-D7-FRAGMENT-001 — P2, mixed-trialkyl-ez.** Same seed under ez produces `(3Z)-6-etil-2,5-dimetiloct-3-eno`; the blanket punctuation guard returned no fragments because of parentheses. Fix: existing reasoning step supplies the explicit CIP descriptor and bonded atom IDs. Link only its exact written prefix in a verified local output, with matching analyzed bond/locant. Hidden names, absent inspection, mismatched descriptor and non-stereo targets fail closed. No R/S or arbitrary parenthetical naming support added.

Repeated principal functions previously used the generic function message. Diol/dione now include graph-derived count and explain locants/multiplicity in the suffix. This is a bounded pedagogical improvement, not a chemistry or correctness bug.

**DIFFICULTY-D7-MCQ-001 — P1, enyne-hydrocarbon / alkyne.** Reproduce seed `D7-DIAG:1`, advanced/v4: reference `5-metilnon-1-en-3-ino` / `5-methyl-1-nonen-3-yne`, structural identity `ded@@DiV}zZj@@`. A verified alternative moves the triple locant 3→8, but Review selected the first unsaturation step (double C1=C2, bond 8:9), rather than triple C3≡C4 (bond 6:7). Fix: select the existing structural step by the transform's original locant, not by kind alone. No alternative graph, name or provenance change.

**DIFFICULTY-D7-MCQ-002 — P1, mixed-trialkyl-benzene / aromatic.** Same seed/category aromatic: `2-etil-1,4-dimetilbenceno` / `2-ethyl-1,4-dimethylbenzene` → verified option `1-etil-2,3-dimetilbenceno` / `1-ethyl-2,3-dimethylbenzene`, methyl transform 1→2. Existing D5 canonical ring renumbering also changes remaining written locants: ethyl 2→1 and the other methyl 4→3. Review incorrectly reused Naming's “the rest of the name matches” claim. Fix: dedicated MCQ locant messages describe the controlled transform and allow canonical renumbering, without asserting literal rest-name equality. Naming's bounded-edit diagnosis is unchanged.

Supplementary audit: 16 deterministic targets / 85 candidates, including forced verified alternatives rather than only normally selected three. It reproduced 10 wrong unsaturation highlights and 2 false ring-copy claims before correction. Two minimal regressions failed before the fix and pass afterward. Final re-audit of the same 16 targets / 85 candidates: zero violations. Generated alternatives, names and provenance remain intact.

## E. Reviewer

Correct outcomes stay authoritative; Review never regrades. Unknown Naming/multiple errors keep the honest nonempty fallback. Explicit E/Z-only Naming errors retain WRONG_EZ_DESCRIPTOR; missing descriptor or additional text/connectivity evidence remains UNKNOWN_MISMATCH. Diagnosis order and shared taxonomy unchanged. Principal group, secondary prefixes, halo/nitro, unsaturation, numbering, multiplicity, ester portions and assembly continue using the existing structured model/highlights.

## F. Fragments / E/Z / long names

DIFFICULTY-D4-REASON-001 EN enyne was already fixed by D5: both double/triple semantic identities and actual bond spans pass in ES/EN. D7 does not rewrite that adapter or canonical names. Tests use the actual ES/EN reasoning-step builders, verify nonempty literal spans, valid atom IDs, reconstruction of the entire visible name and independent graph-derived unsaturation identities. Explicit E/Z uses the existing step 06 and native reference-link navigation; double-bond metadata avoids a false triple-bond accessibility label. Unverified variants remain plain text.

Mobile verification at 390×844: PASS in ES/EN. Long amino/bromo/methyl enyne MCQ choices wrap completely (261 px client/scroll width); localized Review text has equal client/scroll widths and document width 375 px, with no horizontal overflow. Naming review, Build prompt/reference and correction answers retain their complete chemistry. Wrong Build methane versus the real alcohol target displays the new atom-count explanation after Check. The native step controls accept Space and retain focus; MCQ arrows select a choice without grading it. Explicit `(4E)` links select the existing step 06 in ES/EN via Enter, with the correct double-bond accessibility description. Saved screenshots under the ignored output directory show the reference graph, full feedback and focused step. The original methane was restored with Undo; the temporary viewport and preview were closed. No CSS/layout or Difficulty selector changes.

## G. MCQ

No recipe, assembly, selection or option payload changes. Tests assert four choices, one correct option, uniqueness under the shared typography normalizer and only reference-name self-acceptance. Every graph distractor is independently reconstructed from its stored canonical alternative identity, round-tripped and passed through the real bilingual reference oracle; its names must exactly match the option. E/Z alternatives are independently reconstructed with the existing structural geometry operation. Allowed transformations and verification metadata are checked; plausibility means validated controlled alternatives, not a subjective string score.

## H. Build

Canonical equality and E/Z contract unchanged. Focused cases include exact graph, IDs/arrays remapped with rotation/scale, reflection, missing branch and valid moved branch for all sampled families. Targeted enyne loss tests distinguish bond order; opposite/missing E/Z distinguishes stereo only after constitutional equality. Combined connectivity/stereo stays a connectivity mismatch. Unknown functional cause is never inferred. E/Z Review highlights use the original target inspection, never a newly generated explanation target.

## I. Exam integrity

PASS: new Hard advanced/v4 amide regression renders the actual pre-submit UI in six real sessions (three types × ES/EN). Naming hides the reference name; MCQ shows four unmarked alternatives without correct flags/provenance; Build receives a blank student editor, hidden category and no answer-graph/target bridge. Its requested name is the legitimate prompt. Neutral pre-submit summary has no reference names, reasons, correctness or attempts, and the plan is unchanged. Existing Hard integration also verifies neutral structural validation, previous/next drafts, locale changes, atomic grading failure/retry and post-submit Review from the original plan. Production gating/UI lifecycle unchanged.

## J. Corrections / Session Review

PASS: existing Hard integration reconstructs with original difficulty advanced/version4/seed/index/type/reference/identity, preserves initial results and correction numbering, and uses saved Build/MCQ records. Changed difficulty or version is rejected; display ordinal 7 / generationIndex 11 reconstructs exactly. Frozen Exam questions are used after submission. Mobile Naming confirmation: initial 0/1 remains 0/1 after an EN correction, mastery becomes 1/1, and Session Review displays the original ES answer plus correct attempt 2 with the same localized reference. Session/reconstruction/reducer sources unchanged.

## K. Frozen compatibility

PASS in targeted, critical and full suite: legacy v1, Easy v2, Intermediate v3 and current Hard v4 frozen/reconstruction. v4 complete all-category plans/payloads repeat exactly in three fresh processes (ES, ES, EN). Historical Class Seed/CSV fingerprints and bytes also pass. No expected payload, historical fixture or capture helper edited/regenerated.

## L. Exact focused counts

Final `experience-sweep.json`: 43 accepted deterministic contexts, 17 categories, 22 distinct families, ES/EN, zero violations. The matrix checks 172 Naming ReviewModels, 344 MCQ ReviewModels and 172 Build ReviewModels: 688 total; 86 complete displayed names with semantic fragments. MCQ: 43 questions / 172 bilingual options / 344 localized option checks, with 127 independently reconstructed non-stereo alternative graphs and 2 opposite-E/Z alternatives. Build: 245 comparisons, including exact/redrawn/reflected answers, missing branches and candidate moves until a valid connectivity mismatch is found. Four raw MCQ capability rejections are handled by the existing bounded search, not counted as failures.

Supplementary controls add 19 ReviewModels (6 Naming E/Z; 5 Build E/Z/combined; 4 Build enyne bond order; 4 MCQ diagnosis), for 707 ReviewModels overall. Five accepted supplementary Build mutations cover opposite/missing E/Z, combined connectivity/stereo, and removal of either enyne bond order. The separate 16-target / 85-candidate diagnosis audit is not added to the matrix totals. Repeated validation runs are not counted as new coverage. This is representative D7 coverage; D8 remains responsible for larger cross-products.

Existing D5 integration additionally passes 136 real five-question finite sessions across 17 categories: 68 Naming, 34 MCQ and 34 Build, split between Practice and Exam, with 680 accepted targets and no exhaustion/violations. Those complete sessions verify public capability routing independently of the 43 explicit-context rows and are not added to the new ReviewModel/option totals.

## M. Validation

Fresh baseline: 83 PASS, 0 FAIL, 84.785 s. Reviewer/fragments/navigation/UI targeted group: 86 PASS, 0 FAIL, 549.730 s before the two MCQ fixes; their minimal regressions afterward: 2 PASS, 0 FAIL, 9.919 s. Final integration (23 D7 matrix/regression tests, Hard finite/frozen, MCQ/Build, Corrections/Session Review, Exam and D6 selector): 137 PASS, 0 FAIL, 1038.055 s. Its 24 newly added test bodies account for 150.729 s; sample size is bounded and no production scan/retry is added. Critical: 157 PASS, 0 FAIL, 300.716 s, including PRACTICE-007B and PRACTICE-008. REASON-UNSAT-001 passes in the focused navigation suite; TEST-CRLF-001 is unchanged.

Full `npm test` ran ONCE after targeted/critical gates: 2482 tests, 2477 PASS, 0 FAIL, 5 historical skips, 2745.850 s. The 24 added tests account exactly for the increase over D6's 2453 PASS. All shared Reviewer, fragments and historical regression suites pass with the final source.

Final TypeScript: 32 historical diagnostics, 0 new, 0 missing; source positions shifted by the three inserted page lines and printed union member order are normalized for comparison. This is the existing debt, not a clean TypeScript build. Focused lint: 0 errors, 6 historical page warnings. Final `npm run build`, `npm run build:pages` and `npm run validate:pages`: PASS, including verified ESM Worker/manifest and Pages artifact (3 entries, 3 assets, base `/Hydrocarbon-Lab/`). Wrapper commands use existing Git Bash on PATH; no script edits or direct-command fallback.

Final `npm run lint`: PASS, 0 errors, 11 historical warnings, 0 new. The first global run found one unused import in the ignored audit utility; removing it and repeating only lint restored the baseline. No production/test changes followed the full suite. Final `git diff --check`: PASS; additional whitespace checks of both new files found no errors. Expected Git LF→CRLF notices for new files are configuration notices, not mass normalization. Tracked diff: five files, 87 insertions/8 deletions, plus the two new deliverables; `page.tsx` changes exactly three lines. HEAD/main unchanged; all work unstaged, no commit/push.

| Gate | Final result |
|---|---|
| test:critical | 157 PASS / 0 FAIL |
| npm test (once) | 2477 PASS / 0 FAIL / 5 historical skips |
| build | PASS |
| build:pages | PASS |
| validate:pages | PASS |
| lint | 0 errors / 11 historical warnings / 0 new |
| TypeScript comparison | 32 historical diagnostics / 0 new |
| diff-check | PASS |

## N. Files

Modified: `app/page.tsx` (three lines exposing existing descriptor evidence), `app/practice-review.ts`, `app/practice-review-i18n.ts`, `app/reasoning-name-fragments.ts`, `tests/exam-ui.test.mjs` (Hard ES/EN privacy regression).

New: `tests/difficulty-hard-experience.test.mjs`, this report. No staging.

Ignored/temp separately: `outputs/difficulty-d7/` holds command logs, pre-fix reproductions, final sweep JSON and eight mobile PNGs. Local audit utilities are `audit.mjs`, `inspect-mcq.mjs` and `compare-typecheck.mjs`; data artifacts include `audit-before.json`, `experience-sweep.json`, `mcq-diagnosis-before.json`, `mcq-diagnosis-audit.json` and `typecheck-comparison.json`. Existing test hooks refresh their ignored output directories, including `outputs/difficulty-d5-v4/session-sweep.json`. Builds use ignored `dist/`, `dist-pages/` and `.sites-runtime/`. None are staged or added to the tracked deliverable.

## O. Versioning

GENERATOR_VERSION remains 4; supported 1/2/3/4. Frozen surfaces audited before edits: snapshot helper hashes the entire question graph/metadata/options/provenance and Build target identity, with complete Exam plans. Review messages/steps and literal UI fragments are outside that generated payload. D7 changes only those presentation surfaces; no RNG, identities, plans, names, choices or evaluation status computation changes. Frozen gates must verify this rather than regenerate expected data.

## P. Limits / out of scope

Reviewer is not a general student-name parser. Arbitrary Naming mistakes can remain generic; Build counts do not prove which function changed. Alternative graphs are neutral comparable answers, not necessarily Hard. Some raw ring targets lack three safe distractors and use existing bounded search. Family spaces remain finite. Full semantic tokenization of every naming convention is not claimed; missing unverifiable links stay literal text.

Out-of-domain chemistry remains under existing fail-closed policies. All 17 categories support the three tested question types; no N/A case was simulated as PASS. Individual raw-target MCQ capacity failures are separate from unsupported chemistry/type routing. D8 increases deterministic cross-product coverage; later chemistry expansion remains a separate domain/versioning decision.

No generator5, new chemistry/categories/sulfur/R/S/topology/Hard families, molecule-generation changes, Class Seed/CSV schema changes, Difficulty UI redesign, DOCX, gamification, dyslexia/dyscalculia mode, CI/package/dependency changes or fixture regeneration. No commit/push/staging.

## Q. D8 handoff

YES. No known correctness-level gap remains in the certified production families covered by this audit. D8 can concentrate on larger deterministic cross-product sweeps, release hardening and Difficulty v1 final freeze. Keep the four regressions and historical snapshots; do not expand chemistry or regenerate frozen expectations during that handoff.

DIFFICULTY D7 COMPLETE — HARD REVIEWER / MCQ / BUILD HARDENED
