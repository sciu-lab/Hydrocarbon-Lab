import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createExerciseChemistryOracles } from "../app/exercise-chemistry-oracles.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer, submitPracticeAnswer,
  endPractice, startPracticeCorrections, nextPracticeQuestion, localizePracticeState } from "../app/practice-session.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { calculatePracticeMastery } from "../app/practice-corrections.ts";
let server, engine, ui, panel, generate, review;
before(async () => {
  server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, logLevel: "error",
    appType: "custom", plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false } });
  engine = await server.ssrLoadModule("/app/page.tsx"); ui = await server.ssrLoadModule("/app/practice-panel.tsx");
  panel = await server.ssrLoadModule("/app/practice-review-panel.tsx");
  generate = createRestrictedChemicalGenerator(createExerciseChemistryOracles(engine)); review = createPracticeReviewer(engine);
});
after(async () => { await server?.close(); });
const noop = () => {};
const actions = { answer: noop, check: noop, next: noop, end: noop, retry: noop, configure: noop, back: noop, correctMistakes: noop };
const renderStructure = (molecule, label, width, height, highlights) => React.createElement(engine.MoleculeHistoryPreview,
  { molecule, ariaLabel: label, width, height, practiceView: true, reviewHighlights: highlights });
const time = (n) => ({ monotonicMs: n, wallTimeMs: 1700000000000 + n });
const submit = (s, answer, language = "en") => submitPracticeAnswer(updatePracticeAnswer(markPracticeQuestionAvailable(s, time(1000)), answer), language, time(5000));
function htmlFor(state, language = "en") {
  return renderToStaticMarkup(React.createElement(ui.PracticeSessionView,
    { state: localizePracticeState(state, language), language, review, renderStructure, actions }));
}
function reviewHTML(model, language, activeStep = model.steps[0].id) {
  return renderToStaticMarkup(React.createElement(panel.PracticeReviewPanel,
    { model, language, activeStep, onSelectStep: noop, onClose: noop, onNext: noop }));
}

test("both feedback modes offer optional Review answer for correct/incorrect submissions and hide walkthroughs before opening", () => {
  const question = startPractice(createPracticeConfig(["alcohol"], 5, "en", "REVIEW-UI"), generate);
  assert.doesNotMatch(htmlFor(question), /Review answer|Detailed review/);
  for (const answer of ["wrong", question.question.reference.names.en]) {
    const feedback = submit(question, answer);
    const html = htmlFor(feedback);
    assert.match(html, /Review answer/); assert.match(html, /Next/);
    assert.doesNotMatch(html, /practice-review-steps|Detailed review/);
  }
  const correction = startPracticeCorrections(endPractice(submit(question, "wrong")), generate);
  for (const answer of ["wrong", correction.question.reference.names.en]) assert.match(htmlFor(submit(correction, answer)), /Review answer/);
});

test("localized panel exposes the same steps/diagnosis, frozen submission and active step in ES/EN", () => {
  const question = startPractice(createPracticeConfig(["ez"], 5, "en", "REVIEW-UI"), generate);
  const opposite = question.question.reference.names.en.replace(/(\d+)([EZ])/, (_, n, d) => n + (d === "E" ? "Z" : "E"));
  const feedback = submit(question, opposite), snapshot = structuredClone(feedback);
  const model = review(feedback.question, feedback.attempts.at(-1));
  const es = reviewHTML(model, "es", "assembly"), en = reviewHTML(model, "en", "assembly");
  assert.match(es, /Revisión detallada/); assert.match(en, /Detailed review/);
  assert.match(es, /Volver al feedback/); assert.match(en, /Back to feedback/);
  assert.match(es, /data-issue-code="WRONG_EZ_DESCRIPTOR"/); assert.match(en, /data-issue-code="WRONG_EZ_DESCRIPTOR"/);
  assert.ok(es.includes(model.reference.names.es)); assert.ok(en.includes(model.reference.names.en));
  assert.deepEqual([...es.matchAll(/data-review-step="([^"]+)"/g)].map((m) => m[1]), [...en.matchAll(/data-review-step="([^"]+)"/g)].map((m) => m[1]));
  assert.match(es, /aria-pressed="true"/); assert.match(en, /aria-pressed="true"/);
  assert.deepEqual(feedback, snapshot);
});

test("step, Close and Next buttons invoke their respective callbacks without submitting attempts", () => {
  const question = startPractice(createPracticeConfig(["alcohol"], 5, "en", "REVIEW-UI"), generate);
  const feedback = submit(question, question.question.reference.names.en);
  const model = review(feedback.question, feedback.attempts.at(-1));
  let selected, closed = 0, advanced = 0;
  const tree = panel.PracticeReviewPanel({ model, language: "en", activeStep: "parent",
    onSelectStep: (id) => { selected = id; }, onClose: () => { closed++; }, onNext: () => { advanced++; } });
  const buttons = [];
  const visit = (node) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === "object") {
      if (node.type === "button") buttons.push(node);
      visit(node.props?.children);
    }
  };
  visit(tree);
  buttons[1].props.onClick(); assert.equal(selected, model.steps[1].id);
  buttons.at(-2).props.onClick(); assert.equal(closed, 1);
  buttons.at(-1).props.onClick(); assert.equal(advanced, 1);
  assert.equal(feedback.attempts.length, 1);
});

