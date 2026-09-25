import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUIDED_TOUR_STEP_COUNT,
  GUIDED_TOUR_STORAGE_KEY,
  INITIAL_GUIDED_TOUR_STATE,
  guidedTourCopy,
  guidedTourControls,
  guidedTourIsSuspendedByOverlay,
  guidedTourReducer,
  guidedTourScrollDelta,
  guidedTourTargetForStep,
  placeGuidedTourCard,
  readGuidedTourDecision,
  writeGuidedTourDecision,
} from "../app/guided-tour-state.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function initialize(decision = null) {
  return guidedTourReducer(INITIAL_GUIDED_TOUR_STATE, { type: "initialize", decision });
}

test("first visit opens the seven-step guide, while Skip persists across reloads", () => {
  const storage = new MemoryStorage();
  const firstVisit = guidedTourReducer(INITIAL_GUIDED_TOUR_STATE, {
    type: "initialize",
    decision: readGuidedTourDecision(storage),
  });
  assert.deepEqual(firstVisit, {
    ready: true, open: true, step: 0, carbonPhase: "select", settingsOpenedFromTour: false, completion: "pending",
  });
  assert.equal(GUIDED_TOUR_STEP_COUNT, 7);

  const skipped = guidedTourReducer(firstVisit, { type: "dismiss" });
  assert.equal(skipped.open, false);
  assert.equal(skipped.completion, "skipped");
  assert.equal(writeGuidedTourDecision(storage, skipped.completion), true);
  assert.equal(storage.getItem(GUIDED_TOUR_STORAGE_KEY), "skipped");
  assert.equal(initialize(readGuidedTourDecision(storage)).open, false);
});

test("completing the last step persists completion and manual reopening restarts at the first step", () => {
  const storage = new MemoryStorage();
  let state = initialize();
  for (let step = 0; step < GUIDED_TOUR_STEP_COUNT - 1; step += 1) {
    state = guidedTourReducer(state, { type: "next" });
    assert.equal(state.step, step + 1);
    assert.equal(state.open, true);
  }
  state = guidedTourReducer(state, { type: "next" });
  assert.equal(state.open, false);
  assert.equal(state.completion, "completed");
  assert.equal(writeGuidedTourDecision(storage, state.completion), true);
  assert.equal(initialize(readGuidedTourDecision(storage)).open, false);

  state = guidedTourReducer(state, { type: "open" });
  assert.deepEqual(state, {
    ready: true, open: true, step: 0, carbonPhase: "select", settingsOpenedFromTour: false, completion: "completed",
  });
  state = guidedTourReducer(state, { type: "dismiss" });
  assert.equal(state.completion, "completed", "closing a manually reopened guide keeps the saved completion");
  assert.equal(guidedTourControls("en").open, "How to use?");
});

test("Previous and Next navigate within bounds, and closed guides ignore navigation", () => {
  let state = initialize();
  state = guidedTourReducer(state, { type: "previous" });
  assert.equal(state.step, 0);
  state = guidedTourReducer(state, { type: "next" });
  state = guidedTourReducer(state, { type: "previous" });
  assert.equal(state.step, 0);
  const closed = guidedTourReducer(state, { type: "dismiss" });
  assert.equal(guidedTourReducer(closed, { type: "next" }), closed);
});

test("localized copy can change without resetting the current guide step", () => {
  const state = guidedTourReducer(guidedTourReducer(initialize(), { type: "next" }), { type: "next" });
  const stepBeforeLanguageChange = state.step;
  assert.match(guidedTourCopy("es", state.step).title, /nombre IUPAC/i);
  assert.match(guidedTourCopy("en", state.step).title, /IUPAC name/i);
  assert.equal(state.step, stepBeforeLanguageChange);
  assert.deepEqual(guidedTourControls("es").progress(state.step), "Paso 3 de 7");
  assert.deepEqual(guidedTourControls("en").progress(state.step), "Step 3 of 7");
});

