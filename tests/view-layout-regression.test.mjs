import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, after } from "node:test";
import ts from "typescript";

import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { flipCoordinates } from "../app/coordinate-flip.ts";
import { getAutoPlacedCarbonPosition } from "../app/manual-layout.ts";
import { inspectDoubleBondStereochemistry } from "../app/double-bond-stereochemistry.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry;
before(async () => { chemistry = await loadExerciseChemistry(); });
after(async () => { await chemistry?.close(); });

const chain = (length, slope = 0) => ({
  atoms: Array.from({ length }, (_, i) => ({ id: i + 1, x: i, y: i * slope })),
  bonds: Array.from({ length: length - 1 }, (_, i) => [i + 1, i + 2, 1]),
});
const pathOf = (molecule) => molecule.atoms.map((atom) => atom.id);
const pointsOn = (positions, path) => path.map((id) => positions.get(id));
const span = (values) => Math.max(...values) - Math.min(...values);
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function assertHorizontal(points) {
  assert.ok(span(points.map((p) => p.y)) <= 5, "text backbone stays on a horizontal baseline");
  points.slice(1).forEach((p, i) => {
    assert.ok(p.x - points[i].x > 90, "labels have space along X");
  });
}

function assertZigzag(points, direction = 1) {
  const steps = points.slice(1).map((p, i) => ({ x: p.x - points[i].x, y: p.y - points[i].y }));
  assert.ok(steps.every((step) => direction * step.x > 90), "consistent horizontal expansion");
  assert.ok(steps.every((step) => Math.abs(step.y) > 40), "visible line-angle geometry");
  steps.slice(1).forEach((step, i) => assert.ok(step.y * steps[i].y < 0, "Y steps alternate sign"));
  if (points.length >= 4) {
    assert.ok(Math.abs(points.at(-1).y - points[0].y) / span(points.map((p) => p.x)) < 0.25,
      "net vertical displacement is small relative to horizontal span");
  }
  const centers = points.filter((_, i) => i % 2 === 0 && i + 1 < points.length)
    .map((p, i) => (p.y + points[i * 2 + 1].y) / 2);
  assert.ok(span(centers) < 5, "successive pair centers do not drift");
  points.slice(1).forEach((p, i) => assert.ok(Math.abs(distance(points[i], p) - 130) < 0.01));
}

function imported(smiles) {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.error);
  return result.molecule;
}

function projected(molecule, mode) {
  const path = chemistry.engine.analyzeMolecule(molecule).mainChain;
  const positions = calculateMolecule2DLayout(molecule, path, mode);
  return { ...molecule, atoms: molecule.atoms.map((atom) => ({ ...atom, ...positions.get(atom.id) })) };
}

for (const length of [2, 3, 4, 5, 6, 8, 10]) {
  test(`C${length}: skeletal zigzag and horizontal semideveloped geometry share one immutable graph`, () => {
    const molecule = chain(length);
    const snapshot = structuredClone(molecule);
    const path = pathOf(molecule);
    assertZigzag(pointsOn(calculateMolecule2DLayout(molecule, path, "skeletal"), path));
    assertHorizontal(pointsOn(calculateMolecule2DLayout(molecule, path, "condensed"), path));
    assert.deepEqual(molecule, snapshot);
  });
}

test("C10 generated continuations cannot inherit diagonal drift from raw coordinates", () => {
  // Before the fix, +/-120-degree choices followed the imported direction,
  // producing +30,+90,+30,+90: alternating turns with accumulated Y drift.
  for (const slope of [-1, 0, 1]) {
    const molecule = chain(10, slope);
    for (const backbone of [[], [1], [1, 2, 3]]) {
      assertZigzag(pointsOn(calculateMolecule2DLayout(molecule, backbone, "skeletal"), pathOf(molecule)));
      assertHorizontal(pointsOn(calculateMolecule2DLayout(molecule, backbone, "condensed"), pathOf(molecule)));
    }
  }
});

test("a branched alkane separates substituents without moving the backbone off its axis", () => {
  const molecule = chain(4);
  molecule.atoms.push({ id: 5, x: 1, y: -1 });
  molecule.bonds.push([2, 5, 1]);
  for (const mode of ["skeletal", "condensed"]) {
    const positions = calculateMolecule2DLayout(molecule, [1, 2, 3, 4], mode);
    const backbone = pointsOn(positions, [1, 2, 3, 4]);
    if (mode === "skeletal") assertZigzag(backbone);
    else assertHorizontal(backbone);
    assert.ok(Math.abs(positions.get(5).y - positions.get(2).y) > 75, "branch is off the baseline");
    assert.ok(backbone.every((point) => distance(point, positions.get(5)) > 75));
  }
});

