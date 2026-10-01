# Reference Name Corpus — Phase 1 findings

Audited initial HEAD: `3a8e36a329837eabbd09b17356ff1e9fd59bb1f5`.
Initial working tree: clean. Review date: 2026-09-30 (America/Santiago).
No namer, chemistry rules, adapters, Practice/Exam, domain or UI were changed.

## Repository inspection

`npm test` runs the verified build then `node --test --test-concurrency=1
tests/*.test.mjs`. Build uses `scripts/build-verified.sh` / vinext and validates
the ESM worker/hosting artifact. Lint uses the existing ESLint configuration.

The principal analyzer and suggested-profile exports currently live in
`app/page.tsx`; functional/ring naming and chain/substituent selection are part
of that implementation. Other conventions use `nomenclature-conventions.ts`,
`legacy-english-nomenclature.ts` and `traditional-nomenclature.ts`. The internal
`GeneratedMolecule` is atoms `{id,x,y,element?,charge?,tetrahedralParity?,
tetrahedralBondTo?}`, bond tuples `[a,b,order?,explicitEZ?]`, and optional ring
metadata `{id,kind,atomIds}`. OpenChemLib import/export lives in
`app/openchemlib-adapter.ts`; robust identity uses its library's canonical graph.

The current OPSIN adapter (`app/opsin-name-resolver.ts`) requests the EBI service
and also contains embedded fallbacks. PubChem integrations in compound context,
formula candidate and name/structure resolution use remote PUG REST. Those
adapters were inspected and left intact; corpus interpretation bypasses local
fallbacks. EN display localizes the Spanish graph analysis; legacy EN has a
separate structural generator. Practice/Exam domain is `exercise-domain.ts`, v1;
its reference oracles use local-systematic ES and legacy-1979 EN.

Existing reference material includes the 122 PubChem fixtures and their reviews
under `reports/external-molecule-audit`, newer mechanical audit reports, the
aromatic-functional derivation fixtures, heterocycle/common-name registries,
and functional/ether/halogen/nitrogen/aromatic/locant/stress/regression suites.
None of their current expected strings was adopted as truth without independent
rule review. The new corpus has its own schema, authority and profile policy.

## Results

102 entries: **101 gold / 1 silver / 0 generated**.
Profile: `hydrocarbon-lab-current-systematic-en-v1`, mapped to public `current`
EN display (IUPAC Suggested / Blue Book 2013+). No ES expected values.

* Gold exact naming: **97 PASS / 4 FAIL**. The silver exact test is explicitly skipped.
* Expected-name → input structure: **102 PASS / 0 FAIL / 0 SKIP**.
* Actual-name → reference structure: **100 PASS / 2 FAIL / 0 SKIP**, including silver.
* All **11** stored accepted alternatives represent their respective input graphs.
* **118** frozen OPSIN responses: 117 SUCCESS, 1 FAILURE. All expected responses succeed.
* Schema/integrity/production domain/import checks: all pass. Fetch guards confirm
  that the three corpus test files make zero network requests.

The six failing assertions describe **five affected records**, not six different
defects: ETHER-0001 fails exact and interpretation checks. Three numbering/citation
findings are structural equivalents. ESTER-0007 fails structure despite its exact
test being skipped as silver. Silver does not excuse a wrong constitutional graph.

## Findings to fix separately

| Finding | Record | Expected | Actual | Exact | Structure |
| --- | --- | --- | --- | --- | --- |
| REFERENCE-001 | ETHER-0001 | methoxymethane | methoxymetane | FAIL | FAIL: OPSIN cannot interpret `metane` |
| REFERENCE-002 | ETHER-0007 | 2-methoxy-4-methylpentane | 2-methyl-4-methoxypentane | FAIL | PASS |
| REFERENCE-003 | ETHER-0008 | 2-methoxy-3-methylbutane | 2-methyl-3-methoxybutane | FAIL | PASS |
| REFERENCE-004 | ETHER-0009 | 2-methoxy-5-methylhexane | 2-methyl-5-methoxyhexane | FAIL | PASS |
| REFERENCE-005 | ESTER-0007 (silver) | propan-2-yl ethanoate | propyl ethanoate | SKIP (silver) | FAIL: different constitutional graph |

### REFERENCE-001 — minimum ether EN spelling