test("fragment guidance names mouse, click, keyboard and touch, and offers the existing acetone example explicitly", () => {
  const spanish = guidedTourCopy("es", 4, { hasInteractiveName: true });
  const english = guidedTourCopy("en", 4, { hasInteractiveName: false });
  assert.match(spanish.description, /nombre IUPAC real/i);
  assert.match(spanish.description, /mouse.*clic, teclado y toque/i);
  assert.match(spanish.followUp, /destaca el mismo fragmento/i);
  assert.match(english.followUp, /propanone example/i);
  assert.equal(english.action, "Try the propanone example");
  assert.match(english.exampleNote, /Undo/);
  const acetoneAlreadyLoaded = guidedTourCopy("en", 4, { acetoneAlreadyLoaded: true });
  assert.equal(acetoneAlreadyLoaded.action, undefined);
  assert.equal(acetoneAlreadyLoaded.exampleNote, undefined);
});

test("guide access and step targets remain localized and point at the real learning path", () => {
  assert.deepEqual(Array.from({ length: GUIDED_TOUR_STEP_COUNT }, (_, index) => guidedTourTargetForStep(index)), [
    "carbon", "bond-controls", "name", "reasoning", "name", "settings", "tools",
  ]);
  assert.equal(guidedTourCopy("es", 3).action, "Mostrar la explicación");
  assert.equal(guidedTourCopy("en", 3).action, "Show the explanation");
  assert.equal(guidedTourControls("es").skip, "Omitir");
  assert.equal(guidedTourControls("en").previous, "Previous");
  assert.equal(guidedTourControls("es").finish, "Terminar");
});

test("the derived-name step offers an explicit propanone example when no explanation can be shown", () => {
  const spanish = guidedTourCopy("es", 3, { needsExampleForReasoning: true });
  const english = guidedTourCopy("en", 3, { needsExampleForReasoning: true });
  assert.equal(spanish.exampleAction, "Cargar propanona y mostrar su explicación");
  assert.match(spanish.description, /ejemplo de propanona/i);
  assert.match(spanish.description, /Deshacer/);
  assert.equal(english.exampleAction, "Load propanone and show its explanation");
  assert.match(english.description, /Undo/);
  assert.equal(guidedTourCopy("es", 3, { needsExampleForReasoning: false }).action, "Mostrar la explicación");
});

test("the carbon step separates real carbon selection from using the actual Add C direction pad", () => {
  const spanish = guidedTourCopy("es", 0, { isPristineInitialMolecule: true, carbonPhase: "select" });
  const english = guidedTourCopy("en", 0, { isPristineInitialMolecule: true, carbonPhase: "select" });
  assert.match(spanish.description, /CH₄.*Haz clic para seleccionarlo/);
  assert.match(english.description, /CH₄.*Click it to select it/);
  assert.match(guidedTourCopy("es", 0, { carbonPhase: "select" }).description, /carbono del canvas para seleccionarlo/);
  assert.match(guidedTourCopy("es", 0, { carbonPhase: "add" }).description, /flechas reales «Añadir C»/);
  assert.match(guidedTourCopy("en", 0, { carbonPhase: "add" }).description, /real Add C arrows/);
  assert.equal(guidedTourTargetForStep(0, "select"), "carbon");
  assert.equal(guidedTourTargetForStep(0, "add"), "add-carbon");
  assert.equal(guidedTourCopy("en", 0).exampleAction, undefined);
});

test("selection only enters the carbon-add substep; only the next valid carbon addition advances once", () => {
  let state = initialize();
  assert.equal(guidedTourReducer(state, { type: "carbon-added" }), state, "an add without a user selection is ignored");
  state = guidedTourReducer(state, { type: "carbon-selected" });
  assert.equal(state.step, 0, "selection does not complete the main step");
  assert.equal(state.carbonPhase, "add");
  const selected = state;
  assert.equal(guidedTourReducer(state, { type: "carbon-selected" }), selected, "repeated selection is idempotent");
  state = guidedTourReducer(state, { type: "carbon-added" });
  assert.equal(state.step, 1);
  assert.equal(state.carbonPhase, "select");
  assert.equal(guidedTourReducer(state, { type: "carbon-added" }), state, "duplicate or stale add events cannot skip another step");
});

test("manual Next can skip the carbon substeps and the other guided requirements", () => {
  let state = guidedTourReducer(initialize(), { type: "carbon-selected" });
  assert.equal(state.carbonPhase, "add");
  state = guidedTourReducer(state, { type: "next" });
  assert.equal(state.step, 1);
  assert.equal(state.carbonPhase, "select");
  state = guidedTourReducer(state, { type: "next" });
  assert.equal(state.step, 2, "manual Next remains available without a bond-order commit");
});

