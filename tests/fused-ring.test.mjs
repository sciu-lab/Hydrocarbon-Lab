import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { fuseRingOnBond, removeFusedRingAtom, ringFusionError } from "../app/fused-ring.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { getSteroidLike6565System } from "../app/fused-ring-nomenclature.ts";
import {
  getFusedRingSystemAtomIds,
  getPreferredAttachmentDirection,
  placeAttachmentTemplate,
} from "../app/manual-layout.ts";

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

function makeFusedSystem(ringCount) {
  let molecule = makeRing(6, "cycloalkane");
  let edge = [1, 2];
  while ((molecule.rings?.length ?? 0) < ringCount) {
    molecule = fuseRingOnBond(molecule, edge[0], edge[1], 6);
    const newestRing = molecule.rings.at(-1);
    edge = [newestRing.atomIds[2], newestRing.atomIds[3]];
  }
  return molecule;
}

function linearTemplate(length) {
  return {
    atoms: Array.from({ length }, (_, index) => ({ x: index + 1, y: 0, element: "C" })),
    bonds: Array.from({ length }, (_, index) => [index === 0 ? -1 : index - 1, index, 1]),
  };
}

function attachTemplate(molecule, anchorId, template, options = {}) {
  const placement = placeAttachmentTemplate(molecule, anchorId, template.atoms, template.bonds, options);
  assert.ok(placement, "a geometrically valid placement is available");
  const firstId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  const ids = placement.map((_, index) => firstId + index);
  return {
    ...molecule,
    atoms: [
      ...molecule.atoms.map((atom) => ({ ...atom })),
      ...placement.map((point, index) => ({
        id: ids[index],
        ...point,
        ...(template.atoms[index].element ? { element: template.atoms[index].element } : {}),
      })),
    ],
    bonds: [
      ...molecule.bonds.map((bond) => [...bond]),
      ...template.bonds.map(([left, right, order = 1]) => [
        left === -1 ? anchorId : ids[left],
        right === -1 ? anchorId : ids[right],
        order,
      ]),
    ],
    rings: molecule.rings?.map((ring) => ({ ...ring, atomIds: [...ring.atomIds] })),
  };
}

function bondValence(molecule, atomId) {
  return molecule.bonds.reduce(
    (total, [left, right, order = 1]) => total + (left === atomId || right === atomId ? order : 0),
    0,
  );
}

function formulaCounts(molecule) {
  const counts = new Map();
  for (const atom of molecule.atoms) {
    const element = atom.element ?? "C";
    counts.set(element, (counts.get(element) ?? 0) + 1);
    const limit = element === "O" ? 2 : element === "N" ? 3 : element === "C" ? 4 : 1;
    const hydrogens = Math.max(0, limit - bondValence(molecule, atom.id));
    counts.set("H", (counts.get("H") ?? 0) + hydrogens);
  }
  return counts;
}

function assertExterior(molecule, anchorId, firstAddedId) {
  const systemIds = getFusedRingSystemAtomIds(molecule, anchorId);
  const anchor = molecule.atoms.find((atom) => atom.id === anchorId);
  const first = molecule.atoms.find((atom) => atom.id === firstAddedId);
  const center = molecule.atoms.filter((atom) => systemIds.has(atom.id)).reduce(
    (sum, atom, _index, atoms) => ({ x: sum.x + atom.x / atoms.length, y: sum.y + atom.y / atoms.length }),
    { x: 0, y: 0 },
  );
  const outward = { x: anchor.x - center.x, y: anchor.y - center.y };
  const attachment = { x: first.x - anchor.x, y: first.y - anchor.y };
  assert.ok(outward.x * attachment.x + outward.y * attachment.y > 0, "attachment points outside the fused system");
}

