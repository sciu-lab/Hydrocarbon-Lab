import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { EXERCISE_CATEGORIES, GENERATOR_VERSION, normalizeSessionConfig } from "../app/exercise-model.ts";
import { exerciseGenerationProfile } from "../app/exercise-generation-profile.ts";
import { validateExerciseChemistry, validateExerciseDomain } from "../app/exercise-domain.ts";
import { validateEasyExercise } from "../app/exercise-easy-profile.ts";
import { validateIntermediateExercise } from "../app/exercise-intermediate-profile.ts";
import { validateHardFoundationExercise } from "../app/exercise-advanced-profile.ts";
import { classifyMinimumExerciseDifficulty } from "../app/exercise-difficulty-classification.ts";
import { buildConstitutionalIdentity, createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { inspectDoubleBondStereochemistry, setDoubleBondGeometry } from "../app/double-bond-stereochemistry.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { formatPracticeReviewMessage } from "../app/practice-review-i18n.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";

const readFixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const fixture = readFixture("difficulty-d4-2b-hard-structural.json");
let chemistry, validate, evaluate, review;
before(async () => {
  chemistry = await loadExerciseChemistry();
  validate = createBuildSubmissionValidator(chemistry.oracles, "hard-foundation");
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles, "hard-foundation");
  review = createPracticeReviewer(chemistry.engine);
});
after(async () => chemistry?.close());
const graph = smiles => { const r = moleculeFromSmiles(smiles); assert.ok(r.ok, r.error); return r.molecule; };
const hard = (m, category) => validateHardFoundationExercise(m, category, chemistry.oracles);
const minimum = (m, category) => classifyMinimumExerciseDifficulty(m, category, chemistry.oracles);
function redraw(m) {
  const ids = new Map(m.atoms.map((a, i) => [a.id, 3000 + i * 19]));
  return { atoms: m.atoms.map(a => ({ ...a, id: ids.get(a.id), x: -a.y * 2 + 9, y: a.x * 2 - 5 })).reverse(),
    bonds: m.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse(),
    rings: (m.rings ?? []).map(r => ({ ...r, atomIds: r.atomIds.map(id => ids.get(id)).reverse() })) };
}

for (const f of fixture.fixtures) test(`D4.2B ${f.id}: structural minimum Hard, bilingual naming and Build`, () => {
  const m = graph(f.smiles), original = structuredClone(m), r = chemistry.oracles.reference(m);
  const a = chemistry.engine.analyzeMolecule(m), h = hard(m, f.category);
  assert.equal(validateExerciseChemistry(m, chemistry.oracles).valid, true);
  // These structures already fit the published topology/elements/stereo domain;
  // domain membership is separate from pedagogical minimum difficulty.
  assert.equal(validateExerciseDomain(m, f.category, chemistry.oracles, "intermediate").valid, true);
  assert.equal(r.namingSupported, true); assert.deepEqual(r.names, f.names); assert.equal(r.formula, f.formula);
  assert.equal(r.parent.carbonCount, f.parentCarbonCount); assert.deepEqual(r.functionalGroups, []);
  assert.equal(r.principalFunctionalGroup, undefined);
  assert.deepEqual(a.substituents.map(s => ({ locant: s.locant, carbonCount: s.atomIds.length })), f.structuralComplexity.substituents);
  assert.deepEqual(a.doubleBondLocants, f.doubleLocants); assert.deepEqual(a.tripleBondLocants, f.tripleLocants);
  assert.equal(exerciseStructuralIdentity(m), f.structuralIdentity);
  assert.equal(buildConstitutionalIdentity(m), f.constitutionalIdentity);
  assert.equal(validateEasyExercise(m, f.category, chemistry.oracles).valid, false);
  assert.equal(validateIntermediateExercise(m, f.category, chemistry.oracles).valid, false);
  assert.equal(h.valid, true, JSON.stringify(h)); assert.equal(minimum(m, f.category), f.minimumDifficulty);
  assert.equal(h.evidence.family, f.family); assert.equal(h.evidence.branchCount, 3);
  assert.deepEqual(h.evidence.parent, r.parent.atomIds);
  assert.deepEqual(h.evidence.structuralComplexity, f.structuralComplexity);
  assert.equal(h.evidence.explicitEZ, f.category === "ez");
  assert.notDeepEqual(f.structuralComplexity.oppositeDirectionLocants, f.structuralComplexity.substituents.map(s => s.locant));
  const exported = moleculeToSmiles(m); assert.ok(exported.ok, exported.error);
  for (const submitted of [structuredClone(m), redraw(m), graph(exported.smiles)]) {
    assert.equal(validate(submitted).valid, f.buildSupported);
    assert.equal(exerciseStructuralIdentity(submitted), f.structuralIdentity);
    assert.deepEqual(chemistry.oracles.reference(submitted).names, f.names);
    assert.equal(minimum(submitted, f.category), "advanced");
    const answer = evaluate({ referenceMolecule: m, submittedMolecule: submitted, category: f.category });
    assert.equal(answer.correct, true); assert.equal(answer.status, "EQUIVALENT");
  }
  // A graph-derived removed methyl is a safe, lower-profile wrong answer.
  const removed = a.substituents.find(s => s.atomIds.length === 1).atomIds[0];
  const wrong = { atoms: m.atoms.filter(a => a.id !== removed), bonds: m.bonds.filter(b => !b.slice(0, 2).includes(removed)), rings: m.rings };
  assert.equal(hard(wrong, f.category).valid, false);
  assert.equal(minimum(wrong, f.category), "intermediate");
  const answer = evaluate({ referenceMolecule: m, submittedMolecule: wrong, category: f.category });
  assert.equal(answer.checks.submissionValid, true); assert.equal(answer.status, "DIFFERENT_ELEMENTS");
  assert.deepEqual(m, original);
});

