# DOCX-3 — Browser worksheet export

## A. Baseline

- Branch: `main`.
- HEAD before DOCX-3: `b146f49 feat: add deterministic mcq docx export`.
- Working tree before work: clean; DOCX-2 and DOCX-VIS-001 were committed.
- `GENERATOR_VERSION` remains 4; Difficulty v1 and all frozen fixtures remain unchanged.

## B. Entry point

The compact **Create worksheet / Crear guía** button sits beside Practice / Exam and How to use in the existing header action group. It opens a dedicated dialog rather than placing 17 topic controls on the lab canvas.

## C. UI architecture

`app/docx-export-panel.tsx` owns local worksheet configuration and status. A native modal `<dialog>` supplies keyboard operation, Escape handling, initial focus, a named modal surface, and focus restoration to the launcher. It never reads or changes Practice/Exam state. The panel reuses `DifficultySelector` and the Practice topic groups for localized category names.

## D. Configuration mapping

The public controls map to the core's canonical values:

| UI control | Core value/default |
| --- | --- |
| Naming / Multiple choice | `naming` / `multiple-choice`; default Naming |
| Questions | 5, 10, 20, 30; default 10 |
| Easy / Intermediate / Hard | `basic` / `intermediate` / `advanced`; default Easy |
| Categories | All 17 `EXERCISE_CATEGORIES`; multi-select |
| Document language | `es` / `en`; defaults to app locale |
| Seed | Exact user text, or one `worksheet-<crypto.randomUUID()>` seed when blank |
| Output | Student / Teacher / Both; default Both |

`createDocxExportRequest` validates the UI boundary and delegates empty-seed handling to Practice's existing `resolvePracticeSeed`. An empty category list disables generation and has localized help; no category is selected implicitly. Naming/MCQ share the same category support in the Exercise Engine, so changing question type preserves selected topics.

## E. Browser asset and DOCX pipeline

```text
UI request → real Practice question generator → seeded session selection
           → one immutable DOCX assessment model
           → existing MoleculeHistoryPreview → SVG with shared inline paint
           → browser Image + canvas → PNG Uint8Array
           → Student / Teacher Packer.toBlob → browser downloads
```

`app/docx-structure-assets-browser.ts` reuses the production `MoleculeHistoryPreview`; it does not add another chemical renderer. `app/docx-structure-svg-style.js` is the small style source shared with the Sharp-only Node proof adapter. Each browser raster is checked for visible ink at every SVG bond-stroke midpoint before it can enter a document, then supplied to the unchanged DOCX model as PNG bytes. Browser generation uses `Blob`, `Image`, canvas and `Uint8Array`; there is no `sharp`, filesystem adapter, server route, or network dependency in this path.

## F. Lazy loading and bundle

The panel dynamically imports `docx-browser-export` only after Generate. The image adapter and DOCX renderer are separate dynamic chunks; the renderer/library is not copied into the initial client payload.

The latest Pages build emitted: `docx-browser-export` 8.82 kB, browser structure adapter (including browser React static rendering) 189.83 kB, and DOCX renderer 394.96 kB. The initial main JS grew from 1,995.65 kB at the pre-change Pages build to 2,004.23 kB (+8.58 kB, about 0.43%). The DOCX chunks contain no `sharp`, `node:fs`, or `node:path` strings. Existing Cloudflare compatibility, dynamic import, and large-chunk warnings remain unrelated.

## G. Student / Teacher / Both

The browser helper selects questions, renders images, and creates exactly one `DocxAssessment` model. Student, Teacher, or both renderer functions consume that same snapshot. Both exposes two sequential downloads plus direct retry links; it does not produce a ZIP. Student fields contain no reference-answer or correctness projection; Teacher retains the established Answer Key.

## H. Naming and MCQ

Naming and MCQ use the real seeded Exercise Engine and existing bounded selection. MCQ alternatives retain engine order and IDs in the model; the existing evaluator verifies their identity and Teacher key. UI selection does not invoke chemistry, naming, or distractor generation independently for each output.

## I. Locale independence

App UI copy follows the current application locale. Document locale is a separate setting. Until the user chooses a document locale, it follows the app locale; after an explicit choice, the override remains stable across prop locale changes. Browser proof B used a Spanish UI to generate an English document.

## J. Seed and reproducibility

The seed is created once at the request boundary only if its input is blank, retained in the field, and reused for every requested audience version. A typed seed is preserved verbatim. No random seed is derived for the Student/Teacher renderer.

## K. Accessibility and status

Native fieldsets, radio inputs, checkboxes, labels, and select controls keep the form keyboard operable. The dialog has an accessible name; focus enters it, Escape and Close dismiss it except while generating, and closing returns focus to the launcher. Loading uses a polite live status, errors use visible `role=alert`, and Generate is disabled while busy or with no categories. No spinner-only status or new UI dependency was added.

## L. Responsive and themes

