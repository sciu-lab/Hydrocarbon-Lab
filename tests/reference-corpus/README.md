# Reference Name Corpus — Phase 1

Small, independently reviewed structure → name oracle for Hydrocarbon Lab. This
corpus is an audit: failing naming tests are findings to investigate, not a reason
to edit the reference or fix the namer in this change. It does not establish
coverage of all IUPAC nomenclature, human expert certification, universal PIN
compliance, or correctness outside the recorded domain/profile.

## Contract and profile

Family files are arrays validated by `schema.json` (JSON Schema draft-07), with
`schemaVersion: 1` in every record. IDs are permanent, never renumbered/reused.
`category` selects one of the 13 files; `domainCategory` selects the existing
production exercise validator. Halogenated alkanes stay in `alkanes.json` and use
the production `halogenated` category. No second chemical domain is implemented.

`hydrocarbon-lab-current-systematic-en-v1` audits the existing public `current`
convention, labelled **IUPAC Suggested (Blue Book 2013+)**, with no optional alkyl
aliases or source-name override. Its normative corpus policy is substitutive
systematic naming, suffix notation with modern locant placement, alphabetized
prefixes, lowest locants and only the justified omissions. Esters use the organyl
component followed by the systematic acid anion. Retained hydrocarbon parent
hydrides (including benzene) are used, while systematic forms such as ethyne,
methylbenzene, methanoic acid, ethanamide and methyl ethanoate are intentional.
These are not claims that every chosen form is a PIN: acetylene, toluene, formic
acid, acetamide and acetate illustrate that distinction. This policy is declared
independently of current test outputs, not inferred by accepting whatever passes.

The concrete production call chain is:

```
moleculeFromSmiles(smiles)                         // OpenChemLib adapter
analyzeMolecule(molecule)                         // existing page.tsx export
suggestedIupacNameWithOmittedLocants(analysis)
translateSpanishIupacForDisplay(suggested)
applyNomenclatureConvention(english, "current", "en")
```

The engine returns Spanish analysis internally. The real EN display formatter is
included in the implementation under test; parser candidates are not substituted
for displayed names. Vite SSR loads the existing exports using the established
test helper. No UI or namer extraction/refactoring is needed. Practice currently
uses `local-systematic-es` / `iupac-1979-legacy-en`; those naming profiles are not
the exact-name target of this phase. Both supported legacy conventions and the
internal traditional formatter remain outside this corpus profile.

EN is required. The schema permits `expected.es` and separately reviewed ES
alternatives, but this phase supplies no Spanish expected values. Adding ES data
requires an independent language/profile review and a corresponding test adapter;
it must not be populated by automatic EN→ES translation.

## Authority and evidence

* **gold:** independently reviewed rule derivation or published exact example
  justifies the exact spelling under the recorded policy. A gold record requires
  a review, an IUPAC rule source and `verification.manual: true`. Here “manual”
  means individual graph/rule review by Codex, not a claim of human sign-off.
* **silver:** strong name/structure evidence, insufficient adjudication of the
  exact profile spelling. Structural tests run; exact-name tests skip explicitly.
* **generated:** automatic property/fuzzing material, never an exact oracle and
  never automatically promoted to gold. Generated records are not supplied here.

Authority hierarchy:

