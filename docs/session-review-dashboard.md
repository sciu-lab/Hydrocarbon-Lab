# Session Review / Dashboard — Phase 11

## Architecture

```text
AttemptRecord[] + original SessionConfig + completed state
                         ↓
                  buildSessionReview
                         ↓
                 SessionReviewModel
                         ↓
                  shared dashboard
                         ↓ user chooses Review
             lazy exact question reconstruction
                         ↓ user chooses Review answer
              existing Detailed Reviewer
```

`app/session-review.ts` validates metadata and derives analytics without chemistry,
React, randomness or clocks. It consumes the existing initial-metrics and mastery
functions. `app/session-review-question.ts` reconstructs only the selected question.
`app/session-review-dashboard.tsx` presents both modes, filters and read-only detail.
The existing compact summary consumes the same validated model. The previous
sequential Exam review remains available.

Neither opening review, switching attempts, filtering, changing locale nor reading
Reviewer creates an attempt or changes answers, correctness, drafts, timers, plans
or correction queues. UI selection is local presentation state.

## Exact model schema

The exported TypeScript declarations in `app/session-review.ts` are authoritative.
The serializable, frozen model has these common fields:

| Field | Value |
| --- | --- |
| schemaVersion | literal 1, independent of generator/class/CSV versions |
| mode | practice or exam |
| config | normalized original SessionConfig, including requested questionCount |
| seed, generatorVersion | original generation context; generatorVersion remains 1 |
| questionCount | number of finalized original answered questions |
| initialResults | existing SessionMetrics, calculated from attemptNumber 1 |
| overview | mode-specific counts and unrounded ratios below |
| timing | initial timing; Practice additionally has corrections timing |
| byQuestionType, byCategory | canonical, nonempty groups with original-question metrics |
| questions | ordered QuestionReviewEntry snapshots |

Practice overview: `mode`, `totalQuestions`, `initialCorrect`, `initialAccuracy`,
`masteredQuestions`, `mastery`, `correctedQuestions`, `unresolvedQuestions`,
`totalAttempts`, `correctionAttempts`. Practice also includes existing
`masteryResults: MasteryMetrics`. Exam overview: `mode`, `totalQuestions`,
`correctQuestions`, `incorrectQuestions`, `accuracy`, `score: {correct, total}`,
`totalAttempts`. Exam has no mastery/correction summary fields.

Each `ReviewTiming` contains `attempts`, `totalMs`, `averageMs`, `medianMs`.
Empty timing has zero attempts/total and null average/median. Existing compatibility
`initialResults` retains the original zero-duration empty-log convention; UI shows
an unavailable marker for empty means/medians rather than a timed response.

Each breakdown row contains `id`, `mode`, `questions`, `initialCorrect`,
`initialAccuracy`, `averageInitialResponseTimeMs`. Only Practice rows add
`mastered` and `mastery`. IDs follow EXERCISE_CATEGORIES / QUESTION_TYPES order;
localized labels do not determine order.

Each `QuestionReviewEntry` contains `key`, `questionId`, `displayOrdinal`,
`generationIndex`, `questionSeed`, `generatorVersion`, `category`, `questionType`,
`structuralIdentity`, `firstAttempt`, `attempts`, `initialCorrect`, `finalCorrect`,
`initialResponseTimeMs`, `reviewStatus`. Only Practice adds `mastered` and
`correctionResponseTimeMs`. Attempts are sorted by attemptNumber; raw answers and
submission locale are copied exactly. The model contains no graphs or React values.

Practice statuses: CORRECT_FIRST_TRY, CORRECTED, UNRESOLVED. Exam statuses:
CORRECT, INCORRECT. Status is always visible text, independent of color.

## Metrics and rounding

Let Q be unique original pedagogical questions, I their first attempts, C the
questions with a correct first attempt, and F the initially incorrect questions
with any later correct attempt.

```text
Practice totalQuestions = |Q|
initialCorrect = |C|
initialAccuracy = |C| / |Q|
correctedQuestions = |F|
masteredQuestions = |C| + |F|
mastery = masteredQuestions / |Q|
unresolvedQuestions = |Q| - |C| - |F|
totalAttempts = full Attempt Log length

Exam correctQuestions = correct first attempts
incorrectQuestions = |Q| - correctQuestions
accuracy = correctQuestions / |Q|
score = { correct: correctQuestions, total: |Q| }
```

Zero-question Practice ratios are zero. Repeated successful corrections count a
question once. Core overview/breakdown ratios are unrounded. The existing
compatibility metrics also expose derived percentages, never used as the new ratio
source. UI uses the existing one-decimal percentage and response-time formatters.
Metrics describe this session; they do not infer ability or a weakest category.

Required Practice fixture: 6 questions; 3 initially correct; accuracy 1/2; 5
mastered; mastery 5/6; 2 corrected; 1 unresolved; 9 attempts. UI's existing formatter
shows 83.3% (83,3% in ES); the mathematical percentage is 83.333...%.
Required Exam fixture: 6 questions; 4 correct; 2 incorrect; accuracy 4/6; 6
attempt-one records; no mastery or correction fields.

