import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("display preferences are available in Settings, not below the canvas", () => {
  const settings = page.slice(page.indexOf('className="settings-panel"'), page.indexOf('settings-accessibility'));
  assert.match(settings, /Mostrar hidrógenos implícitos/);
  assert.match(settings, /Numerar anillo/);
  assert.match(settings, /Tamaño de numeración/);
  assert.match(settings, /Tamaño de grupos funcionales/);
  assert.match(settings, /Tamaño de badges R\/S/);
  assert.match(settings, /Mostrar etiquetas de anillos esteroideos/);
  assert.match(settings, /Resaltar sustituyentes/);
  assert.doesNotMatch(page, /className="display-options"/);
});

test("implicit-H toggle remains enabled in skeletal view", () => {
  assert.match(page, /const showHydrogenOnLabel = showHydrogens;/);
  assert.match(page, /checked=\{showHydrogens\}/);
  assert.doesNotMatch(page, /checked=\{showHydrogens\} disabled=\{viewMode === "skeletal"\}/);
});

test("numbering and substituent-highlight controls remain present", () => {
  assert.match(page, /setShowNumbering\(event\.target\.checked\)/);
  assert.match(page, /hydrocarbonLab\.numberingScale\.v1/);
  assert.match(page, /type="range"[\s\S]*MIN_NUMBERING_SCALE[\s\S]*MAX_NUMBERING_SCALE/);
  assert.match(page, /normalizeNumberingScale\(stored\)/);
  assert.match(page, /aria-label=\{t\("Tamaño de numeración"\)\}/);
  assert.match(page, /setHighlightSubstituents\(enabled\)/);
  assert.match(css, /\.numbering-size-control/);
});

test("the settings drawer keeps its controls, shortcuts, and dismiss actions", () => {
  assert.match(page, /className="settings-control"/);
  assert.match(page, /className="settings-panel"/);
  assert.match(page, /className="settings-scrim"/);
  assert.match(page, /setSettingsOpen\(false\)/);
  assert.match(page, /Mostrar hidrógenos implícitos/);
  assert.match(page, /Numerar anillo/);
  assert.match(page, /Recordar estereoquímica/);
  assert.match(page, /Atajos de teclado/);
  assert.match(page, /key === "r"/);
  assert.match(page, /key === "s"/);
  assert.match(page, /key === "4"/);
  assert.match(css, /\.settings-panel\s*\{/);
  assert.match(css, /\.settings-toggle\s*\{/);
});
