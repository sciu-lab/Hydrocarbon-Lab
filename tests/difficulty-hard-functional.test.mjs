import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { validateExerciseChemistry, validateExerciseDomain } from "../app/exercise-domain.ts";
import { validateEasyExercise } from "../app/exercise-easy-profile.ts";
import { validateIntermediateExercise } from "../app/exercise-intermediate-profile.ts";
import { validateHardFoundationExercise } from "../app/exercise-advanced-profile.ts";
import { classifyMinimumExerciseDifficulty } from "../app/exercise-difficulty-classification.ts";
import { resolveFunctionalHierarchy } from "../app/legacy-english-nomenclature.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { formatPracticeReviewMessage } from "../app/practice-review-i18n.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/difficulty-d4-2a-hard-functional.json", import.meta.url)));
const previousFixture = JSON.parse(readFileSync(new URL("./fixtures/difficulty-d4-hard-foundation.json", import.meta.url)));
const categories = ["ester", "amine", "amide", "nitrile", "nitro"];
let chemistry, validate, evaluate, currentValidate, currentEvaluate, review;
before(async () => {
  chemistry = await loadExerciseChemistry();
  validate = createBuildSubmissionValidator(chemistry.oracles, "hard-foundation");
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles, "hard-foundation");
  currentValidate = createBuildSubmissionValidator(chemistry.oracles);
  currentEvaluate = createStructuralAnswerEvaluator(chemistry.oracles);
  review = createPracticeReviewer(chemistry.engine);
});
after(async () => chemistry?.close());
const graph = (smiles) => { const r = moleculeFromSmiles(smiles); assert.ok(r.ok, r.error); return r.molecule; };
const hard = (molecule, category) => validateHardFoundationExercise(molecule, category, chemistry.oracles);
function redraw(m) {
  const ids = new Map(m.atoms.map((a, i) => [a.id, 2000 + i * 23]));
  return { atoms: m.atoms.map(a => ({ ...a, id: ids.get(a.id), x: -a.y * 2 + 9, y: a.x * 2 - 5 })).reverse(),
    bonds: m.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse(), rings: [] };
}

for (const f of fixture.fixtures) test(`D4.2A ${f.id}: bilingual structural certification and opt-in Build`, () => {
  const m = graph(f.smiles), original = structuredClone(m), r = chemistry.oracles.reference(m);
  assert.equal(validateExerciseChemistry(m, chemistry.oracles).valid, true);
  assert.equal(r.namingSupported, true); assert.deepEqual(r.names, f.names); assert.equal(r.formula, f.formula);
  assert.equal(r.principalFunctionalGroup ?? null, f.principalGroup);
  assert.deepEqual(JSON.parse(JSON.stringify(r.functionalGroups)), f.functionalLocants);
  assert.equal(resolveFunctionalHierarchy(r.functionalGroups).principalKind ?? null, f.principalGroup);
  assert.equal(r.parent.carbonCount, f.parentCarbonCount);
  const a = chemistry.engine.analyzeMolecule(m);
  assert.deepEqual(a.doubleBondLocants, f.doubleLocants); assert.deepEqual(a.tripleBondLocants, f.tripleLocants);
  assert.equal(exerciseStructuralIdentity(m), f.structuralIdentity);
  assert.equal(validateEasyExercise(m, f.category, chemistry.oracles).valid, false);
  assert.equal(validateIntermediateExercise(m, f.category, chemistry.oracles).valid, false);
  assert.equal(classifyMinimumExerciseDifficulty(m, f.category, chemistry.oracles), f.minimumDifficulty);
  const h = hard(m, f.category); assert.equal(h.valid, true, JSON.stringify(h));
  assert.equal(h.evidence.family, f.family); assert.equal(h.evidence.principalGroup ?? null, f.principalGroup);
  assert.deepEqual(h.evidence.secondaryGroups.map(g => g.kind), f.secondaryGroups);
  assert.equal(h.evidence.principalInstances.length, f.principalGroup ? 1 : 0);
  assert.deepEqual(h.evidence.repeatedFunctions, []);
  assert.equal(h.evidence.carbonDoubleBondCount, f.doubleCount); assert.equal(h.evidence.carbonTripleBondCount, f.tripleCount);
  assert.equal(validateExerciseDomain(m, f.category, chemistry.oracles).valid, false);
  assert.equal(validateExerciseDomain(m, f.category, chemistry.oracles, "intermediate").valid, false);
  assert.equal(currentValidate(m).valid, false);
  assert.equal(currentEvaluate({ referenceMolecule: m, submittedMolecule: m, category: f.category }).status, "UNSUPPORTED_COMPARISON");
  const exported = moleculeToSmiles(m); assert.ok(exported.ok, exported.error);
  const restored = graph(exported.smiles);
  for (const submitted of [structuredClone(m), redraw(m), restored]) {
    assert.equal(validate(submitted).valid, f.buildSupported);
    assert.equal(exerciseStructuralIdentity(submitted), f.structuralIdentity);
    assert.deepEqual(chemistry.oracles.reference(submitted).names, f.names);
    assert.equal(classifyMinimumExerciseDifficulty(submitted, f.category, chemistry.oracles), "advanced");
    const answer = evaluate({ referenceMolecule: m, submittedMolecule: submitted, category: f.category });
    assert.equal(answer.correct, true); assert.equal(answer.status, "EQUIVALENT");
  }
  // Each lost C–C axis is a safe lower-profile mistake, not an invalid drawing.
  for (const order of [2, 3]) {
    const wrong = structuredClone(m), carbon = id => (wrong.atoms.find(a => a.id === id).element ?? "C") === "C";
    wrong.bonds.find(([a, b, o]) => carbon(a) && carbon(b) && o === order)[2] = 1;
    assert.equal(hard(wrong, f.category).valid, false);
    assert.equal(classifyMinimumExerciseDifficulty(wrong, f.category, chemistry.oracles), "intermediate");
    const answer = evaluate({ referenceMolecule: m, submittedMolecule: wrong, category: f.category });
    assert.equal(answer.checks.submissionValid, true); assert.equal(answer.correct, false);
    assert.equal(answer.status, "DIFFERENT_BOND_ORDERS");
    assert.notEqual(exerciseStructuralIdentity(wrong), f.structuralIdentity);
  }
  assert.deepEqual(m, original);
});

