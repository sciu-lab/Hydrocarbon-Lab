# Difficulty D8 — release hardening and freeze

## A. Baseline

HEAD `94c9435ac5aafbc66b6ed67bb58a8d7563ef990f`, main synchronized with origin/main, initially clean. Recent history confirms D0–D7 and D5-CI-001. All eight requested architecture reports were read before edits. No applicable AGENTS.md. Current generator **4**, supported **1/2/3/4**.

Historical D7 release baseline: critical 157 PASS; full 2477 PASS / 0 FAIL / five historical skips. These are historical results, not a second D8 full-suite baseline. Fresh D8 baseline: frozen/plumbing **19 PASS / 0 FAIL**, 256.173 s. TypeScript baseline retains 32 existing diagnostics.

## B. Scope

Release verification only. Production, chemistry, family registry/recipes, profiles, namer, canonical identities, MCQ recipes/selection, Build comparison, UI, i18n, Class/CSV, generator versions, package/dependencies and CI remain unchanged. No historical fixture is regenerated. D0 exclusions subsequently promoted by D3/D4.2A/B/D5 are interpreted through those later contracts, without rewriting D0.

## C. Method and matrix

The new `tests/difficulty-v1-release-sweep.test.mjs` has two explicit modes. Default CI uses alkane/alcohol/aromatic/ez across three levels; Easy ez is N/A. `D8_DEEP=1` checks all 17 IDs with eight fixed health seeds and five bounded MCQ seed searches per compatible cell. Locale repeats use the first three health seeds. Graph validators and production oracles verify category and level; tests do not reproduce chemical classification rules.

Naming configurations plus explicit MCQ context intentionally retain one chemical namespace when comparing modalities. Complete public mixed sessions are checked separately because changing the selected type set/count/mode changes the existing seed namespace. These are stratified configurations, not the complete Cartesian product of all controls.

Deep invocation (PowerShell):

```powershell
$env:D8_DEEP='1'
node --test --test-concurrency=1 tests/difficulty-v1-release-sweep.test.mjs
Remove-Item Env:D8_DEEP
node outputs/difficulty-d8/fresh-process-audit.mjs
```

The second utility is an ignored, deterministic release audit. It starts three fresh processes ES/ES/EN, each covering all levels, mixed Practice/Exam and Class participant plans. Scripts/logs/manifests/screenshots remain ignored under `outputs/difficulty-d8/`.

Fixed seed sets: `D8-HEALTH:0..7` at generationIndex 11; `D8-MCQ:0..4` searched indices 0..11; `D8-FINITE` for single-category plans; `D8-LENGTH` for alkane/alcohol/ester/nitrile at 10/20/30; `D8-ENDLESS` for alkane/alcohol/ester at 60 submitted questions; `D8-LIFECYCLE` for the same three categories at six mixed-type questions in both modes; `D8-PRIVACY` for amide renderer checks; `D8-EXHAUSTION` for injected oracle failure. Class Seed is CHEM-4B-2026, participants 001/002, six mixed-type Exam questions, all levels.

| Difficulty | Supported health cells | Primary targets | Accepted MCQ | Session configurations | Conserved session questions |
|---|---:|---:|---:|---:|---:|
| basic | 16; ez N/A | 128 | 75 | 38 | 279 |
| intermediate | 17 | 136 | 85 | 40 | 297 |
| advanced | 17 | 136 | 85 | 40 | 302 |
| Total | 50 plus one explicit N/A | 400 | 245 | 118 | 878 |

These count configuration contexts/slots, not unique molecules. The 878 includes 180 Endless submissions and 36 public mixed slots; 18 corrections are replays, not new targets. Fresh audit captures 72 logical slots three times (216 captures): 36 mixed slots already in the session matrix, plus 36 Class slots. Eighteen renderer plans are separate. Repeated checks and reused historical/D7 tests are not added as new coverage.

## D. Generation health

