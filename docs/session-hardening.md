# Phase 9.1 — Practice / Exam session integrity and UX hardening

## A. Baseline

Repository: `C:\Users\Amy\Documents\GitHub\Hydrocarbon-Lab`, branch `main`.
HEAD: `ddbbb6a7621c0d55d9b9c509be839d8e581502aa` (`test: add reference corpus integrity manifest`).
`git status --short` was empty. The reference-corpus manifest was already tracked;
it was not modified, staged or removed.

Before edits, `npm test`: 1993 tests, 1988 passed, 0 failed, 5 skipped, 925.3 seconds.
The production build and Sites artifact validation passed. Lint: 0 errors,
11 existing warnings. `git diff --check` passed.

## B. PRACTICE-007 root cause

`selectSessionQuestion` remembered only eight recent structural identities.
After eight questions a finite session could forget an earlier exercise. It also
explicitly accepted the last duplicate candidate, or returned its saved repeat
when the bounded search ran out of eligible MCQ candidates. Neither fallback
guaranteed literal uniqueness. Exam inherited both behaviors through the shared
selector. A different question ID, seed or MCQ option order could conceal the
literal repeat; none is the identity of an exercise.

## C. Uniqueness contract

`getExerciseUniquenessKey` returns `JSON.stringify([questionType, structuralIdentity])`.
An omitted legacy type means Naming. Labels, atom IDs, seed, ordinal,
generationIndex and MCQ distractors are excluded. Naming and Build of the same
molecule are different exercises.

Finite Practice retains all accepted keys; Exam retains all keys while preparing
its complete frozen plan. Corrections and post-exam Review reconstruct existing
questions and do not run this selection policy. Endless excludes exactly the
previous eight accepted literal exercises and keeps at most eight keys. It can
reuse a key after it leaves that window; there is no global uniqueness claim.

Search remains bounded at four ordinary candidates or twelve MCQ candidates.
Every duplicate is rejected, including the final candidate. Exhaustion produces
`insufficient-unique-questions`, with this ES message and its English translation:

> Hydrocarbon-Lab no pudo generar suficientes preguntas únicas para esta configuración. Prueba con menos preguntas o selecciona más categorías.

Practice preserves completed attempts and offers its existing controls. A retry
after duplicate exhaustion starts at the next candidate block. Exam exposes no
partial plan or attempts. MCQ eligibility failures retain their separate safe
reason. The bounded search can stop before enumerating the full chemical domain;
the message does not claim the domain has been exhaustively searched.

## D. Duplicate retry and generationIndex

Frozen fixture: `PRACTICE-PHASE3`, categories alkane/alcohol/ester, five Naming
questions. Display question 1 accepts generation index 0. The fixture makes
indices 1, 2 and 3 return that same exercise; all are rejected. Display question 2
accepts real generation index 4. The call trace is `[0,1,2,3,4]`.
Its initial attempt records ordinal 2 and generationIndex 4. Correct mistakes
reconstructs index 4 exactly, with its graph, bilingual reference and question
identity intact. A separate fixture repeats a key after ten prior accepted keys
and proves that the old eight-question window and final-candidate fallback
cannot reintroduce it.

## E. EXAM-003

Practice still renders its category pill. Exam question markup omits the pill
entirely; its navigation and pre-submit Review contain only ordinals, question
types and completion. The Build bridge passes `hideCategory` to omit the student
family badge in pre-submit Exam, including after Reset. Category remains in the
question, configuration, attempt and metrics. After submission, category metrics,
post-exam feedback and Detailed Reviewer remain available.

Tests inspect complete text and attributes for alcohol, ketone, carboxylic acid,
ester, nitrile and E/Z in Naming, MCQ and Build, in ES and EN. They also render the
actual isolated Build editor, rather than replacing its markup with a stub.

## F. SESSION-COUNT-001

The numeric input retains raw input, validates through SessionConfig's shared
positive safe integer predicate, and has no maximum. Counts 1/7/15/23/37 are
accepted; blank, 0, -1 and 1.5 disable Start and show a localized explanation.
NaN, infinity and unsafe integers are rejected. Practice has a separate Endless
checkbox. Exam is finite only; switching mode preserves the numeric text.
The old exported length lists remain compatibility/convenience presets, not
validation limits. The lower-level Exam cap of 30 was removed.

