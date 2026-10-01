import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { validateExerciseDomain } from "../app/exercise-domain.ts";
import { applyNomenclatureConvention } from "../app/nomenclature-conventions.ts";
import { translateSpanishIupacForDisplay, translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";
import { canonicalizeEnglishAcyclicPrefixes } from "../app/english-acyclic-prefixes.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry;
before(async () => { chemistry = await loadExerciseChemistry(); });
after(async () => chemistry?.close());

// Independently assigned using Blue Book P-14.4(f,g) and P-14.5.1:
// compare the complete numeric sequence first; only then use cited EN order.
// https://iupac.qmul.ac.uk/BlueBook/P1.html
// Ether prefix construction: P-63.2.4.1, https://iupac.qmul.ac.uk/BlueBook/P6.html
// These fixtures exercise the public current-EN path, not the legacy profile.
const fixtures = [
  ["REFERENCE-001", "COC", "ether", "methoxymethane", "metoximetano"],
  ["short methoxy neighbour", "COCC", "ether", "methoxyethane", "metoxietano"],
  ["symmetric ethoxy neighbour", "CCOCC", "ether", "ethoxyethane", "etoxietano"],
  ["longer methoxy neighbour", "COCCC", "ether", "1-methoxypropane", "1-metoxipropano"],
  ["longer ethoxy neighbour", "CCOCCC", "ether", "1-ethoxypropane", "1-etoxipropano"],
  ["symmetric propoxy neighbour", "CCCOCCC", "ether", "1-propoxypropane", "1-propoxipropano"],
  ["secondary attachment neighbour", "COC(C)C", "ether", "2-methoxypropane", "2-metoxipropano"],
  ["REFERENCE-002", "COC(C)CC(C)C", "ether", "2-methoxy-4-methylpentane", "2-metil-4-metoxipentano"],
  ["REFERENCE-002 reversed SMILES", "CC(C)CC(OC)C", "ether", "2-methoxy-4-methylpentane", "2-metil-4-metoxipentano"],
  ["REFERENCE-003", "COC(C)C(C)C", "ether", "2-methoxy-3-methylbutane", "2-metil-3-metoxibutano"],
  ["REFERENCE-004", "COC(C)CCC(C)C", "ether", "2-methoxy-5-methylhexane", "2-metil-5-metoxihexano"],
  ["larger tied parent", "COC(C)CCCC(C)C", "ether", "2-methoxy-6-methylheptane", "2-metil-6-metoxiheptano"],
  ["ethoxy precedes methyl", "CCOC(C)CC(C)C", "ether", "2-ethoxy-4-methylpentane", "2-etoxi-4-metilpentano"],
  ["bromo precedes methyl", "CC(Br)CC(C)C", "halogenated", "2-bromo-4-methylpentane", "2-bromo-4-metilpentano"],
  ["chloro precedes methyl", "CC(Cl)CC(C)C", "halogenated", "2-chloro-4-methylpentane", "2-cloro-4-metilpentano"],
  ["iodo changes Spanish alphabetical precedence", "CC(I)CC(C)C", "halogenated", "2-iodo-4-methylpentane", "2-metil-4-yodopentano"],
  ["ethyl precedes methyl", "CCC(CC)CC(C)CC", "alkane", "3-ethyl-5-methylheptane", "3-etil-5-metilheptano"],
  // [2,4] beats [3,5], even though methoxy would receive 3 after reversal.
  ["numeric locants outrank alphabetization", "CC(C)CC(OC)CC", "ether", "4-methoxy-2-methylhexane", "2-metil-4-metoxihexano"],
  // The first locant ties at 2; [2,2,6] beats [2,6,6] at the SECOND position.
  ["first point of difference includes repeated locants", "COC(C)CCCC(C)(C)C", "ether", "6-methoxy-2,2-dimethylheptane", "2,2-dimetil-6-metoxiheptano"],
  // tri- does not give methyl precedence over methoxy in either selection or citation.
  ["multipliers ignored in an alphabetical tie", "COC(C)(C)CCCC(C)(C)C", "ether", "2-methoxy-2,6,6-trimethylheptane", "2,2,6-trimetil-6-metoxiheptano"],
];

for (const [label, smiles, category, en, es] of fixtures) {
  test(`${label}: current EN, unchanged ES/legacy and graph`, () => {
    const parsed = moleculeFromSmiles(smiles);
    assert.equal(parsed.ok, true, parsed.error);
    const molecule = parsed.molecule, snapshot = structuredClone(molecule);
    assert.equal(validateExerciseDomain(molecule, category, chemistry.oracles).valid, true);
    const analysis = chemistry.engine.analyzeMolecule(molecule);
    const legacyBefore = chemistry.oracles.reference(molecule).names;
    const spanish = chemistry.engine.suggestedIupacNameWithOmittedLocants(analysis);
    const actual = applyNomenclatureConvention(translateSpanishIupacForDisplay(spanish), "current", "en");
    assert.equal(actual, en, `${smiles}: ${actual}`);
    assert.equal(applyNomenclatureConvention(spanish, "current", "es"), es);
    assert.deepEqual(chemistry.oracles.reference(molecule).names, legacyBefore);
    assert.deepEqual(molecule, snapshot, "choosing EN numbering cannot mutate the graph");
    assert.equal(translateSpanishIupacForDisplay(actual), actual, "current EN naming is idempotent");
  });
}

test("legacy ether profile retains its independently selected Spanish numbering", () => {
  const molecule = moleculeFromSmiles("COC(C)CC(C)C").molecule;
  assert.deepEqual(chemistry.oracles.reference(molecule).names, {
    es: "2-metil-4-metoxipentano", en: "4-methoxy-2-methylpentane",
  });
});

test("parent root translation is independent of the glued prefix and suffix", () => {
  for (const [input, expected] of [
    ["metoximetano", "methoxymethane"], ["metoxietano", "methoxyethane"],
    ["etoxietano", "ethoxyethane"], ["nitrometano", "nitromethane"],
    ["nitroetano", "nitroethane"],
    ["hidroximetano", "hydroxymethane"], ["aminometano", "aminomethane"],
    ["fenilmetanol", "phenylmethanol"], ["feniletanol", "phenylethanol"],
    ["diclorometano", "dichloromethane"], ["metanal", "methanal"],
    ["etanol", "ethanol"], ["N-metiletanamina", "N-methylethanamine"],
    ["oxetano", "oxetane"], ["oxetane", "oxetane"],
  ]) assert.equal(translateSpanishIupacToOpsin(input), expected, input);
});

test("EN orientation compares multi-digit locants numerically, not as strings", () => {
  assert.equal(translateSpanishIupacForDisplay("3-metil-10-metoxidodecano"),
    "3-methoxy-10-methyldodecane");
});

test("current EN selection and alphabetical citation are separate and independent of input order", () => {
  for (const name of ["2-methyl-4-methoxyhexane", "4-methoxy-2-methylhexane",
    "5-methyl-3-methoxyhexane", "3-methoxy-5-methylhexane"]) {
    assert.equal(canonicalizeEnglishAcyclicPrefixes(name), "4-methoxy-2-methylhexane");
  }
});

test("acyclic prefix numbering leaves unsupported parent grammars intact", () => {
  for (const name of ["2-methyl-4-methoxycyclohexane", "2-methyl-4-methoxyhexan-1-ol",
    "2-methyl-4-methoxyhex-1-ene", "2-(1-methylethoxy)-4-methylpentane",
    "(2R)-2-methyl-4-methoxyhexane", "2-unknown-4-methylpentane"]) {
    assert.equal(canonicalizeEnglishAcyclicPrefixes(name), name);
  }
});
