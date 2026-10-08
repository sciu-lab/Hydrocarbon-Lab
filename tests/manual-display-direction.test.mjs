import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { createServer } from "vite";

import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import {
  canonicalManualDisplayDirection,
  hasManualDisplayDirection,
  manualDisplayDirectionFromVector,
  normalizeManualDisplayPlacements,
  retainValidManualDisplayPlacements,
} from "../app/manual-display-direction.ts";
import { getAutoPlacedCarbonPosition } from "../app/manual-layout.ts";
import { moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { flipCoordinates } from "../app/coordinate-flip.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
let server;
let analyzeMolecule;
let readChemistryDocument;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, readChemistryDocument } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function extract(startMarker, endMarker) {
  const start = page.indexOf(startMarker);
  const end = page.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `source markers exist: ${startMarker}`);
  return page.slice(start, end);
}

const optionsSource = extract("const directionOptions = [", "const ALKYL_TEMPLATES:");
const addCarbonSource = extract("  const addCarbon = (dx: number, dy: number) => {", "  const addCarbonFromArrow =");
const cloneSource = extract("function cloneMolecule(molecule: Molecule): Molecule {", "function buildAdjacency(");
const commitSource = extract("  const commit = (next: Molecule, message: string, preserveName = false) => {", "  const constructFromName =");
const undoSource = extract("  const undo = () => {", "  const redo = () => {");
const redoSource = extract("  const redo = () => {", "  const saveCurrentStructure =");
const redrawSource = extract("  const redrawMolecule = () => {", "  useEffect(() => {");
const compiledActions = ts.transpileModule(
  `${cloneSource}\n${commitSource}\n${undoSource}\n${redoSource}\n${addCarbonSource}\n${redrawSource}\nreturn { cloneMolecule, commit, undo, redo, addCarbon, redrawMolecule };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const compiledOptions = ts.transpileModule(`${optionsSource}\nreturn directionOptions;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const directionOptions = new Function(compiledOptions)();

function graphWithChain(length = 3) {
  return {
    atoms: Array.from({ length }, (_, index) => ({ id: index + 1, x: index, y: 0, element: "C" })),
    bonds: Array.from({ length: Math.max(0, length - 1) }, (_, index) => [index + 1, index + 2, 1]),
  };
}

function harness(sourceGraph = graphWithChain(), selectedId = 2, viewMode = "semi-developed") {
  const context = {
    molecule: structuredClone(sourceGraph),
    selectedAtom: sourceGraph.atoms.find((atom) => atom.id === selectedId),
    selectedId,
    hasActiveSelection: true,
    viewMode,
    newBondOrder: 1,
    isPristineInitialMolecule: false,
    undoStack: [],
    undoPristineStates: [],
    future: [],
    futurePristineStates: [],
    isCarbonAtom: (atom) => atom.element === "C" || atom.element === undefined,
    getElement: (atom) => atom.element ?? "C",
    elementNames: { C: "carbono" },
    getBondOrderLabel: (order) => order === 1 ? "simple" : order === 2 ? "doble" : "triple",
    getAtomValenceViolation: () => null,
    formatBondValenceError: () => "blocked by valence",
    findMoleculeValenceViolation: () => null,
    sanitizeTetrahedralStereochemistry: (molecule) => molecule,
    getAutoPlacedCarbonPosition,
    flipCoordinates,
    canonicalManualDisplayDirection,
    hasManualDisplayDirection,
    manualDisplayDirectionFromVector,
    retainValidManualDisplayPlacements,
    setPlacementTool(value) { context.placementTool = value; },
    setUndoStack(update) { context.undoStack = typeof update === "function" ? update(context.undoStack) : update; },
    setUndoPristineStates(update) { context.undoPristineStates = typeof update === "function" ? update(context.undoPristineStates) : update; },
    setFuture(update) { context.future = typeof update === "function" ? update(context.future) : update; },
    setFuturePristineStates(update) { context.futurePristineStates = typeof update === "function" ? update(context.futurePristineStates) : update; },
    setMolecule(value) { context.molecule = value; },
    setIsPristineInitialMolecule(value) { context.isPristineInitialMolecule = value; },
    setReasoningSourceName() {},
    setSourceNameOverride() {},
    previousSelectedId: { current: null },
    setSelectedId(id) {
      context.selectedId = id;
      context.selectedAtom = context.molecule.atoms.find((atom) => atom.id === id);
    },
    dispatchGuidedTour() {},
    showValenceError(message) { context.valenceError = message; },
    setNotice(message) { context.notice = message; },
    titleCaseElement: (element) => element,
  };
  const actions = new Function("context", `with (context) { ${compiledActions} }`)(context);
  Object.assign(context, actions);
  return context;
}

function addWithDirection(context, direction) {
  const option = directionOptions.find(({ label }) => ({
    Arriba: "up", Abajo: "down", Izquierda: "left", Derecha: "right",
  })[label] === direction);
  assert.ok(option, `direction option exists for ${direction}`);
  context.addCarbon(option.dx, option.dy);
}

function positionsFor(molecule, preferred = []) {
  return calculateMolecule2DLayout(molecule, preferred, "semi-developed");
}

function assertDirection(molecule, parentId, childId, direction, preferred = []) {
  const positions = positionsFor(molecule, preferred);
  const parent = positions.get(parentId), child = positions.get(childId);
  assert.ok(parent && child);
  if (direction === "up") {
    assert.equal(child.x, parent.x);
    assert.ok(child.y < parent.y);
  } else if (direction === "down") {
    assert.equal(child.x, parent.x);
    assert.ok(child.y > parent.y);
  } else if (direction === "left") {
    assert.equal(child.y, parent.y);
    assert.ok(child.x < parent.x);
  } else {
    assert.equal(child.y, parent.y);
    assert.ok(child.x > parent.x);
  }
  return positions;
}

test("the real editor action maps all four arrow buttons to graph atoms and orthogonal display bonds", () => {
  assert.deepEqual(directionOptions.map(({ symbol, dx, dy }) => [symbol, dx, dy]), [
    ["↑", 0, -1], ["←", -1, 0], ["→", 1, 0], ["↓", 0, 1],
  ]);

  for (const [selectedId, direction] of [[2, "up"], [2, "down"], [1, "left"], [3, "right"]]) {
    const before = graphWithChain();
    const context = harness(before, selectedId);
    addWithDirection(context, direction);
    const childId = before.atoms.length + 1;
    assert.equal(context.molecule.atoms.length, before.atoms.length + 1);
    assert.ok(context.molecule.bonds.some(([left, right]) =>
      (left === selectedId && right === childId) || (left === childId && right === selectedId)));
    assert.equal(context.molecule.manualDisplayDirections.at(-1).direction, direction);
    assertDirection(context.molecule, selectedId, childId, direction, [1, 2, 3]);
  }
});

test("same-parent up, down and right requests remain distinct and orthogonal", () => {
  const context = harness(graphWithChain(2), 2);
  for (const direction of ["up", "down", "right"]) {
    context.selectedAtom = context.molecule.atoms.find((atom) => atom.id === 2);
    context.selectedId = 2;
    addWithDirection(context, direction);
  }
  const placements = context.molecule.manualDisplayDirections;
  assert.deepEqual(placements.map(({ direction }) => direction), ["up", "down", "right"]);
  const positions = positionsFor(context.molecule, [1, 2]);
  for (const { parentAtomId, childAtomId, direction } of placements) {
    assertDirection(context.molecule, parentAtomId, childAtomId, direction, [1, 2]);
  }
  const points = [...positions.values()];
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      assert.ok(Math.abs(points[left].x - points[right].x) >= 104 || Math.abs(points[left].y - points[right].y) >= 104);
    }
  }
});

