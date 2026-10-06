# DOCX-0 — Architecture and minimum Word export proof

## A. Repository audit

Baseline: branch `main`, HEAD `35452de` (`test: freeze difficulty v1 release baseline`), clean working tree. The exercise model owns `SessionConfig`, locale, seed, category selection, difficulty, and generator version. At this baseline `GENERATOR_VERSION` is 4 and the supported versions remain 1–4.

Practice and Exam already share `PracticeQuestion` and the chemistry generator. A Naming question carries its production molecular graph, selected category, seed/identity and generator-version metadata, plus `reference.names.es` and `reference.names.en`. Those reference names come from the existing chemistry oracles. `SessionConfig` stores difficulty and locale. The proof uses Practice's existing config builder and `selectSessionQuestion` path; Exam can supply the same structured question payloads later. Class Seed derives ordinary session configs and already has a separate CSV manifest path; neither CSV nor class participant derivation is a DOCX source of truth.

`app/page.tsx` exports the production `MoleculeHistoryPreview` SVG component and chemistry oracle functions. It renders a compact molecule-only SVG using the shared practice layout. The app's downloadable PNG/SVG action operates on the interactive editor canvas and is unsuitable as a document export API. DOCX-0 reuses `MoleculeHistoryPreview` through React static rendering in a proof adapter, then rasterizes that structure-only SVG; it does not screenshot a screen or panel.

Existing useful modules include `exercise-model.ts`, `exercise-chemical-generator.ts`, `exercise-seed.ts`, `practice-question.ts`, `practice-session.ts`, `exam-session.ts`, `session-question-selection.ts`, `exercise-chemistry-oracles.ts`, `practice-reference-answer.ts`, `practice-structural-answer.ts`, `practice-corrections.ts`, `practice-review.ts`, `session-review.ts`, `class-assignment.ts`, `class-assignment-csv.ts`, `practice-molecule-layout.ts`, and `molecule-visual-bounds.ts`. MCQ payloads already carry four options and a correct option ID. ES/EN labels use the established `uiText` dictionary.

## B. Existing reusable infrastructure

The engine's generated graph and `reference.names[locale]` are the source of truth. The export path neither names a graph again nor parses visible UI text. It has no network or PubChem dependency. `selectSessionQuestion` gives the proof the same bounded duplicate-selection behavior as Practice.

No independent molecular renderer was added. The proof renders only the existing `MoleculeHistoryPreview` component to SVG markup and converts that molecule-only image to PNG. The interactive editor's whole-canvas export code was not reused because it is tied to the main UI and current browser DOM.

## C. DOCX library decision

The project had no DOCX writer. `docx` **9.8.1** was selected and locked in `package-lock.json`; its license is **MIT**. The package supports Node and browsers, emits a Node `Buffer` or browser `Blob`, and has APIs for paragraphs, styles, images, page breaks, tables, and page layout. Its current package metadata reports about **9.0 MB unpacked**. The renderer stays in a separate module so the application can load it on demand when a later UI is added.

`sharp` **0.34.5** is explicitly declared for the Node proof adapter, under **Apache-2.0**. That version was already in the project's lockfile through the existing toolchain, so the DOCX work does not add another rasterizer implementation. The main renderer takes PNG bytes as input and does not depend on Sharp or React.