test("new anchors do not reassign suffix functions, nitro or hydrocarbon categories", () => {
  assert.deepEqual([...new Set(fixture.fixtures.map(f => f.category))], categories);
  for (const f of fixture.fixtures) {
    const m = graph(f.smiles);
    for (const category of [...categories, "alcohol", "carboxylic-acid", "alkene", "alkyne", "halogenated"])
      assert.equal(hard(m, category).valid, category === f.category, `${f.id}/${category}`);
  }
  for (const [smiles, actual] of [["OCC=C(C)C(N)CC", "alcohol"], ["O=C(O)C=C(C)C(N)CC", "carboxylic-acid"]]) {
    const m = graph(smiles); assert.equal(hard(m, actual).valid, true); assert.equal(hard(m, "amine").valid, false);
  }
  // D0 #4 remains Intermediate; a nitro prefix alone never supplies a Hard axis.
  const m = graph("OCC=CC(C)C([N+](=O)[O-])C");
  assert.equal(classifyMinimumExerciseDifficulty(m, "alcohol", chemistry.oracles), "intermediate");
  assert.equal(hard(m, "nitro").valid, false);
});

test("combined foundation certifies thirteen category anchors and leaves only D4.2B coverage gaps", () => {
  const covered = new Set(), allCategories = ["alkane", "alkene", "alkyne", "halogenated", "alcohol", "aldehyde",
    "ketone", "carboxylic-acid", "ether", "ester", "amine", "amide", "simple-carbocycle", "aromatic", "ez", "nitrile", "nitro"];
  for (const f of [...previousFixture.fixtures, ...previousFixture.additionalFixtures, ...fixture.fixtures]) {
    const m = graph(f.smiles), r = chemistry.oracles.reference(m);
    for (const category of allCategories)
      if (validateHardFoundationExercise(m, category, chemistry.oracles, r).valid) covered.add(category);
  }
  assert.equal(covered.size, 13);
  assert.deepEqual(allCategories.filter(category => !covered.has(category)), ["alkane", "simple-carbocycle", "aromatic", "ez"]);
});

