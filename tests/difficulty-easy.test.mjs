import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES, GENERATOR_VERSION, normalizeSessionConfig } from "../app/exercise-model.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createExamConfig } from "../app/exam-session.ts";
import { createRestrictedChemicalGenerator, MAX_CHEMICAL_GENERATION_ATTEMPTS } from "../app/exercise-chemical-generator.ts";
import { buildExerciseChemicalCandidate } from "../app/exercise-chemical-candidate.ts";
import { validateExerciseChemistry } from "../app/exercise-domain.ts";
import { describeEasyChemistry, validateEasyExercise, validateEasyParent } from "../app/exercise-easy-profile.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

let chemistry, generate;
const categories = EXERCISE_CATEGORIES.filter((category) => category !== "ez");
before(async () => { chemistry = await loadExerciseChemistry(); generate = createRestrictedChemicalGenerator(chemistry.oracles); });
after(async () => chemistry?.close());
const graph = (smiles) => { const result = moleculeFromSmiles(smiles); assert.ok(result.ok, result.error); return result.molecule; };
const config = (category, seed = "D2-CONTRACT", difficulty = "basic", version = 2) =>
  createPracticeConfig([category], 5, "es", seed, ["naming"], difficulty, version);

test("new builders default to v2; explicit v1 persists; absent/unknown versions retain strict legacy validation", () => {
  assert.equal(GENERATOR_VERSION, 2);
  for (const builder of [createPracticeConfig, createExamConfig]) {
    assert.equal(builder(["alkane"], 5, "es", "D2").generatorVersion, 2);
    for (const version of [1, 2]) {
      const c = builder(["alkane"], 5, "es", "D2", ["naming"], "basic", version);
      assert.deepEqual(normalizeSessionConfig(JSON.parse(JSON.stringify(c))), c);
      const legacy = { ...c }; delete legacy.difficulty;
      assert.deepEqual(normalizeSessionConfig(legacy), c);
    }
  }
  for (const value of [undefined, null, 0, 3, "1", "2", NaN]) {
    const c = { ...config("alkane"), generatorVersion: value };
    if (value === undefined) delete c.generatorVersion;
    assert.throws(() => normalizeSessionConfig(c));
  }
});

const positive = [
  ["alkane", "CCCC"], ["alkane", "CC(C)CC"], ["alkene", "C=CCC(C)C"], ["alkyne", "C#CCC(C)C"],
  ["halogenated", "CCCCl"], ["alcohol", "CC(O)CC"], ["aldehyde", "CCCC=O"], ["ketone", "CC(=O)CC"],
  ["carboxylic-acid", "CCC(=O)O"], ["ether", "CCOCCC"], ["ester", "CCC(=O)OCC"],
  ["amine", "CC(N)CC"], ["amide", "CCC(=O)N"], ["nitrile", "CCC#N"], ["nitro", "CCC[N+](=O)[O-]"],
  ["simple-carbocycle", "C1CCCC1"], ["simple-carbocycle", "CC1CCCCC1"], ["aromatic", "c1ccccc1"], ["aromatic", "Cc1ccccc1"],
];
for (const [category, smiles] of positive) test(`Easy positive ${category}: ${smiles}`, () => {
  const molecule = graph(smiles);
  assert.ok(validateExerciseChemistry(molecule, chemistry.oracles).valid);
  assert.ok(validateEasyExercise(molecule, category, chemistry.oracles).valid);
  assert.ok(validateEasyParent(molecule, category, chemistry.oracles.reference(molecule)).valid);
  const groups = chemistry.oracles.detectFunctionalGroups(molecule);
  assert.equal(groups.length, ["alkane", "alkene", "alkyne", "simple-carbocycle", "aromatic"].includes(category) ? 0 : 1);
});