test("controlled families preserve category identity and classify from graph evidence, not names", () => {
  for (const f of fixture.fixtures) {
    const m = graph(f.smiles), r = chemistry.oracles.reference(m);
    for (const category of EXERCISE_CATEGORIES) assert.equal(hard(m, category).valid, category === f.category, `${f.id}/${category}`);
    const opaque = { ...chemistry.oracles, reference: () => ({ ...r, names: { es: "opaque", en: "opaque" } }) };
    assert.equal(classifyMinimumExerciseDifficulty(m, f.category, opaque), "advanced");
  }
});

test("real parent evidence exposes first-point-of-difference and cyclic alphabetical ties", () => {
  const alkane = hard(graph(fixture.fixtures[1].smiles), "alkane").evidence.structuralComplexity;
  assert.deepEqual(alkane.substituents.map(s => s.locant), [3, 4, 6]);
  assert.deepEqual(alkane.oppositeDirectionLocants, [3, 5, 6]);
  // First locant ties at 3; the actual namer selects 4 rather than 5 next.
  for (const f of fixture.fixtures.filter(f => ["simple-carbocycle", "aromatic"].includes(f.category) && f.id.endsWith("-locant-variant"))) {
    const m = graph(f.smiles), parent = chemistry.oracles.reference(m).parent.atomIds;
    const substitutions = chemistry.engine.analyzeMolecule(m).substituents;
    const oppositeFromThird = Array.from({ length: parent.length }, (_, i) => parent[(2 - i + parent.length) % parent.length]);
    const alternative = substitutions.map(s => {
      const anchor = m.bonds.find(([a, b]) => s.atomIds.includes(a) && parent.includes(b) || s.atomIds.includes(b) && parent.includes(a));
      const id = parent.includes(anchor[0]) ? anchor[0] : anchor[1];
      return { locant: oppositeFromThird.indexOf(id) + 1, carbonCount: s.atomIds.length };
    });
    assert.deepEqual(alternative.map(s => s.locant).sort((a, b) => a - b), [1, 2, 3]);
    assert.deepEqual(substitutions.map(s => s.locant), [1, 2, 3]);
    assert.equal(substitutions.find(s => s.atomIds.length === 2).locant, 1);
    assert.equal(alternative.find(s => s.carbonCount === 2).locant, 3);
    // Same locant set, different allocation: ethyl gets 1 before methyl.
    assert.deepEqual(chemistry.oracles.reference(m).names, f.names);
  }
});