Browser validation completed both Practice and Exam from question 1 through 15.
Practice summary: 15 answered, `0 / 15`; Exam Review: `15 of 15 answered`, then
results: `0 / 15`. Intentionally incorrect test answers exercised grading rather
than bypassing it. Mixed 15-question tests preserve five questions of each type.
Both modes also generated complete 37-question mixed sessions.

## G. BUILD-004 root cause

Lab's compact direction pad uses four 26px tracks, 2px gaps and 28px height.
Inside `.practice-card`, the generic button rule supplied 44px minimum height and
10px/16px padding. Actual Build buttons were 34px wide on a 28px horizontal pitch:
6px of overlap. Hover scaling could enlarge the overlap. Lab buttons measured
26×28px. These are HTML controls below the SVG, so the cause was CSS track/button
geometry, not SVG transforms, duplicated overlays or chemistry coordinates.

## H. BUILD-004 fix

Only isolated Build now uses a 2×2 grid with a shared 44px target variable and
8px gaps. Border-box button dimensions, minimum dimensions and grid tracks agree;
padding is zero and hover does not scale. No graph coordinates, viewBox calculation
or evaluation adapter changed. At desktop/390/320px, buttons measured 44×44px and
all six pairwise rectangular intersection areas were zero. Lab remained 26×28px.

Real browser pointer tests at each width clicked every arrow's center and 1px
inside its edge on fresh methane drafts: all 24 clicks added exactly one carbon.
Clicks in the 8px gaps added none. Initial exploratory multi-carbon clicks into
an occupied neighbor appropriately made no new bond; fresh drafts isolate each
arrow's interaction from that existing geometry guard.

Additional branched editing added one atom per up/left/right action, reaching five
atoms; Undo gave four, Redo restored five, and ES/EN preserved five. Reset returned
to methane. The valid five-atom student draft could be reviewed, submitted and
revisited beside the alcohol target after grading. The Lab molecule remained
methane. Both desktop and mobile screenshots and raw measurements were saved.

## I. REVIEW-001

The old highlight reused a subtle generic blue. In dark mode, the more specific
history-preview rule overwrote it with the normal mint bond color
`rgb(123,196,174)`, even while width increased to 4px.

One dedicated active-review color is used per theme: light `#b45309`, dark
`#ffd166`. Specificity matches the dark history rule. Highlighted bond strokes
are 2.8px with a 10px translucent halo underneath; double/triple component strokes
remain separate. Highlighted atoms have transparent 3px outline rings and marked
carbon centers. Heteroatom labels keep their opaque background and readable text.
No blinking, chemical color taxonomy or ReviewModel change was introduced.

Browser computed styles confirmed `rgb(180,83,9)` in light and `rgb(255,209,102)`
in dark. The same ketone carbonyl retained both double-bond strokes, one halo and
two atom rings in both themes. Parent, OH, carbonyl, substituent and E/Z steps
were checked, including Build student/reference post-exam review. Step changes
change semantic highlight sets. ES/EN preserve highlighted IDs and geometry.
Existing tests verify unchanged attempts, response timing and mastery when opening,
selecting steps, localizing and closing the Reviewer.

## J. Determinism

Generator version stays 1; recipes, RNG and seed derivation are unchanged.
Accepted indices remain real generation indices. Whole-session filtering can
change a new session's later sequence where the old policy allowed duplicates;
reconstruction of an accepted question is unchanged. A 15-question mixed Exam
plan matches across locales and a fresh Node process. Existing ten-question
process, frozen correction and MCQ provenance tests also remain applicable.

## K. Sweeps

All 17 current categories; seeds HARDENING-1/2/3; count 15. Reproduce with
`node scripts/session-hardening-sweep.mjs`. Raw output: `session-hardening-sweep.json`.