// Exact D0 graphs: chemically valid, outside Easy. Do not alter their names/graphs.
const manual = [
  ["alcohol", "CC(O)C=CC(C)C"], ["alcohol", "CC(O)C=C(Br)C(C)CC"], ["ketone", "CC(=O)C=C(C)C(Cl)C"],
  ["alcohol", "OCC=CC(C)C([N+](=O)[O-])C"], ["alcohol", "C=C(O)C(OCC)C(C)CC"], ["alcohol", "OCC=C(C)C(N)CC"],
  ["aldehyde", "O=CC=C(C)C(O)CC"], ["ketone", "CC(=O)C=C(C)C(O)C(Br)C"],
  ["carboxylic-acid", "O=C(O)C=C(C)C(O)C(N)C"], ["ketone", "CC(=O)C(C)=CCC(=O)C"],
  ["alcohol", "CC(O)C#CC(C)C(O)C"], ["alcohol", "CC(O)C=CC(C)C#CC"],
  ["carboxylic-acid", "O=C(O)C=CC(C)C#CC"], ["alcohol", "OCC=C(C)C(N)C(Br)C#C"],
];
for (const [index, [category, smiles]] of manual.entries()) test(`D0 manual ${index + 1} remains non-Easy`, () => {
  const molecule = graph(smiles);
  assert.ok(validateExerciseChemistry(molecule, chemistry.oracles).valid);
  assert.equal(validateEasyExercise(molecule, category, chemistry.oracles).valid, false);
});

for (const [category, smiles] of [
  ["alcohol", "OCCCO"], ["ketone", "CC(=O)CC(=O)C"], ["alkene", "C=CC#C"], ["alkene", "C=CC=C"],
  ["halogenated", "ClCCCBr"], ["halogenated", "CC(C)CCl"], ["nitro", "CC(C)C[N+](=O)[O-]"],
  ["ether", "CC(C)OCC"], ["amine", "CCNCC"], ["aromatic", "CCc1ccccc1"], ["aromatic", "Cc1ccc(C)cc1"],
  ["simple-carbocycle", "C1CCC1"], ["simple-carbocycle", "CC1CCC(C)CC1"],
  ["alkane", "CCC(CC)CC"], ["alkane", "CC(C)C(C)CC"], ["alkene", "CC(C)=CC"], ["ez", "C/C=C/C"],
]) test(`Easy negative ${category}: ${smiles}`, () => {
  assert.equal(validateEasyExercise(graph(smiles), category, chemistry.oracles).valid, false);
});

test("overvalent triple+halo D0 counterexample is chemically invalid", () => {
  const molecule = graph("CC(O)C#C(Br)C(C)CC");
  assert.equal(validateExerciseChemistry(molecule, chemistry.oracles).valid, false);
  assert.equal(validateEasyExercise(molecule, "alcohol", chemistry.oracles).valid, false);
});

test("parent validation detects a longer/reinterpreted parent and keeps multiple bonds on the parent", () => {
  const molecule = graph("CC(C)CC"), reference = chemistry.oracles.reference(molecule);
  assert.equal(reference.parent.carbonCount, 4);
  assert.equal(validateEasyParent(molecule, "alkane", { ...reference, parent: { carbonCount: 5, atomIds: molecule.atoms.map((a) => a.id) } }).valid, false);
  assert.equal(validateEasyParent(molecule, "alkane", { ...reference, parent: undefined }).valid, false);
});

test("ez+v2 basic rejects the entire selection before invoking any chemical oracle; v1/all levels and v2 nonbasic retain ez", () => {
  const fail = () => { throw new Error("An unsupported request touched chemistry"); };
  const guarded = createRestrictedChemicalGenerator({ findMoleculeValenceViolation: fail, detectFunctionalGroups: fail, reference: fail });
  for (const topics of [["ez"], ["alkane", "ez"]]) assert.throws(() => guarded({ ...config("ez"), categories: topics }, 0),
    (error) => error.code === "unsupported-request" && error.rejections.length === 0);
  for (const version of [1, 2]) for (const difficulty of ["basic", "intermediate", "advanced"]) {
    if (version === 2 && difficulty === "basic") continue;
    const c = config("ez", "D2-EZ-LEGACY", difficulty, version);
    assert.deepEqual(generate(c, 0), generate(c, 0));
    assert.equal(generate(c, 0).category, "ez");
  }
});

