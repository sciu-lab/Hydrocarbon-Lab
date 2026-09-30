# Practice Multiple Choice contract

The following sections record the frozen Phase 7.1/7.2 foundation. The completed
Phase 7 integration and expanded producer restrictions are documented at the end.

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

## Completed Phase 7

`practice-distractor-recipes.ts` extends the existing E/Z producer when production
chemistry oracles are supplied. Without these oracles the original E/Z producer
retains its original vectors. The expanded canonical recipe order appends
substituent locant, omitted substituent, functional locant, unsaturation locant and
parent length. Alphabetical order, reversed numbering and suffix remain blocked:
these may describe the same structure or an ambiguous interpretation and lack a
validated producer. Unsafe registry entries remain blocked as well.

Graph recipes retain at most three proven variants each, in stable traversal order.
This bounds the candidate pool and stops additional expensive naming once the
recipe has sufficient variants. It changes neither safety checks nor chemistry.

Expanded producers copy graphs, never names alone. Each alternative must pass the
existing chemical/domain validator, production bilingual naming and structural
identity oracle. Structured naming models must differ only in the declared field.
Locant and omission recipes also preserve the actual parent atom set. A simple
carbon branch must have exactly one single-bond attachment; selecting one branch
among several is permitted only when every other model field remains unchanged.
Functional relocation is limited to a single alcohol, amine or ketone; multiple
bond relocation to one unspecified alkene/alkyne bond. Parent length extends a
chain terminal or expands a simple saturated ring, with all other named fields
unchanged. No arbitrary polycycles, unsupported groups or new naming algorithm.

Restricted provenance includes reference and alternative structural identities.
The option validator requires proof bound to the current reference; that proof is
an internal trusted-producer contract, not a proof verifier for untrusted text.

`practice-question.ts` separates candidate eligibility (three unique, safe
distractors) from four-option assembly. It takes one candidate per recipe first,
then additional variants. Isolated `mcq:selection:<recipe>:v1` streams choose
variants; `mcq:option-order:v1` shuffles the four options. IDs are semantic seed
contexts; A/B/C/D are labels only. Complete bilingual option order, IDs and
provenance form `optionSetIdentity`, an exact serialized signature rather than a
collision-prone hash. The reference graph and chemical seed are unchanged.

Practice searches at most 12 real generation indices for MCQ, retaining the
accepted index; Naming retains its four-context duplicate avoidance. A bounded
failure displays a localized safe error. All categories have partial or full
coverage; eligibility is always tested on the individual molecule. Mixed sessions
shuffle blocks containing one of each selected type with an isolated block seed.
Naming remains the default and Naming-only frozen vectors remain unchanged.

There is one append-only Attempt Log, one timer and one metrics/correction system.
MCQ attempts store the selected stable option ID and option signature, plus the
displayed answer as audit metadata. Corrections reconstruct by actual generation
index and stored type, verifying graph/question identity and exact option signature.
Selection resets, timing restarts on availability and attempt numbers grow from
history. Initial metrics still use only attempt number 1.

The existing Detailed Reviewer receives the selected option's typed provenance,
not a new string diagnosis. Its correct graph walkthrough is unchanged. Locale
changes select bilingual option text and reference name while retaining IDs,
order, selection, timing, outcomes and diagnosis. Build, Exam and persistence are
not introduced.