test("Build distinguishes safe functional locant isomers and a missing mandatory feature", () => {
  const variants = [
    ["ester", "COC(=O)C=CC(C)C#CC", "COC(=O)C=C(C)CC#CC"],
    ["amine", "CC(N)C=CC(C)C#CC", "NCCC=CC(C)C#CC"],
    ["amide", "NC(=O)C=CC(C)C#CC", "NC(=O)C=C(C)CC#CC"],
    ["nitrile", "N#CC=CC(C)C#CC", "N#CC=C(C)CC#CC"],
    ["nitro", "CC([N+](=O)[O-])C=CC(C)C#CC", "[O-][N+](=O)CCC=CC(C)C#CC"],
  ];
  for (const [category, smiles, wrongSmiles] of variants) {
    const m = graph(smiles), wrong = graph(wrongSmiles);
    assert.equal(validate(wrong).valid, true, category);
    assert.notEqual(exerciseStructuralIdentity(m), exerciseStructuralIdentity(wrong));
    const answer = evaluate({ referenceMolecule: m, submittedMolecule: wrong, category });
    assert.equal(answer.correct, false); assert.equal(answer.status, "DIFFERENT_STRUCTURE");
  }
  const nitro = graph(fixture.fixtures.find(f => f.category === "nitro").smiles), hydrocarbon = graph("CCC=CC(C)C#CC");
  assert.equal(hard(hydrocarbon, "nitro").valid, false);
  assert.equal(validate(hydrocarbon).valid, true);
  assert.equal(evaluate({ referenceMolecule: nitro, submittedMolecule: hydrocarbon, category: "nitro" }).status, "DIFFERENT_ELEMENTS");
});

const unsupported = [
  ["ester", "CCCOC(=O)C=CCC#CC", "O-propyl exceeds certified O-alkyl scope"],
  ["ester", "C=COC(=O)CCCCC#CC", "unsaturation on the ester alkyl side"],
  ["ester", "COC(=O)C=CC(O)C#CC", "hydroxy ester is not this family"],
  ["ester", "COC(=O)C=CCC#CC(=O)OC", "repeated ester"],
  ["amine", "CNC=CCC#CC", "secondary amine"],
  ["amine", "CN(C)CC=CCC#CC", "tertiary amine"],
  ["amine", "NCC=CC(N)C#CC", "diamine"],
  ["amine", "OCC(N)C=CCC#CC", "alcohol outranks amine and combination is not certified"],
  ["amide", "CNC(=O)C=CCC#CC", "N-substituted amide"],
  ["amide", "NC(=O)C=CC(O)C#CC", "hydroxy amide"],
  ["nitrile", "N#CC=CC(O)C#CC", "hydroxy nitrile"],
  ["nitrile", "N#CC=CCC#CC#N", "repeated nitrile"],
  ["nitro", "CC([N+](=O)[O-])C=CC(O)C#CC", "nitro plus suffix function"],
  ["nitro", "CC([N+](=O)[O-])C=CC([N+](=O)[O-])C#CC", "two nitro groups"],
  ["amine", "NCC=C=CCC#CC", "cumulated axes"],
  ["amide", "NC(=O)C=CCC=CC#CC", "three C–C axes"],
  ["nitrile", "N#CC=CCC=CC", "diene not certified"],
  ["ester", "COC(=O)C#CCC#CC", "diyne not certified"],
  ["amine", "NCCC(C)(C)C=CCC#CC", "complex branching"],
  ["nitro", "[O-][N+](=O)C1=CC=CCC1", "functional ring"],
];
for (const [category, smiles, label] of unsupported) test(`D4.2A rejects ${label}`, () => {
  const m = graph(smiles);
  assert.equal(hard(m, category).valid, false);
  assert.equal(classifyMinimumExerciseDifficulty(m, category, chemistry.oracles), "unsupported");
  assert.equal(validate(m).valid, false);
});

