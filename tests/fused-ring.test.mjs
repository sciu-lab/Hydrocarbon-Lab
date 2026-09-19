import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { fuseRingOnBond, removeFusedRingAtom, ringFusionError } from "../app/fused-ring.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";

// Exercise the actual editor helpers/actions, as in keyboard-interactions.test.mjs.
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function action(name, context = {}) {
  let source;
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) {
      source = ts.isVariableDeclaration(node) ? `const ${node.getText(ast)};` : node.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(source, name);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("context", `with (context) { ${compiled}; return ${name}; }`)(context);
}
const makeRing = action("makeRing");
const cloneMolecule = action("cloneMolecule");
const fuse = (size = 6) => fuseRingOnBond(makeRing(size, "cycloalkane"), 1, 2, 6);

function checkGraph(molecule) {
  const ids = new Set(molecule.atoms.map((atom) => atom.id));
  assert.equal(ids.size, molecule.atoms.length);
  const edges = new Set();
  for (const [a, b] of molecule.bonds) {
    assert.ok(ids.has(a) && ids.has(b) && a !== b);
    const key = [a, b].sort((a, b) => a - b).join("-");
    assert.ok(!edges.has(key)); edges.add(key);
  }
  for (const ring of molecule.rings ?? []) {
    ring.atomIds.forEach((a, i) => assert.ok(edges.has([a, ring.atomIds[(i + 1) % ring.atomIds.length]].sort((a, b) => a - b).join("-"))));
  }
  for (const id of ids) assert.ok(molecule.bonds.reduce((sum, [a, b, order = 1]) => sum + (a === id || b === id ? order : 0), 0) <= 4);
}

test("6+6 uses ten carbons, eleven bonds and exactly the original shared edge", () => {
  const original = makeRing(6, "cycloalkane");
  const snapshot = structuredClone(original);
  const result = fuseRingOnBond(original, 1, 2, 6);
  assert.equal(result.atoms.length, 10);
  assert.equal(result.bonds.length, 11);
  assert.deepEqual(result.rings[1].atomIds.filter(id => result.rings[0].atomIds.includes(id)), [1, 2]);
  assert.deepEqual(original, snapshot);
  assert.deepEqual(result.atoms.slice(0, 6), original.atoms);
  checkGraph(result);
});

test("5+6 and 6+5 add only N-2 carbons; subsequent peripheral fusion stays valid", () => {
  assert.equal(fuse(5).atoms.length, 9);
  assert.equal(fuseRingOnBond(makeRing(6, "cycloalkane"), 1, 2, 5).atoms.length, 9);
  const third = fuseRingOnBond(fuse(), 8, 9, 5);
  assert.equal(third.atoms.length, 13);
  assert.equal(third.bonds.length, 15);
  checkGraph(third);
  const smiles = moleculeToSmiles(third);
  assert.equal(smiles.ok, true);
  const restored = moleculeFromSmiles(smiles.smiles);
  assert.equal(restored.ok, true, restored.error);
  checkGraph(restored.molecule);
});

test("layout is deterministic, outside the old ring and a regular polygon in both views", () => {
  const original = makeRing(6, "cycloalkane");
  const result = fuseRingOnBond(original, 1, 2, 6);
  assert.deepEqual(result, fuseRingOnBond(original, 2, 1, 6));
  const positions = calculateMolecule2DLayout(result, []);
  const a = positions.get(1), b = positions.get(2);
  const side = p => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  assert.ok(side(positions.get(4)) * side(positions.get(8)) < 0);
  const ids = result.rings[1].atomIds;
  const lengths = ids.map((id, i) => {
    const p = positions.get(id), q = positions.get(ids[(i + 1) % ids.length]);
    return Math.hypot(p.x - q.x, p.y - q.y);
  });
  assert.ok(Math.max(...lengths) - Math.min(...lengths) < 1e-8);
});