SMILES: `COC`. The [Blue Book ether example, P-63.2.4.1](https://iupac.qmul.ac.uk/BlueBook/P6.html)
explicitly names CH3–O–CH3 methoxymethane. The production EN display omits the `h`
in the parent fragment. The frozen direct OPSIN response rejects methoxymetane.
This is an uninterpretable spelling, not evidence that OPSIN produced another graph.
Classification: `NAME_STRUCTURE_MISMATCH`, with the rejection reason preserved.

### REFERENCE-002/003/004 — methoxy/methyl alphabetical ties

SMILES, respectively: `COC(C)CC(C)C`, `COC(C)C(C)C`, `COC(C)CCC(C)C`.
These are the base/smaller/larger neighbors around a historical ether fixture.
Locant sets tie at 2,4 / 2,3 / 2,5. Methoxy precedes methyl alphabetically, so it
receives the lower locant and is cited first. See [Blue Book P-14.4(g), P-14.5.1](https://iupac.qmul.ac.uk/BlueBook/P1.html).
Actual displays cite methyl first and assign methoxy the higher position.
OPSIN independently interprets both spellings as the same graph after reversing
the chain. Classification: `CANONICAL_NAME_MISMATCH`.

The existing regression uses a methyl-first Spanish analysis and a different
English formatting route/profile; it therefore did not establish the independent
modern numbering/citation policy tested here. Its expected was not copied.

### REFERENCE-005 — branched ester alcohol component flattened

SMILES: `CC(OC(=O)C)C`. The oxygen is attached to the central carbon of a
three-carbon alcohol component. Independently interpreted propan-2-yl ethanoate
and 1-methylethyl ethanoate reproduce that graph. Production propyl ethanoate
describes terminal attachment instead; OPSIN returns a different graph.
Classification: `NAME_STRUCTURE_MISMATCH`.

ESTER-0007 was selected as silver **before evaluating the namer**, because the
profile's preferred branched organyl spelling was not fully adjudicated. Its
structural evidence is sufficiently strong to demonstrate this defect regardless
of which exact valid branched spelling is eventually selected. The silver status
was neither a response to this failure nor a reason to hide it.

## Deliberate exclusions and limits

Not included: the proposed 1-phenylethan-1-ol example, phenyl/functional chains,
function plus C=C/C≡C, polyenes, polyols, functionalized/unsaturated rings,
N-substituted amines/amides, function plus halogens, sulfur, heterocycles,
multiple/fused/spiro/bridged rings and disconnected graphs. The production
Practice/Exam domain validator rejects these combinations even where the wider
Lab has naming support. Historical diene/stereo/unsaturated-ring cases therefore
cannot be imported blindly.

Not promoted for insufficient exact-profile evidence: the branched alcohol ester
ESTER-0007 remains silver. No doubtful exact names were added solely to reach a
count. No Spanish names, live PubChem properties, PubChem synonym lists, embedded
OPSIN fallbacks or existing regression expected values were adopted as oracles.
PubChem cross-check flags remain false. Individual gold review is Codex graph/rule
review, not a statement of human expert sign-off.

## Validation

Before changes: full suite **1110 PASS / 0 FAIL**; focused naming/domain suite
**72 PASS / 0 FAIL**; build PASS; lint **0 errors / 11 existing warnings**.

The corpus run adds 453 tests. Current corpus result: **446 PASS / 6 FAIL / 1 SKIP**.
The failures above remain intentionally exposed; no failing test is marked TODO
or skipped to obtain a green suite. The single skipped test is the independently
declared silver exact-name oracle. Final focused naming/domain suite remains
**72 PASS / 0 FAIL**. Final full suite, lint and build results are recorded below
after completion: **1563 tests: 1556 PASS / 6 FAIL / 1 SKIP**, zero TODO/cancelled.
All 1110 pre-existing tests still pass. Final build PASS (including artifact
validation). Final lint: **0 errors / the same 11 pre-existing warnings**.
No introduced behavior regressions were found. `git diff --check` passes.

The stored [offline results](offline-results.json) give every record's actual
text, reference text and separate structural statuses. [Live capture results](live-results.json)
record the original service audit. The corpus [README](../../tests/reference-corpus/README.md)
contains the schema/profile/source/expected modification policies and commands.

Implementation scope: new corpus/tests/helper/optional auditor/reports and
package test scripts plus explicit dev-only Ajv 6.15.0. That Ajv version already
existed in package-lock transitively; its existing resolution/integrity is reused.
No existing production source or test was edited. Failures are pre-existing
engine/display errors discovered by the oracle, not behavior regressions introduced
by this implementation.

## Delivered files and Git

Created (24 files):

```
tests/reference-corpus/README.md
tests/reference-corpus/schema.json
tests/reference-corpus/alkanes.json
tests/reference-corpus/alkenes.json
tests/reference-corpus/alkynes.json
tests/reference-corpus/alcohols.json
tests/reference-corpus/aldehydes.json
tests/reference-corpus/ketones.json
tests/reference-corpus/ethers.json
tests/reference-corpus/esters.json
tests/reference-corpus/carboxylic-acids.json
tests/reference-corpus/amines.json
tests/reference-corpus/amides.json
tests/reference-corpus/aromatics.json
tests/reference-corpus/rings.json
tests/reference-corpus/opsin-snapshots.json
tests/reference-corpus-schema.test.mjs
tests/reference-name-corpus.test.mjs
tests/reference-roundtrip.test.mjs
tests/helpers/reference-corpus.mjs
scripts/audit-reference-corpus.mjs
reports/reference-corpus/findings.md
reports/reference-corpus/live-results.json
reports/reference-corpus/offline-results.json
```

Modified: `package.json`, `package-lock.json` only (commands and explicit test
validator dependency). All created files are currently untracked, so ordinary
`git diff --stat` reports the tracked changes only:

```
 package-lock.json | 1 +
 package.json      | 3 +++
 2 files changed, 4 insertions(+)
```

Final `git status --short`:

```
 M package-lock.json
 M package.json
?? reports/reference-corpus/
?? scripts/audit-reference-corpus.mjs
?? tests/helpers/reference-corpus.mjs
?? tests/reference-corpus-schema.test.mjs
?? tests/reference-corpus/
?? tests/reference-name-corpus.test.mjs
?? tests/reference-roundtrip.test.mjs
```