1. **IUPAC / Blue Book / verified rules** decide the naming policy. Sources were
   consulted directly on 2026-09-30. Each record distinguishes rule application
   from a printed example, and records its parent/locants/components in
   `review.derivation`. The family references are [P-2](https://iupac.qmul.ac.uk/BlueBook/P2.html),
   [P-3](https://iupac.qmul.ac.uk/BlueBook/P3.html),
   [P-6](https://iupac.qmul.ac.uk/BlueBook/P6.html) and
   [P-66–69](https://iupac.qmul.ac.uk/BlueBook/P6a.html).
   Parent length is addressed in [P-44.3](https://iupac.qmul.ac.uk/BlueBook/P4.html).
   The [general rules](https://iupac.qmul.ac.uk/BlueBook/P1.html) distinguish general
   IUPAC names from PINs and govern omissions (P-14.3.4), numbering (P-14.4),
   lowest sets (P-14.3.5) and citation order (P-14.5).
2. **OPSIN** independently interprets name → structure. The optional audit calls
   the public service directly using the exact EN text. It bypasses the app's
   translated candidates and embedded fallbacks. `opsin-snapshots.json` stores
   requested name/URL, retrieval timestamp, HTTP status, original JSON response
   body and SHA-256. The service does not supply a version in its response; a
   version is not invented. The frozen body, rather than a live response, is the
   reproducible offline artifact. `verification.opsinRoundTrip` records review of
   expected-name interpretation against the input graph, not an endorsement of
   textual preference.
3. **PubChem** can corroborate a graph, CID, known compound or synonym. Its
   `IUPACName` is not automatically this corpus's expected. No fresh PubChem
   cross-check was performed for Phase 1; all corresponding flags are false.
   The older 122-compound audit remains auxiliary historical material, not the
   source of expected names in this corpus.
4. **OpenChemLib** parses SMILES and compares canonical graph identities,
   including charges, bond orders and specified/unspecified stereochemistry. It
   is not a normative authority on IUPAC text. SMILES strings, formulas and
   canvas coordinates are never used as graph-equality substitutes.

> A passing OPSIN round-trip proves structural interpretation, not that the Hydrocarbon Lab output is the preferred/canonical name required by the selected naming profile.

Source policy: never invent rule numbers, URLs, quotes, checks or reviewers.
Include the applicable primary reference and an individual derivation. A
plausible name, a passing local builder, an existing regression expected, or a
PubChem property alone cannot establish gold. Insufficient evidence means silver
or exclusion. Verification flags must describe checks actually supported by
stored evidence; retrieval failures are not confirmations.

## Two separate results

**Exact Name Match** compares the final EN string byte for byte with
`expected.en`, only for gold. There is no punctuation, case, locant, word-order or
synonym normalization. `acceptedAlternatives` never makes an exact failure pass.

**Structural Equivalence** first checks the frozen OPSIN interpretation of the
expected name against the input SMILES graph, then compares the frozen actual
name interpretation to that graph. The main suite makes no Internet requests.
Missing expected evidence is an integrity failure. A future actual name without
a stored response is a reported `SKIP`, not assumed equivalent. OPSIN rejection
is a failed interpretation, distinguished from proving a different graph.
HTTP/service failures are `SKIP`, not chemical evidence.

Diagnostics include ID, category, SMILES, expected, actual, exact status,
expected/input structural status, actual structural status and classification:

* `CANONICAL_NAME_MISMATCH`: exact FAIL, independently verified structure PASS.
* `NAME_STRUCTURE_MISMATCH`: exact FAIL, different graph or uninterpretable name;
  the structural reason distinguishes these situations.
* `NAME_MISMATCH_STRUCTURE_UNVERIFIED`: exact FAIL, structural SKIP.
* `REFERENCE_STRUCTURE_MISMATCH`: the oracle's expected disagrees with its input;
  investigate corpus evidence before attributing a namer defect.

## Chemical scope and selection

Production `validateExerciseDomain` / `EXERCISE_DOMAIN_VERSION = 1` is the
Practice/Exam DomainProfile implementation. Each record must pass it, using the
real valence and group-detection oracles. Its conservative generation envelope
is stricter than the Lab's overall capabilities: one functional group family,
one group for the functional categories, primary N, saturated functional chains,
one C=C or C≡C for the corresponding hydrocarbon category, saturated simple
carbomonocycles, and a single benzene ring with hydrocarbon substituents.
F/Cl/Br/I are exercised in the admitted saturated halogenated category. Sulfur,
heterocycles, multiple rings, fused/spiro/bridged graphs, disconnected graphs,
configured R/S, functionalized rings, polyenes and function/unsaturation or
function/halogen combinations are excluded by this current envelope. Their
presence elsewhere in Lab tests does not justify admitting them here.

There are 102 individually selected cases: 101 gold, 1 silver. Distribution:

| Family | Entries |
| --- | ---: |
| alkanes | 10 |
| alkenes | 10 |
| alkynes | 8 |
| alcohols | 10 |
| aldehydes | 7 |
| ketones | 7 |
| ethers | 9 |
| esters | 7 |
| carboxylic-acids | 8 |
| amines | 7 |
| amides | 6 |
| aromatics | 7 |
| rings | 6 |

Coverage includes minimal parents, branches, repeated substituents, longer
chains, positional neighbors, suffix/unsaturation priority, alphabetical
ordering, symmetrical ties, omitted and explicit locants. Historical tests
guided risk selection only. The ether series includes terminal/secondary
attachments and a smaller/base/larger family of methoxy-vs-methyl numbering
ties. Historical diene/EZ and unsaturated-ring bugs were not copied into a domain
that currently rejects those structures. The branched-alcohol ester ESTER-0007
is silver: propan-2-yl versus rooted 1-methylethyl spelling needs exact profile
adjudication. No expected was read from namer output or copied from a regression.

## Adding and correcting cases

1. Independently select the structure and confirm the current production domain.
2. Allocate a new ID in the correct family, never recycling an old ID. Review
   graph, parent selection, numbering, suffix and complete spelling against
   sources. Record the actual rule application, profile, features and authority.
3. Keep valid alternate names separate. Review their graph correspondence too;
   an alternate is not necessarily recommended or preferred.
4. Run the optional capture to store independent name interpretations. Review
   its raw responses and graph comparison before setting the corresponding
   verification flag. The audit deliberately never edits the corpus fields.
5. Run the offline integrity/domain/name/round-trip tests. Inspect every mismatch.

> Never change an expected value merely to make the implementation pass.

Changing expected requires independent evidence of a corpus error or an explicit
versioned profile decision, with the old/new spelling, reason and sources recorded
in the change review. Output mismatches, new PubChem values, and OPSIN acceptance
are not sufficient. Do not demote gold or expand alternatives to hide a failure.
Promotion from silver/generated requires individual review, never automatic
generation or a successful round-trip alone.

To turn a finding into a later regression, retain this independent record/ID,
link its report ID (REFERENCE-001 etc.), add a focused production regression with
the independently justified spelling and neighboring cases, then fix the namer
in a separate change. Preserve the original finding report as historical evidence.

## Commands

```sh
npm run test:reference-corpus             # entirely offline; findings fail
npm test                                 # build + all tests, including corpus
npm run lint
npm run build
npm run audit:reference-corpus            # OPTIONAL Internet audit, fresh responses
npm run audit:reference-corpus -- --capture # OPTIONAL Internet; append missing frozen evidence
npm run audit:reference-corpus -- --offline # offline diagnostic report, no network
```

Tests reside at `tests/*.test.mjs` so the existing CI glob includes them. Ajv
6.15.0 is explicitly declared for draft-07 validation; that same version was
already present transitively in the lockfile. No production dependency changes.
Audit reports go to `reports/reference-corpus/`; a nonzero audit exit can mean a
real naming finding even when all reference interpretations succeeded. Do not
require a live audit for normal CI. `--capture` retains existing responses and
does not silently refresh frozen evidence; a refresh requires an explicit,
reviewed evidence-file change.
