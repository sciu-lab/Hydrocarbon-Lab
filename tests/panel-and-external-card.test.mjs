import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
  assert.match(styleSource, /grid-template-areas:\s*\n\s*"name smiles"\s*\n\s*"formula formula"\s*\n\s*"view view"/);
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
  const examplesStart = pageSource.indexOf('className="examples-card"');
  const footerStart = pageSource.indexOf('<footer>');
  assert.ok(leftStart < rightStart && rightStart < analysisStart);
  assert.ok(analysisStart < examplesStart && examplesStart < footerStart);
  assert.equal((pageSource.match(/className=\{`molecule-workspace/g) ?? []).length, 1);
  assert.ok(pageSource.indexOf('id="iupac-name-builder"') < rightStart);
  assert.ok(pageSource.indexOf('id="molecular-formula-builder"') < rightStart);
  assert.ok(pageSource.indexOf('id="smiles-interop-panel"') < rightStart);
  assert.ok(pageSource.indexOf('className="analysis-utility-bar"') > rightStart);
  assert.match(styleSource, /\.workspace-grid\s*\{[^}]*grid-template-columns: minmax\(0, 3fr\) minmax\(360px, 2fr\)/s);
  assert.match(styleSource, /\.builder-card\s*\{[^}]*position: sticky;[^}]*height: calc\(100dvh - 24px\)/s);
  assert.match(styleSource, /\.molecule-stage\s*\{[^}]*position: sticky/s);
  assert.match(styleSource, /@media \(max-width: 1000px\)\s*\{[^}]*\.workspace-grid\s*\{[^}]*grid-template-columns: 1fr/s);
});

test("keeps Wikipedia and PubChem in one alternate, source-attributed card", () => {
  assert.match(pageSource, /id="external-info-card"/);
  assert.match(pageSource, /className="source-toggle"/);
  assert.match(pageSource, /setExternalInfoSource\(\(source\) => source === "wikipedia" \? "pubchem" : "wikipedia"\)/);
  assert.match(pageSource, /setExternalInfoSource\("wikipedia"\)/);
  assert.match(pageSource, /className="pubchem-grid"/);
  assert.match(pageSource, /target="_blank" rel="noopener noreferrer"/);
  assert.match(styleSource, /\.external-info-card\.is-collapsed/);
});
