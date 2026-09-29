# Practice Detailed Reviewer (Phase 6)

This is a per-question, read-only explanation layer. It has no generator, answer
evaluator, persistence, session dashboard, or free-form text generation.

```
Generated molecule + reference + frozen AttemptRecord
              ↓
analyzeMolecule + buildLegacyEnglishNameModel
              ↓
ReviewModel (semantic parameters, message keys, graph IDs)
              ↓
bounded diagnosis of the submitted reference profile
              ↓
EN/ES message formatting + existing Practice SVG highlights
```

## Data and authority

`createPracticeReviewer(engine)` returns a reusable `PracticeReviewer(question,
attempt)`. It verifies question ID, seed, generator version, category and chemical
identity, then verifies both reference names against the existing graph analysis.
An identity/reference mismatch throws; Practice offers a safe message and Next.

`ReviewModel` contains version, question ID, real generation index, attempt number,
status, submitted locale, exact student answer, both reference names, structural
identity, issues and ordered steps. It contains no molecule copy, timestamp, random
value, mutable session state, or persisted localized explanation.

`ReviewStep` contains a stable ID, kind, title/message keys, parameters, highlighted
atom IDs and canonical endpoint pair bond IDs (`min:max`). Numbering steps also
carry `(atomId, locant)` pairs. `ReviewIssue` contains a code, message key,
parameters and related atom/bond IDs. The model is JSON serializable.

`AttemptRecord.correct` is the sole correctness authority. Correct attempts always
produce `CORRECT` with zero issues, including Spanish acute-accent variants. The
reviewer does not call the evaluator, resubmit answers, or change prior outcomes.
Diagnosis uses `localeAtSubmission`; changing the display locale never rebuilds
the model, changes its issue or step IDs, or reevaluates an attempt.

## Sources reused

- Parent, numbering and locants: `analyzeMolecule.mainChain/numberedAtoms`.
- Functional groups and attachment atoms: the analysis's existing detected groups.
- Substituent names/locants/provenance: `analysis.substituents`. A connectivity
  traversal expands visual provenance outside the already selected parent, including
  the complete alkoxy chain; it does not select or name another parent.
- Unsaturation: graph-derived double/triple locants and actual parent bond IDs.
- English reference and parent: existing `buildLegacyEnglishNameModel`, `formatName`,
  `generateLegacyEnglishName`, and `englishStructuralSubstituentName`.
- Numbering comparison: existing `compareLocantSets` with structural reverse locants.
- E/Z: `inspectDoubleBondStereochemistry` configuration and priority neighbor IDs.
- Final assembly: the original generator references, verified against the engine.

No human reasoning strings are parsed. The existing English profile remains the
1979 profile used by Practice. Written locants are only diagnosed if they are
explicit in that profile; omitted English locants are never invented.

## Diagnosis policy

Only complete-reference, bounded transformations qualify. All text outside the
identified component must remain identical after the official typography
normalization in the submission locale. At most one issue is returned.

Precedence: opposite E/Z only → joint reversal of independent locants → functional
locant → unsaturation locant → substituent locant → missing sole substituent →
swapped prefix order → unsubstituted parent length → literal suffix → unknown.
The checks before unknown cannot diagnose simultaneous unrelated edits.