test("all seventeen anchors have independent Hard evidence; D4 and all five D4.2A categories remain certified", () => {
  const d4 = readFixture("difficulty-d4-hard-foundation.json"), a = readFixture("difficulty-d4-2a-hard-functional.json");
  const covered = new Set();
  for (const f of [...d4.fixtures.filter(f => f.minimumDifficulty === "advanced"), ...d4.additionalFixtures, ...a.fixtures, ...fixture.fixtures]) {
    const m = graph(f.smiles), r = chemistry.oracles.reference(m);
    assert.equal(minimum(m, f.category), "advanced"); assert.deepEqual(r.names, f.names);
    assert.equal(exerciseStructuralIdentity(m), f.structuralIdentity);
    for (const category of EXERCISE_CATEGORIES) if (validateHardFoundationExercise(m, category, chemistry.oracles, r).valid) covered.add(category);
  }
  assert.equal(covered.size, 17); assert.deepEqual(EXERCISE_CATEGORIES.filter(c => !covered.has(c)), []);
});

test("production current/version routing remains frozen; v4 is still rejected", () => {
  assert.equal(GENERATOR_VERSION, 3);
  for (const generatorVersion of [1, 2, 3]) assert.equal(exerciseGenerationProfile({ generatorVersion, difficulty: "advanced" }), "legacy");
  assert.throws(() => normalizeSessionConfig({ mode: "practice", questionCount: 5, categories: ["alkane"], questionTypes: ["naming"], difficulty: "advanced", locale: "es", seed: "D4.2B", generatorVersion: 4 }));
});

const boundaries = [
  ["alkane", "CCCCCCCCCCCC", "basic"], ["alkane", "CC(C)CCC", "basic"],
  ["simple-carbocycle", "C1CCCCC1", "basic"], ["aromatic", "Cc1ccccc1", "basic"],
  ["alkene", "CCC=CCC", "basic"],
  ["alkane", "CC(C)CC(C)CC", "intermediate"],
  ["simple-carbocycle", "CC1CCC(C)CC1", "intermediate"],
  ["aromatic", "Cc1cc(C)ccc1", "intermediate"], ["ez", "CCC/C=C/CCC", "intermediate"],
];
for (const [category, smiles, expected] of boundaries) test(`D4.2B boundary ${category}/${smiles} stays ${expected}`, () => {
  const m = graph(smiles); assert.equal(minimum(m, category), expected); assert.equal(hard(m, category).valid, false);
});

test("Build distinguishes safe locant and substituent identity mistakes", () => {
  for (const [category, target, wrong] of [
    ["alkane", fixture.fixtures[0].smiles, fixture.fixtures[1].smiles],
    ["simple-carbocycle", fixture.fixtures[2].smiles, "CCC1C(C)C(C)CCC1"],
    ["aromatic", fixture.fixtures[4].smiles, fixture.fixtures[5].smiles],
    ["ez", fixture.fixtures[6].smiles, "CC(C)CC(CC)/C=C/C(C)CC"],
  ]) {
    const m = graph(target), submitted = graph(wrong);
    assert.equal(validate(submitted).valid, true);
    const answer = evaluate({ referenceMolecule: m, submittedMolecule: submitted, category });
    assert.equal(answer.correct, false); assert.equal(answer.status, "DIFFERENT_STRUCTURE");
  }
  const m = graph(fixture.fixtures[4].smiles), wrong = graph("Cc1c(C)cc(C)cc1");
  assert.equal(validate(wrong).valid, true);
  assert.equal(evaluate({ referenceMolecule: m, submittedMolecule: wrong, category: "aromatic" }).status, "DIFFERENT_ELEMENTS");
});