test("automatic step changes are gated by the active step and do not remove manual navigation", () => {
  let state = initialize();
  assert.equal(guidedTourReducer(state, { type: "bond-order-changed" }), state);
  state = guidedTourReducer(state, { type: "next" });
  assert.equal(state.step, 1);
  state = guidedTourReducer(state, { type: "bond-order-changed" });
  assert.equal(state.step, 2);
  assert.equal(guidedTourReducer(state, { type: "bond-order-changed" }), state);
  state = guidedTourReducer(state, { type: "previous" });
  assert.equal(state.step, 1);
  state = guidedTourReducer(state, { type: "next" });
  assert.equal(state.step, 2);
});

test("reasoning auto-advances only on opening its explanation or activating a real linked fragment", () => {
  let state = initialize();
  for (let step = 0; step < 3; step += 1) state = guidedTourReducer(state, { type: "next" });
  assert.equal(state.step, 3);
  assert.equal(guidedTourReducer(state, { type: "reasoning-fragment-activated" }), state);
  state = guidedTourReducer(state, { type: "reasoning-opened" });
  assert.equal(state.step, 4);
  assert.equal(guidedTourReducer(state, { type: "reasoning-opened" }), state);
  state = guidedTourReducer(state, { type: "reasoning-fragment-activated" });
  assert.equal(state.step, 5);
  assert.equal(guidedTourReducer(state, { type: "reasoning-fragment-activated" }), state);
});

test("Settings advances only after it was opened from the Settings guide step and then closed", () => {
  let state = initialize();
  state = guidedTourReducer(state, { type: "settings-opened", fromGuidedStep: true });
  assert.equal(state.settingsOpenedFromTour, false, "an early Settings visit is not attributed to step 6");
  state = guidedTourReducer(state, { type: "settings-closed" });
  assert.equal(state.step, 0);
  for (let step = 0; step < 5; step += 1) state = guidedTourReducer(state, { type: "next" });
  state = guidedTourReducer(state, { type: "settings-opened", fromGuidedStep: false });
  state = guidedTourReducer(state, { type: "settings-closed" });
  assert.equal(state.step, 5, "an external Settings visit does not advance the guide");
  state = guidedTourReducer(state, { type: "settings-opened", fromGuidedStep: true });
  assert.equal(state.settingsOpenedFromTour, true);
  state = guidedTourReducer(state, { type: "settings-closed" });
  assert.equal(state.step, 6);
  assert.equal(state.settingsOpenedFromTour, false);
});

test("opening an Examples or By name tool may complete the final guide step, while manual Finish remains available", () => {
  let state = initialize();
  for (let step = 0; step < GUIDED_TOUR_STEP_COUNT - 1; step += 1) state = guidedTourReducer(state, { type: "next" });
  assert.equal(guidedTourReducer(state, { type: "tools-opened" }).completion, "completed");
  assert.equal(guidedTourReducer(state, { type: "tools-opened" }).open, false);
  state = guidedTourReducer(state, { type: "open" });
  for (let step = 0; step < GUIDED_TOUR_STEP_COUNT - 1; step += 1) state = guidedTourReducer(state, { type: "next" });
  state = guidedTourReducer(state, { type: "next" });
  assert.equal(state.open, false, "manual Finish still completes the guide");
  assert.equal(state.completion, "completed");
});

test("the bond step distinguishes the order picker for new bonds from clicking an existing canvas bond", () => {
  const spanish = guidedTourCopy("es", 1).description;
  const english = guidedTourCopy("en", 1).description;
  assert.match(spanish, /Antes de añadir un carbono.*Simple, Doble o Triple/);
  assert.match(spanish, /Para cambiar un enlace del canvas, haz clic o actívalo/);
  assert.match(english, /Before adding a carbon.*Single, Double, or Triple/);
  assert.match(english, /click or activate that bond/);
});