test("invalid selections, saturated endpoints, aromatic and already shared edges are rejected", () => {
  const original = makeRing(6, "cycloalkane");
  assert.throws(() => fuseRingOnBond(original, 1, 3, 6));
  assert.throws(() => fuseRingOnBond(fuse(), 1, 2, 6));
  assert.throws(() => fuseRingOnBond(makeRing(6, "aromatic"), 1, 2, 6));
  original.atoms.push({ id: 7, x: 3, y: 3 });
  original.bonds.push([1, 7, 2]);
  assert.match(ringFusionError(original, 1, 2), /valencia/);
  assert.throws(() => fuseRingOnBond(original, 1, 2, 6));
});

test("crowding the outside selects the other geometric candidate", () => {
  const original = makeRing(6, "cycloalkane");
  // A manually expanded parent leaves a usable candidate on its inner side.
  original.atoms = [[0, 0], [1, 0], [3, 3], [3, 6], [-3, 6], [-3, 3]]
    .map(([x, y], i) => ({ id: i + 1, x, y }));
  const first = fuseRingOnBond(original, 1, 2, 6);
  // Model occupied coordinates independently of their connectivity for this layout check.
  const crowded = { ...original, atoms: [...original.atoms, ...first.atoms.slice(6)] };
  const result = fuseRingOnBond(crowded, 1, 2, 6);
  for (const atom of result.atoms.slice(10)) {
    assert.ok(crowded.atoms.every(old => Math.hypot(atom.x - old.x, atom.y - old.y) > 0.1));
  }
  assert.notDeepEqual(result.atoms.slice(10).map(({ x, y }) => [x, y]), first.atoms.slice(6).map(({ x, y }) => [x, y]));
});

test("deleting a new atom opens its ring, preserves the original ring and permits further editing", () => {
  const opened = removeFusedRingAtom(fuse(), 8);
  assert.ok(opened);
  assert.equal(opened.atoms.length, 9);
  assert.equal(opened.rings.length, 1);
  checkGraph(opened);
  checkGraph(fuseRingOnBond(opened, 4, 5, 5));
  assert.equal(removeFusedRingAtom(makeRing(6, "cycloalkane"), 2), null);
});

test("actual commit, fusion, undo and redo preserve exact snapshots as one edit", () => {
  const initial = { ...makeRing(6, "cycloalkane"), isMirrored: true };
  const context = { molecule: initial, undoStack: [], future: [], cloneMolecule, fuseRingOnBond,
    selectedFusionBond: { a: 1, b: 2 }, language: "es",
    findMoleculeValenceViolation: () => null, ringFusionError,
  };
  for (const key of ["molecule", "undoStack", "future"]) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { context[key] = typeof value === "function" ? value(context[key]) : value; };
  }
  for (const name of ["setPlacementTool", "setReasoningSourceName", "setSourceNameOverride", "setNotice", "setSelectedId"]) context[name] = () => {};
  context.commit = action("commit", context);
  action("fuseSelectedBond", context)(6);
  const fused = structuredClone(context.molecule);
  assert.equal(context.undoStack.length, 1);
  action("undo", context)();
  assert.deepEqual(context.molecule, cloneMolecule(initial));
  action("redo", context)();
  assert.deepEqual(context.molecule, cloneMolecule(fused));
});

test("existing chemistry document and SMILES round trips preserve fused topology", () => {
  const molecule = fuse();
  const read = action("readChemistryDocument", { isPortableStructure: action("isPortableStructure") });
  const structure = { molecule, name: "Fusionado", formula: "C10H18", family: "polycyclic", viewMode: "skeletal", atomCount: 10, createdAt: "today", updatedAt: "today" };
  const restored = read(JSON.parse(JSON.stringify({ format: "laboratorio-quimica-organica", version: 1, kind: "structure", structure })))[0];
  assert.deepEqual(restored.molecule, molecule);
  const exported = moleculeToSmiles(molecule);
  assert.equal(exported.ok, true);
  const imported = moleculeFromSmiles(exported.smiles);
  assert.equal(imported.ok, true, imported.error);
  assert.equal(imported.molecule.atoms.length, 10);
  assert.equal(imported.molecule.bonds.length, 11);
  assert.equal(moleculeToSmiles(imported.molecule).smiles, exported.smiles);
  checkGraph(imported.molecule);
});
