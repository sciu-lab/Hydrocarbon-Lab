import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { Molecule as OCLMolecule, SmilesParser } from "openchemlib";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { readSmilesFileRecord } from "../app/smiles-file.ts";
import { retainValidManualDisplayPlacements } from "../app/manual-display-direction.ts";
import { getCondensedUnavailableReason } from "../app/condensed-layout.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function action(name, context) {
  let source;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) {
      source = `const ${node.getText(ast)};`;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(source, `${name} is present in the editor`);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("context", `with (context) { ${compiled}; return ${name}; }`)(context);
}

function editor(viewMode = "semi-developed") {
  const initial = moleculeFromSmiles("CO");
  assert.equal(initial.ok, true);
  const context = {
    molecule: initial.molecule,
    undoStack: [], future: [], undoPristineStates: [], futurePristineStates: [],
    isPristineInitialMolecule: true, smilesFeedback: null, analysisCalls: 0,
    language: "en", moleculeFromSmiles, viewMode,
    retainValidManualDisplayPlacements,
    getCondensedUnavailableReason,
    cloneMolecule: structuredClone,
    findMoleculeValenceViolation: () => null,
    analyzeMolecule: () => { context.analysisCalls += 1; return { name: "test name" }; },
    externalCandidateNeedsNeutralLocalName: () => false,
    getTetrahedralStereoCenters: () => [],
    localizedIupac: (name) => name,
    localizedDynamicText: (message) => message,
    t: (message) => message,
  };
  context.setViewMode = (mode) => { context.viewMode = mode; };
  for (const key of ["molecule", "undoStack", "future", "undoPristineStates", "futurePristineStates", "isPristineInitialMolecule", "smilesFeedback"]) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => {
      context[key] = typeof value === "function" ? value(context[key]) : value;
    };
  }
  for (const name of [
    "setPlacementTool", "setReasoningSourceName", "setSourceNameOverride", "setNotice", "setSelectedId",
    "setShowStereochemistry", "setCommonAlkylNameSelections", "setShowIupacName", "setRingInsertMode",
    "setShowAlkylPalette", "setShowRingPalette", "setShowFunctionalPalette", "setNameBuilderFeedback",
  ]) context[name] = () => {};
  context.commit = action("commit", context);
  return { context, importSmilesString: action("importSmilesString", context), initial: structuredClone(initial.molecule) };
}

function loadFromFile(editorState, contents) {
  const record = readSmilesFileRecord(contents);
  editorState.importSmilesString(record.smiles, {
    kind: "file", name: "molecule.smi", ignoredRecordCount: record.ignoredRecordCount,
  });
}

function alkeneGeometry(molecule) {
  const exported = moleculeToSmiles(molecule);
  assert.equal(exported.ok, true);
  const parsed = new SmilesParser().parseMolecule(exported.smiles);
  parsed.ensureHelperArrays(OCLMolecule.cHelperCIP);
  const geometry = [];
  for (let bond = 0; bond < parsed.getAllBonds(); bond += 1) {
    if (parsed.getBondOrder(bond) !== 2 || parsed.isAromaticBond(bond)) continue;
    const parity = parsed.getBondCIPParity(bond);
    geometry.push(parity === OCLMolecule.cBondCIPParityEorP ? "E"
      : parity === OCLMolecule.cBondCIPParityZorM ? "Z" : null);
  }
  return geometry;
}

test("the existing file and direct-text routes commit the same editable propane graph", () => {
  const direct = editor();
  const file = editor();
  direct.importSmilesString("CCC", { kind: "text" });
  loadFromFile(file, "CCC");
  assert.deepEqual(direct.context.molecule, file.context.molecule);
  assert.equal(direct.context.molecule.atoms.length, 3);
  assert.equal(direct.context.smilesFeedback.kind, "success");
  assert.equal(direct.context.analysisCalls, 1);
  assert.equal(direct.context.undoStack.length, 1);
});

test("direct text trims only surrounding whitespace", () => {
  const direct = editor();
  direct.importSmilesString("   CCC   ", { kind: "text" });
  assert.deepEqual(direct.context.molecule, moleculeFromSmiles("CCC").molecule);
  assert.equal(direct.context.smilesFeedback.kind, "success");
});

test("importing an aromatic ring while Condensed is active falls back without changing the graph", () => {
  const direct = editor("condensed");
  const expected = moleculeFromSmiles("c1ccccc1");
  assert.equal(expected.ok, true);

  direct.importSmilesString("c1ccccc1", { kind: "text" });

  assert.equal(direct.context.smilesFeedback.kind, "success");
  assert.equal(direct.context.viewMode, "semi-developed");
  assert.deepEqual(direct.context.molecule, expected.molecule);
  assert.equal(direct.context.molecule.rings?.[0].kind, "aromatic");
});

for (const [label, source] of [["empty", "   "], ["invalid", "C1("]]) {
  test(`${label} direct input reports an error without changing molecule or history`, () => {
    const direct = editor();
    direct.importSmilesString(source, { kind: "text" });
    assert.equal(direct.context.smilesFeedback.kind, "error");
    assert.deepEqual(direct.context.molecule, direct.initial);
    assert.equal(direct.context.undoStack.length, 0);
    assert.equal(direct.context.analysisCalls, 0);
  });
}

for (const [smiles, geometry] of [
  ["CC=CC", [null]],
  ["C/C=C/C", ["E"]],
  ["C/C=C\\C", ["Z"]],
  ["c1ccccc1", []],
]) {
  test(`${smiles} has the same graph from file and text, with its existing stereo and aromaticity`, () => {
    const direct = editor();
    const file = editor();
    direct.importSmilesString(smiles, { kind: "text" });
    loadFromFile(file, smiles);
    assert.equal(direct.context.smilesFeedback.kind, "success");
    assert.deepEqual(direct.context.molecule, file.context.molecule);
    assert.deepEqual(alkeneGeometry(direct.context.molecule), geometry);
    if (smiles === "c1ccccc1") {
      assert.equal(direct.context.molecule.rings?.[0].kind, "aromatic");
    } else if (geometry.length) {
      assert.equal(Boolean(direct.context.molecule.bonds.find((bond) => bond[2] === 2)?.[3]), geometry[0] !== null);
    }
  });
}

test("a direct load is one history action and undo/redo restore both graphs", () => {
  const direct = editor();
  direct.importSmilesString("CCC", { kind: "text" });
  const propane = structuredClone(direct.context.molecule);
  assert.equal(direct.context.undoStack.length, 1);
  action("undo", { ...direct.context })();
  assert.deepEqual(direct.context.molecule, direct.initial);
  action("redo", { ...direct.context })();
  assert.deepEqual(direct.context.molecule, propane);
});

test("the current panel submits text on button or Enter through the shared import action", () => {
  assert.match(page, /<form className="smiles-text-form" onSubmit=/);
  assert.match(page, /importSmilesString\(smilesInput, \{ kind: "text" \}\)/);
  assert.match(page, /<button type="submit" disabled=\{smilesImporting\}>/);
  assert.match(page, /<label htmlFor="smiles-text-input">/);
});