References: [docx package and license](https://github.com/dolanmiu/docx/blob/master/package.json), [docx MIT license](https://github.com/dolanmiu/docx/blob/master/LICENSE), [Node and browser output APIs](https://docx.js.org/api/classes/index.Packer.html), [docx quickstart for images and page layouts](https://github.com/dolanmiu/docx/blob/master/docs/quickstart.md).

## D. Architecture

```text
Exercise Engine / Practice session selection
          ↓ structured PracticeQuestion[] + SessionConfig
DOCX assessment model (app/docx-export-model.ts)
          ↓ prompt, metadata, engine reference answer, PNG asset
DOCX renderer (app/docx-export.ts)
          ↓ Buffer in Node / Blob in browser
DOCX package
```

The model and renderer do not import React. The proof script is a separate Node adapter: it loads the production engine and molecule preview through Vite's SSR loader, renders the SVG component to static markup, converts each structure with Sharp, builds the model, and writes the proof. This is a build-time proof adapter, not a UI download button.

The renderer owns Word presentation only: A4 dimensions, margins, Arial body text, spacing, images, answer lines, and answer-key page break. It introduces no random data.

## E. Document model

`DocxAssessment` contains title, locale, seed, generatorVersion, difficulty, selected categories, questions, and the answer-key flag. Each `DocxQuestion` contains its ordinal, Naming type, category, difficulty, generatorVersion, existing localized prompt, PNG asset with alt text, and reference answer copied from `PracticeQuestion.reference.names[locale]`.

The constructor validates the Naming-only scope and checks question metadata against the session. It copies asset bytes and arrays into a new immutable snapshot; it does not mutate session or engine values. The model accepts both `es` and `en`. It is a small document-facing projection, not a new exercise definition or chemistry model.

## F. Structure-image strategy

`MoleculeHistoryPreview` is rendered at 360 × 180 with practice-mode layout, producing only the chemical structure. Sharp rasterizes that SVG to PNG. Each question image is embedded in the DOCX as PNG media with alt text. The proof contains five separate media files.

No screenshot of the browser, React panel, or interactive canvas is used. A later browser export can pass PNG assets from a browser canvas to this same document model and renderer; the renderer itself only requires bytes and dimensions.

## G. Proof of concept

The generated `outputs/docx-0/hydrocarbon-lab-naming-proof.docx` is an English A4 Practice Naming document with a title, name/course/date lines, five numbered questions using the existing “What is the IUPAC name?” prompt, structure images, answer lines, an Answer Key on a new page, and the five real localized engine references. The `outputs/` directory is already ignored by Git.

Proof configuration: seed `DOCX-0-PROOF-NAMING`; generatorVersion 4; difficulty `basic`; locale `en`; selected categories `alkane`, `alkene`, `alkyne`; Naming only; five questions. Question categories are selected by the normal seeded engine/session selection and are recorded when the proof script runs.

## H. Reproducibility

The same SessionConfig and accepted generation indices select the same questions. Locale is presentation data in the existing generation projection. The DOCX renderer does not call an RNG, chemistry oracle, clock, network API, or random ID source of its own. The proof uses a fixed seed and records the accepted categories and answers in its run output. Reproducibility means identical question payloads for the same config; ZIP bytes are not promised identical across separate library versions.

## I. Testing

`tests/docx-export.test.mjs` checks a deterministic model, five Naming questions, engine reference answers, ES/EN projection, input immutability, a valid ZIP package, `word/document.xml`, Answer Key text, and five embedded image parts. The proof script performs the same package checks on the actual engine-generated document before writing it.

## J. Limitations

- DOCX-0 supports Naming only, in one combined Questions + Answer Key file.
- The renderer accepts already-produced PNG assets. Browser-side structure rasterization and eventual UI are future integration work.
- Questions are session-local snapshots; there is no stored assessment import/export format yet.
- MCQ and Build are not rendered. Student/Teacher versions, configurable answer-key policy, naming/file-name policy, and document styling remain for DOCX-1.
- The file was validated as an OOXML ZIP and its XML/media contents were inspected programmatically. It was not opened in Microsoft Word, so visual fidelity there is unclaimed.

## K. DOCX-1 plan

1. Define teacher/student views and answer-key visibility using the same document model.
2. Accept Practice and Exam session snapshots, configurable counts, Difficulty, categories, seed, and ES/EN.
3. Add MCQ fields for four localized options and correct-option identity; place that answer in the teacher key without recomputing it.
4. Translate Build into a paper prompt (existing target name) and a reserved drawing area; do not export a Build editor state as a question.
5. Add safe filename construction and only then wire an eventual UI to lazy-load the renderer.
6. Keep structure PNG generation as a boundary adapter around the established molecule preview pipeline.
