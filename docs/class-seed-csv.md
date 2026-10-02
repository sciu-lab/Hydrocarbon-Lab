# Phase 10 — Class Seed and CSV assignment manifest

## Architecture

```text
ClassAssignmentConfig
  -> existing deriveSeed tuple framing
  -> ParticipantAssignment
  -> ordinary SessionConfig
  -> existing Practice / Exam engine
```

`app/class-assignment.ts` owns the UI-independent contract, canonicalization,
participant IDs, seed derivation and conversion to SessionConfig.
`app/class-assignment-csv.ts` owns the manifest schema, CSV serialization and
reconstruction from an already parsed row. `app/class-variants-panel.tsx` owns
local configuration/preview/download UI, embedded in the existing configuration
form. Preview and export generate metadata only. They have no chemical generator,
Exam plan, Build editor or Attempt Log instance.

The **Use this seed** button copies one assignment into the existing individual
seed field. Starting Practice/Exam then uses the existing engine. The teacher
must distribute the seed together with the exported configuration: the ordinary
seed input does not infer mode, count or selections from a class seed string.

## Versions and typed schema

```ts
ClassAssignmentConfig {
  schemaVersion: 1
  derivationVersion: 1
  classSeed: string
  mode: "practice" | "exam"
  questionCount: number
  categories: readonly ExerciseCategory[]
  questionTypes: readonly QuestionType[]
  generatorVersion: number
}
ParticipantAssignment {
  participantId: string
  sessionSeed: string
  configFingerprint: string
}
ClassAssignmentManifest { config, participants }
```

`generatorVersion` remains **1**. Class schema/derivation versions are separate
from chemistry compatibility. Unknown schema/derivation versions are rejected.
The pure manifest contract can represent a positive future generator version,
which changes its fingerprint/seed. The current UI always supplies the current
generator version; conversion to SessionConfig rejects versions unsupported by
the existing engine. It never silently substitutes another generator version.

Class v1 fixes the existing `difficulty: "basic"` compatibility field. There is
no new difficulty control or algorithm. Finite positive safe integer question
counts are accepted, including 15, 23 and 37. Class Endless is rejected. Regular
individual Practice Endless continues to use its existing path.

## Text and participant IDs

Class Seeds and participant IDs use outer trim followed by Unicode NFC. Case and
meaningful internal text, including spaces, commas, quotes and Unicode, are
preserved. Blank Class Seeds are rejected. Lone UTF-16 surrogates and binary
control characters are rejected so UTF-8 export can preserve values; internal
tabs and line breaks remain representable.

Custom rosters split on LF, CRLF or CR, trim/NFC each line, remove blank lines and
preserve teacher order. Duplicate canonical IDs are rejected explicitly,
including canonically equivalent Unicode spellings. IDs are opaque and case
sensitive: `A01` and `a01` are different IDs. Real names are unnecessary; UI copy
recommends anonymous IDs. This feature sends no IDs to a server.

Automatic IDs use `String(index + 1).padStart(3, "0")`: `001` through `036` for
36 participants. Padding is independent of roster size. `037` is appended when
the count becomes 37; `1000` is appended after `999` without renaming prior IDs.

The optional **Generate seed** action calls `crypto.randomUUID()` once per
click. Rendering, changing locale and generating participants do not create new
random Class Seeds.

## Canonical fingerprint and derivation v1

Categories and types use the existing Exercise Model catalog order. Duplicate
set selections canonicalize identically. Object insertion order and UI selection
order do not affect the fingerprint.

Example canonical fingerprint:

```json
["class-config-v1","exam",15,["alkane","alcohol"],["naming","multiple-choice","build"],1]
```

The explicit tuple is:

```text
["class-config-v1", mode, questionCount, categories, questionTypes, generatorVersion]
```

The seed is the existing `deriveSeed(classSeed, context)`, where:

```text
context = JSON.stringify([
  "class-participant", derivationVersion, configFingerprint, canonicalParticipantId
])
```

Existing `deriveSeed` returns the full framed tuple string. This intentionally
produces longer, auditable session seeds instead of shortening exported identity
to a 32-bit hash. Distinct canonical IDs yield distinct exported strings under
one configuration. Roster order, roster length and other participants are absent
from each participant's derivation. Changes to Class Seed, ID, mode, question
count, category/type selections or generator version alter the corresponding
seed. Returning to a prior canonical input restores it exactly.

