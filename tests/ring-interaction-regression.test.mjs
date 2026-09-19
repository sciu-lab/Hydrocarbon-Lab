import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { fuseRingOnBond, ringFusionError } from "../app/fused-ring.ts";

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
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("context", `with (context) { ${compiled}; return ${name}; }`)(context);
}

test("ordinary bond activation edits while Shift activation retains explicit fusion", () => {
  assert.match(page, /if \(containingRing && event\.shiftKey\) \{\s*setFusionSelection/s);
  assert.match(page, /setFusionSelection\(null\);\s*cycleBondOrder\(a, b, undefined, event\.altKey\);/s);
  assert.doesNotMatch(page, /containingRing && !event\.shiftKey\) setFusionSelection/);
});

test("ring drag and drop is the only direct gesture that invokes fused construction", () => {
  assert.match(page, /draggable=\{template\.size === 5 \|\| template\.size === 6\}/);
  assert.match(page, /onDragOver=\{\(event\) => previewDraggedRingOnBond\(event, a, b\)\}/);
  assert.match(page, /onDrop=\{\(event\) => dropDraggedRingOnBond\(event, a, b\)\}/);
  assert.match(page, /const fuseDraggedRingOnBond[\s\S]*?fuseRingOnBond\(molecule, a, b, template\.size\)/);
  assert.match(page, /const endRingDrag[\s\S]*?setRingFusionDropTarget\(null\)/);
});

test("dropping a six-membered ring commits one ten-carbon fused structure", () => {
  const makeRing = action("makeRing");
  const context = {
    molecule: makeRing(6, "cycloalkane"),
    language: "es",
    fuseRingOnBond,
    ringFusionError,
    setNotice() {},
    setFusionSelection() {},
    setShowRingPalette() {},
  };
  context.commit = (next) => {
    context.committed = next;
    return true;
  };
  const template = {
    id: "cyclo-6",
    label: "Ciclohexano",
    formula: "C6H12",
    detail: "",
    size: 6,
    kind: "cycloalkane",
    molecule: makeRing(6, "cycloalkane"),
  };

  assert.equal(action("fuseDraggedRingOnBond", context)(template, 1, 2), true);
  assert.equal(context.committed.atoms.length, 10);
  assert.equal(context.committed.bonds.length, 11);
});

test("the Kekulé benzene template stores three alternating double bonds", () => {
  const benzene = action("makeRing")(6, "aromatic");
  assert.deepEqual(benzene.bonds.map((bond) => bond[2] ?? 1), [2, 1, 2, 1, 2, 1]);
});

test("SVG and PNG export share the live ring-double-bond geometry", () => {
  assert.match(page, /getSkeletalRingDoubleBondSegments\(/);
  assert.match(page, /skeletal-ring-double-bond ring-double-bond-\$\{segment\.role\}/);
  assert.match(page, /const clonedSvg = sourceSvg\.cloneNode\(true\) as SVGSVGElement/);
  assert.match(page, /image\.src = svgUrl/);
});
