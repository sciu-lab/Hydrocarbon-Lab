import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("display controls are visible again", () => {
  const displayBlock = css.match(/\.display-options\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(displayBlock, /display:\s*flex;/);
  assert.doesNotMatch(displayBlock, /display:\s*none;/);
});

test("implicit-H toggle remains enabled in skeletal view", () => {
  assert.match(page, /const showHydrogenOnLabel = showHydrogens;/);
  assert.match(page, /checked=\{showHydrogens\} onChange=/);
  assert.doesNotMatch(page, /checked=\{showHydrogens\} disabled=\{viewMode === "skeletal"\}/);
});

test("numbering and substituent-highlight controls remain present", () => {
  assert.match(page, /setShowNumbering\(event\.target\.checked\)/);
  assert.match(page, /setHighlightSubstituents\(enabled\)/);
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
