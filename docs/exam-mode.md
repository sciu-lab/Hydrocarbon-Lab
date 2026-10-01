# Phase 9 — Exam Mode

## A. Baseline

- Repository: `C:\Users\Amy\Documents\GitHub\Hydrocarbon-Lab`, working directly on `main`.
- HEAD: `374e2e16e79b82722ca06e5f808cc6ffc5670ba4` (`fix: separate skeletal and semideveloped layouts`).
- Initial `git status --short`: only `?? tests/fixtures/reference-corpus-v1-manifest.json`.
- The user explicitly authorized preserving that pre-existing file as an exception to a clean baseline. It was not edited.
- Before implementation: `npm test` reported 1964 tests, 1959 passed, 0 failed, 5 skipped. Build/artifact validation passed. Lint: 0 errors, 11 existing warnings. `git diff --check`: clean.

## B. Exam architecture

```text
Existing generator + seeded scheduler + bounded question selection
                          ↓
                  Frozen Question Plan
                          ↓
                      Draft Store
                          ↓
                 Previous / Next Navigation
                          ↓
             Neutral Review + Submit Confirmation
                          ↓
              Shared Answer Evaluation, atomically
                          ↓
                  Existing Attempt Log
                          ↓
                  Existing Metrics → Results
                          ↓
                 Existing Detailed Reviewer
```

`session-question-selection.ts` extracts Practice's existing bounded selection. `session-answer-evaluation.ts` shares Naming, MCQ and Build grading between the two policies. No generator, seed algorithm, chemistry adapter, naming engine, domain profile, or structural comparison rule was replaced.

`exam-session.ts` owns the pure Exam policy. `exam-panel.tsx` owns presentation and synchronous UI commits; grading executes outside React's replayable state updaters. `practice-panel.tsx` retains the shared topic/type/seed configuration. `practice-summary.tsx` uses the same metrics with an Exam presentation that never calculates Practice mastery. Post-exam review reuses `PracticeSessionView` and the existing Detailed Reviewer.

## C. Exam state machine

```text
CONFIG → EXAM_QUESTION ↔ EXAM_QUESTION
             ↕
         EXAM_REVIEW → confirmation → EXAM_RESULTS ↔ EXAM_POST_REVIEW

Generation failure → EXAM_ERROR → configuration
Grading failure → locked EXAM_REVIEW → explicit retry confirmation
```

The final Next opens pre-submit Review. Review can return to any question while drafts are editable. Submit is unavailable until all drafts are complete. While the confirmation is open, Go to question is disabled; Cancel restores editing. Confirmation also checks completeness. Confirmed submission freezes drafts and commits the entire attempt array only after every grade and record succeeds. A technical failure produces zero attempts, preserves frozen drafts, prevents editing, and offers retry. Successful submission and repeated delivery cannot append duplicates. There are no attempts 2/3 in Exam.

## D. Question plan contract

Each frozen slot stores `displayOrdinal`, `questionType`, actual `generationIndex`, `questionIdentity`, and a frozen question snapshot. The plan is built once; navigation, locale changes, final grading and post-exam review do not call the generator. Stored reference presentation is canonical Spanish; `examQuestion` derives the displayed localized name from the existing bilingual names.

The existing retry bounds are unchanged: recent window 8, ordinary duplicate search 4, MCQ search 12. A failed complete plan produces a safe error rather than a partial exam. The UI and `createExamConfig` accept only 5/10/20/30. The lower-level finite plan policy supports positive counts through 30, allowing nine-question mixed and small fake-clock tests without adding UI lengths.

## E. Draft contracts

| Type | Draft | Neutral completeness |
|---|---|---|
| Naming | Exact `rawText`, including spaces/accents | Non-empty after trim |
| MCQ | Existing `selectedOptionId` | ID exists in the frozen option set |
| Build | Cloned student graph, validation state | Graph passes existing chemistry/domain submission validation |

Drafts contain no correctness or reference feedback and are not AttemptRecords. The Build validator receives only the student graph, never the target; a valid wrong molecule is complete. Invalid or technically unvalidated graphs remain incomplete with neutral messages. Final comparison still uses Phase 8's structural evaluator.