test("v2 intermediate/advanced retain exactly legacy candidate recipes, with deterministic independent namespaces", () => {
  for (const category of EXERCISE_CATEGORIES) {
    const identities = new Set();
    for (const difficulty of ["intermediate", "advanced"]) {
      const c = config(category, "D2-NONBASIC", difficulty), q = generate(c, 0);
      assert.deepEqual(q, generate(c, 0));
      assert.deepEqual(q.molecule, buildExerciseChemicalCandidate(category, q.generation.candidateSeed));
      identities.add(q.question.seed);
    }
    assert.equal(identities.size, 2);
  }
});

test("16 categories × 8 seeds × 2 indices: independently checked Easy graphs, parents, motifs, round-trip and locale determinism", () => {
  const start = performance.now(), stats = {}, branches = new Set(), halos = new Set();
  for (const category of categories) {
    const stat = stats[category] = { candidates: 0, accepted: 0, easyRejects: 0, maxRetries: 0, violations: 0 };
    for (let seed = 0; seed < 8; seed++) for (let index = 0; index < 2; index++) {
      const c = config(category, `D2-SWEEP-${seed}`), q = generate(c, index), m = q.molecule;
      assert.deepEqual(q, generate(c, index));
      const en = generate({ ...c, locale: "en" }, index);
      assert.deepEqual(en.molecule, m); assert.equal(en.reference.structuralIdentity, q.reference.structuralIdentity);
      assert.deepEqual(en.question, q.question);
      assert.ok(validateExerciseChemistry(m, chemistry.oracles).valid);
      assert.ok(validateEasyExercise(m, category, chemistry.oracles).valid);
      assert.ok(validateEasyParent(m, category, chemistry.oracles.reference(m)).valid);
      const groups = chemistry.oracles.detectFunctionalGroups(m), carbons = new Set(m.atoms.filter((a) => (a.element ?? "C") === "C").map((a) => a.id));
      const cc = m.bonds.filter(([a, b]) => carbons.has(a) && carbons.has(b));
      assert.equal(groups.length, ["alkane", "alkene", "alkyne", "simple-carbocycle", "aromatic"].includes(category) ? 0 : 1);
      assert.equal(cc.filter((b) => b[2] === 2).length, category === "aromatic" ? 3 : category === "alkene" ? 1 : 0);
      assert.equal(cc.filter((b) => b[2] === 3).length, category === "alkyne" ? 1 : 0);
      assert.ok(m.bonds.every((b) => !b[3]));
      const f = describeEasyChemistry(m, groups);
      if (f.branchCenters.length || f.externalRingCarbons.length) branches.add(category);
      if (!["alkane", "alkene", "alkyne", "simple-carbocycle", "aromatic"].includes(category)) assert.equal(f.branchCenters.length, 0);
      if (category === "halogenated") {
        const atoms = m.atoms.filter((a) => ["F", "Cl", "Br", "I"].includes(a.element));
        assert.equal(atoms.length, 1); halos.add(atoms[0].element);
      }
      stat.candidates += q.generation.attempt + 1; stat.accepted++;
      stat.easyRejects += q.generation.rejections.filter((r) => r.stage === "easy").length;
      stat.maxRetries = Math.max(stat.maxRetries, q.generation.attempt);
    }
  }
  for (const category of ["alkane", "alkene", "alkyne", "simple-carbocycle", "aromatic"]) assert.ok(branches.has(category));
  assert.deepEqual([...halos].sort(), ["Br", "Cl", "F", "I"]);
  assert.equal(MAX_CHEMICAL_GENERATION_ATTEMPTS, 16);
  mkdirSync("outputs/difficulty-d2", { recursive: true });
  writeFileSync("outputs/difficulty-d2/chemical-sweep.json", JSON.stringify({ elapsedMs: performance.now() - start, stats }, null, 2));
});