Health checks use the actual graph, valence oracle, canonical identity, bilingual reference, minimum-Difficulty classifier and level-specific parent/profile validators. **400/400 valid**, 0 unexpected chemical exhaustion, 0 invalid category/level, 0 silent fallback. Every primary health target succeeded on chemical attempt 1; injected invalid-valence controls exhaust exactly 16 attempts at each level. Easy E/Z is explicit incompatibility.

All **22/22 certified Hard families** were reached without supplementary seed discovery:

| Family | Category sampled | Seed | generationIndex |
|---|---|---|---:|
| mixed-trialkyl-alkane | alkane | D8-HEALTH:0 | 11 |
| enyne-hydrocarbon | alkene | D8-HEALTH:0 | 11 |
| amino-alcohol-enyne-bromo | halogenated | D8-HEALTH:0 | 11 |
| hydroxy-ketone | halogenated | D8-HEALTH:2 | 11 |
| diol | alcohol | D8-HEALTH:0 | 11 |
| enyne-alcohol | alcohol | D8-HEALTH:2 | 11 |
| amino-alcohol | alcohol | D8-HEALTH:3 | 11 |
| alkoxy-alcohol | alcohol | D8-MCQ:1 | 0 |
| hydroxy-aldehyde | aldehyde | D8-HEALTH:0 | 11 |
| dione | ketone | D8-HEALTH:0 | 11 |
| amino-acid | carboxylic-acid | D8-HEALTH:0 | 11 |
| amino-hydroxy-acid | carboxylic-acid | D8-HEALTH:1 | 11 |
| hydroxy-acid | carboxylic-acid | D8-HEALTH:2 | 11 |
| enyne-acid | carboxylic-acid | D8-HEALTH:6 | 11 |
| enyne-ester | ester | D8-HEALTH:0 | 11 |
| enyne-amine | amine | D8-HEALTH:0 | 11 |
| enyne-amide | amide | D8-HEALTH:0 | 11 |
| mixed-trialkyl-carbocycle | simple-carbocycle | D8-HEALTH:0 | 11 |
| mixed-trialkyl-benzene | aromatic | D8-HEALTH:0 | 11 |
| mixed-trialkyl-ez | ez | D8-HEALTH:0 | 11 |
| enyne-nitrile | nitrile | D8-HEALTH:0 | 11 |
| enyne-nitro | nitro | D8-HEALTH:0 | 11 |

## E. Locale independence

Repeat equality checks the full generated payload. ES/EN comparison normalizes only the display-name projection; identity, graph, seed, index, version and metadata must be identical. **150 health locale pairs** and all **245 accepted MCQ option payloads** pass. Three independent processes agree over the complete 72-slot capture, ES/ES/EN.

## F. Naming

Naming uses `evaluateSessionAnswer`: exact visible references accept, controlled appended-character errors reject: **800 self-acceptances + 800 controlled rejections**, with exact bilingual oracle consistency. MCQ additionally performs 1,960 option-name grading checks; PRACTICE-008 remains an explicit critical/full regression.

## G. MCQ

Every admitted MCQ must satisfy the production four-option validator, exactly one correct flag, normalized bilingual uniqueness, real option-ID grading, rejection of each wrong name by Naming grading, exact repeated order and locale-independent option payload. Existing bounded capability search remains 12. Easy aromatic lacks three safe distractors in its tiny benzene/toluene space: a recorded explicit capability exhaustion, not a simulated passing MCQ or fallback to another type/level. **245 admitted questions / 980 bilingual options / 1,960 localized option checks**, each checked through both option-ID and Naming grading. Zero collisions or multiple-correctness violations. **69 raw capability rejections**: 60 in five complete Easy-aromatic searches, nine recovered by the existing bounded search. D7 chemical alias, enyne highlight and aromatic diagnosis controls pass again.

## H. Build

