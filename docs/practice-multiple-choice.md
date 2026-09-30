# Practice Multiple Choice contract (Phase 7.1)

This phase defines localized option records, recipe provenance and a pure option-set
validator. It does not generate options or add a Multiple Choice question flow.

## Option contract

`MultipleChoiceOption` is a discriminated union. A reference option has
`kind: "reference"`, `correct: true` and reference origin. A distractor has
`kind: "distractor"`, `correct: false` and recipe origin containing a stable
`recipeId`, the matching Detailed Reviewer `diagnosticCode`, and typed transformation
metadata. Both carry one stable `id` and `{es, en}` names. IDs and provenance name the
semantic option; locale only selects its displayed text.

## Invariants and validator boundary

`validateMultipleChoiceOptions` accepts the bilingual reference and an option set.
It requires exactly one correct reference option, nonempty localized names, unique
IDs, names unique under the Practice evaluator's official typography normalization
in each locale, and no distractor that that evaluator accepts as the reference. It
rejects malformed origins, unknown diagnostic codes, recipe/metadata mismatches,
recipes marked unsafe, and restricted recipes until their preconditions have a
verifiable producer. For the currently supported E/Z recipe it also checks that
the localized option changes exactly the declared descriptor and nothing else.
`UNKNOWN_MISMATCH` is never a recipe.

The validator checks option-contract integrity, not chemistry from arbitrary text.
The trusted recipe producer in a future engine must establish the chemistry-specific
preconditions in the taxonomy before attaching provenance. The validator must not
be treated as a universal IUPAC parser or molecular identity checker.

## Recipe taxonomy

| Reviewer diagnostic | Recipe status | Restrictions / reason |
|---|---|---|
| `WRONG_PARENT_CHAIN` | NOT_SAFE_AS_DISTRACTOR | No bounded way to derive and prove an alternate parent/name from the current contract. |
| `WRONG_PARENT_LENGTH` | SUPPORTED_WITH_RESTRICTIONS | Restrict to simple parents whose alternate name is independently validated as a supported, distinct structure. |
| `WRONG_NUMBERING_DIRECTION` | SUPPORTED_WITH_RESTRICTIONS | Requires at least two independent, explicit locants; resulting name and distinct interpretation must be verified. |
| `MISSING_SUBSTITUENT` | SUPPORTED_WITH_RESTRICTIONS | Only one simple substituent; confirm the omission yields a supported, different structure. |
| `EXTRA_SUBSTITUENT` | NOT_SAFE_AS_DISTRACTOR | Inventing a branch would require constructing and validating new chemistry. |
| `WRONG_SUBSTITUENT_LOCANT` | SUPPORTED_WITH_RESTRICTIONS | One simple substituent and a valid alternate parent position; verify the resulting structure/name. |
| `WRONG_ALPHABETICAL_ORDER` | SUPPORTED_WITH_RESTRICTIONS | Exactly two simple prefixes; swap their whole locant/name blocks and localize ordering by language. |
| `WRONG_FUNCTIONAL_GROUP` | NOT_SAFE_AS_DISTRACTOR | A free-form group substitution does not prove a valid alternate functional structure. |
| `WRONG_FUNCTIONAL_GROUP_LOCANT` | SUPPORTED_WITH_RESTRICTIONS | One supported principal function and a valid alternate locant; verify the resulting isomer/name. |
| `WRONG_UNSATURATION_LOCANT` | SUPPORTED_WITH_RESTRICTIONS | One supported multiple bond and a valid alternate locant; verify a distinct supported structure. |
| `WRONG_SUFFIX` | SUPPORTED_WITH_RESTRICTIONS | Only a bounded suffix change that independently resolves to a valid, distinct supported structure. |
| `WRONG_EZ_DESCRIPTOR` | SUPPORTED | Flip one engine-confirmed stereogenic E/Z descriptor at the same locant; retain all other name components. |
| `UNKNOWN_MISMATCH` | NOT_SAFE_AS_DISTRACTOR | Reviewer fallback, not a controlled transformation. |

The registry preserves the Reviewer codes and distinguishes a recipe's known origin
from the less certain diagnosis of a student's free-text answer. Restricted recipes
are not enabled until a producer can prove their stated preconditions and validate
the alternate chemistry. No random names or arbitrary string mutations are valid.

## Exercise model and later phases

`exercise-model.ts` already declares the `multiple-choice` question discriminator,
category, difficulty, seed and generator version. That metadata remains unchanged.
`PopulatedMultipleChoiceQuestion` composes that metadata with the bilingual reference
and validated option records without changing the existing Question union. This
phase does not extend session state, choose three distractors, arrange A/B/C/D, store
attempts, or provide UI.

Detailed Reviewer remains the shared diagnostic vocabulary. Later MCQ review can
reuse an option's recipe and diagnostic code; it should not infer provenance again
from the selected option's text.

## Deterministic candidate engine (Phase 7.2)

`createDeterministicDistractorEngine` binds the existing naming engine and accepts a
`GeneratedExerciseMolecule` plus its matching `questionSeed`. It returns zero or more
typed bilingual distractor options. It validates the source graph/reference, derives
an explicit stereo descriptor from the graph, checks each candidate with the existing
Practice evaluator and `validateMultipleChoiceOptions`, then returns only safe,
normalized-unique options. Invalid or unsupported chemistry fails closed to `[]`; a
seed that does not identify the supplied question is an input error.

The canonical recipe order is frozen as `WRONG_EZ_DESCRIPTOR`. That recipe is
implemented only for a generated `ez` molecule whose explicit graph E/Z descriptors
and both engine-produced reference names agree. It flips exactly one structured
descriptor; the molecule and all other name text remain unchanged. If the molecule
has multiple explicit descriptors, a recipe-isolated stream derived from
`deriveSeed(questionSeed, "mcq:distractor:WRONG_EZ_DESCRIPTOR:variant")` chooses one
from locant-sorted variants. Candidate IDs are also derived from the question seed.
No wall clock or ambient randomness is used.

All other taxonomy recipes remain `NOT_IMPLEMENTED_IN_7_2` and produce no candidates.
The engine does not guarantee three distractors, create a four-option question, or
order/shuffle answer choices; those concerns belong to later phases.
