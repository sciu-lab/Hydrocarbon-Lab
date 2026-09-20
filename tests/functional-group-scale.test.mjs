import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { getMoleculeVisualBounds } from "../app/molecule-visual-bounds.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function functionFromPage(name) {
  let source;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.getText(ast) === name) source = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(source, `expected ${name} in page.tsx`);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(
    "DEFAULT_FUNCTIONAL_GROUP_SCALE",
    "MIN_FUNCTIONAL_GROUP_SCALE",
    "MAX_FUNCTIONAL_GROUP_SCALE",
    "FUNCTIONAL_GROUP_SCALE_STEP",
    `${compiled}; return ${name};`,
  )(1, 0.6, 2, 0.1);
}

test("functional-group scale defaults to 100% and accepts only 60% through 200%", () => {
  const normalize = functionFromPage("normalizeFunctionalGroupScale");
  assert.match(page, /const DEFAULT_FUNCTIONAL_GROUP_SCALE = 1/);
  assert.match(page, /const MIN_FUNCTIONAL_GROUP_SCALE = 0\.6/);
  assert.match(page, /const MAX_FUNCTIONAL_GROUP_SCALE = 2/);
  assert.equal(normalize(0.6), 0.6);
  assert.equal(normalize(1), 1);
  assert.equal(normalize(2), 2);
  assert.equal(normalize(0.5), 1);
  assert.equal(normalize(2.1), 1);
});

test("one global SVG transform scales every heteroatom label without scaling bonds or numbering", () => {
  assert.match(page, /className="functional-group-label" transform=\{`scale\(\$\{functionalGroupScale\}\)`\}/);
  assert.match(page, /className=\{carbonAtom \? undefined : "functional-group-label"\}/);
  assert.match(page, /className="number-label"[\s\S]*?fontSize: numberingGeometry\.fontSize/);
  assert.match(page, /className="hydrogen-subscript" baselineShift="sub"/);
  assert.doesNotMatch(page, /molecule-stage[^\n]*scale\(\$\{functionalGroupScale\}/);
});

test("the selected label size is shared by expanded rendering and exports with fitted bounds", () => {
  assert.match(page, /const \[functionalGroupScale, setFunctionalGroupScale\] = useState\(DEFAULT_FUNCTIONAL_GROUP_SCALE\)/);
  assert.match(page, /<ViewportPortal active=\{canvasExpanded\}>/);
  assert.match(page, /additionalExtents: \[\.\.\.numberingBadgeExtents, \.\.\.functionalLabelExtents\]/);
  assert.match(page, /const clonedSvg = sourceSvg\.cloneNode\(true\) as SVGSVGElement/);
  assert.match(page, /fitViewBoxToContent\(clonedSvg, SVG_EXPORT_VIEWBOX_PADDING\)/);
});

test("a 200% functional label contributes its full painted extent to the SVG frame", () => {
  const labelAt200Percent = { x: -42, y: -30, width: 84, height: 60 };
  const bounds = getMoleculeVisualBounds([{ x: 0, y: 0 }], {
    atomExtent: 12,
    padding: 0,
    additionalExtents: [labelAt200Percent],
  });
  assert.ok(bounds.x <= labelAt200Percent.x);
  assert.ok(bounds.y <= labelAt200Percent.y);
  assert.ok(bounds.x + bounds.width >= labelAt200Percent.x + labelAt200Percent.width);
  assert.ok(bounds.y + bounds.height >= labelAt200Percent.y + labelAt200Percent.height);
});

test("the display control remains independent from numbering", () => {
  assert.match(page, /aria-label=\{t\("Tamaño de grupos funcionales"\)\}/);
  assert.match(page, /updateFunctionalGroupScale\(functionalGroupScale - FUNCTIONAL_GROUP_SCALE_STEP\)/);
  assert.match(page, /updateNumberingScale\(numberingScale - NUMBERING_SCALE_STEP\)/);
  assert.match(page, /\{Math\.round\(functionalGroupScale \* 100\)\} %/);
});