Build compares exact targets and rotated/scaled/remapped IDs, arrays and ring metadata. A valid incorrect elemental graph must remain comparable and incorrect. Existing D7/foundation/structural tests retain same-formula connectivity mutations, lost double/triple orders, correct/opposite/missing E/Z and drawing-orientation invariance; these detailed cases are reused rather than copied into another large matrix. New matrix: **150 comparisons** (50 exact, 50 transformed/remapped, 50 valid incorrect graphs). Reused D7: **245 comparisons + five stereo/enyne supplementary mutations**, with no new domain/equivalence rules.

## I. Reviewer

Correct and controlled unknown Naming ReviewModels are rendered in ES/EN using real chemistry and frozen attempts. Localized messages must be nonempty, with valid atom/bond highlights and no unresolved internal keys. Actual Lab reasoning builders produce literal name fragments; complete link parts reconstruct the visible name and spans remain in bounds. D7 integration retains enyne double/triple graph links, aromatic renumbering copy, repeated suffixes, explicit E/Z and safe unknown feedback. New matrix: **200 valid localized ReviewModels and 100 displayed names with valid fragments**. Reused D7 separately retains **707 ReviewModels / 86 names**, including precise stereo and enyne evidence. No general student-name parser is claimed.

## J. Practice

Deep finite Naming sessions stratify every supported category/level over both modes. Request five questions except Easy aromatic, whose actual two-target space is requested explicitly. Safe bounded exhaustion is distinguished from invalid generation, duplicates or fallback. Representative mixed-category sessions cover lengths 10/20/30 in all levels. Endless covers 60 submitted questions per level, past ordinary finite lengths, with recent identities/keys bounded to eight and no automatic completion.

Public mixed six-question Practice sessions cover Naming/MCQ/Build for all levels. Locale switches preserve the original chemical payload/index/config. All six controlled wrong initial answers enter Corrections; correct repeats preserve exact original targets, numbering and initial metrics. No session is silently reconfigured. Final deep lifecycle passes in **259.197 s** (260.766 s including runner). Of 118 configurations, 115 reach their requested plan/completion/horizon and three fail safely: Easy/simple-carbocycle Practice at ordinal 4 retains three attempts; Easy/simple-carbocycle Exam fails planning at ordinal 5; Intermediate/aromatic Exam fails planning at ordinal 4. Both Exam failures retain zero attempts and no partial plan. Each failure proves exactly four previously accepted duplicate candidates.

Endless submits **60 × 3 = 180** answers. Easy requires one existing explicit Retry before ordinal 13: rejected generationIndices 12–15, unchanged 12 attempts/config/history, recovery from index 16. Intermediate/Hard require no Retry. The test emulates the public action with a maximum four Retry actions per ordinal; production search/history limits remain 4/8. It does not conceal this interruption or promise uninterrupted success for arbitrary seed/count.

## K. Exam

Six-question public mixed plans for every level remain frozen; drafts, Previous/Next and locale switching preserve plan/drafts/timing. Attempts remain empty before Submit. A forced grading failure leaves neutral review with zero attempts; successful retry creates the complete result atomically and re-submit is idempotent.

The actual Exam renderer is checked before Submit for all three current levels, all three types and ES/EN: **18 plans**. Naming reference is hidden. MCQ choices are legitimate visible answers but have no correctness/provenance flags. Build receives only an isolated student draft, hidden category, no target/reference graph. Neutral pre-submit summary has no answer names or correctness. The focused all-level renderer check passes again (18.078 s including runner); existing D6/D7 tests add historical lifecycle coverage.

## L. Reconstruction

JSON-normalized original configurations drive replay; accepted generationIndex and display ordinal remain distinct. Existing frozen v1–v4 tests protect complete graph/plan/MCQ/provenance/Build payloads. New fresh-process checks cover all current levels and mixed multi-category public sessions, with Math.random/Date.now forbidden during generation. The fresh audit took **194.519 s**. Six new mixed-plan SHA-256 captures are stored in the D8 test only after all three processes agree. These protect complete current-v4 payloads for Practice/Exam at each level, independently of answer correctness and display locale. No existing fixture values are updated to match outputs.