test("ether side-chain continuations stay balanced independently of the imported raw directions", () => {
  const molecule = imported("CCCCOCCCCCC");
  const path = chemistry.engine.analyzeMolecule(molecule).mainChain;
  assert.equal(path.length, 6, "use the existing chemical parent selection");
  const positions = calculateMolecule2DLayout(molecule, path, "skeletal");
  assertZigzag(pointsOn(positions, path));
  assertZigzag(pointsOn(positions, [6, 5, 4, 3, 2, 1]), -1);
});

test("unsaturated textual chains retain their double/triple bond orders", () => {
  for (const order of [2, 3]) {
    const molecule = chain(4);
    molecule.bonds[1][2] = order;
    const snapshot = structuredClone(molecule);
    assertHorizontal(pointsOn(calculateMolecule2DLayout(molecule, [1, 2, 3, 4], "condensed"), [1, 2, 3, 4]));
    assert.deepEqual(molecule, snapshot);
  }
});

test("defined E/Z and diene geometry survive both views and redraw", () => {
  for (const smiles of ["C/C=C/C", "C/C=C\\C", "C/C=C/C=C\\C"]) {
    const molecule = imported(smiles);
    const snapshot = structuredClone(molecule);
    const targets = molecule.bonds.filter((bond) => bond[2] === 2)
      .map(([a, b]) => ({ a, b, stereo: inspectDoubleBondStereochemistry(molecule, a, b) }));
    for (const mode of ["skeletal", "condensed"]) {
      for (const source of [molecule, flipCoordinates(molecule)]) {
        const displayed = projected(source, mode);
        for (const { a, b, stereo } of targets) {
          assert.deepEqual(inspectDoubleBondStereochemistry(displayed, a, b), stereo);
        }
      }
    }
    assert.deepEqual(molecule, snapshot);
  }
});

test("alcohol, ketone and aldehyde layouts preserve identity and group attachments", () => {
  for (const smiles of ["CCO", "CC(=O)C", "CCC=O"]) {
    const molecule = imported(smiles);
    const snapshot = structuredClone(molecule);
    const analysis = chemistry.engine.analyzeMolecule(molecule);
    const before = moleculeToSmiles(molecule);
    assert.equal(before.ok, true);
    for (const mode of ["skeletal", "condensed", "skeletal"]) {
      const positions = calculateMolecule2DLayout(molecule, analysis.mainChain, mode);
      if (mode === "condensed") assertHorizontal(pointsOn(positions, analysis.mainChain));
      assert.equal(positions.size, molecule.atoms.length);
    }
    assert.deepEqual(chemistry.engine.analyzeMolecule(molecule), analysis);
    assert.deepEqual(moleculeToSmiles(molecule), before);
    assert.deepEqual(molecule, snapshot);
  }
});

test("explicit and inferred rings retain cyclic topology in independent view layouts", () => {
  for (const smiles of ["C1CCCCC1", "c1ccccc1", "CCc1ccccc1"]) {
    const explicit = imported(smiles);
    for (const molecule of [explicit, { ...explicit, rings: undefined }]) {
      const path = chemistry.engine.analyzeMolecule(explicit).mainChain;
      const skeletal = calculateMolecule2DLayout(molecule, path, "skeletal");
      const condensed = calculateMolecule2DLayout(molecule, path, "condensed");
      assert.notDeepEqual(condensed, skeletal, "semi-developed ring layout owns its display geometry");
      const ringPoints = pointsOn(condensed, explicit.rings[0].atomIds);
      assert.ok(span(ringPoints.map((p) => p.y)) > 100, "ring is not flattened");
      for (const [left, right] of explicit.bonds.filter(([a, b]) => explicit.rings[0].atomIds.includes(a) && explicit.rings[0].atomIds.includes(b))) {
        assert.ok(distance(condensed.get(left), condensed.get(right)) > 50, "ring edge remains visible");
      }
    }
  }
});