The editor bridge accepts only an optional **student** `initialMolecule`. Home clones it when mounting the isolated editor. Next/Previous restore that graph. Reset deliberately starts methane. Undo/redo history and selection restart on remount; the molecule graph persists. No graph or editor history crosses into the main Lab. The Build target's localized **name** remains the instruction; its graph is never passed to the editor or rendered pre-submit.

## F. Scheduling / reproducibility

The existing seeded shuffled-block scheduler is reused. Every complete three-slot block with Naming/MCQ/Build includes each type once. Tests compare the whole plan across ES/EN and a fresh Node process. Eligibility skips preserve the accepted generation index, and reconstruction uses the same scheduler context, not `displayOrdinal - 1` as a generation index.

## G. No-feedback contract

Question screens contain answer controls, Previous/Next and neutral Review only. Review lists question number, type and Answered/Unanswered, with no target/reference, score, diagnostic, correctness color or Reviewer access. Attempt Log remains empty until submission succeeds.

Existing MCQ option IDs contain human-readable seed namespaces such as `mcq:reference` and diagnostic recipes. Exam therefore keeps them in the state and uses neutral `option-1` through `option-4` as DOM radio values. Selection handlers still store the real IDs. Regression tests reject reference/distractor namespaces and provenance in pre-submit markup. This is a presentation boundary, not an anti-cheat or server secrecy mechanism; the full question data remains in the client as permitted by the MVP.

## H. Timing

The existing browser clock supplies `performance.now()` for duration and wall time for audit. A DOM commit or Build editor readiness starts a visit. Leaving a question accumulates that visit and pauses it. Returning resumes with a new visit. First presentation is recorded once. Locale changes do not stop, reset or restart an active visit.

Pre-submit Review, results and post-exam Reviewer add no response time. Each record's `responseTimeMs` is the accumulated active duration. `startedAt` is the first visit's wall timestamp; `submittedAt` is final submission's wall timestamp. Their difference is intentionally not the Exam duration. Fake-clock tests cover revisits, large wall-clock jumps, delayed submission and locale changes.

## I. Attempt Log

The Phase 4/8 `AttemptRecord` schema is reused unchanged. Its creation API accepts an optional accumulated duration for Exam; Practice still uses its original interval. Records retain slot identity/actual index, seed/version/category/type, submission locale, audit times and correctness. MCQ retains the selected real ID and option-set identity; Build retains the existing compact structural evaluation/SMILES. No editor graph is added to a record. SessionConfig unequivocally identifies `mode: exam`.

## J. Results

Existing metrics calculate score, accuracy, mean/median response time and accuracy by category/type. The mixed-nine regression yields exactly 6/9, 66⅔%, three questions and two correct answers per type, with 600 ms mean and median. Exam does not calculate or show mastery, corrections, or correction actions.

## K. Post-exam Reviewer

Review answers traverses the frozen plan read-only. Naming shows disabled student text/reference; MCQ shows selected/correct options and uses the existing origin/provenance diagnosis; Build shows student and reference structures. Detailed Review uses the existing steps/highlights and safe structural mismatch behavior. Localization and review navigation preserve attempts, metrics, drafts and timings. Returning to results does not grade again.

## L. Practice regression

Practice retains immediate feedback, Detailed Reviewer, initial summary, correction attempts 2/3 and mastery. Shared search/evaluation extraction preserves its bounds and chemistry. Existing UI tests were updated only for the intentionally enabled Exam button. Manual Practice verification produced initial 0/1, then one correction and final mastery 1/1 (100%). Existing Naming, MCQ, Build, correction and Reviewer tests run in the full suite. PRACTICE-005 and NOM-ETHER-001 are also exercised by final Exam grading regressions.

## M. Locale

UI strings are ES/EN through the existing dictionary. Naming raw text, MCQ IDs/order/selection and Build graphs persist across switches. Stored question and option identities are locale-neutral. Correctness is computed using the final submission locale and remains frozen during post-exam localization; the Reviewer retains the original submitted locale.

## N. Performance