test("an already occupied manual direction is rejected without a phantom atom", () => {
  const context = harness(graphWithChain(), 2);
  addWithDirection(context, "up");
  context.selectedAtom = context.molecule.atoms.find((atom) => atom.id === 2);
  context.selectedId = 2;
  const before = structuredClone(context.molecule);
  addWithDirection(context, "up");
  assert.deepEqual(context.molecule, before);
  assert.match(context.notice, /ocupado/i);
});

test("the existing valence rejection blocks direction actions before graph mutation", () => {
  const context = harness(graphWithChain(), 2);
  context.getAtomValenceViolation = () => ({ attempted: 5, limit: 4 });
  const before = structuredClone(context.molecule);
  addWithDirection(context, "up");
  assert.deepEqual(context.molecule, before);
  assert.equal(context.valenceError, "blocked by valence");
});

test("the real commit, undo and redo path restores the directional hint and its placement", () => {
  const context = harness(graphWithChain(), 2);
  addWithDirection(context, "up");
  const afterAdd = structuredClone(context.molecule);
  assertDirection(afterAdd, 2, 4, "up", [1, 2, 3]);
  context.undo();
  assert.equal(context.molecule.atoms.length, 3);
  context.redo();
  assert.deepEqual(context.molecule.atoms, afterAdd.atoms);
  assert.deepEqual(context.molecule.bonds, afterAdd.bonds);
  assert.deepEqual(context.molecule.manualDisplayDirections, afterAdd.manualDisplayDirections);
  assertDirection(context.molecule, 2, 4, "up", [1, 2, 3]);
});

