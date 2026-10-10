import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const renderer = readFileSync(new URL("../app/condensed-renderer.tsx", import.meta.url), "utf8");

test("SVG renderer keeps atom and bond targets separate and tied to graph identity", () => {
  assert.match(renderer, /data-atom-id=\{token\.atomId\}/);
  assert.match(renderer, /onSelectAtom\(token\.atomId\)/);
  assert.match(renderer, /className="condensed-atom-hit-target"[^\n]*data-editor-only="true"/);
  assert.match(renderer, /className="condensed-selection-halo"[^\n]*data-editor-only="true"/);
  assert.match(renderer, /data-bond-a=\{token\.atomIds\[0\]\}/);
  assert.match(renderer, /data-bond-b=\{token\.atomIds\[1\]\}/);
  assert.match(renderer, /className="condensed-bond-hit-target"[^\n]*data-editor-only="true"/);
  assert.match(renderer, /onActivateBond\(token\.atomIds\[0\], token\.atomIds\[1\]/);
  assert.match(renderer, /role: "button" as const, tabIndex: 0/);
});

test("parentheses stay visual-only and editor interaction is stopped at each token", () => {
  assert.match(renderer, /token\.type === "branch-open" \? "condensed-branch-open"/);
  assert.match(renderer, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(renderer, /data-atom-id=\{[^}]*branch/);
});

test("export removes editor hit geometry and selection-only decorations", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const exportSelector = page.slice(page.indexOf("const SVG_EXPORT_INTERFACE_SELECTOR"), page.indexOf("const SVG_EXPORT_BOUNDS_IGNORED_SELECTOR"));
  assert.match(exportSelector, /\[data-editor-only='true'\]/);
  assert.match(exportSelector, /\[class\*='hit-target'\]/);
  assert.match(page, /cleanSvgForExport\(clonedSvg\)/);
});