Current-v4 release digests (SHA-256 of the ordered full-payload SHA-256 list), seed D8-LIFECYCLE, six mixed questions, alkane/alcohol/ester:

| Difficulty | Practice | Exam |
|---|---|---|
| basic | 35ed2b9289ab1c720e360bf60b6bb8b47737e773ce90ecdbbf0ed069a06a979f | 07cdd66f332578b442f6acd306173d1dbe96ee952cf3b60a62ab9b24d0be06ec |
| intermediate | 19f3e8d00057ae1bdfd8753a988ea7bfc7c73ebb5783b312fa2cd7f6b9555fe8 | 9040cc00c9be312b665caa824bcc776d07086a898750abb5419fb1390c2f9e10 |
| advanced | 69e77011a73379ba12cc518f32e752f4acc7caede194ac61f5bed479b498de95 | 2f72500a796fc4830291fcde922103e26f649f7ad83fb0fd8b44f9c6284039b4 |

## M. Corrections and Session Review

Original answers/results remain append-only. Corrected attempts have attemptNumber 2; initialResults remain unchanged. Practice Review reconstructs from stored config/type/index; Exam Review uses its original frozen plan without calling generation. Locale changes cannot replace the original Difficulty/version/reference. AttemptRecord remains session-context dependent; no schema churn.

## N. Class Seed and CSV

Focused Class/CSV validation: **31 PASS / 0 FAIL**, 1.431 s. Reuse the existing 10,000-participant uniqueness regression. CHEM-4B-2026 current assignments repeat with distinct level fingerprints and seeds. The fresh-process utility checks D5's original v4 participant-001 seed hashes and ES/EN CSV hashes exactly, then reconstructs two participant plans per level. Historical v1–v3 full fingerprints/seeds/CSV hashes remain protected by the existing frozen tests.

SchemaVersion **1**, derivationVersion **1**, 12 columns, UTF-8 BOM, CRLF, quote-all, deterministic order and spreadsheet protection unchanged. Difficulty is recovered from the fingerprint and version from its existing column; no new importer or column. Existing CSV tests retain injection and malformed-row controls.

## O. Actual UI smoke

Local Pages preview, unchanged production artifact from the D7 baseline. Verified at 390×844 and 1280×900, ES/EN, light/dark. Practice and Exam configuration labels wrap; native radio arrows preserve the internal ID across locale switches. Real Exam retains two drafts across keyboard Previous/Next and language switching; pre-submit review is neutral and results appear after confirmed local Submit.

Long Hard alcohol MCQ seed `D7-MOBILE-LONG` shows all four full alternatives; arrows select without grading. Correction preserves original order/target, score 0/1 and mastery 1/1. Long Naming Session Review displays the submitted text unchanged plus the localized reference. Space selects the triple-bond reasoning step. Build methane versus the real alcohol target yields the D7 element-count explanation in both locales. Document scrollWidth equals requested viewport width; MCQ labels have equal client/scroll widths 332 px, Review text 250 px, Build feedback 292/288 px. No critical overflow.

Screenshots: mobile-config-en, mobile-exam-neutral, mobile-review-es, mobile-mcq-en, mobile-build-review-es, desktop-build-review-es, desktop-config-dark-es, mobile-exam-dark-en. No PubChem interaction or external chemistry oracle; the existing Lab methane information card can fetch Wikipedia when returning to Lab and is not part of release verification. Theme/locale/viewport were restored, the temporary tab/preview closed. This is a focused keyboard/layout smoke, not a screen-reader audit.

## P. Findings

No production bug found in the completed D8 sweeps; no new P0/P1 identified. The first development run had one incorrect test oracle field in the new forced-failure test; fixed to `findMoleculeValenceViolation`, then the isolated check passed. This was a test authoring error, not a chemical failure or a new product issue. The first run's six other tests passed. Two further development assertions initially assumed uninterrupted Endless and restricted finite exhaustion to Easy; the existing D0/D3 contract explicitly preserves bounded safe exhaustion. The corrected checks verify duplicate evidence, atomic failure and the public Retry action, and the final lifecycle passes. These were test assumptions, not production bugs. No product bug ID is assigned to documented capability limits or corrected test assumptions.

