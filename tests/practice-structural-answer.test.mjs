import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { createStructuralAnswerEvaluator, buildConstitutionalIdentity } from "../app/practice-structural-answer.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createPracticeConfig } from "../app/practice-session.ts";

let chemistry, evaluate, generate;
before(async () => { chemistry = await loadExerciseChemistry(); evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
  generate = createRestrictedChemicalGenerator(chemistry.oracles); });
after(async () => chemistry?.close());
const graph = (smiles) => { const result = moleculeFromSmiles(smiles); assert.equal(result.ok, true); return result.molecule; };
const compare = (target, student, category = "alkane") => evaluate({ referenceMolecule: target, submittedMolecule: student, category });
function remap(m) {
  const ids = new Map(m.atoms.map((a, i) => [a.id, 100 + 11 * (m.atoms.length - i)]));
  return { atoms: m.atoms.map((a) => ({ ...a, id: ids.get(a.id), x: -a.y * 9 + 330, y: -a.x * 9 - 125 })).reverse(),
    bonds: m.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse(),
    rings: m.rings?.map((r) => ({ ...r, id: r.id + 99, atomIds: r.atomIds.map((id) => ids.get(id)) })) };
}
for (const [name, smiles, category] of [["alkane", "CCC(C)C", "alkane"], ["ring", "C1CCCCC1", "simple-carbocycle"],
  ["aromatic", "Cc1ccccc1", "aromatic"], ["nitro", "CC[N+](=O)[O-]", "nitro"], ["E", "C/C=C/C", "ez"], ["Z", "C/C=C\\C", "ez"]]) {
  test(`${name}: equality ignores IDs, atom/bond ordering, rotation, mirror and translation`, () => {
    const m = graph(smiles), before = structuredClone(m);
    assert.equal(compare(m, m, category).correct, true);
    assert.equal(compare(m, structuredClone(m), category).correct, true);
    assert.equal(compare(m, remap(m), category).correct, true);
    assert.deepEqual(m, before);
  });
}
for (const [name, a, b, category, status] of [
  ["formula is not equality", "CCO", "COC", "alcohol", "DIFFERENT_STRUCTURE"],
  ["constitutional isomer", "CCCC", "CC(C)C", "alkane", "DIFFERENT_STRUCTURE"],
  ["ether attachment", "CCCOCCCC", "CC(C)OCCCC", "ether", "DIFFERENT_STRUCTURE"],
  ["bond order", "CCCC", "CC=CC", "alkane", "DIFFERENT_BOND_ORDERS"],
  ["ring connectivity", "C1CCCCC1", "CC1CCCC1", "simple-carbocycle", "DIFFERENT_STRUCTURE"],
  ["element", "CCO", "CCN", "alcohol", "DIFFERENT_ELEMENTS"],
  ["E vs Z", "C/C=C/C", "C/C=C\\C", "ez", "DIFFERENT_STEREOCHEMISTRY"],
  ["missing E/Z", "C/C=C/C", "CC=CC", "ez", "DIFFERENT_STEREOCHEMISTRY"],
]) test(name, () => { const result = compare(graph(a), graph(b), category); assert.equal(result.correct, false);
  assert.equal(result.status, status); assert.ok(result.submittedIdentity); assert.ok(result.submittedSmiles); });

test("aromatic Kekule encodings are equivalent", () => {
  const m = graph("Cc1ccccc1"), other = structuredClone(m);
  const ring = new Set(m.rings[0].atomIds);
  other.bonds.forEach((b) => { if (ring.has(b[0]) && ring.has(b[1])) b[2] = b[2] === 1 ? 2 : 1; });
  assert.equal(compare(m, other, "aromatic").correct, true);
});
test("coordinates cannot create stereo on an unmarked double bond", () => {
  const m = graph("CC=CC"), other = remap(m);
  other.atoms.forEach((a, i) => { a.x = i * 71; a.y = i % 2 * 150; });
  assert.equal(compare(m, other, "alkene").correct, true);
});
test("disconnected, malformed and valence-invalid submissions are recoverable without identities", () => {
  const target = graph("CCCC");
  const submissions = [null, { atoms: [], bonds: [] }, { ...target, bonds: target.bonds.slice(1) },
    { ...target, bonds: [...target.bonds, target.bonds[0]] },
    { ...target, atoms: [...target.atoms, { ...target.atoms[0] }] },
    { ...target, bonds: [[1, 2, 3], [2, 3, 3], [3, 4, 1]] }];
  for (const m of submissions) { const r = compare(target, m); assert.equal(r.status, "INVALID_SUBMISSION"); assert.equal(r.correct, false); }
});
test("charges are part of canonical identity; neutral/misplaced nitro charges never pass", () => {
  const m = graph("CC[N+](=O)[O-]");
  const neutral = { ...m, atoms: m.atoms.map((a) => ({ ...a, charge: 0 })) };
  assert.notEqual(buildConstitutionalIdentity(m), buildConstitutionalIdentity(neutral));
  assert.equal(compare(m, neutral, "nitro").correct, false);
  assert.equal(compare(m, neutral, "nitro").status, "INVALID_SUBMISSION");
  const misplaced = structuredClone(m); misplaced.atoms.find((a) => a.element === "C").charge = 1;
  assert.equal(compare(m, misplaced, "nitro").status, "INVALID_SUBMISSION");
});
test("explicit H, sulfur and R/S are outside the supported comparison domain", () => {
  for (const element of ["H", "S", "P"]) { const m = graph("CC"); m.atoms[1].element = element;
    assert.equal(compare(graph("CC"), m).correct, false); }
  const rs = graph("CCCC"); rs.atoms[1].tetrahedralParity = "R";
  assert.equal(compare(graph("CCCC"), rs).status, "INVALID_SUBMISSION");
});
test("technical validation failure is unsupported comparison, not a wrong chemical answer", () => {
  const broken = createStructuralAnswerEvaluator({ ...chemistry.oracles, findMoleculeValenceViolation() { throw new Error("offline"); } });
  assert.equal(broken({ referenceMolecule: graph("CC"), submittedMolecule: graph("CC"), category: "alkane" }).status, "UNSUPPORTED_COMPARISON");
});
test("17 categories x 8 seeds: deep-clone/remapped equality and controlled disconnected mutation", () => {
  const times = []; let mutations = 0;
  for (const category of EXERCISE_CATEGORIES) for (let seed = 0; seed < 8; seed++) {
    const q = generate(createPracticeConfig([category], 5, "es", `BUILD-SWEEP:${category}:${seed}`, ["naming"], "basic", 1), 0);
    const snapshot = structuredClone(q.molecule), started = performance.now();
    assert.equal(compare(q.molecule, structuredClone(q.molecule), category).correct, true);
    assert.equal(compare(q.molecule, remap(q.molecule), category).correct, true);
    times.push(performance.now() - started);
    const wrong = structuredClone(q.molecule);
    wrong.atoms.push({ id: Math.max(...wrong.atoms.map((a) => a.id)) + 1, x: 0, y: 0 });
    assert.equal(compare(q.molecule, wrong, category).status, "INVALID_SUBMISSION"); mutations++;
    assert.deepEqual(q.molecule, snapshot);
  }
  console.log("BUILD_SWEEP", JSON.stringify({ targets: times.length, comparisons: times.length * 2, mutations,
    averageMsPerComparison: times.reduce((a,b) => a+b,0)/times.length/2, maxPairMs: Math.max(...times) }));
});