| Mode | Configuration | Sessions | Questions | Duplicates | Exhaustions | Skips | Mean retries | Max |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Practice | Naming | 3 | 45 | 0 | 0 | 0 | 0 | 0 |
| Practice | MCQ | 3 | 45 | 0 | 0 | 3 | .0667 | 1 |
| Practice | Build | 3 | 45 | 0 | 0 | 2 | .0444 | 1 |
| Practice | Mixed | 3 | 45 | 0 | 0 | 4 | .0889 | 1 |
| Exam | Naming | 3 | 45 | 0 | 0 | 1 | .0222 | 1 |
| Exam | MCQ | 3 | 45 | 0 | 0 | 3 | .0667 | 1 |
| Exam | Build | 3 | 45 | 0 | 0 | 1 | .0222 | 1 |
| Exam | Mixed | 3 | 45 | 0 | 0 | 2 | .0444 | 1 |

Total: 24 sessions, 360 questions, 376 candidate calls, 16 skips, 0 failures;
mean .0444 retries per accepted exercise, observed maximum 1. Eligibility and
duplicate skips are both counted. A narrower E/Z-only 15-question Naming Exam
also completed with zero duplicates and 21 candidate calls. Frozen exhaustion
fixtures verify safe failure independently of statistical luck.

## L. Tests

- `session-hardening.test.mjs`: 32 tests; literal identity; repeat past eight;
  bounded exhaustion; cross-type reuse; real index/reconstruction/corrections;
  bounded Endless; integer validation; two seeds × counts 5/15/30 × four types ×
  two modes; 37-question plans; fresh-process 15-question determinism.
- `exam-ui.test.mjs`: six new privacy cases, each exercising two locales and three
  question types before/after submission; numeric configuration contract updated.
- `session-hardening-presentation.test.mjs`: scoped target geometry and theme-safe
  halo/ring contracts.
- `practice-review-ui.test.mjs`: ketone/alkene coverage, halo/ring counts and locale
  equality added to semantic ID and unchanged endpoint tests.
- Existing preset/fallback expectations updated only for the requested session
  contracts. No chemical expectations were changed.

Directed runs: 77/77 existing session/UI tests; 29/29 privacy/presentation/review
tests; 32/32 new integrity tests, all with zero failures/skips.

## M. Validation

| Check | Result |
|---|---|
| Finite Practice no literal duplicates | PASS: 5/15/30, multiple seeds, four type configurations |
| Finite Exam no literal duplicates | PASS: whole frozen plans |
| Duplicate retry deterministic | PASS: frozen `[0,1,2,3,4]` |
| generationIndex preserved | PASS: ordinal 2, index 4 |
| Correction reconstruction | PASS: exact original question |
| Endless bounded policy | PASS: previous eight literal exercises |
| Practice category visible | PASS: six categories, both locales |
| Exam category hidden | PASS: text, attributes and actual Build markup |
| Exam pre-submit review hidden | PASS: neutral completion list |
| Post-exam category allowed | PASS: results and review |
| 1 question | PASS: boundaries and browser |
| 15 questions | PASS: tests, balanced schedule and complete browser sessions |
| 37 questions | PASS: complete mixed plans in both modes |
| Practice Endless | PASS |
| Exam Endless rejected | PASS |
| Build hitboxes desktop | PASS: 44px targets, center/edge/gap clicks |
| Build hitboxes 390px | PASS: same pointer checks |
| Build hitboxes 320px | PASS: same pointer checks |
| Normal Lab editor regression | PASS: original 26×28px buttons, original graph |
| Reviewer strong highlight | PASS: dedicated color, halos and rings |
| Light theme | PASS: computed styles and screenshot |
| Dark theme | PASS: computed styles and screenshot |
| Reviewer locale preservation | PASS: identical IDs/endpoints |
| Naming regression | PASS: full suite |
| MCQ regression | PASS: full suite, unchanged distractor chemistry |
| Build regression | PASS: full suite and browser |
| Exam regression | PASS: drafts, navigation, atomic grading, results and review |
| PRACTICE-005 | PASS: accents/spelling acceptance unchanged |
| NOM-ETHER-001 | PASS: ether suites unchanged |
| Full suite | PASS: 2033 tests, 2028 passed, 0 failed, 5 skipped; 789.8s |
| Build | PASS: production build inside final npm test |
| Artifact validation | PASS: ESM Worker default.fetch and hosting manifest |
| Lint | PASS: 0 errors, same 11 existing warnings |
| git diff --check | PASS |

