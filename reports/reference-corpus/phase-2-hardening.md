# Reference Name Corpus — Phase 2 hardening

Date: 2026-09-30. Initial HEAD: `b768c0849e9ba0d5c8ac84193de0bd2e58e41a05`.
Initial `git status --short`: empty; working tree clean. No commit or push.
The final HEAD remains the same.

## Baseline completed before edits

| Check | Total | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: | ---: |
| `npm run test:reference-corpus` | 453 | 452 | 0 | 1 |
| Relevant nomenclature suites (15 files) | 201 | 201 | 0 | 0 |
| `npm test` | 1602 | 1601 | 0 | 1 |

The full baseline exited 0; its verified build and packaged artifact validation
passed. Runtime was 787,133 ms. Baseline lint: 0 errors, 11 existing warnings.
The sole baseline skip is silver ESTER-0007, intentionally outside exact-name
assertions. Gold exact: 101 PASS / 0 FAIL; expected/input and actual/expected
structural comparisons: 102 PASS / 0 FAIL / 0 SKIP each.

The naming baseline/final command selected functional-nomenclature,
traditional-nomenclature-engine, legacy-english-nomenclature, nomenclature-order,
reasoning-functional-group-coverage, ether-current-profile-regressions,
ether-nomenclature, ester-organyl-connectivity, nitrogen-functional-groups,
aromatic-functional-nomenclature, english-aromatic-localization,
suggested-locant-omission, halogen-nomenclature, nomenclature-conventions and
functional-group-scale. The final additional domain/regression check selected
exercise-domain and chemistry-regressions. Full `npm test` includes all existing
test files, including the broader Lab's topology tests; those capabilities are
not thereby admitted into this narrower corpus.

## Supported Naming Matrix established before admission

The actual profile is the production `validateExerciseDomain` in
`app/exercise-domain.ts`, `EXERCISE_DOMAIN_VERSION = 1`, used by Practice/Exam.
It permits C/O/N/F/Cl/Br/I in its defined recipes; primary N; exactly one family
and one functional group (except the admitted saturated halogenated category);
one C=C or C≡C in hydrocarbon categories; one saturated carbomonocycle or one
benzene ring with hydrocarbon substituents. It imposes no carbon-count ceiling.
Import restrictions and domain validation are both relevant, and domain
acceptance by itself is insufficient evidence for an exact naming requirement.