test("Hard E/Z requires a genuine marked center and preserves separate constitutional/stereo equality", () => {
  const e = graph(fixture.fixtures[6].smiles), z = graph(fixture.fixtures[7].smiles);
  assert.equal(buildConstitutionalIdentity(e), buildConstitutionalIdentity(z));
  assert.notEqual(exerciseStructuralIdentity(e), exerciseStructuralIdentity(z));
  for (const [m, expected] of [[e, "E"], [z, "Z"]]) {
    const [b] = m.bonds.filter(b => b[3]);
    const inspected = inspectDoubleBondStereochemistry(m, b[0], b[1]);
    assert.equal(inspected.stereogenic, true); assert.equal(inspected.configuration, expected);
    assert.equal(inspected.priorityAtomIds.length, 2);
    // Each alkene endpoint has one carbon neighbor besides its opposite endpoint,
    // and one implicit H: real distinct substituents, confirmed by existing CIP.
    for (const id of b.slice(0, 2)) assert.equal(m.bonds.filter(edge => edge.slice(0, 2).includes(id)).length, 2);
    const changed = setDoubleBondGeometry(m, b[0], b[1], expected === "E" ? "Z" : "E"); assert.ok(changed.ok);
    assert.equal(hard(changed.molecule, "ez").valid, true);
    const answer = evaluate({ referenceMolecule: m, submittedMolecule: changed.molecule, category: "ez" });
    assert.equal(answer.checks.constitutionEqual, true); assert.equal(answer.checks.stereoEqual, false);
    assert.equal(answer.correct, false); assert.equal(answer.status, "DIFFERENT_STEREOCHEMISTRY");
    assert.ok(answer.referenceIdentity.endsWith(`|ez:${expected}`));
    const unspecified = structuredClone(m); delete unspecified.bonds.find(b => b[3])[3];
    assert.equal(hard(unspecified, "ez").valid, false);
    assert.equal(evaluate({ referenceMolecule: m, submittedMolecule: unspecified, category: "ez" }).status, "DIFFERENT_STEREOCHEMISTRY");
  }
  const terminal = graph("C=CCCCCCC"); terminal.bonds.find(b => b[2] === 2)[3] = true;
  assert.equal(hard(terminal, "ez").valid, false);
});

const unsupported = [
  ["alkane", "CC(C)CC(C)CC(C)CC", "three methyls alone are not the mixed family"],
  ["alkane", "CC(C)(C)C(CC)CCC", "quaternary branch"],
  ["alkane", "CCC(C)C(CCC)CC(C)CC", "propyl outside parent"],
  ["alkane", "CC(C)C(CC)CC(C)C(C)CC", "four branches"],
  ["simple-carbocycle", "CCC1C(C)CC(C)CCC1", "C7 ring"],
  ["simple-carbocycle", "CCC1C(C)=CC(C)CC1", "ring unsaturation"],
  ["simple-carbocycle", "CCC1C(C)OC(C)CC1", "heterocycle"],
  ["simple-carbocycle", "CC1CCC2CCCCC2C1", "fused rings"],
  ["simple-carbocycle", "CC1CCC2(CC1)CCCC2", "spiro"],
  ["simple-carbocycle", "CC1CC2CCC1C2", "bridged"],
  ["simple-carbocycle", "CCC1C(C)CC(C)CC1O", "ring suffix function"],
  ["aromatic", "CCc1c(C)cc(C)cc1O", "aromatic suffix function"],
  ["aromatic", "CCc1nc(C)cc(C)c1", "heteroaromatic"],
  ["aromatic", "Cc1ccc2ccccc2c1", "fused aromatic"],
  ["ez", "CC(C)C(CC)/C=C/C(C)CCO", "stereo with suffix function"],
  ["alkane", "CC(C)C(CC)CC(S)CCC", "sulfur"],
];
for (const [category, smiles, label] of unsupported) test(`D4.2B rejects ${label}`, () => {
  if (["spiro", "bridged", "fused aromatic"].includes(label)) {
    const imported = moleculeFromSmiles(smiles);
    assert.equal(imported.ok, false); assert.match(imported.error, /policíclico/);
    return;
  }
  assert.equal(hard(graph(smiles), category).valid, false);
});

