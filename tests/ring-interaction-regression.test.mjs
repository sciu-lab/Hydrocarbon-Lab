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

test("ring drag and drop remains available outside explicit fusion mode", () => {
  assert.match(page, /draggable=\{ringLibraryContext !== "fuse" && \(template\.size === 5 \|\| template\.size === 6\)\}/);
  assert.match(page, /onDragOver=\{\(event\) => previewDraggedRingOnBond\(event, a, b\)\}/);
  assert.match(page, /onDrop=\{\(event\) => dropDraggedRingOnBond\(event, a, b\)\}/);
  assert.match(page, /const fuseDraggedRingOnBond[\s\S]*?fuseRingOnBond\(molecule, a, b, template\.size\)/);
  assert.match(page, /const endRingDrag[\s\S]*?setRingFusionDropTarget\(null\)/);
});

test("one contextual library replaces the compact fusion picker", () => {
  assert.match(page, /type RingLibraryContext = RingInsertMode \| "fuse"/);
  assert.match(page, /const ringLibraryContext: RingLibraryContext = selectedFusionBond/);
  assert.match(page, /Fusionar con enlace seleccionado/);
  assert.match(page, /Unir al carbono seleccionado/);
  assert.match(page, /chooseRingFromLibrary\(template\)/);
  assert.doesNotMatch(page, /ring-quick-options/);
  assert.doesNotMatch(page, /aria-label=\{language === "en" \? "Fuse ring"/);
});

test("only explicit ring actions open the shared ring library", () => {
  assert.match(page, /if \(containingRing && event\.shiftKey\) \{\s*setFusionSelection\(\{ molecule, a, b \}\);\s*setShowRingPalette\(true\);/s);
  assert.doesNotMatch(page, /setSelectedId\(atom\.id\);\s*if \(carbonAtom\) \{\s*setRingInsertMode\("attach"\);\s*setShowRingPalette\(true\);/s);
  assert.match(page, /if \(!selectedFusionBond\) \{\s*setRingInsertMode\(hasActiveSelection && isCarbonAtom\(selectedAtom\) \? "attach" : "replace"\);/s);
  assert.match(page, /const key = event\.key\.toLowerCase\(\);[\s\S]*?else if \(key === "r"\) \{[\s\S]*?setShowRingPalette\(!showRingPalette\)/);
});

test("explicit fusion clears its temporary selection only after a successful commit", () => {
  assert.match(page, /const fuseSelectedBond[\s\S]*?const committed = commit\([\s\S]*?if \(!committed\) return false;\s*setFusionSelection\(null\);\s*setShowRingPalette\(false\);/);
  assert.match(page, /ringFusionOptionError\(template\)/);
  assert.match(page, /La fusión aromática aún no está disponible/);
});

test("expanded workspace wraps the live canvas and construction controls", () => {
  assert.match(page, /import \{ createPortal \} from "react-dom"/);
  assert.match(page, /function ViewportPortal[\s\S]*?createPortal\(children, document\.body\)/);
  assert.match(page, /<ViewportPortal active=\{canvasExpanded\}>/);
  assert.match(page, /className=\{`molecule-workspace \$\{canvasExpanded \? "is-expanded" : ""\}`\}/);
  assert.match(page, /expanded-workspace-header/);
  assert.match(page, /ref=\{expandedCanvasCloseButtonRef\}/);
  assert.match(page, /ref=\{expandedWorkspaceRef\}/);
  assert.match(page, /window\.requestAnimationFrame\(\(\) => expandedCanvasCloseButtonRef\.current\?\.focus/);
  assert.match(page, /keepFocusInWorkspace/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.canvas-expand-scrim \{[\s\S]*position: fixed;[\s\S]*inset: 0;/);
  assert.match(css, /\.molecule-workspace\.is-expanded \{[\s\S]*position: fixed;[\s\S]*width: 90vw;[\s\S]*height: 90dvh;/);
  assert.match(css, /\.molecule-workspace\.is-expanded \.molecule-stage \{[\s\S]*height: clamp\(470px, 62dvh, 720px\);/);
  assert.doesNotMatch(css, /\.molecule-stage\.is-expanded/);
});

test("the traditional nomenclature card uses the name supplied by fused-ring analysis", () => {
  assert.match(page, /const traditionalName = analysis\.commonName/);
  assert.match(page, /translateCommonName\(language, analysis\.commonName\)/);
  assert.match(page, /name: convention === "traditional"\s*\? traditionalName/s);
});

test("contextual selection focus preserves the page scroll and expanded SVG uses fitted bounds", () => {
  assert.match(page, /\.ring-option:not\(:disabled\)"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /const expandedFitBounds = getMoleculeVisualBounds\(displayPositions\.values\(\)/);
  assert.match(page, /const activeViewBounds = canvasExpanded/);
  assert.match(page, /setExpandedZoom\(1\)/);
  assert.match(page, /fitExpandedMolecule/);
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