test("canonical nitro charges and N motifs remain closed to malformed graphs and oracle failures", () => {
  const f = fixture.fixtures.find(f => f.category === "nitro"), m = graph(f.smiles);
  for (const mutate of [
    m => { m.atoms.find(a => a.element === "N").charge = 0; },
    m => { m.atoms.find(a => a.charge === -1).charge = 0; },
    m => { const o = m.atoms.find(a => a.charge === -1); o.charge = 0; m.atoms.find(a => (a.element ?? "C") === "C").charge = -1; },
    m => { m.atoms.find(a => (a.element ?? "C") === "C").charge = 1; },
    m => { m.bonds.find(([a, b, o]) => o === 1 && [a, b].some(id => m.atoms.find(a => a.id === id).charge === -1))[2] = 2; },
    m => { m.bonds.find(b => b[2] === 2)[3] = true; },
    m => { m.atoms[0].tetrahedralParity = "R"; },
  ]) {
    const wrong = structuredClone(m); mutate(wrong);
    assert.equal(hard(wrong, "nitro").valid, false); assert.equal(validate(wrong).valid, false);
  }
  const nitrile = graph(fixture.fixtures.find(f => f.category === "nitrile").smiles);
  const sp = nitrile.atoms.find(a => (a.element ?? "C") === "C" && nitrile.bonds.some(([x, y, o]) => o === 3
    && [x, y].includes(a.id) && [x, y].some(id => nitrile.atoms.find(a => a.id === id).element === "N")));
  nitrile.atoms.push({ id: 1000, element: "C", x: 0, y: 0 }); nitrile.bonds.push([sp.id, 1000, 1]);
  assert.deepEqual(validateExerciseChemistry(nitrile, chemistry.oracles), { valid: false, reason: "invalid-valence" });
  assert.equal(hard(nitrile, "nitrile").valid, false); assert.equal(validate(nitrile).valid, false);
  for (const overrides of [
    { reference: () => { throw Error("oracle unavailable"); } },
    { findMoleculeValenceViolation: () => { throw Error("oracle unavailable"); } },
    { detectFunctionalGroups: () => [] },
    { reference: m => ({ ...chemistry.oracles.reference(m), namingSupported: false }) },
    { reference: m => ({ ...chemistry.oracles.reference(m), principalFunctionalGroup: "amine" }) },
  ]) assert.equal(validateHardFoundationExercise(m, "nitro", { ...chemistry.oracles, ...overrides }).valid, false);
});

test("new functional targets enter bilingual ReviewModel with consistent principal/prefix metadata", () => {
  for (const f of fixture.fixtures) {
    const molecule = graph(f.smiles), a = chemistry.engine.analyzeMolecule(molecule);
    const q = { type: "build", molecule, category: f.category,
      question: { id: `D4.2A:${f.id}`, seed: `manual:${f.id}`, generatorVersion: 3 },
      reference: { names: f.names, name: f.names.es, structuralIdentity: f.structuralIdentity, smiles: f.smiles,
        formula: a.formula, profiles: { es: "local-systematic-es", en: "iupac-1979-legacy-en" } } };
    const answer = evaluate({ referenceMolecule: molecule, submittedMolecule: redraw(molecule), category: f.category });
    for (const locale of ["es", "en"]) {
      const attempt = createInitialAttempt({ question: q, displayOrdinal: 7, generationIndex: 11, answer: "", correct: true,
        locale, structuralAnswer: answer, started: { monotonicMs: 0, wallTimeMs: 1700000000000 },
        submitted: { monotonicMs: 100, wallTimeMs: 1700000000100 } });
      const model = review(q, attempt);
      assert.equal(model.status, "CORRECT"); assert.deepEqual(model.issues, []); assert.deepEqual(model.reference.names, f.names);
      assert.equal(model.steps.some(s => s.kind === "ez"), false);
      const group = model.steps.find(s => s.kind === "function");
      assert.equal(group?.params.group ?? null, f.principalGroup);
      assert.equal(model.steps.filter(s => s.kind === "unsaturation").length, 2);
      const bonds = new Set(molecule.bonds.map(([a, b]) => reviewBondId(a, b)));
      for (const step of model.steps) {
        assert.ok(step.highlightAtomIds.every(id => molecule.atoms.some(a => a.id === id)));
        assert.ok(step.highlightBondIds.every(id => bonds.has(id)));
        assert.doesNotMatch(formatPracticeReviewMessage(step.messageKey, step.params, locale), /undefined|NaN|\{\w+\}/);
      }
      if (f.category === "nitro") assert.ok(model.steps.some(s => s.kind === "substituent" && s.params.name.es === "nitro" && s.params.name.en === "nitro"));
    }
  }
});