function makeAndrostaneLayoutReference() {
  const ringAtomIds = [
    [1, 17, 16, 4, 3, 2],
    [5, 6, 7, 15, 16, 4],
    [13, 14, 15, 7, 8, 12],
    [9, 8, 12, 11, 10],
  ];
  const points = new Map([
    [1, [0, 1.732]], [17, [-1, 0.866]], [16, [0, 0]], [4, [1, 0]], [3, [1.5, -0.866]], [2, [0.5, -1.732]],
    [5, [2, 0.866]], [6, [3, 0]], [7, [3, -1.732]], [15, [2, -2.598]],
    [13, [2, -4.33]], [14, [1, -3.464]], [8, [3.5, -2.598]], [12, [3, -3.464]],
    [9, [4.5, -2.598]], [11, [4, -4.33]], [10, [5, -4.33]],
  ]);
  const edgeKeys = new Set();
  const bonds = [];
  for (const ids of ringAtomIds) {
    ids.forEach((atomId, index) => {
      const otherId = ids[(index + 1) % ids.length];
      const key = [atomId, otherId].sort((a, b) => a - b).join("-");
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        bonds.push([atomId, otherId, 1]);
      }
    });
  }
  return {
    atoms: [...points].map(([id, [x, y]]) => ({ id, x, y })),
    bonds,
    rings: ringAtomIds.map((atomIds, index) => ({ id: index + 1, kind: "cycloalkane", atomIds })),
  };
}