| Capability | DomainProfile status | Implementation evidence | Existing test evidence | Safe for hardening? |
| --- | --- | --- | --- | --- |
| ACYCLIC: Saturated acyclic alkane: longest parent, methyl/ethyl branches, repeated prefixes | YES | app/page.tsx:analyzeHydrocarbonMolecule/selectLegacyParentCandidate/nameSubstituent; app/legacy-english-nomenclature.ts:selectParent | tests/legacy-english-nomenclature.test.mjs (branched alkanes); tests/nomenclature-order.test.mjs; ALKANE-0003–0006 | YES |
| HALO: F/Cl/Br/I on saturated acyclic carbon; mixed halo/alkyl, numeric-first, EN citation/ties | YES (halogenated only) | app/exercise-domain.ts:expectedGroup/carbonMultiple; app/english-acyclic-prefixes.ts; app/iupac-name-normalization.ts | tests/halogen-nomenclature.test.mjs; tests/ether-current-profile-regressions.test.mjs; tests/exercise-chemical-generator.test.mjs (mixed halos) | YES |
| UNSAT: One unconfigured C=C or C#C; branched parent and bond-priority numbering | YES (one bond only) | app/exercise-domain.ts:carbonMultiple; app/page.tsx:analyzeHydrocarbonMolecule/numberingCriteria | tests/legacy-english-nomenclature.test.mjs (single ene/yne); tests/suggested-locant-omission.test.mjs; ALKENE-0006–0010/ALKYNE-0006–0008 | YES |
| OH: One saturated acyclic alcohol: longest eligible OH parent and suffix-priority numbering | YES | app/page.tsx:analyzeFunctionalAcyclic/parentCriteria/makeFunctionalParentName | tests/functional-nomenclature.test.mjs; ALCOHOL-0007–0010; tests/exercise-domain.test.mjs | YES |
| CHO: One saturated acyclic aldehyde: CHO in parent, terminal locant omission and branching | YES | app/page.tsx:analyzeFunctionalAcyclic; app/nomenclature-conventions.ts; app/iupac-name-normalization.ts | tests/functional-nomenclature.test.mjs (omit only principal acyclic -al locant); tests/capability-audit.test.mjs (branched aldehydes); ALDEHYDE-0005–0007 | YES |
| CO: One saturated acyclic ketone: carbonyl-containing parent, suffix locants and branches | YES | app/page.tsx:analyzeFunctionalAcyclic/numberingCriteria | tests/functional-nomenclature.test.mjs; KETONE-0005–0007 | YES |
| ETHER: One saturated acyclic ether: simple alkoxyalkane, rooted attachments, methyl/ethyl branches, numeric then EN ties | YES | app/page.tsx:etherAlkoxySubstituent/analyzeFunctionalAcyclic; app/english-acyclic-prefixes.ts | tests/ether-current-profile-regressions.test.mjs; tests/ether-nomenclature.test.mjs; ETHER-0004–0009 | YES |
| ESTER: One saturated acyclic monoester; acid branching; primary/secondary/tertiary C3/C4 O attachment | YES (structure; secondary/tertiary exact spelling unresolved) | app/page.tsx:detectFunctionalGroups/esterAlkylName/nameSubstituent | tests/ester-organyl-connectivity.test.mjs (ten graphs, C3/C4 attachment); ESTER-0001–0007 | YES (unadjudicated spellings silver) |
| ACID: One saturated acyclic acid; acid carbon in longest eligible parent, branching | YES | app/page.tsx:analyzeFunctionalAcyclic/makeFunctionalParentName | tests/functional-nomenclature.test.mjs; ACID-0005–0008 | YES |
| PRIMARY_N: One primary acyclic amine or NH2 amide; saturated branches and suffix locants | YES (primary N only) | app/exercise-domain.ts:unsupported-n-substitution; app/page.tsx:analyzeFunctionalAcyclic | tests/nitrogen-functional-groups.test.mjs; tests/exercise-domain.test.mjs; AMINE-0005–0007/AMIDE-0005–0006 | YES |
| BENZENE: Single benzene with up to three simple alkyl substituents; start/direction and citation order | YES | app/page.tsx:ringCandidates/buildRingAnalysis; app/exercise-chemical-candidate.ts:aromatic up to three methyl/ethyl branches | tests/legacy-english-nomenclature.test.mjs (benzene, alkyl, meta); tests/exercise-chemical-generator.test.mjs sweep; AROMATIC-0004–0007 | YES |
| MONOCYCLE: One saturated carbocycle; simple alkyl branches, repeated substituents, start/direction | YES | app/page.tsx:ringCandidates/buildRingAnalysis; app/exercise-chemical-candidate.ts:simple-carbocycle | tests/legacy-english-nomenclature.test.mjs (ethyl/methyl ring); RING-0004–0006; tests/exercise-chemical-generator.test.mjs | YES |
| MULTIDIGIT: Existing twelve-carbon acyclic parent and numeric locants 3/10 | YES (no carbon-count cap in validator) | app/english-acyclic-prefixes.ts numeric comparison; app/page.tsx:makeChainName/compareNumberLists | tests/capability-audit.test.mjs dodecane; tests/ether-current-profile-regressions.test.mjs 3/10 dodecane formatter | YES (two graph cases only; no new parent grammar) |
| COMPLEX_TIE: General canonical EN ties with nested complex alkoxy substituents | Domain may admit graph; canonical rule not established | app/english-acyclic-prefixes.ts explicitly leaves complex grammar unchanged | tests/ether-current-profile-regressions.test.mjs unsupported-parent-grammar guard | NO |
| MULTIFUNCTION: Function + halogen/unsaturation; polyfunctional groups; functionalized rings or benzene | NO in this envelope | app/exercise-domain.ts:category-group-mismatch/unsupported-combination/category-topology-mismatch | tests/exercise-domain.test.mjs boundary cases | NO |
| POLYUNSAT: Dienes, diynes, ene-yne, unsaturated carbocycles | NO | app/exercise-domain.ts:category-unsaturation-mismatch/unsupported-ring-unsaturation | tests/exercise-domain.test.mjs | NO |
| TOPOLOGY: Fused/spiro/bridged/multiple rings, heterocycles, disconnected, sulfur, explicit R/S | NO | app/exercise-domain.ts:cycle rank, connectivity, elements, tetrahedral metadata | tests/exercise-domain.test.mjs | NO |
| N_SUB: Secondary/tertiary N amines or N-substituted amides | NO | app/exercise-domain.ts:unsupported-n-substitution | tests/exercise-domain.test.mjs | NO |
| NEW_FAMILY: Additional categories such as nitrile/nitro or configured E/Z | Some domain categories exist; outside existing 13-file corpus scope | app/exercise-model.ts EXERCISE_CATEGORIES; existing corpus families registry | tests/exercise-model.test.mjs; tests/reference-corpus-schema.test.mjs | NO (Phase 2 keeps current families/profile) |

