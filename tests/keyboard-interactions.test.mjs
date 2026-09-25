import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the actual centralized listener with action spies, without a DOM dependency.
const page = fs.readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const source = page.slice(page.indexOf("    const handleGlobalShortcut ="), page.indexOf('    window.addEventListener("keydown", handleGlobalShortcut)'));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(overrides = {}) {
  const calls = [];
  const context = {
    historyOpen: false, settingsOpen: false, pngExportOpen: false, canvasExpanded: false,
    placementTool: null, showRingPalette: false, showAlkylPalette: false, showFunctionalPalette: false,
    lastToolPointer: { current: null }, selectedId: 1, selectedFusionBond: null, setFusionSelection: () => {}, molecule: { rings: [] }, previousSelectedId: { current: null },
    AROMATIC_TEMPLATES: [{ id: "benzene" }], CYCLE_TEMPLATES: [3,4,5,6,7,8].map(size => ({ size })),
    ALKYL_TEMPLATES: ["methyl", "ethyl", "propyl"].map(id => ({ id })),
  };
  for (const name of ["setToolPointer", "setPlacementTool", "setSelectedId", "setShowRingPalette", "setShowAlkylPalette", "setShowFunctionalPalette", "setRingInsertMode", "setPngExportOpen", "setCanvasExpanded", "setSettingsOpen", "removeSelectedWithKeyboard", "loadRingTemplate", "addAlkylGroup", "addCarbon", "cycleBondOrder", "undo", "redo"]) {
    context[name] = (...args) => {
      calls.push([name, ...args]);
      return name === "cycleBondOrder" ? false : undefined;
    };
  }
  context.addCarbonFromArrow = (...args) => calls.push(["addCarbon", ...args]);
  context.dispatchGuidedTour = action => calls.push(["dispatchGuidedTour", action]);
  context.changeBondOrderFromInput = (...args) => {
    const committed = context.cycleBondOrder(...args);
    if (committed) context.dispatchGuidedTour({ type: "bond-order-changed" });
    return committed;
  };
  Object.assign(context, overrides);
  const listener = new Function("context", `with (context) { ${compiled}; return handleGlobalShortcut; }`)(context);
  const press = (key, options = {}) => {
    let prevented = false;
    listener({ key, target: { closest: () => null }, preventDefault: () => { prevented = true; }, ...options });
    return prevented;
  };
  return { calls, press, context };
}

test("construction keys route to the existing templates and actions", () => {
  for (const [key, id] of [["m", "methyl"], ["e", "ethyl"], ["p", "propyl"]]) {
    const h = harness(); assert.equal(h.press(key), true);
    assert.deepEqual(h.calls.at(-1), ["addAlkylGroup", { id }]);
  }
  const h = harness(); h.press("B");
  assert.deepEqual(h.calls.at(-1), ["setPlacementTool", { kind: "ring", template: { id: "benzene" }, mode: "replace" }]);
  const empty = harness({ selectedId: null }); empty.press("m");
  assert.deepEqual(empty.calls.at(-1), ["setPlacementTool", { kind: "alkyl", template: { id: "methyl" } }]);
});

test("arrow keys route through the shared carbon-placement action", () => {
  for (const [key, direction] of [
    ["ArrowRight", [1, 0]],
    ["ArrowLeft", [-1, 0]],
    ["ArrowUp", [0, -1]],
    ["ArrowDown", [0, 1]],
  ]) {
    const h = harness();
    assert.equal(h.press(key), true);
    assert.deepEqual(h.calls.at(-1), ["addCarbon", ...direction]);
  }
});

test("typing, composition, modifiers, repeats and dialogs never trigger construction", () => {
  for (const options of [
    { target: { closest: () => ({}) } }, { target: { closest: () => null, isContentEditable: true } },
    { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true },
    { isComposing: true }, { repeat: true }, { defaultPrevented: true },
  ]) {
    const h = harness(); assert.equal(h.press("m", options), false); assert.deepEqual(h.calls, []);
  }
  for (const dialog of ["settingsOpen", "historyOpen", "pngExportOpen"]) {
    const h = harness({ [dialog]: true }); h.press("b"); assert.deepEqual(h.calls, []);
  }
  const h = harness(); assert.equal(h.press("r", { ctrlKey: true }), false); assert.deepEqual(h.calls, []);
});

test("ring palette handles size keys before focused bond keys; Escape cancels first", () => {
  for (let size = 3; size <= 8; size++) {
    const h = harness({ showRingPalette: true }); h.press(String(size));
    assert.deepEqual(h.calls.at(-1), ["loadRingTemplate", { size }]);
  }
  const h = harness({ placementTool: { kind: "ring" }, canvasExpanded: true }); h.press("Escape");
  assert.deepEqual(h.calls[0], ["setPlacementTool", null]);
  assert.equal(h.calls.some(([name]) => name === "setCanvasExpanded"), false);
});

test("bond numbers require focus; Backspace is guarded; undo uses existing history", () => {
  const h = harness(); assert.equal(h.press("2"), false);
  assert.equal(h.press("2", { target: { closest: selector => selector === "[data-bond-a]" ? { dataset: { bondA: "1", bondB: "2" } } : null } }), true);
  assert.deepEqual(h.calls.at(-1), ["cycleBondOrder", 1, 2, 2]);
  const empty = harness({ selectedId: null }); assert.equal(empty.press("Backspace"), true); assert.deepEqual(empty.calls, []);
  const undo = harness(); undo.press("z", { ctrlKey: true }); assert.deepEqual(undo.calls, [["undo"]]);
});

test("a focused bond number advances the guide only when the bond-order edit commits", () => {
  const target = { target: { closest: selector => selector === "[data-bond-a]" ? { dataset: { bondA: "1", bondB: "2" } } : null } };
  const committedCycles = [];
  const committed = harness({ cycleBondOrder: (...args) => { committedCycles.push(args); return true; } });
  assert.equal(committed.press("2", target), true);
  assert.deepEqual(committedCycles, [[1, 2, 2]]);
  assert.deepEqual(committed.calls, [["dispatchGuidedTour", { type: "bond-order-changed" }]]);
  const rejected = harness();
  assert.equal(rejected.press("2", target), true);
  assert.deepEqual(rejected.calls, [["cycleBondOrder", 1, 2, 2]]);
});
