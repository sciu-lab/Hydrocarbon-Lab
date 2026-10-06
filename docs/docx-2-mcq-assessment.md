# DOCX-2 — Student / Teacher Multiple Choice export

## Scope and architecture

DOCX-1 Naming remains supported through the same model and renderer. `DocxAssessmentConfig`, `DocxAssessment`, and `DocxQuestion` are discriminated by the canonical `questionType` IDs `naming` and `multiple-choice`; a document contains one type only. Build and mixed assessments are outside this phase.

The MCQ source is Practice's existing pipeline:

```text
Exercise chemistry generator
  → createPracticeQuestionGenerator + deterministic distractor engine
  → selectSessionQuestion (seeded identity and bounded duplicate checks)
  → DOCX assessment selection
  → typed DOCX model
  → shared Student / Teacher renderer
```

DOCX calls neither the distractor engine nor chemistry generation. It receives real `GeneratedMultipleChoiceQuestion` values, validates their four-option payload and order, then projects localized option text and stable option IDs into the document model. The core model and renderer use no filesystem, React, Sharp, or Node globals. `scripts/docx-structure-assets.mjs` remains the isolated Node adapter for production SVG → PNG images, including the inline SVG styles from DOCX-VIS-001.

## Configuration and question model

`createMultipleChoiceAssessmentConfig` uses locale `es | en`, count `5 | 10 | 20 | 30`, difficulty `basic | intermediate | advanced`, canonical category IDs, a required seed, `questionType: "multiple-choice"`, and current `GENERATOR_VERSION = 4`. Version 5 is not introduced; the exercise model continues to support historical versions 1–4.

MCQ question fields are the shared exercise identity, structural identity, category, difficulty projection, generator version, localized prompt, PNG structure, four ordered `{ optionId, text }` alternatives, `correctOptionIndex`, and localized reference name for the teacher key. The source's recipe/origin metadata and correctness flags are not copied into DOCX question options.

Before creating the model, every one of the four source option IDs is passed through the real `evaluateSessionAnswer` boundary in the requested locale. Model creation fails unless exactly one option is accepted and it is the source question's `correctOptionId` and `reference` option. The existing `validateMultipleChoiceQuestion` contract also verifies four options, option-set identity, and uniqueness in both locales.

## Student and Teacher documents

Student MCQ contains localized title and Name/Course/Date lines, each real molecule image, the localized MCQ prompt, and alternatives A/B/C/D in their generated order. It has no answer line, key page, correct letter, answer flag, engine option ID, distractor origin, or recipe metadata.

The correct localized name appears among the four alternatives by design; that is the answer choice a student must identify. The Student package is checked for correctness-specific field names and internal IDs, rather than incorrectly treating the visible chemistry text as a leak.

Teacher uses the same model, image order, alternatives, and alternative order. Its localized Answer Key adds one entry per question in the form `question number. correct letter. localized reference name` (for example `1. C. 2,6-dimetilhept-3-eno`). The name and correct letter come from the model projection; the renderer does not grade or choose an option.

## Determinism and localization

For identical seed, category selection, difficulty, version, count, and question type, the existing session selector reproduces exercise IDs, structures, categories, option IDs, and option order. ES/EN selection preserves those same identities and option order; prompts and each option's display name are taken from its localized production field. Student and Teacher are rendered from one model instance.

## Proof and current validation

`npm run docx:mcq-proof` reuses the DOCX-1 real-engine proof adapter with a separate `--mcq` mode. Its fixed proof config is ES, 10 questions, Intermediate, categories `alkane`, `alkene`, `alcohol`, seed `DOCX-2-MCQ-ASSESSMENT`, and generator v4. The proof checks all four alternatives and their order, all structure images, all teacher key entries, and absence of correctness metadata from the Student OOXML package. It writes ignored files to `outputs/docx-2/`.

The proof currently emits ten Student and ten Teacher images, four alternatives per question, and ten ordered key entries. The SVG/PNG inspection also confirms the DOCX-VIS-001 inline style path on real MCQ structures, including double- and triple-bond strokes.

## Limitations and DOCX-3 handoff

This phase does not add a web UI, download button, Build worksheet, mixed Naming/MCQ/Build document, Class Seed or CSV changes, or Reviewer export. No chemistry, generator profile, Difficulty behavior, or frozen fixtures are changed. The separated assessment config factories and the shared model/renderer can now be called by a future Naming-or-MCQ export UI without changing document generation semantics.