Locale is absent from both fingerprint and derivation. SessionConfig includes
the chosen presentation locale; the existing locale-neutral generation projection
preserves chemistry, scheduling, accepted generation indices and MCQ identities/
order. Locale changes in the configuration UI preserve the generated manifest.
Changing assignment inputs marks the old preview as stale and disables export/
use until regeneration. Returning to exactly the prior inputs makes the matching
snapshot usable again.

## Resource bounds and performance

Question counts retain the existing positive-safe-integer contract. Materializing
participant arrays is separately bounded at **100,000 IDs** to prevent enormous
synchronous allocations from arbitrary numeric input. Manifest generation also
rejects an estimated escaped-text footprint above **16,000,000 UTF-16 code
units**, using a conservative multiplier of eight for repeated contexts and
escaping. The effective roster ceiling therefore depends on text/config length.
These are client memory guards, not classroom or pedagogical limits.

Preview renders the first 100 rows in a contained scrolling table; CSV includes
every assignment. No chemistry is generated for preview/export.

Measured on the local Node runtime, 2026-10-01, for Exam/15 questions/two
categories/all three types. Timings are observations, not performance thresholds:

| Participants | Derivation ms | CSV ms | UTF-8 bytes |
|---|---:|---:|---:|
| 1 | 0.251 | 1.427 | 670 |
| 36 | 0.305 | 0.954 | 17,435 |
| 100 | 0.358 | 1.380 | 48,091 |

## CSV schema and safety

Filename: `hydrocarbon-lab-class-assignments.csv`. Fixed columns:

```text
schema_version,derivation_version,class_seed,config_fingerprint,participant_id,session_seed,mode,generator_version,question_count,question_types,categories,locale
```

Types/categories are canonical JSON arrays of machine IDs. Rows preserve
automatic numeric/generated order or canonical custom input order. Locale is
delivery metadata only. Same manifest and locale produce byte-identical data.

