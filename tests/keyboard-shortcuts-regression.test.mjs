import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("the canvas has no listener for the retired drawing shortcuts", () => {
  assert.doesNotMatch(page, /handleCanvasKeyDown/);
  assert.doesNotMatch(page, /onKeyDown=\{handleCanvasKeyDown\}/);
  assert.doesNotMatch(page, /\["arrowleft",\s*"arrowright",\s*"arrowup",\s*"arrowdown"/);
  assert.doesNotMatch(page, /Atajo de dibujo:/);
});

test("the global listener retains only the requested keyboard actions", () => {
  ["z", "y", "r", "s", "i", "n", "1", "2", "3", "4"].forEach((key) => {
    assert.match(page, new RegExp(`key === "${key}"`));
  });
  assert.match(page, /event\.key === "Delete"/);
  assert.match(page, /event\.key === "Escape"/);
});