## Timing

Use responseTimeMs from records exclusively, never submittedAt - startedAt.
Practice initial mean, median and total use only attemptNumber 1. Corrections have
their own total, mean and median. The fixture's initial values 1–6 seconds give
21 seconds total and 3.5 seconds mean/median. Correction values 9, 8 and 7 seconds
give 24 seconds total and 8 seconds mean/median; they cannot alter initial timing.

Exam records already contain accumulated active visit time. Integration tests visit
a question for 20 ms, leave, return for 30 ms and submit at a much later wall time;
the dashboard reports 50 ms. Pre-submit review and post-session review do not count.
The median helper sorts a copy; even medians average the middle pair without
overflow. Missing, negative, nonnumeric or nonfinite durations and overflowing
aggregate totals reject the model, never silently become zero.

## Grouping, validation and lifecycle

Grouping uses the existing practiceQuestionKey contract (questionId, actual index
and display ordinal), never localized names or structuralIdentity alone. Different
pedagogical questions with identical chemistry retain separate histories.

Validation returns a typed NOT_COMPLETED or INCOMPLETE_DATA result. Duplicate/gapped
attempt numbers, missing first attempts, ordinal gaps, changed question context,
unknown selected categories/types, version mismatch, missing MCQ metadata, missing
Build checks/identities, nonserializable records and count inconsistencies are
rejected. Records are never repaired, renumbered or dropped to manufacture metrics.
UI provides a localized incomplete-data message and a safe exit.

`buildSessionReview` normally validates the configured finite count. The explicit
finalizedQuestionCount supports a declared closed Practice prefix. Existing
endPractice supports finite early exit and Endless and retains only config plus
attempts. Its completed-state adapter therefore declares the number of first
attempts as the submitted prefix, checks contiguous ordinals and excludes the open
unsent question. Requested and answered counts remain separately visible. This
existing state cannot distinguish a truncated final record from a legitimate early
exit; no synthetic completion metadata is invented. Direct callers with a known
finite completed count should retain strict default validation.

Only COMPLETE / CORRECTION_SUMMARY Practice and successfully graded EXAM_RESULTS /
EXAM_POST_REVIEW are eligible. Exam validates every entry against its frozen full
plan and exact configured count. Draft, confirmation and atomic-failure states have
no dashboard, partial metrics or Reviewer.

## Lazy reconstruction and student evidence

Practice supplies original config and **real generationIndex**, with the recorded
type and display context to the existing question generator. Reconstruction checks
questionId, question seed, generator version, category, type, target identity and
actual graph identity before display. A failure shows no substitute question.

