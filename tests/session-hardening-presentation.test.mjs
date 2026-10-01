import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const rule = (selector) => {
  const start = css.lastIndexOf(selector + " {"); assert.ok(start >= 0, selector);
  return css.slice(start, css.indexOf("}", start) + 1);
};
test("Build arrow tracks and hitboxes share accessible dimensions and gaps, scoped away from Lab", () => {
  const pad = rule(".practice-build-editor .builder-card .direction-pad");
  const buttons = rule(".practice-build-editor .builder-card .direction-pad button");
  assert.match(pad, /--build-arrow-target: 44px/);
  assert.match(pad, /repeat\(2, var\(--build-arrow-target\)\) \/ repeat\(2, var\(--build-arrow-target\)\)/);
  assert.match(pad, /gap: 8px/);
  for (const dimension of ["width", "height", "min-width", "min-height"]) assert.ok(buttons.includes(`${dimension}: var(--build-arrow-target)`));
  assert.match(buttons, /box-sizing: border-box/); assert.match(buttons, /padding: 0/);
  assert.match(rule(".practice-build-editor .builder-card .direction-pad button:hover"), /transform: none/);
});
test("review has one dedicated color per theme plus bond halos and transparent atom rings, with dark-safe specificity", () => {
  assert.match(rule(":root"), /--review-highlight: #b45309/);
  assert.match(rule('html[data-theme="dark"]'), /--review-highlight: #ffd166/);
  const bond = rule('html .practice-molecule-preview line[data-review-highlight="true"]');
  assert.match(bond, /stroke: var\(--review-highlight\)/); assert.match(bond, /stroke-width: 2.8/);
  assert.match(rule("html .practice-molecule-preview line.practice-review-bond-halo"), /stroke-width: 10/);
  const ring = rule("html .practice-molecule-preview circle.practice-review-atom-ring");
  assert.match(ring, /fill: none/); assert.match(ring, /stroke-width: 3/);
});