## N. Findings

No additional chemistry issue was discovered. No new finding IDs were introduced.
The existing synchronous Exam planning cost remains, without the arbitrary
30-question cap. Search limits remain bounded; extremely restrictive or large
requests can stop safely when the next unique exercise is unavailable.

## O. Scope

Only the five Phase 9.1 issues were implemented. No difficulty UI, Class Seed,
CSV, Session Dashboard, countdown, new timer, persistence, R/S or generative AI.
No changes to nomenclature, DomainProfile, evaluator chemistry, MCQ recipes,
E/Z rules, ether naming, molecular identity or manual graph coordinates.

## Q. Final state

No commit. No push. The manifest remains tracked and unchanged. Source changes
are the session selector/policies, count scalar validation, Practice/Exam
presentation, Build bridge, SVG highlight presentation, CSS and two i18n entries.
Test changes cover session, count, privacy, presentation and reconstruction;
the sweep helper/script and this report are new. Exact final diff/status and
suite totals are recorded below. No staging or branch change was performed.

`git diff --ignore-cr-at-eol --stat` (tracked files):

```text
 app/exam-panel.tsx                  |  5 +++--
 app/exam-session.ts                 | 21 ++++++++++++++-------
 app/exercise-model.ts               | 12 ++++++++++--
 app/globals.css                     | 33 ++++++++++++++++++++++++++++++---
 app/i18n.ts                         |  2 ++
 app/page.tsx                        | 14 ++++++++++++--
 app/practice-build-editor.tsx       |  6 ++++--
 app/practice-panel.tsx              | 25 +++++++++++++++++--------
 app/practice-session.ts             | 24 ++++++++++++++++--------
 app/session-question-selection.ts   | 25 ++++++++++++++++++-------
 docs/exam-mode.md                   |  4 ++++
 tests/exam-session.test.mjs         |  6 +++---
 tests/exam-ui.test.mjs              | 33 ++++++++++++++++++++++++++++++++-
 tests/helpers/exam-plan-process.mjs |  6 ++++--
 tests/practice-review-ui.test.mjs   |  6 +++++-
 tests/practice-session.test.mjs     | 12 +++++++-----
 tests/practice-ui.test.mjs          |  7 ++++---
 17 files changed, 185 insertions(+), 56 deletions(-)
```

Seven new unstaged files are additional to that tracked-file diff. Final
`git status --short`:

```text
 M app/exam-panel.tsx
 M app/exam-session.ts
 M app/exercise-model.ts
 M app/globals.css
 M app/i18n.ts
 M app/page.tsx
 M app/practice-build-editor.tsx
 M app/practice-panel.tsx
 M app/practice-session.ts
 M app/session-question-selection.ts
 M docs/exam-mode.md
 M tests/exam-session.test.mjs
 M tests/exam-ui.test.mjs
 M tests/helpers/exam-plan-process.mjs
 M tests/practice-review-ui.test.mjs
 M tests/practice-session.test.mjs
 M tests/practice-ui.test.mjs
?? docs/session-hardening-browser.json
?? docs/session-hardening-sweep.json
?? docs/session-hardening.md
?? scripts/session-hardening-sweep.mjs
?? tests/helpers/session-hardening-sweep.mjs
?? tests/session-hardening-presentation.test.mjs
?? tests/session-hardening.test.mjs
```

Browser measurements: `session-hardening-browser.json`. Screenshots are saved
under the task's visualization directory
`C:\Users\Amy\.codex\visualizations\2026\10\01\01a0f576-8c37-73f2-b0f0-64a28a64c889`:
`practice-15-results.jpg`, `exam-15-results.jpg`, `build-390.jpg`, `build-320.jpg`,
`reviewer-light-detail.jpg`, `reviewer-dark-detail.jpg`, `reviewer-substituent.jpg`
and `reviewer-ez.jpg`. The browser viewport and original automatic theme preference
were restored after testing.

## P. Verdict

All five Phase 9.1 issues are implemented and validated. Phase 10 was not started.

PHASE 9.1 COMPLETE — READY FOR PHASE 10
