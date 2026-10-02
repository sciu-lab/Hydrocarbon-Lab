# REASON-UNSAT-001 — reasoning for parent-chain unsaturation

## A. Baseline

- HEAD: `857c5a2d89ffdb8dec4bec0dc9101a25f4d3ef84` (`chore: harden release candidate for public beta`)
- Branch: `main`; synchronized with `origin/main`.
- Working tree before this task: clean.
- `npm test`: PASS, 2,138 passed, 0 failed, 5 skipped; 29m 02s.
- `npm run build`: PASS.
- `npm run lint`: PASS, 0 errors and 11 pre-existing warnings.

## B. Reproduction

For `3-metilhept-3-en-2,6-diona`, the existing “Numeración razonada” step already identified the double bond and explained why C3=C4 wins after the ketone locants tie. The name’s `3-en` contribution had no separate semantic target, so the user could not select that text to reach the C3=C4 explanation or highlight that bond.

## C. Root cause

`deriveExistingReasoningNameFragments` only had a special presentation path for a single unsaturation in a name without functional groups, and another path that grouped two or more unsaturations into one broad parent suffix. Its general acyclic path returned early when a primary functional group, functional group, or unsaturation existed. Later functional evidence could recover suffix, parent, and prefix spans, but did not create unsaturation evidence. Consequently, polyfunctional alkene/alkyne names had reasoning text without a per-bond name mapping.

## D. Architecture before

`displayed name → literal fragments keyed by numbered reasoning step → generic reasoning step`

The single `3-en` span was absent for a functionalized molecule. Multi-unsaturation names could instead expose one combined string under step 03. The link model carried a step number and optional functional/atom provenance, but no bond type, locant, or bond identity.

## E. Fix

The analysis model supplies each parent-chain double/triple locant. The new contribution builder pairs locant `n` with `mainChain[n-1]` and `mainChain[n]`, creating locale-independent IDs such as `unsaturation:double:3`, the bond type, locant, atom IDs, and sorted bond endpoint IDs. It then locates that already-analyzed contribution in the exact displayed parent form. For grouped diene/triene/diine locants, each locant digit has its own target; for separate enyne suffixes, the link spans the locant and its `en`/`in`/`yn` morpheme.

Each item maps to step 07, “Insaturaciones del nombre” / “Name unsaturations”, and includes a specific explanation. The existing step 03 remains “Numeración razonada” / “Numbering”. Clicking a name link or its matching item opens step 07, selects only that semantic item, and highlights only its bond. Selection identity excludes locale, so switching ES/EN keeps the selection when the molecule is unchanged.

## F. Numbering vs. name contribution

Numbering explains why one orientation wins. Name unsaturation explains why a specific bond contributes a given locant and suffix. For the diketone, step 03 still says the ketone set ties at C2,C6 and the alkene comparison selects C3 over C4; step 07 says C3=C4 contributes `3-en`.

## G. Required example

For `3-metilhept-3-en-2,6-diona`:

- `3-metil` → substituent/localizer evidence, step 04.
- `hept` → seven-carbon parent, step 02.
- `3-en` → `unsaturation:double:3`, atoms at C3 and C4, step 07.
- `2,6-diona` → principal ketone suffix, step 01.

All four remain independently represented and linked.

## H. Double bond

`5-metilhex-3-en-2-ol`: `3-en` maps to C3=C4. The item label is localized, and the name fragment has an accessible label describing the double bond and locant.

## I. Triple bond

`5-metilhept-3-in-2,6-diol`: `3-in` maps to C3≡C4. The SVG’s three rendered bond strokes receive the same high-contrast highlight and halo.

## J. En + in

`5-metiloct-3-en-6-in-2-ol` has two IDs: `unsaturation:double:3` → C3=C4 and `unsaturation:triple:6` → C6≡C7. The English output currently uses `3-en` and `6-yn`; each fragment selects its own target.

## K. Polyfunctional examples

Verified alongside their existing functional and prefix evidence:

- `3-metilhept-3-en-2,6-diona` — ketone + alkene + methyl.
- `ácido 4-metilhept-2-en-5-inoico` — acid + en + in + methyl.
- `4-amino-5-bromo-3-metilhept-2-en-6-in-1-ol` — alcohol + amine + bromo + methyl + en + in.

The fixtures’ generated names remain unchanged.

## L. Name constructor vs. manual structure

The browser’s name constructor and SMILES structure constructor were both run with the same polyfunctional enyne. Both produced `4-amino-5-bromo-3-metilhept-2-en-6-in-1-ol`, formula C₈H₁₂BrNO, the same two locants/types, and the same C2=C3 and C6≡C7 explanations. Physical atom IDs are graph-local; semantic IDs and locants agree.