“YES” is bounded by the description, not a claim of complete IUPAC support.
The twelve-carbon cases reuse both an already-tested parent and an already-tested
numeric formatter capability. They do not introduce large-chain grammar.
C3/C4 secondary/tertiary ester attachment is an established **structural**
requirement. Its exact organyl text is deliberately not a new gold requirement.

## Independent admission and evidence

Before adding records, all 82 proposed graphs passed production DomainProfile
validation and structural duplicate checking, without calling the namer for their
new-case names. The matrix and all proposed expected strings/individual
derivations were fixed before the new-case naming audit. All original records
were hashed before additions. The entire batch was then added and audited;
nothing was selected or dropped based on the namer's observed spelling.

The EN profile stays `hydrocarbon-lab-current-systematic-en-v1`. Its pre-existing
README policy uses systematic substitutive forms and systematic acid components,
rather than asserting that every spelling is a universal PIN. No ES fields,
additional categories, nomenclature features or production rules were added.

Primary normative sources consulted directly:
[general numbering/locants/citation P-14](https://iupac.qmul.ac.uk/BlueBook/P1.html),
[acyclic/cyclic parents and substituent groups P-21/P-22/P-29](https://iupac.qmul.ac.uk/BlueBook/P2.html),
[ene/yne endings P-31](https://iupac.qmul.ac.uk/BlueBook/P3.html),
[parent selection P-44/P-45](https://iupac.qmul.ac.uk/BlueBook/P4.html),
[halogens, amines, alcohols, ethers, ketones, acids and esters P-61–65](https://iupac.qmul.ac.uk/BlueBook/P6.html),
[amides and aldehydes P-66](https://iupac.qmul.ac.uk/BlueBook/P6a.html).
Every new record provides its particular rule application, graph/locant
derivation, implementation/test support and actual verification flags. These
are individual Codex reviews, not human expert certification. Rule applications
are distinguished from published exact examples; section numbers were checked
against the cited primary pages.

OPSIN independently interpreted expected, alternatives and actual text.
The cache now contains 203 raw receipts (85 additions; 118 protected originals),
each with request URL, timestamp, HTTP status, unchanged raw JSON body and
SHA-256. Successful expected/alternative graph checks were reviewed before
marking the **new** records' `opsinRoundTrip` flags true. No original flag changed.
No PubChem check is claimed; every such flag remains false. OpenChemLib compares
canonical graph identities including bond order, charge and unspecified stereo,
not textual SMILES or molecular formulas.

> A passing OPSIN round-trip proves structural interpretation, not that the Hydrocarbon Lab output is the preferred/canonical name required by the selected naming profile.

> Never change an expected value merely to make the implementation pass.

The initial sandbox capture was blocked by network/filesystem restrictions.
It supplied no successful new evidence. The authorized external capture then
completed; CI tests and the offline report block fetch and need no Internet.
Historical offline-results/live-results reports were not overwritten: the
optional audit gained a bounded `--report=filename.json` argument.

## Scope audit

**Did Phase 2 add any requirement for a nomenclature feature that Hydrocarbon Lab
did not previously claim to support? NO.**

All 82 admitted records pass the same unmodified DomainProfile, and every case
links to a YES capability above plus an independent rule derivation. Admission
checks were applied to all four conditions, not merely to IUPAC's theoretical
allowances. The existing 102 records, 118 receipts, 13-file chemistry contract
and naming profile remain protected. No source, authority, alternatives,
expected, graph or verification field in an original record changed.
REFERENCE-001–005 were not reopened or edited.

The only modified pre-existing regression test lets an independently checked
ester interpretation now be shared by the corpus and the pre-existing fixture.
It compares both receipts' canonical graph identities and retains the corpus
receipt; it never replaces the naming oracle. This avoids the former assumption
that structural-fixture names could never be admitted into a later corpus.

## Results, coverage and rejected candidates

Corpus: **102 → 184**; **+82** entries (**78 gold, 4 silver**). Final total: **179 gold, 5 silver, 0 generated**.

| Family | Before | New | Total |
| --- | --- | --- | --- |
| alkanes | 10 | 12 | 22 |
| alkenes | 10 | 6 | 16 |
| alkynes | 8 | 5 | 13 |
| alcohols | 10 | 6 | 16 |
| aldehydes | 7 | 6 | 13 |
| ketones | 7 | 5 | 12 |
| ethers | 9 | 14 | 23 |
| esters | 7 | 9 | 16 |
| carboxylic-acids | 8 | 4 | 12 |
| amines | 7 | 4 | 11 |
| amides | 6 | 3 | 9 |
| aromatics | 7 | 4 | 11 |
| rings | 6 | 4 | 10 |

The new silver entries are ESTER-0012 (secondary C4), ESTER-0014 (tertiary C4), ESTER-0015 (secondary C3, longer acid) and ESTER-0016 (secondary C3, branched acid). Protected ESTER-0007 remains the fifth silver. Names are structurally interpreted, but exact organyl spelling is not adjudicated. Matching an accepted alternative never turns a gold exact mismatch into PASS.

| Audit axis | PASS | FAIL | SKIP |
| --- | --- | --- | --- |
| All entries: exact names | 179 | 0 | 5 |
| Gold exact only | 179 | 0 | 0 |
| Expected name vs input graph | 184 | 0 | 0 |
| Actual name vs expected/input graph | 184 | 0 | 0 |
| New entries: exact | 78 | 0 | 4 |
| New entries: structure | 82 | 0 | 0 |

**Complete new findings list: empty.** No REFERENCE2 IDs were assigned, and there are no failure clusters. Existing supported behavior produced no wrong output in this batch. The five unadjudicated silver spelling differences are expected SKIPs, not bugs. No regression was introduced or concealed. This result does not establish correctness for untested combinations.

### Feature coverage derived from corpus annotations

| Feature | Before | Added | Total |
| --- | --- | --- | --- |
| branching | 12 | 62 | 74 |
| multiple-substituents | 7 | 44 | 51 |
| halogens | 4 | 7 | 11 |
| rings | 13 | 8 | 21 |
| aromatics | 7 | 4 | 11 |
| multiple-bonds | 18 | 11 | 29 |
| numbering-ties | 9 | 24 | 33 |
| attachment-sensitive | 3 | 33 | 36 |
| regression-neighbors | 7 | 32 | 39 |

Counts are overlapping unions of tags, with complete record IDs in [phase-2-results.json](phase-2-results.json). Older tags are immutable and can underdescribe old coverage; no old tags were added to improve the statistics. Rings include aromatics. Multiple bonds here are hydrocarbon C=C/C≡C, not carbonyl groups.

### Complete candidate rejection log

| Candidate | SMILES | Reason | Decision |
| --- | --- | --- | --- |
| R2C-001 | `COC(C)CC(C)C` | DUPLICATE_COVERAGE | Same graph as protected ETHER-0007; reversing SMILES is not a new corpus structure. |
| R2C-002 | `COC(C)C` | DUPLICATE_COVERAGE | Protected ETHER-0005 already supplies this secondary C3 methoxy attachment. |
| R2C-003 | `C=CC=C` | OUT_OF_DOMAIN | Two C=C bonds; the hydrocarbon category permits exactly one. |
| R2C-004 | `C#CC#C` | OUT_OF_DOMAIN | Two C#C bonds; exactly one required. |
| R2C-005 | `C=CCO` | OUT_OF_DOMAIN | Alcohol plus C=C excluded from saturated functional envelope. |
| R2C-006 | `CC(O)CCl` | OUT_OF_DOMAIN | Competing alcohol/halogen groups. |
| R2C-007 | `COCCCl` | OUT_OF_DOMAIN | Ether/halogen interaction excluded here despite separate halogen support. |
| R2C-008 | `Clc1ccccc1` | OUT_OF_DOMAIN | Aromatic category currently admits hydrocarbon substituents only. |
| R2C-009 | `ClC1CCCCC1` | OUT_OF_DOMAIN | Functional/halo ring substitutions excluded. |
| R2C-010 | `OC1CCCCC1` | OUT_OF_DOMAIN | Cyclic alcohol outside acyclic functional category. |
| R2C-011 | `c1ccncc1` | OUT_OF_DOMAIN | Heteroaromatic ring excluded. |
| R2C-012 | `c1ccc2ccccc2c1` | OUT_OF_DOMAIN | Fused polycycle. |
| R2C-013 | `C1CCC2(CC1)CCCC2` | OUT_OF_DOMAIN | Spiro polycycle. |
| R2C-014 | `C1CC2CCC1C2` | OUT_OF_DOMAIN | Bridged polycycle. |
| R2C-015 | `C1CC1C2CC2` | OUT_OF_DOMAIN | Multiple connected rings. |
| R2C-016 | `CC.CC` | OUT_OF_DOMAIN | Disconnected graph. |
| R2C-017 | `CSC` | OUT_OF_DOMAIN | Sulfur excluded. |
| R2C-018 | `CN(C)C` | OUT_OF_DOMAIN | Tertiary N substitution excluded. |
| R2C-019 | `CC(=O)NC` | OUT_OF_DOMAIN | N-substituted amide excluded. |
| R2C-020 | `OCCO` | OUT_OF_DOMAIN | Two alcohol groups excluded. |
| R2C-021 | `COC(C)CC(C)OC` | OUT_OF_DOMAIN | Two ether groups excluded. |
| R2C-022 | `CC(C)OC(C)CC(C)C` | UNSUPPORTED_NAMING_RULE | Do not require new canonical EN tie handling for complex 1-methylethoxy prefixes; existing formatter guard explicitly declines that grammar. |
| R2C-023 | `CC(OC(=O)C)C` | INSUFFICIENT_SOURCE_CONFIDENCE | Proposal to make a branched organyl spelling gold is not independently adjudicated for this profile; protected ESTER-0007 stays silver. |
| R2C-024 | `C/C=C/C` | REQUIRES_NEW_FEATURE | Configured E/Z exists in DomainProfile but would require extending the existing corpus's domain-category/profile contract; excluded from Phase 2. |
| R2C-025 | `CC#N` | REQUIRES_NEW_FEATURE | Adding a new family file/registry would expand Phase-2 corpus scope; existing 13 categories retained. |
| R2C-026 | `O=CCC(C)=O` | OUT_OF_DOMAIN | Historical 3-oxobutanal regression contains aldehyde and ketone; category-group-mismatch. Only single-CHO neighbors admitted. |

20 proposals were excluded by the existing domain/import envelope, 2 as duplicate structures, 1 for an unsupported canonical naming rule, 1 for insufficient confidence in an exact gold claim, and 2 because they would extend this corpus contract. The last two (configured E/Z and nitriles) exist elsewhere in the repository; they are out of scope for this batch, not absent from the entire Lab. All rejection graphs were checked against the production importer/domain. No rejected case is a failing naming requirement.

The complex-alkoxy proposal R2C-022 is domain-valid but not safe as a new canonical-tie requirement: the existing EN formatter explicitly leaves that grammar alone. R2C-023 rejects promotion of a spelling hypothesis to gold; it does not change protected ESTER-0007. No other admitted gold expected was taken from a current output or regression expected.

## Validation

Corpus tests: **797 total / 792 PASS / 0 FAIL / 5 SKIP** (offline, exit 0).
Relevant nomenclature suites: **201 PASS / 0 FAIL / 0 SKIP**.
Additional existing chemistry/domain regression suites: **33 PASS / 0 FAIL / 0 SKIP**.
The 12 new protection/coverage checks pass. The offline report confirms zero network calls.

Final `npm test`: **1946 total / 1941 PASS / 0 FAIL / 5 SKIP**, exit 0 (799,080 ms).

Full test delta: +344 assertions = 328 per-record checks for 82 additions, four
new independently checked alternatives and 12 protection/coverage checks. The
four additional SKIPs are the new silver exact-name checks. There are no
introduced regressions and no existing errors newly discovered by this batch.

Final `npm run lint`: exit 0, **0 errors / 11 pre-existing warnings**, unchanged
from baseline. The final report script also passed targeted eslint after its
last diagnostic-only change. `npm run build` and explicit
`npm run validate:artifact`: both exit 0; packaged ESM Worker default.fetch and
hosting manifest validated. The full test command additionally runs the same
verified build. `git diff --check`: exit 0.

Manifest hashes were compared directly against original Git HEAD objects:
102 record hashes and 118 receipt hashes match the protected commit. There are
no differences in app/, package-lock.json, schema.json or historical Phase-1
offline/live reports. No production, UI, profile or adapter file changed.

The offline JSON stores informational candidateExact separately from exact SKIP
for silver records; matching silver graphs are NON_GOLD_STRUCTURE_MATCH.
They are not adjudicated canonical-name findings. All 184 graphs are audited.


## Files and final Git state

Initial/final HEAD: `b768c0849e9ba0d5c8ac84193de0bd2e58e41a05`. Initial working tree: clean.
No commit, no push. Final changes are ready for review.

Created (8):

- `reports/reference-corpus/phase-2-audit.json`
- `reports/reference-corpus/phase-2-hardening.md`
- `reports/reference-corpus/phase-2-rejections.json`
- `reports/reference-corpus/phase-2-results.json`
- `scripts/report-reference-corpus.mjs`
- `tests/fixtures/reference-corpus-v1-manifest.json`
- `tests/helpers/reference-coverage.mjs`
- `tests/reference-corpus-coverage.test.mjs`

Modified (18):

- `package.json`
- `scripts/audit-reference-corpus.mjs`
- `tests/ester-organyl-connectivity.test.mjs`
- `tests/reference-corpus/README.md`
- `tests/reference-corpus/alcohols.json`
- `tests/reference-corpus/aldehydes.json`
- `tests/reference-corpus/alkanes.json`
- `tests/reference-corpus/alkenes.json`
- `tests/reference-corpus/alkynes.json`
- `tests/reference-corpus/amides.json`
- `tests/reference-corpus/amines.json`
- `tests/reference-corpus/aromatics.json`
- `tests/reference-corpus/carboxylic-acids.json`
- `tests/reference-corpus/esters.json`
- `tests/reference-corpus/ethers.json`
- `tests/reference-corpus/ketones.json`
- `tests/reference-corpus/opsin-snapshots.json`
- `tests/reference-corpus/rings.json`

`git diff --stat` (tracked files only; new files remain untracked):

```text
 package.json                                 |   3 +-
 scripts/audit-reference-corpus.mjs           |  10 +-
 tests/ester-organyl-connectivity.test.mjs    |   9 +-
 tests/reference-corpus/README.md             |  59 ++-
 tests/reference-corpus/alcohols.json         | 296 ++++++++++++
 tests/reference-corpus/aldehydes.json        | 293 ++++++++++++
 tests/reference-corpus/alkanes.json          | 647 +++++++++++++++++++++++++
 tests/reference-corpus/alkenes.json          | 298 ++++++++++++
 tests/reference-corpus/alkynes.json          | 249 ++++++++++
 tests/reference-corpus/amides.json           | 150 ++++++
 tests/reference-corpus/amines.json           | 199 ++++++++
 tests/reference-corpus/aromatics.json        | 188 ++++++++
 tests/reference-corpus/carboxylic-acids.json | 196 ++++++++
 tests/reference-corpus/esters.json           | 489 +++++++++++++++++++
 tests/reference-corpus/ethers.json           | 683 +++++++++++++++++++++++++++
 tests/reference-corpus/ketones.json          | 243 ++++++++++
 tests/reference-corpus/opsin-snapshots.json  | 680 ++++++++++++++++++++++++++
 tests/reference-corpus/rings.json            | 191 ++++++++
 18 files changed, 4875 insertions(+), 8 deletions(-)
```

`git status --short`:

```text
 M package.json
 M scripts/audit-reference-corpus.mjs
 M tests/ester-organyl-connectivity.test.mjs
 M tests/reference-corpus/README.md
 M tests/reference-corpus/alcohols.json
 M tests/reference-corpus/aldehydes.json
 M tests/reference-corpus/alkanes.json
 M tests/reference-corpus/alkenes.json
 M tests/reference-corpus/alkynes.json
 M tests/reference-corpus/amides.json
 M tests/reference-corpus/amines.json
 M tests/reference-corpus/aromatics.json
 M tests/reference-corpus/carboxylic-acids.json
 M tests/reference-corpus/esters.json
 M tests/reference-corpus/ethers.json
 M tests/reference-corpus/ketones.json
 M tests/reference-corpus/opsin-snapshots.json
 M tests/reference-corpus/rings.json
?? reports/reference-corpus/phase-2-audit.json
?? reports/reference-corpus/phase-2-hardening.md
?? reports/reference-corpus/phase-2-rejections.json
?? reports/reference-corpus/phase-2-results.json
?? scripts/report-reference-corpus.mjs
?? tests/fixtures/reference-corpus-v1-manifest.json
?? tests/helpers/reference-coverage.mjs
?? tests/reference-corpus-coverage.test.mjs
```