Representative mixed plan measurements from the focused run (warm runtime):

| Count | Plan | Final grading |
|---|---:|---:|
| 5 | 205 ms | 7 ms |
| 10 | 1033 ms | 4 ms |
| 20 | 900 ms | 12 ms |
| 30 | 3204 ms | 15 ms |

During concurrent full-suite/build/browser work, the same plan cases took approximately 0.6–9.5 seconds and final grading 17–52 ms. These are local observations, not performance guarantees. MCQ distractor generation and bounded duplicate retries dominate preparation. No student/reference comparisons run during plan creation. Generation remains synchronous and finite; no premature chemical or scheduler optimization was added.

## O. Tests

- `tests/exam-session.test.mjs`: 14 policy tests covering lengths, deterministic complete plan/new process, actual retry indices, safe generation failure, all three drafts, neutral completeness, active timing, exact mixed score/metrics, atomic failure/retry, frozen post-review, PRACTICE-005/ether, and measured costs.
- `tests/exam-ui.test.mjs`: 15 tests covering both locales, finite configuration, Naming/MCQ/Build no-leak markup, neutral Review, results without mastery, student-only editor restoration, invalid Build messages, reused Reviewer, dictionary coverage and strict TypeScript contracts.
- `tests/helpers/exam-plan-process.mjs`: fresh-process reproducibility harness using the production chemistry exports.
- Final directed Exam + Practice UI run: 59 passed, zero failed/skipped.
- `npm test`: 1993 tests, **1988 passed, 0 failed, 5 skipped** (the same five pre-existing skips), including reference corpus and the requested generator/seed/Naming/MCQ/Build/attempt/metrics/corrections/Reviewer/i18n/E/Z/nitro/ether suites.
- After the final confirmation guard adjustment, Exam UI/strict contract tests were repeated: 15 passed, 0 failed/skipped. The policy reconstruction-context test was repeated in the 14-test core suite: all passed. Final production build/artifact, Pages build and lint were also repeated successfully.
- Lint: **0 errors, 11 pre-existing warnings**. Both ordinary and CR-insensitive diff checks are clean.

## P. Validation

| Check | Result |
|---|---|
| Exam enabled; finite-only validation | PASS |
| Naming / MCQ / Build / mixed three-type Exam | PASS — automated and manual |
| Deterministic plan, actual retry indices | PASS — ES/EN and fresh Node process |
| Previous/Next; all three draft restorations | PASS |
| ES/EN preservation | PASS — each question type |
| No feedback/reference leak pre-submit | PASS — markup regressions and manual checks |
| Empty pre-submit Attempt Log | PASS |
| Atomic final grading; attemptNumber 1 | PASS |
| Score and grouped metrics | PASS — mixed 6/9 regression |
| Timing across revisits | PASS — monotonic fake-clock regression |
| Neutral pre-submit Review; Submit confirmation | PASS — manual complete/incomplete/cancel/confirm |
| Post-exam Reviewer; no Correction Loop | PASS |
| Practice Naming/MCQ/Build/corrections | PASS — existing full suite; manual Naming/correction/mastery |
| PRACTICE-005; NOM-ETHER-001 | PASS — directed and existing regressions |
| Full suite; reference corpus | PASS — 1988 pass, 0 fail, 5 pre-existing skip |
| Production build; artifact validation | PASS |
| Pages build used for manual validation | PASS |
| Lint | PASS — 0 errors, 11 existing warnings |
| git diff --check | PASS — ordinary and CR-insensitive |
| Manual desktop | PASS — Naming5, MCQ5, Build5, mixed5; edit/revisit, locale switches, confirmation cancellation, results and Detailed Reviewer |
| Manual mobile | PASS — 390×844 and 320×800, Naming/Build/MCQ, Review/confirmation/results; no horizontal overflow |
| Exit confirmation; Lab isolation | PASS — cancellation preserves graph, discard returns configuration; main Lab remains methane with empty history |