## M. ES / EN

The contribution is rebuilt from the same analysis fields in each locale. Spanish displays `3-en`, `6-in`, `5-ino`; this current English profile displays `3-en`, `6-yn`. English is derived from the application’s existing English name output, not a new name translation rule. ES→EN→ES kept the selected `6-in` / `6-yn` identity and the same bond target.

## N. Highlight

The main molecule SVG marks the selected bond segments and draws a broad halo underneath them. The orange/brown palette is high contrast in light mode; dark mode uses pale gold. The selection does not highlight the whole molecule.

## O. Accessibility

Name fragments remain keyboard-reachable links with `:focus-visible` styling and bond/type/locant labels. The reverse explanation items are buttons with localized accessible names and `aria-pressed`; color is not their only selected-state cue.

## P. Sweep

The deterministic fixture sweep covers 10 named structures and 13 unsaturation contributions, including alkene, alkyne, alcohol, ketone, aldehyde, acid, nitro, amine, enyne, and the polyfunctional fixture. A second sweep covers seven currently supported diene, triene, diyne, triyne, enyne, and branched-diene parents (16 contributions).

| Family | Structures | Unsaturations | Missing explanations | Wrong locants | Wrong bond targets |
|---|---:|---:|---:|---:|---:|
| Single alkene / functionalized alkene | 6 | 6 | 0 | 0 | 0 |
| Single alkyne | 1 | 1 | 0 | 0 | 0 |
| En + in, including acid and polyfunctional cases | 3 | 6 | 0 | 0 | 0 |
| Supported grouped multiple-bond parents | 7 | 16 | 0 | 0 | 0 |
| **Total** | **17** | **29** | **0** | **0** | **0** |

## Q. Tests

Added structured checks for one item per analyzed bond, semantic ID locale independence, correct locant/type/atom/bond IDs, exact displayed spans, valid target step, grouped polyunsaturation locants, ES/EN rendering, reverse-navigation controls, and continued functional/substituent mapping. Existing name-constructor chemistry and Exam pre-submit tests remain in the full suite.

## R. Validation

| Check | Result |
|---|---|
| `3-metilhept-3-en-2,6-diona` | PASS |
| `3-en` clickable | PASS |
| C3=C4 explanation | PASS |
| C3=C4 highlight | PASS; only the double-bond strokes |
| Simple alkene | PASS |
| Simple alkyne | PASS |
| Alcohol + alkene | PASS |
| Ketone + alkene | PASS |
| Acid + alkene | PASS |
| Multiple functional groups | PASS |
| C=C + C≡C | PASS |
| `3-en` maps to correct bond | PASS |
| `6-in` maps to correct bond | PASS |
| Numbering rationale preserved | PASS |
| Functional-group fragments preserved | PASS |
| Substituent fragments preserved | PASS |
| ES | PASS |
| EN | PASS |
| Locale switching | PASS; semantic selection persisted |
| Manual structure constructor | PASS via SMILES with matching name, formula, semantics |
| Name constructor | PASS |
| Practice Reviewer | PASS; existing reviewer model is separate from Lab name links |
| Exam post-submit Reviewer | PASS; existing post-submit review tests pass |
| No pre-submit Exam leak | PASS; existing access-guard tests pass |
| No AttemptLog mutation | PASS by interaction path; link callbacks only update reasoning selection/navigation |
| PRACTICE-008 | PASS in full suite |
| Full suite | PASS, 2,140 passed, 0 failed, 5 skipped; 16m 43s |
| Build | PASS |
| Lint | PASS, 0 errors and 11 existing warnings |
| `git diff --check` | PASS |

## S. Findings

No independent naming or chemistry defect was found. `PRACTICE-007B` remains a separate open report and was not changed or folded into this work.

## T. Out of scope

No Easy/Intermediate/Hard implementation, generator expansion, PRACTICE-007B fix, new chemistry, class changes, dashboard changes, account/persistence work, R/S changes, or AI integration. Existing Google Analytics is retained as requested; no telemetry was added.

## U. Final state

- No commit and no push.
- Modified files: `app/globals.css`, `app/i18n.ts`, `app/page.tsx`, `app/reasoning-name-fragments.ts`, `app/reasoning-name-links.ts`, `tests/reasoning-hierarchy.test.mjs`, `tests/reasoning-name-fragments.test.mjs`.
- New file: `docs/reason-unsat-001.md`.
- Final `npm test`: PASS, 2,140 passed, 0 failed, 5 skipped; 16m 43s.
