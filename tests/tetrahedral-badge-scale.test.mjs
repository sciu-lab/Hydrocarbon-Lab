import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

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
    "DEFAULT_TETRAHEDRAL_BADGE_SCALE",
    "MIN_TETRAHEDRAL_BADGE_SCALE",
    "MAX_TETRAHEDRAL_BADGE_SCALE",
    "TETRAHEDRAL_BADGE_SCALE_STEP",
    `${compiled}; return ${name};`,
  )(1, 0.75, 2, 0.05);
}

test("R/S badge scale accepts 75% through 200% and rejects invalid saved values", () => {
  const normalize = functionFromPage("normalizeTetrahedralBadgeScale");
  assert.equal(normalize(0.75), 0.75);
  assert.equal(normalize(1), 1);
  assert.equal(normalize(2), 2);
  assert.equal(normalize(1.23), 1.25);
  for (const value of [0.7, 2.05, "bad", Infinity, null]) {
    assert.equal(normalize(value), 1);
  }
});

test("R/S badge preference is persistent, resettable, and scales layout plus SVG paint", () => {
  assert.match(page, /hydrocarbonLab\.tetrahedralBadgeScale\.v1/);
  assert.match(page, /min=\{MIN_TETRAHEDRAL_BADGE_SCALE\}[\s\S]*max=\{MAX_TETRAHEDRAL_BADGE_SCALE\}/);
  assert.match(page, /\{Math\.round\(tetrahedralBadgeScale \* 100\)\} %/);
  assert.match(page, /updateTetrahedralBadgeScale\(DEFAULT_TETRAHEDRAL_BADGE_SCALE\)/);
  assert.match(page, /effectiveTetrahedralBadgeScale = tetrahedralMarkerScale \* tetrahedralBadgeScale/);
  assert.match(page, /layoutTetrahedralBadgePositions\([\s\S]*effectiveTetrahedralBadgeScale/);
  assert.match(page, /<g transform=\{`scale\(\$\{tetrahedralBadgeScale\}\)`\}>/);
  assert.match(page, /TETRAHEDRAL_BADGE_HIT_RADIUS \* Math\.max\(1, tetrahedralBadgeScale\)/);
});

test("the visual badge extent follows the selected scale for canvas and export framing", () => {
  assert.match(page, /tetrahedralBadgeExtentsAtScale\([\s\S]*effectiveTetrahedralBadgeScale/);
  assert.match(page, /additionalExtents: \[\.\.\.numberingBadgeExtents, \.\.\.functionalLabelExtents, \.\.\.tetrahedralBadgeExtents, \.\.\.steroidRingLabelExtents\]/);
});
