# REFERENCE-005 / ESTER-0007: preserve organyl connectivity

Initial HEAD: `3a8e36a329837eabbd09b17356ff1e9fd59bb1f5`.
The prior corpus and ether correction were already uncommitted. No commit or
push is part of this task.

## Independent graph inspection

Stored SMILES: `CC(OC(=O)C)C`.

The OpenChemLib import gives these relevant atoms and bonds:

- C4 is the carbonyl carbon: C4=O5, C4–C6, C4–O3.
- O3 is the ester linking oxygen: O3–C4 and O3–C2.
- C2 is the organyl attachment: C2–C1, C2–C7, C2–O3.
- The acid carbon component is `{4,6}`: `CH3–C(=O)–`.
- The alcohol/organyl carbon component is `{1,2,7}`; its root C2 has **two**
  carbon neighbors: `(CH3)2CH–`, the propan-2-yl connectivity.

The carbon-only C3 fragment is a three-carbon path in both propyl isomers.
Its root is central here; in linear propyl the root is an endpoint. Carbon
count, formula and unrooted fragment connectivity alone cannot distinguish
these attachments. The full ester graphs have different canonical identities.

## Cause and minimal correction

`detectFunctionalGroups` preserves the actual root as `alkylCarbonId = 2`.
The loss occurs later in `esterAlkylName`: `simpleAlkylLength` calls the carbon
component "simple" if every carbon has degree ≤2, returns its size, and
`alkylNames[3]` becomes `propil`. Attachment position is discarded. Secondary
C4 also becomes `butil`; carbon branching with degree 3 falls back to `alquilo`.
`buildLegacyEnglishNameModel` independently repeats the same count lookup.

For saturated acyclic organyl components, `esterAlkylName` now reuses
`nameSubstituent` with the O-linked carbon as the root. That existing algorithm
chooses the longest root-starting path and names the remaining branches with
locants. A null carbon parent lets it traverse the already separated carbon
component without inventing a blocked atom. Every existing numeric-parent
caller retains its previous behavior. The non-acyclic/unsaturated fallback is
unchanged; this correction does not expand that chemistry.

The legacy ester DTO now uses the same derived organyl instead of its separate
count shortcut. This preserves ester graph meaning across the existing naming
paths without changing profile formatters or Practice/Exam code. The traditional
ester DTO already uses `esterAlkylName` and inherits the connectivity correction.
No ether rule or caller changed.

## Structural matrix

| Organyl attachment | SMILES | Before current EN | After current EN |
| --- | --- | --- | --- |
| methyl | COC(=O)C | methyl ethanoate | methyl ethanoate |
| ethyl | CCOC(=O)C | ethyl ethanoate | ethyl ethanoate |
| linear C3 | CCCOC(=O)C | propyl ethanoate | propyl ethanoate |
| secondary C3 | CC(OC(=O)C)C | propyl ethanoate | 1-methylethyl ethanoate |
| linear C4 | CCCCOC(=O)C | butyl ethanoate | butyl ethanoate |
| secondary C4 | CCC(OC(=O)C)C | butyl ethanoate | 1-methylpropyl ethanoate |
| branched C4, terminal attachment | CC(C)COC(=O)C | alquyl ethanoate | 2-methylpropyl ethanoate |
| tertiary C4 | CC(C)(C)OC(=O)C | alquyl ethanoate | 1,1-dimethylethyl ethanoate |

Two further structural fixtures combine secondary C3 with propanoate and with
2-methylpropanoate. All ten fixtures pass the existing ester DomainProfile.

## Structural evidence, not a textual promotion

ESTER-0007 now produces **1-methylethyl ethanoate**. This spelling was already
stored as an accepted alternative, with a frozen successful OPSIN interpretation
matching the input graph. Its candidate `expected.en = propan-2-yl ethanoate`,
`authority = silver`, and all other corpus fields remain unchanged. Exact gold
naming remains 101/101; the silver exact test remains **SKIP**. The candidate
and actual spellings differ, and preferred textual naming remains undecided.

Six further OPSIN interpretations were requested for independently proposed
names before editing the implementation. Their raw responses, URLs, timestamps
and SHA-256 hashes are in the new unit-test fixture
`tests/fixtures/ester-organyl-interpretations.json`, outside the reference corpus.
The existing corpus snapshots are read-only. Normal tests forbid fetch calls
and compare OpenChemLib canonical graph identities, not SMILES strings.

An OPSIN round-trip demonstrates structural interpretation; it does not establish
that this spelling is preferred or canonical for a nomenclature profile.

## Deferred sibling audit

Read-only inspection found the same unrooted count shortcut in these paths:

| Path | Audited SMILES / observed ES output | Existing DomainProfile result |
| --- | --- | --- |
| N-substituted amine | CC(C)NCCCC / N-propilbutan-1-amina | unsupported-n-substitution |
| N-substituted amide | CC(=O)NC(C)C / N-propiletanamida | unsupported-n-substitution |
| Subordinate ester alkoxy prefix | CC(C)OC(=O)CC(=O)O / ácido 3-oxo-3-propoxipropanoico | category-group-mismatch |

Those examples have a secondary C3 attachment but still use an unrooted propyl
or propoxy form. They are outside the current exercise domain and are documented
for separate work. `nitrogenSubstituentPrefixes`, the subordinate ester prefix
path, and the ether-specific uses of `simpleAlkylLength` are untouched here.

## Validation

| Check | Before | After |
| --- | --- | --- |
| Initial related naming baseline | 120 PASS | PASS |
| New structural regressions | — | 14 PASS / 0 FAIL |
| Related naming, nitrogen and ether suites | — | 156 PASS / 0 FAIL |
| Gold exact naming | 101 PASS / 0 FAIL | 101 PASS / 0 FAIL |
| Actual structural equivalence | 101 PASS / 1 FAIL / 0 SKIP | 102 PASS / 0 FAIL / 0 SKIP |
| Corpus assertions | 451 PASS / 1 FAIL / 1 SKIP | 452 PASS / 0 FAIL / 1 SKIP |
| Complete suite | 1586 PASS / 1 FAIL / 1 SKIP (1588 total) | 1601 PASS / 0 FAIL / 1 SKIP (1602 total) |
| Lint | 0 errors / 11 existing warnings | 0 errors / same 11 warnings |
| Build and artifact validation | PASS | PASS (executed by npm test) |
| git diff --check | PASS | PASS |

Comparing all 102 pre/post corpus outputs found only **ESTER-0007** changed.
SHA-256 checks preserve all 16 corpus files and 24 protected ether,
DomainProfile, Practice/Exam and test files. Production changes are confined
to the rooted helper, ester helper and ester legacy DTO in `app/page.tsx`;
there are no UI-component edits.

The 14 new tests inspect attachment directly from bonds, check canonical graph
equivalence for current EN, ES parser translation and legacy EN, verify the
traditional DTO's organyl fragment, distinguish constitutional isomers, preserve
simple outputs, remap IDs/reverse atom and bond order/change coordinates, and
prove graph immutability and zero network requests.

Task files: `app/page.tsx`, new `tests/ester-organyl-connectivity.test.mjs`, new
`tests/fixtures/ester-organyl-interpretations.json`, and this report.
Older audit reports remain historical records of their respective pre-fix states.

`npm test` exits 0. Its single SKIP is the intentionally undecided silver exact
name. There are no remaining structural corpus failures or introduced test
regressions. Preferred textual naming for ESTER-0007 remains a separate task.