test("settings guidance matches the real accessibility and keyboard-shortcut location in both languages", () => {
  const spanish = guidedTourCopy("es", 5);
  const english = guidedTourCopy("en", 5);
  assert.match(spanish.description, /Configuración.*Historial y Guardados/);
  assert.match(spanish.description, /H implícitos, numeración, resaltado de sustituyentes/);
  assert.match(spanish.description, /Accesibilidad y los atajos de teclado/);
  assert.match(english.description, /Settings.*History and Saved/);
  assert.match(english.description, /implicit hydrogens, numbering, substituent highlighting/);
  assert.match(english.description, /Accessibility options and keyboard shortcuts/);
});

test("context cards stay beside their target and inside the viewport above the fixed name dock", () => {
  const desktopAnchor = { top: 230, right: 410, bottom: 290, left: 350 };
  const desktop = placeGuidedTourCard({
    anchor: desktopAnchor,
    card: { width: 360, height: 220 },
    viewport: { width: 1366, height: 720 },
    preferHorizontal: true,
  });
  assert.equal(desktop.side, "right");
  assert.ok(desktop.left >= desktopAnchor.right);
  assert.ok(desktop.left + 360 <= 1354);
  assert.ok(desktop.top >= 12 && desktop.top + 220 <= 650);

  const mobileAnchor = { top: 780, right: 270, bottom: 810, left: 120 };
  const mobile = placeGuidedTourCard({
    anchor: mobileAnchor,
    card: { width: 360, height: 190 },
    viewport: { width: 390, height: 844 },
    dockHeight: 58,
  });
  assert.equal(mobile.side, "above");
  assert.ok(mobile.left >= 12 && mobile.left + 360 <= 378);
  assert.ok(mobile.top + 190 <= mobileAnchor.top - 10);
  assert.ok(mobile.top >= 12);
});

test("guided scrolling leaves visible targets alone and brings off-screen targets into the usable viewport", () => {
  assert.equal(guidedTourScrollDelta({ anchor: { top: 100, bottom: 200 }, viewportHeight: 720 }), 0);
  assert.ok(guidedTourScrollDelta({ anchor: { top: 600, bottom: 700 }, viewportHeight: 720 }) > 0);
  assert.ok(guidedTourScrollDelta({ anchor: { top: -40, bottom: 60 }, viewportHeight: 720 }) < 0);
  assert.equal(guidedTourScrollDelta({ anchor: { top: 422, bottom: 475 }, viewportHeight: 844, targetTop: 422 }), 0);
  assert.equal(guidedTourScrollDelta({ anchor: { top: 531, bottom: 584 }, viewportHeight: 844, targetTop: 422 }), 109);
});

test("the guide is suspended while another modal or the expanded canvas is active", () => {
  const closed = { historyOpen: false, settingsOpen: false, exportOpen: false, canvasExpanded: false };
  assert.equal(guidedTourIsSuspendedByOverlay(closed), false);
  for (const key of Object.keys(closed)) {
    assert.equal(guidedTourIsSuspendedByOverlay({ ...closed, [key]: true }), true, key);
  }
});

test("blocked storage does not crash first-visit or dismissal behavior", () => {
  const blockedStorage = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
  };
  let state = guidedTourReducer(INITIAL_GUIDED_TOUR_STATE, {
    type: "initialize",
    decision: readGuidedTourDecision(blockedStorage),
  });
  assert.equal(state.open, true);
  state = guidedTourReducer(state, { type: "dismiss" });
  assert.equal(state.open, false);
  assert.equal(state.completion, "skipped");
  assert.equal(writeGuidedTourDecision(blockedStorage, state.completion), false);
});

test("guide navigation is independent of the current molecule, undo stack and history", () => {
  const workspace = {
    molecule: { atoms: [{ id: 4, element: "C" }, { id: 7, element: "O" }], bonds: [[4, 7, 2]] },
    undo: [{ atoms: [{ id: 1, element: "C" }], bonds: [] }],
    history: [{ id: "entry-1", name: "ethanal" }],
  };
  const before = structuredClone(workspace);
  let state = initialize();
  state = guidedTourReducer(state, { type: "next" });
  state = guidedTourReducer(state, { type: "open" });
  state = guidedTourReducer(state, { type: "dismiss" });
  assert.deepEqual(workspace, before);
  assert.equal(state.open, false);
});