test("redraw mirrors manual placement; switching to Skeletal and back preserves graph intent", () => {
  const context = harness(graphWithChain(), 1);
  addWithDirection(context, "left");
  const graph = context.molecule;
  const condensed = positionsFor(graph, [1, 2, 3]);
  const skeletal = calculateMolecule2DLayout(graph, [1, 2, 3], "skeletal");
  const semiDevelopedAgain = positionsFor(graph, [1, 2, 3]);
  assert.deepEqual(semiDevelopedAgain, condensed);
  assert.equal(skeletal.size, graph.atoms.length);
  assert.deepEqual(graph.manualDisplayDirections, [{ parentAtomId: 1, childAtomId: 4, direction: "left" }]);
  context.redrawMolecule();
  const mirrored = context.molecule;
  const mirroredPositions = positionsFor(mirrored, [1, 2, 3]);
  assert.ok(mirroredPositions.get(4).x > mirroredPositions.get(1).x, "redraw reflects the manual bond horizontally");
  assert.equal(mirroredPositions.get(4).y, mirroredPositions.get(1).y);
  context.selectedAtom = context.molecule.atoms.find((atom) => atom.id === 1);
  context.selectedId = 1;
  const beforeOccupiedAttempt = structuredClone(context.molecule);
  addWithDirection(context, "right");
  assert.equal(context.molecule.atoms.length, beforeOccupiedAttempt.atoms.length);
  assert.match(context.notice, /ocupado/i);
});

test("different arrow histories with identical connectivity keep the same SMILES and IUPAC name", () => {
  const build = (first, second) => {
    const context = harness(graphWithChain(), 2);
    addWithDirection(context, first);
    context.selectedAtom = context.molecule.atoms.find((atom) => atom.id === 2);
    context.selectedId = 2;
    addWithDirection(context, second);
    return context.molecule;
  };
  const first = build("up", "down"), second = build("down", "up");
  assert.equal(moleculeToSmiles(first).smiles, moleculeToSmiles(second).smiles);
  assert.equal(analyzeMolecule(first).name, analyzeMolecule(second).name);
  assert.equal(first.atoms.length, second.atoms.length);
  assert.equal(first.bonds.length, second.bonds.length);
});

test("presentation directions survive portable structure save/restore and reject invalid edge references", () => {
  const context = harness(graphWithChain(), 2);
  addWithDirection(context, "up");
  const molecule = context.molecule;
  const structure = {
    name: "test chain",
    formula: analyzeMolecule(molecule).formula,
    family: "acyclic",
    molecule,
    viewMode: "semi-developed",
    atomCount: molecule.atoms.length,
    createdAt: "2026-10-07T00:00:00.000Z",
    updatedAt: "2026-10-07T00:00:00.000Z",
  };
  const document = {
    format: "laboratorio-quimica-organica", version: 1, kind: "structure",
    exportedAt: structure.createdAt, structure,
  };
  const restored = readChemistryDocument(document)[0].molecule;
  assert.deepEqual(restored.manualDisplayDirections, molecule.manualDisplayDirections);
  assertDirection(restored, 2, 4, "up", [1, 2, 3]);
  assert.equal(normalizeManualDisplayPlacements([
    { parentAtomId: 1, childAtomId: 4, direction: "up" },
  ], restored), undefined);
});