| ID | Severity / area | Status | Frozen impact |
|---|---|---|---|
| D8-ENV-001 | Environment: Bash wrapper filesystem permission | First npm test aborted at mkdir before tests; approved outside-sandbox execution started normally, with scripts unchanged | None |

No production bug remains open from D8; no unresolved P0/P1. All final gates below completed.

## Q. Frozen compatibility

Baseline 19 PASS includes exact legacy/plumbing, v3 and all-category Hard v4 fresh-process replay. Critical and full suites both PASS. Frozen status: **v1 PASS / v2 PASS / v3 PASS / v4 PASS**, covering exact historical targets, accepted indices, types, MCQ IDs/order/provenance, Build payloads and Class/CSV bytes. All-category Hard v4 repeats in three fresh processes. No v1/v2/v3/v4 fixture, seed expectation, capture helper or skip is changed.

## R. Runtime and bounds

All loops have explicit seed/question limits. Chemical attempts remain 16; ordinary duplicate search 4; MCQ search 12; Endless history 8. No timing threshold depends on hardware. Performance.now records measurement only; seeds and cases never use time/unseeded randomness. The original deep generation/matrix run took **1,782.892 s** including its initial lifecycle boundary assertion; chemical/profile/MCQ groups took 1,731.221 s. Its slowest complete cell, Hard/ketone, took 142.206 s across eight health seeds, five MCQ searches, repeats and grading/review checks; this is not a single-question latency benchmark. The final seven-test D8 sample inside npm test took **126.471 s** on this Windows/Node environment; the deep matrix is opt-in. No production scans, candidate generations or retries are added.

## S. Final gates

| Gate | Result |
|---|---|
| Frozen/plumbing baseline | 19 PASS / 0 FAIL; 256.173 s |
| Deep health / family checks | All seven non-lifecycle checks PASS; initial lifecycle assumption corrected and verified separately |
| Final deep lifecycle | 1 PASS / 0 FAIL; 260.766 s |
| Current all-level renderer | 1 PASS / 0 FAIL; 18.078 s |
| Final focused group | 93 PASS / 0 FAIL; 667.433 s |
| Class / CSV | 31 PASS / 0 FAIL; 1.431 s; 10,000-participant regression |
| Fresh ES/ES/EN processes | PASS; 194.519 s; exact D5 seed/CSV hashes |
| npm run test:critical | 157 PASS / 0 FAIL; 612.859 s |
| npm test | 2489 tests; 2484 PASS / 0 FAIL / 5 historical skips; 4700.422 s |
| npm run build | PASS / exit 0; verified ESM Worker and hosting manifest |
| npm run build:pages | PASS / exit 0 |
| npm run validate:pages | PASS / exit 0 |
| npm run lint | PASS / exit 0; 0 errors, 11 historical warnings, 0 new |
| TypeScript | Raw exit 1; same 32 historical diagnostics, exact source positions, 0 new / 0 removed |
| git diff --check + new-file whitespace QA | PASS / exit 0 |

One actual full-suite run after targeted/critical success. The preceding sandbox attempt aborted before tests at wrapper mkdir; the approved outside-sandbox run used unchanged scripts. Five existing silver ESTER skips (0007/0012/0014/0015/0016) remain for unavailable exact naming oracles; no new skip. TypeScript is historical debt, not a clean compilation. No production or test source changed after the full-suite run began; only this report was finalized afterward.

## T. Exact scope of files

Working-tree additions: `tests/difficulty-v1-release-sweep.test.mjs` and `docs/difficulty-d8-release-freeze.md`. Tracked existing files modified: **none**. New tracked/staged files: **none**; both additions remain **untracked, unstaged**. Ignored audit utilities, JSON measurements, logs and eight screenshots are separate under `outputs/difficulty-d8/`; normal build/test caches and outputs remain ignored. No staging, commit or push.