Frozen skipped-index fixture: seed PRACTICE-PHASE3, EN, categories alkane/alcohol/
ester, Naming, count 5. Question displayOrdinal 2 uses generationIndex 4 and identity
``gC`@H}P@``. Review calls index 4, never ordinal minus one as the chemical index.

Exam uses the already frozen plan question. MCQ uses stable option IDs and
optionSetIdentity/order/provenance, never displayed name equality or a fresh
distractor set. Practice verifies its deterministic original set against saved
option metadata. Selected-option correctness is checked for consistency, not
reevaluated on language change.

Naming shows exact raw answers, localized reference and each recorded result.
Build student structures are parsed only from each attempt's recorded
submittedSmiles. Generator structuralIdentity uses OCL IDCode; Build snapshot
identity uses the existing constitutional identity plus E/Z descriptor. These are
distinct existing formats and must not be compared as identical strings. The review
boundary verifies each saved Build representation with existing identity/stereo
primitives, without comparing student against target or creating a grade.

Detail is read-only: target and student use the existing structure preview, not the
Build editor. Detailed Reviewer receives the selected original question/attempt;
attempt 1 is the default even when later corrected. Existing reasoning, highlights,
halos and atom rings are reused. Users can choose later attempts and move to the next
question in the current filtered list.

## Filters, i18n and accessibility

Filters are local native selects: mode-appropriate status, question type and
category. They preserve original question order and do not change overview metrics.
ES/EN switches labels/reference names only; selected question, attempt, filters,
raw answers, submission locale, identity and timing remain unchanged. No generation
or evaluation is triggered by locale.

The dashboard has semantic headings, dl metrics, table captions/scoped headers,
lists, visible textual statuses, labelled selects, visible keyboard focus and
focus transitions into/out of detail/Reviewer. Tables scroll within their own
container with a 640 px minimum readable width; the surrounding dashboard does not
overflow at 390 or 320 px. Existing general mobile whitespace remains outside scope.
No chart library is added.

## Performance and deterministic sweep

Grouping uses map passes over attempts, with a fixed canonical group vocabulary.
Ordering and numeric median use sorted copies (O(n log n)); there is no quadratic
question grouping or eager per-question chemistry. Existing metric adapters retain
their bounded-category scans. One review click constructs one question and its
recorded student representations; opening the dashboard constructs none.

Local measurements (development machine, individual runs; not performance claims):

| Original questions | Pure analytics | Lazy question reconstruction |
| --- | --- | --- |
| 15 | 0.65 ms | not repeated per session size |
| 37 | 1.21 ms | not repeated per session size |
| 100 | 3.34 ms | not repeated per session size |

One separately measured real reconstruction: 4.63 ms. It is not a full generation
benchmark and is not a promise of constant latency.

Sweep seeds REVIEW-SWEEP-A and REVIEW-SWEEP-B; Practice Naming, Practice mixed,
Exam Naming and Exam mixed; counts 5, 15 and 37. Total: 24 completed sessions, 456
questions. Raw-log correctness/mastery, count/order, timing and breakdowns reconcile;
every question reconstructs; metric mismatches, reconstruction failures and
mutations are zero.

## Coverage and manual validation

New suites: session-review.test.mjs (32 pure cases),
session-review-integration.test.mjs (13 real-engine cases), session-review-ui.test.mjs
(11 bilingual UI/strict-TypeScript cases), shared fixtures. Total 56 new tests.
Coverage includes correction refresh/attempts 1/2/3, immutable initial metrics,
frozen MCQ options, Build identities, skipped indices, Exam atomic failures,
accumulated timing, class-derived Exam, safe malformed logs, read-only history,
locale, 15/37/100 analytics and the bounded sweep. Existing full-suite frozen
chemistry/RNG/MCQ/Build/Reviewer/Class/CSV vectors remain unchanged.

Manual checks used the production Pages artifact because the Vinext development
entry failed to load locally and the Pages development page stalled. No deployment
configuration was changed. Pages production preview completed successfully:

- Practice seed P11-MANUAL, count 15, alkane/alcohol, Naming/MCQ/Build: initial 1/15,
  6.7%; 14 errors. Corrected original heptane Build by constructing seven carbons;
  second Naming correction remained wrong. Return to summary: initial 1/15 and
  timing unchanged; mastery 2/15 (13.3%); corrected 1; unresolved 13; 17 attempts.
- Naming review preserved both raw wrong answers and separate times. MCQ review
  preserved original order, selected ID and correct ID. Build review displayed
  original methane and corrected heptane separately; existing Reviewer worked for
  both initial and later attempts. ES→EN preserved selection/history/timing and
  changed reference etan-1-ol to ethanol.
- Class seed P11-CLASS, anonymous generated participant 001, 15-question mixed Exam,
  same two categories. Pre-submit dashboard count zero. After confirmation: 4/15,
  26.7%, 15 attempts, 46.8 s total active time, 3.1 s mean, 0.7 s median; Naming 0/5,
  MCQ 3/5, Build 1/5. No mastery or correction actions. All three detail types opened.
- Desktop 1280 px and mobile 390/320 px verified. Mobile dashboard client/scroll
  widths respectively 277/277 and 207/207; table scrolling remained contained at
  640 px. Selects were 44 px high; filters and Review/Back/Next worked. Existing
  halo/ring highlights were visible in the light mobile Reviewer; dark Practice
  review and the permanent theme regression tests were preserved.

Screenshots are outside the repository, under the current Codex visualization
directory: p11-practice-desktop.jpg, p11-exam-desktop.jpg, p11-review-390.jpg,
p11-dashboard-320.jpg, p11-review-320.jpg. The development-preview failure is an environment validation
limitation, not an inferred chemistry defect.

## Baseline and final validation

Baseline HEAD d60fcab (`feat: add class seed variants and CSV export`), main,
up to date with origin/main and clean working tree. Baseline suite: 2085 tests,
2080 pass, 0 fail, 5 skip. Baseline build passed; lint had 0 errors and 11 existing
warnings; diff check was clean before editing.

Final `npm test`: 2141 tests, 2136 pass, 0 fail, 5 unchanged skips, 0 cancelled,
1676839.6525 ms. Final separate `npm run build` passed and validated the existing
Sites artifact; Pages production build also passed. A sandbox permission failure
in the final build was rerun with the approved unrestricted build permission.
Final lint: 0 errors and the same 11 preexisting warnings. Final git diff --check
passed. The known SSR/nodejs_compat and chunk-size warnings remain. No generator, RNG,
naming, evaluator, rendering or frozen chemistry test files were changed.

Validation finding DEV-001 (limitation, outside Phase 11): local Vinext development
preview failed twice to fetch its virtual browser entry on Windows; the Pages
development preview also stayed blank. Root cause was not established and no
deployment/tooling changes were made. Browser acceptance checks were completed on
the freshly compiled Pages production preview. Investigating the development
preview belongs to release hardening and does not invalidate the production UI
checks recorded above.

## Limits

This is only the current completed in-memory session. Refresh does not retain its
history. There is no teacher aggregation, cohort analytics, long-term progress,
account history, cloud sync, result export, AI diagnosis or proof of identity.
Class-derived seeds use the normal SessionConfig; no participant result state is
introduced. The dashboard adds no evaluator, chemistry, difficulty, countdown,
persistence, account, LMS, sharing, anti-cheat, leaderboard or R/S support.