The file is UTF-8 with BOM for spreadsheet Unicode detection. Records use CRLF,
every field is quoted, and embedded double quotes are doubled. Commas and
embedded newlines remain inside their quoted fields. Quoting follows
[RFC 4180](https://www.rfc-editor.org/rfc/rfc4180.html); the BOM is an explicit
spreadsheet compatibility addition and the reconstruction test reader removes it.

**Formula protection:** v1 CSV always prefixes `class_seed` and `participant_id`
with the literal alphabetic marker `text:`. Thus `=1+1` exports as `text:=1+1`,
and ID `001` exports as `text:001`, retaining its leading zeros. Internal values
remain unchanged. The row reconstruction helper removes exactly one required
prefix, so an original `text:A01` becomes `text:text:A01` in CSV and decodes
without ambiguity. The marker is deliberately visible in a text/spreadsheet
viewer; it is part of the documented v1 serialization, not the internal ID.

This avoids relying solely on quotation or an apostrophe, which spreadsheet
programs may remove during later save/reopen operations. See
[OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection). No CSV
strategy claims universal behavior after arbitrary spreadsheet edits or data
transformations. Tests validate the alphabetic-leading cells and reversible
values; no spreadsheet application is launched by the tests.

CSV rows contain assignment metadata only. They contain no answer, correct MCQ
option, target molecule, structural identity, student response, attempt or score.

## Reconstruction and engine integration

`reconstructClassSessionFromCsvRow(parsedRow)` validates versions, canonical
configuration, fingerprint, participant ID and derived seed before returning an
ordinary SessionConfig. Altered fingerprints/seeds/IDs and unsupported metadata
are rejected. No CSV import UI is added.

Automated fixture: `CHEM-4B-2026`, Exam, 15 questions, all supported categories,
Naming/MCQ/Build, participants `001`, `002`, `003`. All three seeds differ. Each
parsed CSV row recreates the exact 15-question plan with no literal duplicate.
Participant `001` starts at generationIndex **0**, structuralIdentity
**`dax@@DiY^jh@@`**. Reconstruction uses each accepted real generationIndex and
the existing display/type context. Separate fresh ES/EN Node processes reproduce
the complete plan. Existing Phase 9.1 duplicate skipping/uniqueness is
reused unchanged; corrections retain their existing exemption.

Class-derived Naming exact references are accepted by the shared evaluator and
record correct initial attempts. Mixed Practice also exercises the existing
Build structural evaluator. Exam plans retain empty Attempt Logs before Submit;
the existing UI/grading regression suites protect privacy and atomic submission.

Bounded sweep: 3 Class Seeds x 12 participants x 4 configurations, 144 assignments
and 864 accepted/reconstructed questions:

| Mode | Types | Count | Assignments | Seed collisions | Reconstruction mismatches | Literal duplicates | Failures |
|---|---|---:|---:|---:|---:|---:|---:|
| Practice | Naming | 5 | 36 | 0 | 0 | 0 | 0 |
| Practice | Naming/MCQ/Build | 7 | 36 | 0 | 0 | 0 | 0 |
| Exam | Naming | 5 | 36 | 0 | 0 | 0 | 0 |
| Exam | Naming/MCQ/Build | 7 | 36 | 0 | 0 | 0 | 0 |

## Tests and manual validation

New suites: `class-assignment.test.mjs` (24), `class-assignment-csv.test.mjs` (7),
`class-assignment-integration.test.mjs` (8), `class-variants-ui.test.mjs` (6):
**45 new tests**. The independent field-state CSV reader is test-only; process
determinism uses `tests/helpers/class-session-process.mjs`.

The derivation suite also verifies 10,000 distinct exported participant seeds,
36->37 and 999->1000 stability, arbitrary finite question counts, invalid text/
rosters, resource guards, configuration sensitivity, no entropy/time dependency
and strict TypeScript integration. Existing RNG/chemistry frozen vectors are
unchanged.

The existing Practice/Exam configuration UI tests now count topic and question-
type checkboxes within their own sections, and separately assert one unchecked
Class opt-in. The prior form-wide fixed counts failed after the new opt-in was
added; no existing topic/type assertion was removed. Both directed UI suites
pass all 51 tests.

Manual browser validation on the local app:

- Desktop 1280 px: Exam, 15 questions, alkane/alcohol, all three types, Class Seed
  `CHEM-4B-2026`, auto IDs 001-036; CSV downloaded and inspected as 36 rows with
  UTF-8 BOM and reconstructable 15-question config.
- ES->EN: all 36 DOM seed values unchanged. 36->37: first 36 unchanged, 037 added;
  stale export disabled until regeneration.
- Custom A01/A02/A03: three assignments. Reordering preserved each ID's seed.
  A01/A01 produced the localized error and disabled the stale export.
- Generate seed: one UUID-based value survived subsequent locale change.
- 390 px: class section clientWidth/scrollWidth both 317 px; 320 px: both 247 px.
  Class Seed, custom textarea, preview and CSV action remained accessible.
- Use this seed copied A03's exact seed into the normal seed field and started
  the existing 15-question Exam (Build first), with existing pre-submit behavior.

Baseline: HEAD `809305d`, main, clean; 2,040 tests, 2,035 PASS, 0 FAIL, 5 SKIP;
build passed; lint 0 errors and 11 preexisting warnings. Final complete suite:
2,085 tests, 2,080 PASS, 0 FAIL, 5 SKIP (1,146,027 ms). Lint remains at 0 errors
and the same 11 warnings; the separate final build and `git diff --check` pass.
No existing frozen vectors were updated.

## Limits

Assignments are transient local configuration data; CSV is the reproduction
manifest. There are no accounts, remote storage, submissions, results dashboard,
grades export, answer key, sharing links or persistence. Class preview state is
not a stored session and is not retained after starting an individual session.

Manifest validation does not pre-generate or certify every full chemical plan.
The existing engine checks unique-question availability when an individual
session starts; restricted categories with a large workload can still produce
its existing safe `insufficient-unique-questions` result. The bounded sweep
certifies the tested configurations, not every possible finite workload.

Independently derived seeds do not guarantee disjoint molecule sets or distinct
entire plans. Existing FNV-1a/Mulberry32 machinery has finite 32-bit state and is
non-cryptographic. Class Seeds provide deterministic variant assignment, not
secrecy, identity verification or anti-cheat. Anyone with a seed and configuration
can reproduce the corresponding session. Phase 11 is not implemented here.