## U. Freeze decision

**READY TO FREEZE**, 2026-10-06. All release-critical invariants pass within the explicit supported domain and bounded-capacity contract. Release baseline is generator4, supported1/2/3/4, IDs basic/intermediate/advanced, labels Easy/Intermediate/Hard and Fácil/Intermedio/Difícil. Intermediate and Hard have 17 category routes; Easy has 16 with explicit ez incompatibility. Naming/MCQ/Build retain actual eligibility and safe exhaustion, Practice/Exam/Corrections/Review/Class/CSV retain their verified contracts.



| Difficulty | Categories | Types | Locales | Practice | Exam | Reviewer | Corrections | Session Review | Status |
|---|---|---|---|---|---|---|---|---|---|
| basic | 16; ez incompatible | Naming/eligible MCQ/Build | ES/EN | PASS incl. explicit Retry | PASS incl. safe planning failure | PASS | PASS | PASS | READY within documented bounds |
| intermediate | 17 | Naming/eligible MCQ/Build | ES/EN | PASS | PASS incl. safe planning failure | PASS | PASS | PASS | READY within documented bounds |
| advanced | 17; 22 families | Naming/eligible MCQ/Build | ES/EN | PASS | PASS | PASS | PASS | PASS | READY |

Class Seed/CSV and versioned reconstruction PASS at all levels; this table does not imply every raw MCQ target or arbitrary seed/count succeeds.

## V. Freeze baseline and versioning rule

**Difficulty v1 is formally frozen at generatorVersion 4**, supported historical versions 1/2/3/4. Internal IDs: basic/intermediate/advanced. Public labels: Easy/Intermediate/Hard and Fácil/Intermedio/Difícil. The baseline includes the verified 17 category IDs, Practice, Exam, Naming, eligible MCQ, Build, Reviewer, Corrections, Session Review, Class Seed, CSV and ES/EN, subject to section W. Any future change to seeded plans, chemical/canonical identity, deterministic MCQ payload/order or versioned reconstruction must evaluate a new generator version with an explicit compatibility strategy before release. UI-only presentation does not imply an automatic bump. Never regenerate published fixtures silently.

## W. Known limits

Certified family-based chemistry only; no arbitrary multifunctional composer. No sulfur, R/S, generic heterocycles, fused/spiro/bridged/polycyclic expansion, arbitrary charges/salts (canonical nitro is supported), general N substitution or multiple configured E/Z centres. Hard multiinsaturation here is certified enyne, not an unimplemented diene/diyne producer. Ring/aromatic spaces are finite; higher requested counts can fail safely. Four recent duplicate candidates can require explicit Endless Retry; ring/aromatic finite plans can exhaust even below their theoretical graph capacity. Raw MCQ target eligibility is not guaranteed; Easy aromatic MCQ is explicitly limited. Frozen v1/v2/v3 reconstruct their published chemical contracts; they are not upgraded to current-v4 chemistry. Reviewer diagnoses only evidence-supported bounded errors; unknown input keeps honest fallback and unverified fragments stay plain text.

## X. Handoff / excluded work

Next major feature: **DOCX question/exam export**. Further Difficulty v1 engineering required BEFORE DOCX: **NO**. The export can consume the frozen version/config/plan contract and must respect its explicit capability limits. D8 does not begin DOCX. Explicitly excluded: generatorVersion 5; new chemistry, categories, Hard recipes or probabilities; sulfur; R/S; topology/domain expansion; namer/IUPAC changes; Class Seed or CSV schema bumps; Difficulty UI redesign; Product Polish; flags/language redesign; gamification; dyslexia/dyscalculia modes; dependencies or external APIs/LLM/PubChem; CI/package changes; frozen fixture regeneration. No commit, no push, no staging.