test("schema, valence, charge, R/S, ring metadata and oracle failures remain fail-closed", () => {
  // Direct graph negatives exercise the profile even when the importer closes
  // the same boundary earlier. No naming/domain/valence bypass is installed.
  for (const [category, cycles, orders] of [
    ["simple-carbocycle", [[1, 2, 3, 4, 5, 6], [5, 6, 7, 8, 9, 10]]],
    ["simple-carbocycle", [[1, 2, 3, 4, 5], [1, 6, 7, 8, 9]]],
    ["simple-carbocycle", [[1, 2, 3, 4, 7], [1, 5, 6, 4, 7]]],
    ["aromatic", [[1, 2, 3, 4, 5, 6], [5, 6, 7, 8, 9, 10]], new Set(["1:2", "3:4", "5:6", "7:8", "9:10"])],
  ]) {
    const edges = new Map();
    for (const ring of cycles) ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length], key = [a, b].sort((x, y) => x - y).join(":");
      edges.set(key, [a, b, orders?.has(key) ? 2 : 1]);
    });
    const m = { atoms: [...new Set(cycles.flat())].map(id => ({ id, element: "C", x: id * 20, y: id % 2 * 10 })),
      bonds: [...edges.values()], rings: cycles.map((atomIds, i) => ({ id: i + 1, kind: category === "aromatic" ? "aromatic" : "cycloalkane", atomIds })) };
    assert.equal(validateExerciseChemistry(m, chemistry.oracles).valid, true);
    assert.equal(hard(m, category).valid, false); assert.equal(validate(m).valid, false);
  }
  for (const f of fixture.fixtures.filter(f => f.id.endsWith("-primary"))) {
    const m = graph(f.smiles);
    for (const change of [g => { g.atoms[0].tetrahedralParity = "R"; }, g => { g.atoms[0].charge = 1; },
      g => { g.atoms[0].x = NaN; }, g => { g.rings = [{ id: 1, kind: "cycloalkane", atomIds: [999, 998, 997] }]; }]) {
      const invalid = structuredClone(m); change(invalid); assert.equal(hard(invalid, f.category).valid, false);
    }
    for (const overrides of [
      { reference: () => { throw Error("unavailable"); } },
      { findMoleculeValenceViolation: () => { throw Error("unavailable"); } },
      { reference: g => ({ ...chemistry.oracles.reference(g), namingSupported: false }) },
      { reference: g => ({ ...chemistry.oracles.reference(g), parent: undefined }) },
      { reference: g => ({ ...chemistry.oracles.reference(g), principalFunctionalGroup: "alcohol" }) },
    ]) assert.equal(validateHardFoundationExercise(m, f.category, { ...chemistry.oracles, ...overrides }).valid, false);
  }
  const overvalent = graph(fixture.fixtures[0].smiles), site = chemistry.engine.analyzeMolecule(overvalent).substituents[0].locant;
  const parent = chemistry.oracles.reference(overvalent).parent.atomIds[site - 1];
  for (const id of [100, 101]) { overvalent.atoms.push({ id, element: "C", x: id, y: 0 }); overvalent.bonds.push([parent, id, 1]); }
  assert.deepEqual(validateExerciseChemistry(overvalent, chemistry.oracles), { valid: false, reason: "invalid-valence" });
  assert.equal(hard(overvalent, "alkane").valid, false);
});

test("all eight structural targets enter bilingual ReviewModels with valid highlights and coherent explicit E/Z", () => {
  for (const f of fixture.fixtures) {
    const molecule = graph(f.smiles), q = { type: "build", molecule, category: f.category,
      question: { id: `D4.2B:${f.id}`, seed: `manual:${f.id}`, generatorVersion: 3 },
      reference: { names: f.names, name: f.names.es, structuralIdentity: f.structuralIdentity, smiles: f.smiles,
        formula: f.formula, profiles: { es: "local-systematic-es", en: "iupac-1979-legacy-en" } } };
    const answer = evaluate({ referenceMolecule: molecule, submittedMolecule: redraw(molecule), category: f.category });
    for (const locale of ["es", "en"]) {
      const attempt = createInitialAttempt({ question: q, displayOrdinal: 7, generationIndex: 11, answer: "", correct: true,
        locale, structuralAnswer: answer, started: { monotonicMs: 0, wallTimeMs: 1700000000000 },
        submitted: { monotonicMs: 100, wallTimeMs: 1700000000100 } });
      const model = review(q, attempt);
      assert.equal(model.status, "CORRECT"); assert.deepEqual(model.issues, []); assert.deepEqual(model.reference.names, f.names);
      const stereo = model.steps.filter(s => s.kind === "ez");
      assert.equal(stereo.length, f.category === "ez" ? 1 : 0);
      if (stereo.length) assert.equal(stereo[0].params.descriptor, f.structuralComplexity.ezConfiguration);
      const bonds = new Set(molecule.bonds.map(([a, b]) => reviewBondId(a, b)));
      for (const step of model.steps) {
        assert.ok(step.highlightAtomIds.every(id => molecule.atoms.some(a => a.id === id)));
        assert.ok(step.highlightBondIds.every(id => bonds.has(id)));
        assert.doesNotMatch(formatPracticeReviewMessage(step.messageKey, step.params, locale), /undefined|NaN|\{\w+\}/);
      }
    }
  }
});
