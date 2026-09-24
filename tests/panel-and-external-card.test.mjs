import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { externalInfoUnavailableReason, preferredExternalInfoSource, shouldShowExternalInfo } from "../app/external-info-state.ts";
import { selectableNomenclatureConventions } from "../app/nomenclature-conventions.ts";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("uses the two existing card roots as the only movable panels", () => {
  assert.match(pageSource, /id="structure-panel"/);
  assert.match(pageSource, /id="analysis-panel"/);
  assert.equal((pageSource.match(/className="(?:card-heading|analysis-heading) panel-drag-handle"/g) ?? []).length, 2);
  assert.match(pageSource, /PANEL_STORAGE_KEY = "hydrocarbonLab\.panelPositions\.v1"/);
  assert.match(pageSource, /PANEL_DRAG_ENABLED_STORAGE_KEY = "hydrocarbonLab\.panelDragEnabled\.v2"/);
  assert.match(pageSource, /const \[panelDraggingEnabled, setPanelDraggingEnabled\] = useState\(false\)/);
  assert.match(pageSource, /!panelDraggingEnabled \|\| event\.button !== 0/);
  assert.match(pageSource, /Mover paneles libremente/);
  assert.match(pageSource, /Restablecer posición de paneles/);
  assert.match(pageSource, /onDoubleClick=\{\(event\) => resetPanelPosition\("structure-panel", event\)\}/);
  assert.match(pageSource, /onDoubleClick=\{\(event\) => resetPanelPosition\("analysis-panel", event\)\}/);
  assert.match(styleSource, /grid-template-areas:\s*\n\s*"name smiles"\s*\n\s*"formula formula"\s*\n\s*"examples view"/);
  assert.match(styleSource, /\.movable-panel\.is-dragging/);
  assert.match(styleSource, /\.movable-panel\.is-drag-disabled \.panel-drag-handle/);
  assert.match(styleSource, /\.builder-card \.card-heading\s*\{\s*display: grid/);
  assert.match(styleSource, /\.builder-card \.heading-actions\s*\{\s*display: flex/);
  assert.match(styleSource, /@media \(max-width: 800px\)/);
});

test("keeps one live canvas in the sticky left card and all information in the right column", () => {
  const leftStart = pageSource.indexOf('id="structure-panel"');
  const rightStart = pageSource.indexOf('className="information-column"');
  const analysisStart = pageSource.indexOf('id="analysis-panel"');
  const footerStart = pageSource.indexOf('<footer>');
  assert.ok(leftStart < rightStart && rightStart < analysisStart);
  assert.ok(analysisStart < footerStart);
  assert.doesNotMatch(pageSource, /className="examples-card"/);
  assert.match(pageSource, /className="alkyl-palette examples-context-panel"/);
  assert.equal((pageSource.match(/className=\{`molecule-workspace/g) ?? []).length, 1);
  assert.ok(pageSource.indexOf('id="iupac-name-builder"') < rightStart);
  assert.ok(pageSource.indexOf('id="molecular-formula-builder"') < rightStart);
  assert.ok(pageSource.indexOf('id="smiles-interop-panel"') < rightStart);
  assert.ok(pageSource.indexOf('className="analysis-utility-bar"') > rightStart);
  assert.match(styleSource, /\.workspace-grid \{ grid-template-columns: minmax\(0, 59fr\) minmax\(0, 41fr\)/);
  assert.match(styleSource, /\.builder-card \{\s*position: sticky;[\s\S]*?height: calc\(100dvh - var\(--iupac-dock-height\)/);
  assert.match(styleSource, /\.builder-card \.molecule-workspace:not\(\.is-expanded\) \.molecule-stage \{[\s\S]*?flex: 1 1 auto/);
  assert.match(styleSource, /@media \(max-width: 760px\) \{\s*\.workspace-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
});

test("uses a page scroll, contextual constructors, right-side display settings and a fixed full-name dock", () => {
  const rightStart = pageSource.indexOf('className="information-column"');
  const settingsStart = pageSource.indexOf('className="settings-panel"');
  assert.ok(settingsStart < rightStart);
  assert.ok(pageSource.indexOf('Tamaño de grupos funcionales', settingsStart) < rightStart);
  assert.ok(pageSource.indexOf('Tamaño de numeración', settingsStart) < rightStart);
  assert.doesNotMatch(pageSource, /className="display-options"/);
  assert.match(pageSource, /setNameBuilderOpen\(false\);\s*setNameBuilderFeedback\(\{/);
  assert.match(pageSource, /className=\{`iupac-dock/);
  assert.match(pageSource, /copyVisibleName\(displayedIupacName\)/);
  assert.match(styleSource, /\.builder-card \{[\s\S]*?overflow: visible;/);
  assert.match(styleSource, /\.iupac-dock \{ position: fixed;/);
  assert.match(styleSource, /\.app-shell \{ padding-bottom: calc\(var\(--iupac-dock-height\)/);
  assert.doesNotMatch(pageSource, /className=\{`name-result/);
  assert.match(pageSource, /className="iupac-dock-profile"/);
  assert.match(pageSource, /nomenclatureVariants\.filter\(\(variant\) => variant\.convention !== activeNomenclatureConvention\)\.map/);
  assert.match(pageSource, /option value=\{variant\.convention\} key=\{variant\.convention\}/);
  assert.deepEqual(selectableNomenclatureConventions("es"), ["current", "iupac-1979-es"]);
  assert.deepEqual(selectableNomenclatureConventions("en"), ["current", "iupac-1979-legacy-en"]);
  assert.match(pageSource, /className="iupac-dock-variants"/);
  assert.match(styleSource, /--editor-top-offset/);
  assert.match(pageSource, /grid\.style\.setProperty\("--editor-top-offset"/);
  assert.match(styleSource, /\.iupac-dock-name wbr \{ display: none; \}/);
});

test("tool libraries share one right context panel and keep graph placement on the canvas", () => {
  assert.match(pageSource, /<ToolPanelPortal target=\{toolPanelTarget\} expanded=\{canvasExpanded\}>/);
  assert.match(pageSource, /className="construction-context-slot" ref=\{toolPanelSlotRef\}/);
  assert.match(pageSource, /className="construction-context-panel"/);
  assert.match(pageSource, /setPlacementTool\(\{ kind: "alkyl", template \}\)/);
  assert.match(pageSource, /setPlacementTool\(\{ kind: "ring", template, mode:/);
  assert.match(pageSource, /setPlacementTool\(\{ kind: "functional", template \}\)/);
  assert.match(pageSource, /addFunctionalGroup\(placementTool\.template, atom\.id\)/);
  assert.match(styleSource, /\.construction-context-slot \{ position: sticky;/);
  assert.match(styleSource, /\.construction-context-panel \{[\s\S]*?overflow-y: auto/);
  assert.match(styleSource, /@media \(max-width: 760px\) \{[\s\S]*?\.construction-context-panel \{[\s\S]*?position: fixed/);
  assert.match(styleSource, /max-height: min\(30dvh, 250px\)/);
});

test("keeps Wikipedia and PubChem in one alternate, source-attributed card", () => {
  assert.match(pageSource, /id="external-info-card"/);
  assert.match(pageSource, /className="source-toggle"/);
  assert.match(pageSource, /setExternalInfoSource\(\(source\) => source === "wikipedia" \? "pubchem" : "wikipedia"\)/);
  assert.match(pageSource, /setExternalInfoSource\("wikipedia"\)/);
  assert.match(pageSource, /className="pubchem-grid"/);
  assert.match(pageSource, /target="_blank" rel="noopener noreferrer"/);
  assert.match(styleSource, /\.external-info-card\.is-collapsed/);
  assert.match(pageSource, /compoundContext\.language === language/, "a previous locale must not render as the current one");
  assert.match(pageSource, /Wikipedia — English/, "English fallback is identified in the Spanish card");
  assert.match(pageSource, /shouldShowExternalInfo\(showIupacName, compoundContextLoading, currentCompoundContext\)/);
});

test("the actual card visibility rule accepts either source independently", () => {
  const pubchem = { identityKey: "cid:5793", language: "es", pubchem: { cid: 5793 } };
  const wikipedia = { identityKey: "smiles:C", language: "es", wikipedia: { title: "Metano" } };
  assert.equal(shouldShowExternalInfo(true, false, pubchem), true);
  assert.equal(shouldShowExternalInfo(true, true, pubchem), true);
  assert.equal(shouldShowExternalInfo(true, false, wikipedia), true);
  assert.equal(shouldShowExternalInfo(true, false, { ...pubchem, ...wikipedia }), true);
  assert.equal(shouldShowExternalInfo(true, false, null), false);
  const temporaryFailure = { identityKey: "smiles:C", language: "en", pubchemStatus: "retrieval-error", wikipediaStatus: "no-article" };
  const unmatched = { identityKey: "smiles:CC", language: "en", pubchemStatus: "no-match", wikipediaStatus: "no-article" };
  assert.equal(shouldShowExternalInfo(true, true, null), true, "the loading card is shown");
  assert.equal(shouldShowExternalInfo(true, false, temporaryFailure), true, "a completed HTTP failure retains the card");
  assert.equal(shouldShowExternalInfo(true, false, unmatched), true, "a completed lookup without sources retains an explanation");
  assert.equal(externalInfoUnavailableReason(temporaryFailure), "temporary");
  assert.equal(externalInfoUnavailableReason(unmatched), "unverified");
  assert.equal(externalInfoUnavailableReason(pubchem), null);
  assert.equal(shouldShowExternalInfo(false, false, pubchem), false);
  assert.equal(preferredExternalInfoSource(pubchem), "pubchem");
  assert.equal(preferredExternalInfoSource(wikipedia), "wikipedia");
  assert.equal(preferredExternalInfoSource({ ...pubchem, ...wikipedia }), "wikipedia");
});
