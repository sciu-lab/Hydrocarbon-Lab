# DOCX-4 release hardening report

## Baseline and scope

- Initial baseline: `main` at `7b93b79`; working tree was clean.
- Final code changes are limited to the DOCX proof harness and two DOCX regression test files. No application production TypeScript, chemistry/generator code, Difficulty behavior, or frozen fixtures changed.
- No dependencies were added. No commit or push was made.

## Resolved blocker

The reported 30-question advanced MCQ proof configuration is viable. The mixed-loader diagnostic reproduced a harness failure at generation index 2: Vite SSR created an `InsufficientSafeDistractorsError`, while the assessment selector had been imported by Node's native TypeScript loader. Their error class constructors therefore had different identities, so the selector's `instanceof` check missed the safe-distractor exclusion and reported question 3 as an invalid generated question.

The proof now loads the selector and generator through the same Vite SSR module loader. With the same fixed seed and configuration it selects 30 unique questions. `--diagnose-legacy=<case-id>` remains available to reproduce and report the old loader-identity mismatch; there is no seed retry or generator workaround.

## DOCX proof and visual checks

`scripts/docx-4-proof.mjs` ran six deterministic proof cases (A–F), generated Student and Teacher documents for each, and validated ZIP/OOXML structure, XML well-formedness, document properties/privacy, A4 page geometry, question/answer-key content, relationships, embedded PNGs and image extents. Student/Teacher body text and image order agree. Every embedded structure was checked against the production SVG bond geometry; all measured carbon-bond segment midpoints are visible in the PNG.

| Case | Coverage | Visible carbon-bond segments | Embedded PNGs per output | Student / Teacher bytes |
| --- | --- | ---: | ---: | ---: |
| A | Naming Student, EN, basic, 5 | 28/28 | 5 | 22,942 / 23,068 |
| B | Naming Teacher, ES, advanced, 10 | 108/108 | 10 | 60,039 / 60,291 |
| C | MCQ Student, EN, intermediate, 10 | 92/92 | 10 | 41,616 / 41,790 |
| D | MCQ Teacher, ES, advanced, 10 | 109/109 | 10 | 59,209 / 59,382 |
| E | MCQ Teacher, EN, advanced, 30 | 325/325 | 30 | 165,605 / 166,041 |
| F | Naming Student, EN, intermediate, 20 | 170/170 | 20 | 81,168 / 81,490 |

The proof includes single, double, and triple line orders. Direct PNG inspection confirmed a zigzag alkene, a triple-bond alkyne, an OH label, and a representative image from the 30-question stress case. DOCX images are 360×180 PNGs with a 2:1 aspect ratio. Visual evidence and generated documents are under ignored `outputs/docx-4/` (`visual/` contains extracted PNGs).

DOCX keeps using the app's production structural SVG renderer through the browser/Node adapters. The adapters materialize paint styles for standalone SVG rasterization; molecular strokes do not rely on external CSS variables or the active dark/light theme. The Node adapter remains separate from the document model. The browser download regression verifies separate Student/Teacher downloads and object-URL retention/revocation timing for Both mode.

## Validation

- DOCX-focused tests: `node --test --test-concurrency=1 tests/docx-export-ui.test.mjs tests/docx-export.test.mjs` — **11/11 passed**.
- `npm run test:critical` — **157 passed, 0 failed, 0 skipped**.
- `npm test` — **2,495 passed, 0 failed, 5 skipped** (2,500 total; about 58 minutes).
- `npm run build` — passed; generated Sites artifact validated. Existing vinext Node-import, large-chunk, and route-classification warnings remain.
- `npm run build:pages` — passed. Existing dynamic-import and large-chunk warnings remain.
- `npm run validate:pages` — passed; 3 entries, 3 assets, base `/Hydrocarbon-Lab/`.
- `npm run lint` — passed with 0 errors and 11 existing warnings.
- `npx tsc --noEmit --pretty false` — still reports the same pre-existing diagnostics captured before this change, in chemistry-document-validation, fused-ring-nomenclature, iupac-name-normalization, name-suggestions, name-to-molecule, page, skeletal-layout, and Cloudflare worker typings. No DOCX file appears in the diagnostics.
- `git diff --check` — passed.
- No frozen fixtures changed.

## Manual review still required

No Word or browser PASS is claimed. LibreOffice is unavailable, and the final visual review is a **MANUAL USER CHECK**. Please inspect these four files in Word:

1. `outputs/docx-4/hydrocarbon-lab-A-naming-student-5-en-basic-student.docx` — Naming Student, 5.
2. `outputs/docx-4/hydrocarbon-lab-B-naming-teacher-10-es-hard-teacher.docx` — Naming Teacher, 10.
3. `outputs/docx-4/hydrocarbon-lab-C-mcq-student-10-en-intermediate-student.docx` — MCQ Student, 10.
4. `outputs/docx-4/hydrocarbon-lab-D-mcq-teacher-10-es-hard-teacher.docx` — MCQ Teacher, 10.

Then check the app in a browser: download Both files for the 10-question MCQ case (Student and Teacher), inspect the 30-question stress document at `outputs/docx-4/hydrocarbon-lab-E-mcq-teacher-30-en-hard-teacher.docx`, and switch to dark theme before exporting a printable DOCX. Confirm both downloads and visible bonds in the exported structures.

**Status: DOCX-4 AUTOMATED HARDENING PASSED — MANUAL WORD/BROWSER CHECK PENDING.**