Manual screenshots were saved in the task's visualization directory as `exam-390-naming.jpg`, `exam-320-build.jpg`, `exam-320-review.jpg`, `exam-320-results.jpg`, `exam-desktop-results.jpg` and `exam-desktop-review-final.jpg`. The final confirmation check observed Go to question disabled while confirming, Confirm submission enabled for five complete drafts, and Go to question enabled after cancellation. Browser console: no errors/warnings observed. The viewport override was reset and the temporary browser tab closed after testing.

## Q. Findings

- **EXAM-001 — resolved:** Existing MCQ IDs leaked reference/distractor provenance through radio values. Exam now emits neutral values; internal stable IDs and existing evaluation remain unchanged.
- **EXAM-002 — non-blocking MVP limitation:** Building the complete plan is synchronous and MCQ preparation costs more for larger/duplicate-heavy configurations. Bounded generation and a 30-question cap remain; measured costs are above.
- **EXAM-003 — intentional MVP limitation:** Exam state is in memory only. Refresh/closing the page loses it. There is no persistence/resume flow, countdown, time limit or anti-cheat.
- **EXAM-004 — intentional editor behavior:** Student graphs persist, but undo/redo and selection restart when a Build editor remounts (including navigation or exit-confirmation cancellation).
- The pre-existing NOM-ETHER-002 limitation and lint warnings were not changed. Five existing skipped tests remain part of the baseline; no expectations were changed to hide chemical failures.

## R. Scope

No Class Seed, CSV, countdown, anti-cheat, persistence/resume, Session Dashboard, accounts, new R/S support, or generative AI was added. No naming, SMILES, molecular formula, connectivity, stereochemical rule, functional-group identification, DomainProfile, reference corpus expectation, canvas design, or representation layout was changed in this phase.

## T. Final state

No commit. No push. Nothing staged. HEAD remains `374e2e16e79b82722ca06e5f808cc6ffc5670ba4`; branch `main` remains up to date with `origin/main`. The working tree intentionally contains the implementation and the pre-existing manifest exception.

Modified files implement configuration/Exam wiring, shared evaluation/search, accumulated durations, student graph restoration, mode-aware summary and UI translations/styles. New files contain the pure policy, Exam controller/view, shared helpers, regressions, fresh-process harness and this report. Final `git status --short`:

```text
 M app/globals.css
 M app/i18n.ts
 M app/page.tsx
 M app/practice-attempt.ts
 M app/practice-build-editor.tsx
 M app/practice-panel.tsx
 M app/practice-session.ts
 M app/practice-structural-answer.ts
 M app/practice-summary.tsx
 M tests/practice-ui.test.mjs
?? app/exam-panel.tsx
?? app/exam-session.ts
?? app/session-answer-evaluation.ts
?? app/session-question-selection.ts
?? docs/exam-mode.md
?? tests/exam-session.test.mjs
?? tests/exam-ui.test.mjs
?? tests/fixtures/reference-corpus-v1-manifest.json
?? tests/helpers/exam-plan-process.mjs
```

`git diff --ignore-cr-at-eol --stat` (tracked files):

```text
 app/globals.css                   |  6 ++++
 app/i18n.ts                       | 28 +++++++++++++++++
 app/page.tsx                      |  6 ++--
 app/practice-attempt.ts           |  7 ++++-
 app/practice-build-editor.tsx     |  7 +++--
 app/practice-panel.tsx            | 44 +++++++++++++++++++--------
 app/practice-session.ts           | 63 +++++++++++----------------------------
 app/practice-structural-answer.ts | 27 +++++++++++------
 app/practice-summary.tsx          | 24 ++++++++-------
 tests/practice-ui.test.mjs        |  4 +--
 10 files changed, 131 insertions(+), 85 deletions(-)
```

Git's diff statistic excludes untracked files: this task additionally adds eight new files (four app modules, two test suites, one helper and one report). The pre-existing untracked manifest is not part of the task's changes. Ignored runtime logs are in `.sites-runtime/exam-*`.

## S. Phase verdict

No blocking findings remain. All Phase 9 quality-bar items are satisfied; the documented in-memory/editor-history/performance limits remain within the requested MVP scope.

PHASE 9 COMPLETE — READY FOR PHASE 10