function fusionExterior(molecule, atomId) {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  const rings = molecule.rings.filter((ring) => ring.atomIds.includes(atomId));
  const neighbourIds = new Set();
  for (const ring of rings) {
    const index = ring.atomIds.indexOf(atomId);
    neighbourIds.add(ring.atomIds[(index - 1 + ring.atomIds.length) % ring.atomIds.length]);
    neighbourIds.add(ring.atomIds[(index + 1) % ring.atomIds.length]);
  }
  const vector = [...neighbourIds].reduce((sum, neighbourId) => {
    const neighbour = molecule.atoms.find((candidate) => candidate.id === neighbourId);
    const dx = atom.x - neighbour.x;
    const dy = atom.y - neighbour.y;
    const length = Math.hypot(dx, dy);
    return { x: sum.x + dx / length, y: sum.y + dy / length };
  }, { x: 0, y: 0 });
  const length = Math.hypot(vector.x, vector.y);
  return { x: vector.x / length, y: vector.y / length };
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

test("methyl placement uses the exterior of the complete fused bicyclic system", () => {
  const parent = makeFusedSystem(2);
  const anchorId = 4;
  const attached = attachTemplate(parent, anchorId, linearTemplate(1), { zigzagLinear: true });
  const methylId = Math.max(...attached.atoms.map((atom) => atom.id));
  assertExterior(attached, anchorId, methylId);
  assert.equal(attached.atoms.length, parent.atoms.length + 1);
  assert.equal(attached.bonds.length, parent.bonds.length + 1);
  checkGraph(attached);

  const skeletal = calculateMolecule2DLayout(attached, []);
  const condensed = calculateMolecule2DLayout(attached, attached.rings.flatMap((ring) => ring.atomIds));
  assert.deepEqual([...skeletal], [...condensed], "both views consume the same fused-system geometry");
});

test("C10-C19 stays in the free exterior sector of the steroid fusion junction", () => {
  const nucleus = makeAndrostaneLayoutReference();
  const steroid = getSteroidLike6565System(nucleus);
  assert.ok(steroid?.numbering);
  const c10 = steroid.numbering[9];
  const c13 = steroid.numbering[12];
  const c10Direction = fusionExterior(nucleus, c10);
  const c13Direction = fusionExterior(nucleus, c13);
  const insertionDirection = getPreferredAttachmentDirection(nucleus, c10);
  assert.ok(
    insertionDirection.x * c10Direction.x + insertionDirection.y * c10Direction.y > 0.999,
    "manual insertion chooses C10's local free sector before display layout",
  );
  const atom10 = nucleus.atoms.find((atom) => atom.id === c10);
  const atom13 = nucleus.atoms.find((atom) => atom.id === c13);
  const molecule = {
    ...nucleus,
    atoms: [
      ...nucleus.atoms,
      { id: 18, x: atom13.x + c13Direction.x, y: atom13.y + c13Direction.y },
      { id: 19, x: atom10.x + c10Direction.x, y: atom10.y + c10Direction.y },
    ],
    bonds: [...nucleus.bonds, [c13, 18, 1], [c10, 19, 1]],
  };
  const snapshot = structuredClone(molecule);
  const c18OnlyPositions = calculateMolecule2DLayout({
    ...molecule,
    atoms: molecule.atoms.filter((atom) => atom.id !== 19),
    bonds: molecule.bonds.filter((bond) => !bond.includes(19)),
  }, []);
  const positions = calculateMolecule2DLayout(molecule, []);
  const anchor10 = positions.get(c10);
  const c19 = positions.get(19);
  const c19Attachment = { x: c19.x - anchor10.x, y: c19.y - anchor10.y };
  assert.ok(c19Attachment.x * c10Direction.x + c19Attachment.y * c10Direction.y > 100, "C19 points through C10's exterior sector");
  assert.ok(Math.abs(Math.hypot(c19Attachment.x, c19Attachment.y) - 130) < 1e-8);
  assert.deepEqual(positions.get(18), c18OnlyPositions.get(18), "placing C19 does not alter C18 geometry");
  assert.deepEqual(molecule, snapshot, "display layout does not change the steroid graph or coordinates");
  assert.equal(formulaCounts(molecule).get("C"), 19);
  checkGraph(molecule);
});

test("ethyl and propyl leave a tricyclic system as non-collinear zigzags", () => {
  const parent = makeFusedSystem(3);
  let attached = attachTemplate(parent, 4, linearTemplate(2), { zigzagLinear: true });
  attached = attachTemplate(attached, 12, linearTemplate(3), { zigzagLinear: true });
  const positions = calculateMolecule2DLayout(attached, []);
  const ethylIds = [15, 16];
  const propylIds = [17, 18, 19];
  assertExterior(attached, 4, ethylIds[0]);
  assertExterior(attached, 12, propylIds[0]);
  const turn = (left, middle, right) => (
    (middle.x - left.x) * (right.y - middle.y)
    - (middle.y - left.y) * (right.x - middle.x)
  );
  assert.ok(Math.abs(turn(positions.get(4), positions.get(15), positions.get(16))) > 1);
  const firstPropylTurn = turn(positions.get(12), positions.get(17), positions.get(18));
  const secondPropylTurn = turn(positions.get(17), positions.get(18), positions.get(19));
  assert.ok(Math.abs(firstPropylTurn) > 1 && Math.abs(secondPropylTurn) > 1);
  assert.ok(firstPropylTurn * secondPropylTurn < 0, "propyl turns alternate");
  for (const atomId of [...ethylIds, ...propylIds]) {
    for (const otherId of [...ethylIds, ...propylIds]) {
      if (atomId >= otherId) continue;
      assert.ok(Math.hypot(
        positions.get(atomId).x - positions.get(otherId).x,
        positions.get(atomId).y - positions.get(otherId).y,
      ) > 50);
    }
  }
  checkGraph(attached);
});

test("alcohol and ketone point outside tri- and tetracyclic systems", () => {
  const alcoholParent = makeFusedSystem(3);
  const alcoholTemplate = { atoms: [{ x: 1, y: 0, element: "O" }], bonds: [[-1, 0, 1]] };
  const alcohol = attachTemplate(alcoholParent, 11, alcoholTemplate);
  assertExterior(alcohol, 11, 15);
  assert.equal(formulaCounts(alcohol).get("O"), 1);
  assert.equal(formulaCounts(alcohol).get("H"), formulaCounts(alcoholParent).get("H"));

  const ketoneParent = makeFusedSystem(4);
  const ketoneTemplate = { atoms: [{ x: 0, y: -1, element: "O" }], bonds: [[-1, 0, 2]] };
  const ketone = attachTemplate(ketoneParent, 16, ketoneTemplate);
  assertExterior(ketone, 16, 19);
  assert.equal(formulaCounts(ketone).get("O"), 1);
  assert.equal(formulaCounts(ketone).get("H"), formulaCounts(ketoneParent).get("H") - 2);
  assert.equal(bondValence(ketone, 16), 4);
  checkGraph(alcohol);
  checkGraph(ketone);
});

test("a fusion carbon accepts one substituent only while valence permits it", () => {
  const parent = makeFusedSystem(2);
  const bridgeheadId = 1;
  assert.equal(bondValence(parent, bridgeheadId), 3);
  const attached = attachTemplate(parent, bridgeheadId, linearTemplate(1), { zigzagLinear: true });
  assert.equal(bondValence(attached, bridgeheadId), 4);
  assertExterior(attached, bridgeheadId, 11);
  assert.ok(bondValence(attached, bridgeheadId) + 1 > 4, "a second attachment must be rejected by editor valence validation");
  assert.match(page, /const attachmentViolation = getAtomValenceViolation\(molecule, selectedAtom\.id, 1\);[\s\S]*?placeAttachmentTemplate\(/);
});

test("exterior placement remains valid after rotation and reflection", () => {
  const source = makeFusedSystem(3);
  for (const reflect of [1, -1]) {
    const angle = 0.73;
    const transformed = {
      ...source,
      atoms: source.atoms.map((atom) => ({
        ...atom,
        x: 5 + atom.x * Math.cos(angle) - atom.y * Math.sin(angle) * reflect,
        y: -3 + atom.x * Math.sin(angle) + atom.y * Math.cos(angle) * reflect,
      })),
      bonds: source.bonds.map((bond) => [...bond]),
      rings: [...source.rings].reverse().map((ring) => ({ ...ring, atomIds: [...ring.atomIds].reverse() })),
    };
    const preferred = getPreferredAttachmentDirection(transformed, 12);
    const placement = placeAttachmentTemplate(
      transformed,
      12,
      linearTemplate(3).atoms,
      linearTemplate(3).bonds,
      { zigzagLinear: true },
    );
    assert.ok(placement);
    const anchor = transformed.atoms.find((atom) => atom.id === 12);
    const first = { x: placement[0].x - anchor.x, y: placement[0].y - anchor.y };
    assert.ok(first.x * preferred.x + first.y * preferred.y > 0);
  }

  const template = linearTemplate(3);
  const expected = placeAttachmentTemplate(source, 12, template.atoms, template.bonds, { zigzagLinear: true });
  const idMap = new Map(source.atoms.map((atom, index) => [atom.id, 401 + index * 3]));
  const remapped = {
    ...source,
    atoms: [...source.atoms].reverse().map((atom) => ({ ...atom, id: idMap.get(atom.id) })),
    bonds: [...source.bonds].reverse().map(([left, right, order]) => [idMap.get(right), idMap.get(left), order]),
    rings: [...source.rings].reverse().map((ring) => ({
      ...ring,
      id: ring.id + 50,
      atomIds: [...ring.atomIds].reverse().map((atomId) => idMap.get(atomId)),
    })),
  };
  const actual = placeAttachmentTemplate(
    remapped,
    idMap.get(12),
    template.atoms,
    template.bonds,
    { zigzagLinear: true },
  );
  assert.deepEqual(actual, expected, "placement does not depend on atom IDs or construction order");
});

test("substituent undo and redo preserve graph, formula and geometry exactly", () => {
  const initial = makeFusedSystem(3);
  const next = attachTemplate(initial, 12, linearTemplate(3), { zigzagLinear: true });
  const nextSnapshot = structuredClone(next);
  const formula = formulaCounts(next);
  calculateMolecule2DLayout(next, []);
  assert.deepEqual(next, nextSnapshot, "display layout does not mutate chemical connectivity or coordinates");
  assert.deepEqual(formulaCounts(next), formula);

  const context = { molecule: initial, undoStack: [], future: [], cloneMolecule,
    findMoleculeValenceViolation: () => null };
  for (const key of ["molecule", "undoStack", "future"]) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { context[key] = typeof value === "function" ? value(context[key]) : value; };
  }
  for (const name of ["setPlacementTool", "setReasoningSourceName", "setSourceNameOverride", "setNotice", "setSelectedId"]) context[name] = () => {};
  context.commit = action("commit", context);
  context.commit(next, "Propil añadido.");
  action("undo", context)();
  assert.deepEqual(context.molecule, cloneMolecule(initial));
  action("redo", context)();
  assert.deepEqual(context.molecule, cloneMolecule(nextSnapshot));
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
