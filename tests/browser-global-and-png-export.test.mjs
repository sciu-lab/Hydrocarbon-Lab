import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("the heterocycle translator is exported to the browser global scope", async () => {
  globalThis.window = {};
  try {
    const module = await import("../app/iupac-name-normalization.ts");
    assert.equal(typeof window.translateHeterocycles, "function");
    assert.equal(window.translateHeterocycles("pirrol"), "pyrrole");
    assert.equal(window.translateHeterocycles, module.translateHeterocycles);
  } finally {
    delete globalThis.window;
  }
});

test("the canvas toolbar exposes expand and PNG export actions on the left", () => {
  assert.match(page, /className="canvas-toolbar-left"/);
  assert.match(page, /className="canvas-expand-button"/);
  assert.match(page, /className="canvas-export-button"/);
  assert.match(page, /onClick=\{\(\) => setPngExportOpen\(true\)\}/);
  assert.match(page, /className="png-export-dialog"/);
  assert.match(page, /\(\[1, 2, 4\] as const\)/);
  assert.match(page, /name="png-background"/);
  assert.match(page, /"transparent", "Sin fondo"/);
  assert.match(page, /querySelectorAll\("\.canvas-background-layer"\)/);
  assert.match(page, /link\.download = `\$\{safePngFileName\(currentName\)\}\.png`/);

  const toolbarRule = css.match(/\.canvas-toolbar-left\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(toolbarRule, /left:\s*12px/);
  assert.doesNotMatch(toolbarRule, /right:/);

  const badgeRule = css.match(/\.structure-family-badge\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(badgeRule, /right:\s*14px/);
});