test("SVG highlights and numbering use semantic IDs for every review step without changing graph or stroke endpoints", () => {
  for (const category of ["alkane", "alcohol", "ketone", "ester", "ether", "aromatic", "alkene", "ez"]) {
    const state = startPractice(createPracticeConfig([category], 5, "en", "REVIEW-2"), generate);
    const feedback = submit(state, state.question.reference.names.en);
    const snapshot = structuredClone(feedback.question);
    const model = review(feedback.question, feedback.attempts.at(-1));
    const projection = (html) => [...html.matchAll(/<(?:g|line)\b([^>]*(?:data-atom-id|data-bond-start)[^>]*)>/g)].map((match) =>
      match[1].replace(/\sdata-review-highlight="true"/g, ""));
    const baseline = projection(renderToStaticMarkup(renderStructure(feedback.question.molecule, "Review structure", 320, 300)));
    for (const step of model.steps) {
      const html = renderToStaticMarkup(renderStructure(feedback.question.molecule, "Review structure", 320, 300, step));
      assert.deepEqual(projection(html), baseline, "highlighting changes no atom transform or bond endpoint/order");
      const atomIds = [...html.matchAll(/<g[^>]*data-atom-id="(\d+)"[^>]*data-review-highlight="true"/g)].map((m) => +m[1]).sort((a, b) => a - b);
      const bondIds = [...new Set([...html.matchAll(/<line[^>]*data-bond-start="(\d+)"[^>]*data-bond-end="(\d+)"[^>]*data-bond-order="\d+"[^>]*data-review-highlight="true"/g)].map((m) => reviewBondId(+m[1], +m[2])))].sort();
      assert.deepEqual(atomIds, step.highlightAtomIds);
      assert.deepEqual(bondIds, step.highlightBondIds);
      assert.equal((html.match(/class="practice-review-atom-ring"/g) ?? []).length, step.highlightAtomIds.length);
      assert.equal((html.match(/class="practice-review-bond-halo"/g) ?? []).length, step.highlightBondIds.length);
      assert.equal(html, renderToStaticMarkup(renderStructure(localizePracticeState(feedback, "es").question.molecule,
        "Review structure", 320, 300, step)), "locale preserves highlighted geometry and atom labels");
      if (step.kind === "numbering") assert.equal([...html.matchAll(/class="practice-review-locant"/g)].length, step.numbering.length);
    }
    assert.deepEqual(feedback.question, snapshot);
  }
});

test("PRACTICE-005 accepted spelling renders CORRECT without an issue or accent warning", () => {
  const question = startPractice(createPracticeConfig(["carboxylic-acid"], 5, "es", "PRACTICE-005-accent-reference"), generate);
  const feedback = submit(question, question.question.reference.names.es.replace("ácido", "acido"), "es");
  const model = review(feedback.question, feedback.attempts.at(-1)), html = reviewHTML(model, "es");
  assert.match(html, /data-review-status="CORRECT"/); assert.match(html, /✓ Correcto/);
  assert.doesNotMatch(html, /data-issue-code|MISSING_ACCENT|FORMATTING_ERROR|tilde|SPELLING_ERROR/);
});

test("attempts 1/2/3 reuse the same reviewer and opening/selecting/localizing/closing does not alter initial metrics, timer or mastery", () => {
  const question = startPractice(createPracticeConfig(["alcohol"], 5, "en", "REVIEW-UI"), generate);
  let feedback = submit(question, "wrong");
  const initialMetrics = calculatePracticeMetrics(feedback.attempts);
  for (let number = 1; number <= 3; number++) {
    const before = structuredClone(feedback);
    const mastery = calculatePracticeMastery(feedback.attempts);
    const model = review(feedback.question, feedback.attempts.at(-1));
    assert.equal(model.attemptNumber, number);
    reviewHTML(model, "es", model.steps.at(-1).id); reviewHTML(model, "en", model.steps[0].id);
    assert.deepEqual(feedback, before); assert.deepEqual(calculatePracticeMastery(feedback.attempts), mastery);
    assert.deepEqual(calculatePracticeMetrics(feedback.attempts), initialMetrics);
    if (number < 3) {
      const correction = startPracticeCorrections(endPractice(feedback), generate);
      feedback = submit(correction, number === 2 ? correction.question.reference.names.en : "wrong");
    }
  }
  assert.equal(nextPracticeQuestion(feedback, generate).phase, "CORRECTION_SUMMARY");
});