The dialog has a bounded width/height and its own vertical scrolling. At the requested 390 px override the in-app browser reported a 375 px CSS viewport: the dialog remained within the viewport (366 px wide), with no document or dialog horizontal overflow; the 17 categories scroll vertically and the sticky Generate footer remains in the dialog. At 768 px the dialog was 700 px wide with three category columns and no internal overflow. The underlying, inert app canvas independently measured 929 px of content at that size because its existing `.analysis-utility-bar` extends beyond the viewport. At 1280 px the dialog remained 700 px wide and the document had no horizontal overflow. The dark theme was visually inspected; the new rules use existing paper/ink/line tokens and include dark-theme borders.

## M. Browser proofs

From the local Pages app and its real UI:

1. **A — Naming Student:** app English, Naming, 5, Easy, Alkanes only, blank seed, Student. Generation reached the ready state, returned exactly one Student link, generated one secure seed, and retained it visibly.
2. **B — MCQ Both:** app Spanish, Multiple choice, 10, Intermediate, Alkenes + Alcohols, document English, seed `DOCX-3-MCQ-PROOF-ES-UI`, Both. Generation reached the ready state and returned one Student and one Teacher link. The browser-side bond-pixel assertion passed across all included structures.
3. **C — long worksheet:** app English, Naming, 20, Intermediate, all categories except E/Z stereochemistry, seed `DOCX-3-LONG-20`, Student. Generation reached the ready state and returned one Student link in about 25 seconds; every rendered bond stroke midpoint passed the browser-pixel assertion. The initial Easy/all-category attempt returned the generic error after the real generator produced an invalid first question; the Intermediate proof succeeded after removing E/Z.
4. **D — alkyne:** app English, Naming, 5, Intermediate, Alkynes only, seed `DOCX-3-ALKYNE-PROOF`, Student. Generation reached the ready state and returned one Student link; the browser-pixel assertion checked all triple-bond strokes.

The Codex in-app browser does not expose its Blob anchor downloads to its `download` event or `downloadMedia` bridge; both methods timed out even though the UI produced Blob-backed `.docx` links and success feedback. Therefore it could not save those proof binaries to `outputs/docx-3/` for an independent package unzip in this environment. This is a browser-bridge limitation, not a failed generation. The Node DOCX proofs still verify ZIP structure, prompt/media counts, MCQ options, Student privacy and Teacher answer keys. No generated DOCX is committed.

## N. DOCX visual integrity

DOCX-VIS-001 remains fixed. Browser rasterization shares the inline style source with Sharp proof generation and checks all SVG bond stroke midpoints against actual canvas pixels before packing. Browser proofs A/B passed this gate. The Node VIS-001 proofs also pass with 8/8 visible C–C strokes for alkane, 8/8 for alkene (including both double-bond strokes), and 8/8 for alcohol; the MCQ proof includes a triple-bond structure whose three strokes were visible.

## O. Privacy

The unchanged model/renderer keeps reference answers out of Student Naming and correctness indices/flags out of Student MCQ; only Teacher includes the answer key. The existing DOCX proof packages scan Student package entries and Teacher key text. The browser UI shows no solution preview.

## P. Performance

The browser adapter renders structure images serially to bound canvas memory and reports no synthetic progress percentage. UI generation reached success for 5-, 10-, and 20-question proofs; the 20-question proof took about 25 seconds on this local run. No hardware-dependent pass threshold is set.

## Q. Validation

`npm run test:docx-ui` passes 10/10; `npm run test:critical` passes 157/157; and the full `npm test` passes 2,494 with 0 failures and 5 skips (4,136 seconds). `npm run build`, `npm run build:pages`, and `npm run validate:pages` pass. Repository `npm run lint` reports 0 errors and 11 existing warnings; the focused DOCX lint has no warnings. `git diff --check` passes. `npx tsc --noEmit --pretty false` still exits nonzero on existing diagnostics in chemistry-document validation, fused-ring nomenclature, IUPAC normalization, name suggestions, `page.tsx`, skeletal layout, and Cloudflare worker types; after correcting the new panel's question-count annotation, there are no diagnostics in any DOCX-3 file. The Pages build retains its existing Cloudflare compatibility, ineffective dynamic import, and large-chunk warnings.

## R. Files, limitations, and handoff

DOCX-3 modifies the UI panel, browser orchestration and raster adapter, a shared SVG style helper, header integration, i18n, CSS, package test script and DOCX UI tests; this document is new. No chemistry, engine, Difficulty, MCQ generation, or frozen fixtures changed. Build and proof outputs remain ignored; no generated DOCX proof was committed. The feature supports Naming/MCQ only: no Build, mixed assessment, ZIP, Class Seed integration, CSV, custom title/branding, or persistence. DOCX-4 should focus on Word/LibreOffice compatibility, layout hardening, browser download edge cases, and release hardening. No commit or push is part of this phase.
