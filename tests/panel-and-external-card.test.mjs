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
  assert.match(pageSource, /PANEL_DRAG_ENABLED_STORAGE_KEY = "hydrocarbonLab\.panelDragEnabled\.v1"/);
  assert.match(pageSource, /!panelDraggingEnabled \|\| event\.button !== 0/);
  assert.match(pageSource, /Mover paneles libremente/);
  assert.match(pageSource, /Restablecer posición de paneles/);
  assert.match(pageSource, /onDoubleClick=\{\(event\) => resetPanelPosition\("structure-panel", event\)\}/);
  assert.match(pageSource, /onDoubleClick=\{\(event\) => resetPanelPosition\("analysis-panel", event\)\}/);
  assert.match(styleSource, /\.movable-panel\.is-dragging/);
  assert.match(styleSource, /\.movable-panel\.is-drag-disabled \.panel-drag-handle/);
  assert.match(styleSource, /\.builder-card \.card-heading\s*\{\s*flex-wrap: wrap/);
  assert.match(styleSource, /\.builder-card \.heading-actions\s*\{\s*max-width: 100%/);
  assert.match(styleSource, /@media \(max-width: 800px\)/);
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
