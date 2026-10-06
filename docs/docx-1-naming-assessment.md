# DOCX-1 — Configurable Naming assessment export

## A. Baseline

DOCX-0 was committed at `a33f978` (`feat: add docx export foundation`) on `main`; the working tree was clean before DOCX-1 began. The engine remains at `GENERATOR_VERSION = 4` with Difficulty IDs `basic`, `intermediate`, and `advanced`. This change does not edit chemistry, Difficulty, frozen fixtures, Class Seed, or CSV code.

## B. Architecture changes

The pipeline is:

```text
Exercise Engine
      ↓ Practice selection (`selectSessionQuestion`)
Naming assessment selection (`app/docx-assessment-selection.ts`)
      ↓ one immutable structured assessment
Model (`app/docx-export-model.ts`)
      ↓ shared model
Student / Teacher renderer (`app/docx-export.ts`)
```

Selection uses the existing seeded session configuration and bounded duplicate-selection mechanism. It occurs before the renderer. The renderer only lays out the supplied prompts, PNGs, and answer key; it neither generates chemistry nor derives names. One model instance produces both audience versions.

## C. Assessment configuration

`createNamingAssessmentConfig` accepts a required nonblank `seed`; `locale` (`en` or `es`, default `en`); `questionCount` (5, 10, 20, or 30, default 10); `difficulty` (`basic`, `intermediate`, or `advanced`, default `basic`); one or more canonical category IDs (default `alkane`, `alkene`, `alkyne`); and Naming-only `questionType`. `generatorVersion` is derived from the current engine version; a supplied non-current version is rejected. Unknown fields, unsupported counts/locales/difficulties/types/categories, empty or duplicate categories, and blank seeds fail explicitly.

The category list is normalized through the existing session config. It never accepts a translated label or synthetic `all` ID. The assessment metadata keeps seed, version, Difficulty, selected categories, locale, type, and count.

## D. Student version

The student document contains Hydrocarbon Lab branding, a localized title, Name/Course/Date fields, numbered Naming prompts, the production-rendered molecular structures, and answer lines. It omits seed, generator metadata, internal identities, the teacher label, and the answer key. The proof checks every inflated ZIP entry for each reference answer's UTF-8 byte sequence, not only visible document text.

## E. Teacher version

The teacher document uses the same questions, order, and images as the student copy, adds `Teacher Version` / `Versión docente`, then inserts a page break and a localized Answer Key. Each key entry is copied from `reference.names[locale]` on the selected engine question. The renderer does not invoke a namer again.

## F. ES/EN behavior

The title, student fields, prompt, answer label, teacher label, and key heading are localized. A real engine-generated assessment test confirms that the same seed and locale-independent generation settings produce identical question IDs, structural identities, and category order for ES and EN, while names are read in the requested locale. It also renders both locales and checks their localized document text and answer keys.

## G. Structure assets

`scripts/docx-structure-assets.mjs` is the Node-only adapter. It renders the existing `MoleculeHistoryPreview` to static SVG and rasterizes the structure SVG with the already-installed development dependency `sharp`. The renderer receives `Uint8Array` PNG bytes and dimensions. Each image is scaled proportionally to fit the document bounds; there is no crop. The model copies the PNG bytes and does not mutate the engine input.

## H. Browser-safety

The model and renderer do not import `fs`, `path`, React, or Sharp, and use no Node-only globals. Buffer-specific output types were replaced by `Uint8Array`; the renderer also exposes browser `Blob` functions. Sharp and filesystem writes remain in scripts/tests. Neither exporter is imported by `app/page.tsx`, so DOCX is not added to the application entry bundle by this phase. `docx` 9.8.1 is already installed from DOCX-0; its package is about 9 MB unpacked, but this phase does not load it from an app route.

## I. Determinism

The proof config is fixed: locale `es`, 10 questions, `intermediate`, categories `alkane`, `alkene`, `alcohol`, seed `DOCX-1-NAMING-ASSESSMENT`, Naming, generator version 4. Repeating the same config repeats the accepted IDs, structural identities, and order. Locale is passed through the existing engine/session path and does not change chemistry. Student and teacher documents are rendered from the same assessment object, so their question identities and image relationship order match exactly.

## J. Privacy and package validation

The permanent test and proof inflate every package entry and scan student entries for each exact reference answer's UTF-8 bytes. The teacher package must include every selected localized answer. Both packages are checked for `word/document.xml`, the expected prompt count, matching image count, and embedded image references. The teacher key must follow an explicit page break. The tests also compare the student/teacher image relationship order and assert model immutability after rendering.

## K. Tests and proof output

`node --test tests/docx-export.test.mjs` passes 3 tests. It covers strict config validation, all four count values, metadata propagation, malformed model inputs, deterministic repeat selection, ES/EN identity, localized package content, answer privacy, matching Student/Teacher questions, image parts, and immutability.

`npm run docx:proof` passes using the representative real-engine config above and writes ignored outputs to `outputs/docx-1/`:

- `hydrocarbon-lab-naming-student.docx` — 25,414 bytes, 10 embedded structures.
- `hydrocarbon-lab-naming-teacher.docx` — 25,634 bytes, 10 embedded structures and 10 localized key answers.
- Student answer leak scan — PASS.

## L. Validation

- `npm run test:critical` — 157 passed, 0 failed. Frozen fixture tests passed; fixtures were not changed.
- `npm test` — 2,487 passed, 0 failed, 5 skipped (full suite, run once).
- `npm run build` — passed.
- `npm run build:pages` — passed.
- `npm run validate:pages` — passed; 3 entries and 3 assets.
- `npm run lint` — passed with 0 errors and 12 warnings at the time of the full run. The one DOCX proof warning (unused local) was then removed; targeted lint over all DOCX files passes with 0 warnings or errors. The remaining full-lint warnings are in existing unrelated files.
- TypeScript baseline comparison — 34 diagnostics at committed HEAD and 33 after DOCX-1; 0 new diagnostics and 1 resolved pre-existing DOCX-0 model diagnostic. The direct `npx tsc --noEmit` command still exits nonzero because of the repository's existing diagnostics elsewhere.
- Microsoft Word was not available for inspection. OOXML package structure and media were verified programmatically; visual pagination/corruption is not claimed.

The production build emitted existing Cloudflare Node-compatibility and large-chunk warnings. The Pages build emitted the existing large client chunk and ineffective dynamic-import warnings. Neither build output reported an exporter import from the app entry.

## M. Files

DOCX-1 changes are confined to the model/renderer, a selection module, the Node proof and structure adapter, the DOCX test, the `docx:proof` package script, this document, and ignored `outputs/docx-1/` proof packages. DOCX-0 files, frozen fixtures, chemistry sources, and package dependencies are not changed by this phase.

## N. Limitations and DOCX-2 handoff

DOCX-1 exports Naming only. It adds no UI, MCQ, Build worksheet, or browser-side structure rasterizer. For DOCX-2, extend the document question projection with the already-generated four localized options and correct-option identity, keep the correct option out of student package content (including ZIP parts), and render it in the teacher key from the same deterministic assessment snapshot. Do not generate MCQ choices independently for the two audience versions.