test("atom IDs, atom order, bond order and bond endpoint order cannot introduce drift", () => {
  const molecule = chain(10, 1);
  const ids = [81, 4, 37, 2, 65, 19, 102, 8, 45, 6];
  const remapped = {
    atoms: molecule.atoms.map((atom, i) => ({ ...atom, id: ids[i] })).reverse(),
    bonds: molecule.bonds.map(([a, b, order]) => [ids[b - 1], ids[a - 1], order]).reverse(),
  };
  for (const mode of ["skeletal", "condensed"]) {
    for (const path of [[], [1], pathOf(molecule)]) {
      const expected = pointsOn(calculateMolecule2DLayout(molecule, path, mode), pathOf(molecule));
      const actual = pointsOn(calculateMolecule2DLayout(remapped, path.map((id) => ids[id - 1]), mode), ids);
      actual.forEach((point, i) => assert.ok(distance(point, expected[i]) < 0.01));
    }
  }
});

test("builder arrows, frozen OPSIN hexane and direct SMILES receive equivalent display conventions", () => {
  const manual = { atoms: [{ id: 1, x: 0, y: 0 }], bonds: [] };
  for (let id = 2; id <= 6; id++) {
    const position = getAutoPlacedCarbonPosition(manual, id - 1, { x: 1, y: 0 });
    manual.atoms.push({ id, ...position });
    manual.bonds.push([id - 1, id, 1]);
  }
  const snapshots = JSON.parse(readFileSync(new URL("./reference-corpus/opsin-snapshots.json", import.meta.url), "utf8"));
  const record = snapshots.responses.find((item) => item.name === "hexane");
  const response = JSON.parse(record.body);
  assert.equal(response.status, "SUCCESS");
  for (const molecule of [manual, imported(response.smiles), imported("CCCCCC")]) {
    const snapshot = structuredClone(molecule);
    const path = chemistry.engine.analyzeMolecule(molecule).mainChain;
    assertZigzag(pointsOn(calculateMolecule2DLayout(molecule, path, "skeletal"), path));
    assertHorizontal(pointsOn(calculateMolecule2DLayout(molecule, path, "condensed"), path));
    assert.deepEqual(molecule, snapshot, "manual/imported coordinates stay persistent and untouched");
  }
});

test("the actual canvas view switch selects derived layouts without touching molecule or history", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const action = page.slice(page.indexOf("  const changeViewMode ="), page.indexOf("  const redrawMolecule ="));
  const expression = page.match(/const rawDisplayPositions = ([^;]+);/)[1];
  const code = ts.transpileModule(`function run(context, mode) { with (context) {
    ${action}; changeViewMode(mode); return ${expression};
  } }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function(`${code}; return run;`)();
  const molecule = imported("C[C@H](O)CC");
  const snapshot = structuredClone(molecule);
  const smiles = moleculeToSmiles(molecule);
  assert.equal(smiles.ok, true);
  assert.ok(molecule.atoms.some((atom) => atom.tetrahedralParity), "fixture has R/S metadata");
  const context = {
    molecule, analysis: chemistry.engine.analyzeMolecule(molecule), calculateMolecule2DLayout,
    viewMode: "skeletal", undoStack: [], future: [], setNotice() {},
    setViewMode(mode) { context.viewMode = mode; },
    commit() { assert.fail("view switching must not commit an edit"); },
    setMolecule() { assert.fail("view switching must not overwrite editor coordinates"); },
  };
  const original = run(context, "skeletal");
  const condensed = run(context, "condensed");
  assertHorizontal(pointsOn(condensed, context.analysis.mainChain));
  assert.deepEqual(run(context, "skeletal"), original);
  assert.deepEqual(molecule, snapshot);
  assert.deepEqual(moleculeToSmiles(molecule), smiles);
  assert.deepEqual(context.undoStack, []);
  assert.deepEqual(context.future, []);
});

test("redraw mirrors each mode reversibly while retaining its display convention", () => {
  const molecule = chain(10);
  const path = pathOf(molecule);
  const mirrored = flipCoordinates(molecule);
  for (const mode of ["skeletal", "condensed"]) {
    const original = calculateMolecule2DLayout(molecule, path, mode);
    const redrawn = calculateMolecule2DLayout(mirrored, path, mode);
    if (mode === "skeletal") assertZigzag(pointsOn(redrawn, path), -1);
    else assertHorizontal(pointsOn(redrawn, [...path].reverse()));
    assert.deepEqual(calculateMolecule2DLayout(flipCoordinates(mirrored), path, mode), original);
  }
  assert.deepEqual(mirrored.bonds, molecule.bonds);
});
