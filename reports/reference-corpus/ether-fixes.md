# REFERENCE-001–004: current English ether naming

Initial HEAD: `3a8e36a329837eabbd09b17356ff1e9fd59bb1f5`.
The Reference Name Corpus implementation was already present as uncommitted
changes. No commit or push is part of this correction.

## Causes and correction

**REFERENCE-001.** `translateCore` in `app/iupac-name-normalization.ts`
translated `metoxi` to `methoxy`, but its word-boundary-only parent-root rule
could not see the glued `met` in `metoximetano`. The result was
`methoxymetane`. Root translation now uses the existing Spanish/English root
table at a Spanish hydride/suffix boundary, independently of the preceding
prefix. This replaces the older phenyl-, oxyethyl- and halomethane-specific
bridges. Already translated English lexical units, including `oxetane`, are
preserved.

**REFERENCE-002–004.** `analyzeFunctionalAcyclic` generates each carbon path
and its reversal. `selectLegacyParentCandidate` groups those orientations;
`numberingCriteria` / `compareNumberings` compare principal groups, multiple
bonds and complete numerically sorted prefix locants before the alphabetical
tie-break. The numeric comparison already uses the first point of difference.
`candidateAlphabeticalTieBreak` and `formatSubstituentGroups` use Spanish
descriptors, where `metil` precedes `metoxi`. The current English display
inherited that orientation. Its existing halogen-prefix alphabetizer changed
only citation order, and did not recognize alkoxy prefixes.

The current EN boundary now fully recognizes simple alkyl/alkoxy/halogen
prefix groups on a saturated acyclic parent, then performs these separate steps:

1. Build both orientations of the same selected parent: `l → n + 1 − l`.
2. Compare all sorted numeric locants, including repeated locants, by first
   point of difference using the existing `compareLocantSets` utility.
3. Only on equality, compare numeric locant vectors in cited English prefix
   order. Multipliers are identified by the number of locants and do not
   participate in that ordering.
4. Render the chosen groups alphabetically, with each group's locants sorted
   numerically. Rendering never makes the numbering decision.

The selected parent and graph do not change. Spanish analysis and the legacy
English model used by Practice/Exam retain their existing numbering. This
correction does not attempt to reinterpret suffix groups, unsaturation, rings,
stereochemical prefixes or complex substituents through the simple-prefix
grammar. Their existing naming paths remain in use.

Authority: [Blue Book P-14.4(f,g), P-14.5.1](https://iupac.qmul.ac.uk/BlueBook/P1.html)
for locants and citation order, and
[P-63.2.4.1](https://iupac.qmul.ac.uk/BlueBook/P6.html) for alkoxyalkanes.

## Corrected outputs

| Reference | Before | After |
| --- | --- | --- |
| ETHER-0001 | methoxymetane | methoxymethane |
| ETHER-0007 | 2-methyl-4-methoxypentane | 2-methoxy-4-methylpentane |
| ETHER-0008 | 2-methyl-3-methoxybutane | 2-methoxy-3-methylbutane |
| ETHER-0009 | 2-methyl-5-methoxyhexane | 2-methoxy-5-methylhexane |

Each now passes exact naming and offline structural equivalence. Comparing all
102 outputs against a pre-edit snapshot found exactly these four changes.
SHA-256 comparison of all 16 corpus files (including README, schema and OPSIN
snapshots) confirms identical contents.

`REFERENCE-005 / ESTER-0007` remains unchanged: `CC(OC(=O)C)C`, expected
`propan-2-yl ethanoate`, actual `propyl ethanoate`. It is still silver,
skipped for gold exact naming, and fails offline structural equivalence.

## Validation

| Check | Before | After |
| --- | --- | --- |
| Gold exact naming | 97 PASS / 4 FAIL | 101 PASS / 0 FAIL |
| Actual vs expected structure | 100 PASS / 2 FAIL / 0 SKIP | 101 PASS / 1 FAIL / 0 SKIP |
| Expected vs input structure | 102 PASS | 102 PASS |
| Corpus test assertions | 446 PASS / 6 FAIL / 1 SKIP (453 total) | 451 PASS / 1 FAIL / 1 SKIP (453 total) |
| Initial relevant naming baseline | 62 PASS / 0 FAIL | PASS |
| Final relevant naming suites | — | 197 PASS / 0 FAIL |
| New regressions | — | 25 PASS / 0 FAIL |
| Complete suite | 1556 PASS / 6 FAIL / 1 SKIP (1563 total) | 1586 PASS / 1 FAIL / 1 SKIP (1588 total) |
| Lint | 0 errors / 11 warnings | 0 errors / 11 pre-existing warnings; modified files additionally pass focused lint |
| Build and artifact validation | PASS | PASS (executed by npm test) |
| git diff --check | PASS | PASS |

`npm test` exits 1 solely because the explicitly deferred ESTER-0007 structural
assertion still fails. There are no remaining regressions from this correction.
Final root/reasoning/heterocycle focused run: 82 PASS / 0 FAIL.

Files for this correction: `app/iupac-name-normalization.ts`, new
`app/english-acyclic-prefixes.ts`, new
`tests/ether-current-profile-regressions.test.mjs`,
`tests/reasoning-functional-group-coverage.test.mjs` (one independently verified
fixture plus its source comment), and this report. Package/dependency and other
corpus changes in the working tree predate this correction.

New regressions cover the four findings, neighbouring ethers, reversed SMILES,
ethoxy/ethyl/bromo/chloro/iodo against methyl, numeric precedence without a tie,
the second differing numeric locant, repeated locants, ignored multipliers,
multi-digit locants, separate selection/citation, idempotence, graph immutability,
Spanish/legacy preservation and unsupported-grammar guards.

The first complete run exposed an overbroad root bridge affecting `oxetane`;
the Spanish suffix boundary was tightened and that regression passes before
the final full run. It also exposed a historical reasoning fixture pinning the
invalid spelling `nitroetane`. Its expected text alone was corrected to
`nitroethane`, independently verified against the explicit structure/PIN
example in [Blue Book P-74.2.2.1.10](https://iupac.qmul.ac.uk/BlueBook/P7.html).
This is the same general glued-root correction, with no nitro-specific naming
change or domain extension. No **corpus** expected values or independent OPSIN
evidence changed.

Original corpus audit reports remain historical records of the pre-fix state.
