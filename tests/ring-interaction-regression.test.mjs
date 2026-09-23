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
  assert.match(page, /if \(event\.shiftKey\) \{\s*setFusionSelection/s);
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
  assert.match(page, /const ringLibraryContext: RingLibraryContext = selectedBondCanFuse/);
  assert.match(page, /Fusionar con enlace seleccionado/);
  assert.match(page, /Unir al carbono seleccionado/);
  assert.match(page, /chooseRingFromLibrary\(template\)/);
  assert.doesNotMatch(page, /ring-quick-options/);
  assert.doesNotMatch(page, /aria-label=\{language === "en" \? "Fuse ring"/);
});

test("only explicit ring actions open the shared ring library", () => {
  assert.match(page, /if \(event\.shiftKey\) \{\s*setFusionSelection\(\{ molecule, a, b \}\);\s*setShowRingPalette\(true\);/s);
  assert.doesNotMatch(page, /setSelectedId\(atom\.id\);\s*if \(carbonAtom\) \{\s*setRingInsertMode\("attach"\);\s*setShowRingPalette\(true\);/s);
  assert.match(page, /if \(!selectedFusionBond\) \{\s*setRingInsertMode\(hasActiveSelection && isCarbonAtom\(selectedAtom\) \? "attach" : "replace"\);/s);
  assert.match(page, /const key = event\.key\.toLowerCase\(\);[\s\S]*?else if \(key === "r"\) \{[\s\S]*?setShowRingPalette\(!showRingPalette\)/);
});

test("the shared bond context exposes atom-owned R/S controls without replacing fusion", () => {
  assert.match(page, /const selectedBondTetrahedralCandidates = selectedFusionBond[\s\S]*?getTetrahedralCandidatesForBond/);
  assert.match(page, /selectedFusionBond && selectedBondTetrahedralCandidates\.length > 0/);
  assert.match(page, /Estereoquímica R\/S/);
  assert.match(page, /\(\["R", "S"\] as const\)\.map\(\(configuration\)/);
  assert.match(page, /configureSelectedBondTetrahedralCenter\(atomId, configuration\)/);
  assert.match(page, /configureSelectedBondTetrahedralCenter\(atomId, null\)/);
  assert.match(page, /selectedBondCanFuse && \(/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /className="tetrahedral-center-hit-target"[\s\S]*?r=\{TETRAHEDRAL_BADGE_HIT_RADIUS \* Math\.max\(1, tetrahedralBadgeScale\)\}/);
  assert.match(page, /className="tetrahedral-center-badge" r=\{TETRAHEDRAL_BADGE_RADIUS\}/);
  assert.match(css, /\.tetrahedral-center-hit-target \{[\s\S]*?pointer-events: all;/);
  assert.match(css, /\.tetrahedral-center-marker text \{[\s\S]*?font-size: 22px;/);
  assert.match(css, /\.bond-stereochemistry-actions button \{[\s\S]*?min-width: 32px;[\s\S]*?min-height: 32px;/);
});

test("R/S context stays selected after assignment and receives focus before ring templates", () => {
  assert.match(page, /\.bond-stereochemistry-actions button:not\(:disabled\), \.ring-option:not\(:disabled\)/);
  assert.match(page, /const committedMolecule = sanitizeTetrahedralStereochemistry\(result\.molecule\)/);
  assert.match(page, /setFusionSelection\(\{\s*molecule: committedMolecule,/s);
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

test("the dock offers verified locale-specific historical variants separate from Legacy English", () => {
  assert.match(page, /const traditionalCandidate = analysis\.steroidSystem[\s\S]*: analysis\.fusedBicyclic/);
  assert.match(page, /fusedBicyclicTraditionalDisplayName\(analysis\.fusedBicyclic, language\)/);
  assert.match(page, /historicalCandidate = language === "es"[\s\S]*applyNomenclatureConvention\(nameWithSelectedStereochemistry, "iupac-1979-es", "es"\)/);
  assert.match(page, /normalizeNomenclatureDisplayName\(historicalCandidate\) !== normalizeNomenclatureDisplayName\(suggestedName\)/);
  assert.match(page, /label: language === "en" \? "Traditional" : "IUPAC 1979"/);
  assert.match(page, /legacyEnglishVariantAvailable = language === "en"[\s\S]*legacyEnglishName !== "-"/);
  assert.match(page, /label: "IUPAC 1979 Legacy English"/);
});

test("contextual selection focus preserves the page scroll and expanded SVG uses fitted bounds", () => {
  assert.match(page, /\.ring-option:not\(:disabled\)[\s\S]*?\.focus\(\{ preventScroll: true \}\)/);
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

test("the existing pristine aromatic templates are complete and chemically named", () => {
  const makeRing = action("makeRing");
  const makeSubstitutedRing = action("makeSubstitutedRing", { makeRing });
  const templates = [
    [makeRing(6, "aromatic"), "C6H6", "benceno"],
    [makeSubstitutedRing("aromatic", [{ ringIndex: 0, length: 1 }]), "C7H8", "metilbenceno"],
    [makeSubstitutedRing("aromatic", [{ ringIndex: 0, length: 2 }]), "C8H10", "etilbenceno"],
  ];
  for (const [molecule, formula, name] of templates) {
    const hydrogenCount = molecule.atoms.reduce((count, atom) => {
      const valence = molecule.bonds.reduce((sum, bond) =>
        sum + ((bond[0] === atom.id || bond[1] === atom.id) ? (bond[2] ?? 1) : 0), 0);
      return count + 4 - valence;
    }, 0);
    assert.equal(`C${molecule.atoms.length}H${hydrogenCount}`, formula);
    assert.ok(page.includes(`label: "${name === "benceno" ? "Benceno" : name === "metilbenceno" ? "Tolueno" : "Etilbenceno"}"`));
  }
  assert.match(page, /!isPristineInitialMolecule && ringLibraryContext === "attach"/);
  assert.match(page, /!isPristineInitialMolecule && ringLibraryContext === "attach" \? "attach" : "replace"/);
});

test("the By name action refocuses without toggling off an open builder", () => {
  assert.match(page, /useEffect\(\(\) => \{\s*if \(nameBuilderOpen\) nameInputRef\.current\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(page, /if \(nameBuilderOpen\) \{\s*nameInputRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*return;/);
  assert.match(page, /id="iupac-name-input"\s+ref=\{nameInputRef\}/);
});

test("formula input keeps ASCII state while mirroring subscript glyphs", () => {
  assert.match(page, /value=\{formulaInput\}[\s\S]*?normalizeFormulaBuilderInput\(event\.target\.value\)/);
  assert.match(page, /className="formula-builder-input-visual" aria-hidden="true"/);
  assert.match(page, /className="formula-builder-visual-field"[\s\S]*?id="molecular-formula-input"[\s\S]*?className="formula-builder-input-visual"/);
  assert.match(page, /generateFormulaIsomers\(formulaInput\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /input\.has-visual-formula[\s\S]*?color: transparent;[\s\S]*?caret-color:/);
  assert.match(css, /\.formula-builder-input-visual \{[\s\S]*?overflow-x: clip;\s*overflow-y: visible;/);
  assert.match(css, /\.formula-builder-input-visual \{[\s\S]*?pointer-events: none;/);
  assert.match(css, /\.formula-builder-visual-field \{\s*position: relative;/);
});

test("canvas guidance can be dismissed and remembers the choice for the tab session", () => {
  assert.match(page, /const SKELETAL_HINT_DISMISSED_STORAGE_KEY = "hydrocarbonLab\.skeletalHintDismissed\.v1"/);
  assert.match(page, /const BOND_HINT_DISMISSED_STORAGE_KEY = "hydrocarbonLab\.bondHintDismissed\.v1"/);
  assert.match(page, /setShowSkeletalHint\(window\.sessionStorage\.getItem\(SKELETAL_HINT_DISMISSED_STORAGE_KEY\) !== "true"\)/);
  assert.match(page, /setShowBondInteractionHint\(window\.sessionStorage\.getItem\(BOND_HINT_DISMISSED_STORAGE_KEY\) !== "true"\)/);
  assert.match(page, /showBondInteractionHint && \(/);
  assert.match(page, /viewMode === "skeletal" && showSkeletalHint && \(/);
  assert.equal((page.match(/className="canvas-hint-dismiss"/g) ?? []).length, 2);
  assert.match(page, /dismissCanvasHint\("bond"\)/);
  assert.match(page, /dismissCanvasHint\("skeletal"\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.skeletal-hint \{[\s\S]*?pointer-events: auto;/);
  assert.match(css, /\.bond-touch-hint \{[\s\S]*?pointer-events: auto;/);
});

test("functional groups share the contextual scroll and use at most three columns", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.construction-context-panel > \.functional-palette \{\s*max-height: none;\s*overflow: visible;/);
  assert.doesNotMatch(css, /\.functional-halogen \.functional-grid \{\s*grid-template-columns: repeat\(4/);
  assert.match(css, /\.construction-context-panel \.functional-grid \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /@media \(max-width: 760px\) \{\s*\.construction-context-panel \.functional-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}\s*\}/);
  assert.match(css, /@media \(max-width: 460px\) \{\s*\.construction-context-panel \.functional-grid \{ grid-template-columns: minmax\(0, 1fr\); \}\s*\}/);
});

test("SVG and PNG export share the live ring-double-bond geometry", () => {
  assert.match(page, /getSkeletalRingDoubleBondSegments\(/);
  assert.match(page, /skeletal-ring-double-bond ring-double-bond-\$\{segment\.role\}/);
  assert.match(page, /const clonedSvg = sourceSvg\.cloneNode\(true\) as SVGSVGElement/);
  assert.match(page, /image\.src = svgUrl/);
});