| Code | Support | Exact contract |
|---|---|---|
| WRONG_PARENT_CHAIN | NOT_YET_DIAGNOSABLE | Answer text cannot establish the chosen graph path. |
| WRONG_PARENT_LENGTH | SUPPORTED_WITH_RESTRICTIONS | Saturated, acyclic, unsubstituted hydrocarbon; another complete standard parent name. |
| WRONG_NUMBERING_DIRECTION | SUPPORTED_WITH_RESTRICTIONS | Acyclic parent; at least two independently written locant components both change to their structural reversals; all substituents accounted for; no E/Z. A single reversed locant is insufficient. |
| MISSING_SUBSTITUENT | SUPPORTED_WITH_RESTRICTIONS | One simple substituent; answer is exactly the engine's parent-only name. |
| EXTRA_SUBSTITUENT | NOT_YET_DIAGNOSABLE | No structural interpretation of an arbitrary extra prefix. |
| WRONG_SUBSTITUENT_LOCANT | SUPPORTED_WITH_RESTRICTIONS | One uniquely located simple prefix occurrence; only its numeric locant changes to a different parent position. Grouped repeated prefixes are excluded. |
| WRONG_ALPHABETICAL_ORDER | SUPPORTED_WITH_RESTRICTIONS | Exactly two distinct single prefixes; their complete prefix/locant blocks are swapped, with every other character unchanged. Submission language determines order. |
| WRONG_FUNCTIONAL_GROUP | NOT_YET_DIAGNOSABLE | A changed word cannot prove the student's inferred functional graph. |
| WRONG_FUNCTIONAL_GROUP_LOCANT | SUPPORTED_WITH_RESTRICTIONS | One acyclic alcohol, ketone or amine; explicit graph-matched locant in the submitted profile; only that locant changes. |
| WRONG_UNSATURATION_LOCANT | SUPPORTED_WITH_RESTRICTIONS | One acyclic double/triple bond without a principal suffix group; explicit graph-matched locant; only that locant changes. |
| WRONG_SUFFIX | SUPPORTED_WITH_RESTRICTIONS | Literal terminal suffix substitution from a bounded suffix vocabulary; everything else unchanged. Does not claim a parsed alternate molecule. |
| WRONG_EZ_DESCRIPTOR | SUPPORTED_WITH_RESTRICTIONS | Engine-confirmed stereogenic alkene; only the reference E/Z letter changes to its opposite at the same locant. Missing stereo or another change yields unknown. |
| UNKNOWN_MISMATCH | SUPPORTED | Every other incorrect response; full correct walkthrough remains available. |

## Generated category walkthroughs

All categories include parent and final assembly. Conditional steps are omitted
when the graph does not contain their corresponding feature.

| Category | Additional applicable steps |
|---|---|
| alkane | Branch numbering, substituents, alphabetization |
| alkene | Numbering, double bond, branches, alphabetization |
| alkyne | Numbering, triple bond, branches, alphabetization |
| halogenated | Prefix numbering, halogen/alkyl substituents, alphabetization |
| alcohol | Principal OH, numbering |
| aldehyde | Principal CHO, terminal carbon numbering |
| ketone | Principal carbonyl, numbering |
| carboxylic-acid | Principal COOH, terminal carbon numbering |
| ether | Ether linkage, parent/prefix numbering, complete alkoxy branch |
| ester | Principal ester, acid-derived parent, terminal numbering, alkyl portion |
| amine | Principal amino group, numbering |
| amide | Principal amide, terminal carbon numbering |
| simple-carbocycle | Ring numbering, branches, alphabetization |
| aromatic | Aromatic parent, ring numbering, branches, alphabetization; no Kekulé E/Z |
| ez | Alkene numbering/unsaturation, E/Z and priority neighbor atoms |
| nitrile | Principal nitrile including its carbon in the parent, terminal numbering |
| nitro | Nitro prefix numbering and substituent; never a principal suffix function |

## Presentation and boundaries

`PracticeSessionView` uses one reviewer for both FEEDBACK and CORRECTION_FEEDBACK.
Opening/closing/selecting a step changes only local presentation state. The stored
model is scoped to question ID, generation index and attempt number, so it cannot
reappear for a different attempt. Review failure never prevents Next or ending.

The existing `MoleculeHistoryPreview` receives optional `ReviewHighlights`. It
adds SVG attributes, visual styles and numbering labels without moving atoms or
changing bond coordinates, topology, stereo, name calculation or structural identity.
The structure stays visible while scrolling the steps. Labels/prose relocalize;
semantic IDs, current selection and diagnosis remain fixed.

Limits: no universal IUPAC equivalence/parser, causal inference for wide mismatches,
or recursive CIP priority explanation. The stereo engine exposes the winning
neighbor atoms and configuration, not a reusable priority-comparison tree; the
walkthrough explains their side relationship without inventing deeper priorities.

Finding `PRACTICE-006` (limitation, non-blocking): the current stereo inspection
does not expose a structured recursive CIP comparison tree. Phase 6 therefore
shows the verified priority neighbors and E/Z side relationship, without a
recursive priority walkthrough. This does not block Phase 7.

Coverage: 17 categories × 3 seeds × 2 indices; safe-diagnosis fixtures in EN/ES;
valid highlight IDs; graph/record immutability; attempts 1/2/3; Spanish accents;
locale relocalization; SVG parent/function/substituent/unsaturation/E/Z highlights;
feedback integration and explicit controls; strict checking of new TS modules.
