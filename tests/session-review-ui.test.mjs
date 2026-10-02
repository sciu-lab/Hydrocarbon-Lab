import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { buildSessionReview, buildCompletedSessionReview } from "../app/session-review.ts";
import { reconstructSessionReviewQuestion } from "../app/session-review-question.ts";
import { practiceReviewFixture, examReviewFixture } from "./helpers/session-review-fixtures.mjs";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeReviewer } from "../app/practice-review.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer, updatePracticeStructure,
  submitPracticeAnswer, submitPracticeStructure, endPractice } from "../app/practice-session.ts";
import { uiText } from "../app/i18n.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

let chemistry, ui, generate, reviewer, evaluate;
before(async () => {
  chemistry = await loadExerciseChemistry(); ui = await chemistry.loadModule("/app/session-review-dashboard.tsx");
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles), createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  reviewer = createPracticeReviewer(chemistry.engine); evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
});
after(async () => chemistry?.close());
const noop = () => {};
const renderStructure = (molecule, label, width, height, highlights) => React.createElement(chemistry.engine.MoleculeHistoryPreview,
  { molecule, ariaLabel: label, width, height, practiceView: true, reviewHighlights: highlights });
const dashboard = (model, language = "en", other = {}) => renderToStaticMarkup(React.createElement(ui.SessionReviewDashboard,
  { model, language, categoryLabel: (id) => uiText(language, id === "alcohol" ? "Alcoholes" : "Alcanos"), renderStructure, review: reviewer, generate, ...other }));
const completeProps = { language: "en", categoryLabel: (id) => id, renderStructure, review: reviewer, generate,
  onConfigure: noop, onBackToLab: noop, onCorrectMistakes: noop };
for (const language of ["es", "en"]) test(`dashboard ${language}: accessible metrics, canonical breakdowns, all filters, list and metadata; no eager chemistry`, () => {
  const fixture = practiceReviewFixture(), model = buildSessionReview(fixture).model, before = JSON.stringify(fixture);
  let calls = 0; const html = dashboard(model, language, { generate: () => { calls++; throw new Error("Eager generation"); } });
  assert.equal(calls, 0); assert.doesNotMatch(html, /<svg|practice-build-editor/);
  assert.equal((html.match(/<select/g) ?? []).length, 3); assert.equal((html.match(/id="session-review-question-/g) ?? []).length, 6);
  for (const key of ["Revisión de sesión", "Correcta en el primer intento", "Corregida", "Sin resolver", "Revisar pregunta", "Historial de intentos"].slice(0, -1))
    assert.ok(html.includes(uiText(language, key)), key);
  assert.ok(html.includes("5 / 6")); assert.ok(html.includes(language === "es" ? "83,3" : "83.3"));
  assert.match(html, /<caption>/); assert.match(html, /<details/); assert.match(html, /<summary/);
  assert.match(html, /scope="row"/); assert.ok(html.includes(model.seed));
  assert.equal(JSON.stringify(fixture), before);
});
test("Exam dashboard has only correct/incorrect statuses and no mastery/correction controls", () => {
  const model = buildSessionReview(examReviewFixture()).model, html = dashboard(model);
  assert.doesNotMatch(html, /Mastery|mastery|Corrected|Unresolved|Correction|CORRECTED|UNRESOLVED|Correct mistakes/);
  assert.ok(html.includes("Incorrect")); assert.ok(html.includes("Correct"));
});
for (const type of ["naming", "multiple-choice", "build"]) test(`${type} read-only detail preserves raw answer, history, timing, localized reference and existing Reviewer`, () => {
  let state = startPractice(createPracticeConfig(["alcohol"], 1, "en", "READONLY-DETAIL", [type]), generate);
  state = markPracticeQuestionAvailable(state, { monotonicMs: 0, wallTimeMs: 1700000000000 });
  state = type === "build" ? submitPracticeStructure(updatePracticeStructure(state, moleculeFromSmiles("C").molecule), "en",
    { monotonicMs: 500, wallTimeMs: 1700000000500 }, evaluate)
    : submitPracticeAnswer(updatePracticeAnswer(state, type === "naming" ? " wrong raw answer " : state.question.options.find((o) => !o.correct).id), "en",
      { monotonicMs: 500, wallTimeMs: 1700000000500 });
  const completed = endPractice(state), before = structuredClone(completed), entry = buildCompletedSessionReview(completed).model.questions[0];
  const result = reconstructSessionReviewQuestion(completed.config, entry, generate); assert.equal(result.ok, true);
  const model = reviewer(result.detail.question, entry.firstAttempt);
  for (const language of ["es", "en"]) {
    const html = renderToStaticMarkup(React.createElement(ui.SessionQuestionDetail, { detail: result.detail, attemptNumber: 1,
      language, renderStructure, reviewerModel: model, activeStep: model.steps[0].id,
      onAttempt: noop, onOpenReviewer: noop, onStep: noop, onCloseReviewer: noop, onClose: noop, onNext: noop }));
    assert.ok(html.includes(result.detail.question.reference.names[language]));
    assert.ok(html.includes(uiText(language, "Historial de intentos"))); assert.ok(html.includes(uiText(language, "Revisión detallada")));
    assert.ok(html.includes(uiText(language, "Volver a la pregunta"))); assert.ok(html.includes(uiText(language, "Volver al resumen de sesión")));
    assert.doesNotMatch(html, /<input|<textarea|contenteditable|practice-build-editor|Check answer|Check structure/);
    if (type === "naming") assert.match(html, /<pre> wrong raw answer <\/pre>/);
    if (type === "multiple-choice") {
      assert.ok(html.includes(uiText(language, "Opción seleccionada"))); assert.ok(html.includes(uiText(language, "Opción correcta")));
      const ids = [...html.matchAll(/data-option-id="([^"]+)"/g)].map((m) => m[1]); assert.equal(ids.length, 4);
    }
    if (type === "build") { assert.ok(html.includes(uiText(language, "Tu estructura"))); assert.ok(html.includes(uiText(language, "Estructura de referencia"))); }
  }
  assert.deepEqual(completed, before);
});
test("incomplete data shows a safe localized exit without fabricated metrics or structures", () => {
  const f = practiceReviewFixture(); f.attempts.push({ ...f.attempts[0] });
  const html = renderToStaticMarkup(React.createElement(ui.CompletedSessionReview, { ...completeProps,
    state: { phase: "COMPLETE", ...f } }));
  assert.match(html, /role="alert"/); assert.match(html, /Session review data is incomplete/);
  assert.doesNotMatch(html, /<svg|practice-metric-grid|session-review-question-/);
});
test("shared lifecycle gate renders nothing before successful Exam grading, including atomic failure", () => {
  for (const state of [{ phase: "CONFIG" }, { phase: "EXAM_QUESTION" }, { phase: "EXAM_REVIEW", attempts: [], gradingError: true, locked: true }]) {
    assert.equal(renderToStaticMarkup(React.createElement(ui.CompletedSessionReview, { ...completeProps, state })), "");
  }
});
test("new dashboard labels and status/type maps have unique English translations", () => {
  const source = readFileSync("app/session-review-dashboard.tsx", "utf8"), dictionary = readFileSync("app/i18n.ts", "utf8");
  const labels = [...source.matchAll(/\bt\("([^"\n]+)"\)/g)].map((m) => m[1]);
  labels.push("Correcta en el primer intento", "Corregida", "Sin resolver", "Incorrecto", "Volver a la pregunta", "Siguiente pregunta",
    "No se pudo reconstruir esta pregunta. Tus resultados se conservan; vuelve a pulsar Revisar pregunta para reintentar.",
    "No se pudo abrir la revisión detallada. Tus resultados se conservan.");
  for (const label of new Set(labels)) { assert.notEqual(uiText("en", label), label, label); assert.equal(dictionary.split(JSON.stringify(label) + ":").length - 1, 1, label); }
});
test("new analytics, reconstruction, dashboard and existing integration typecheck strictly", () => {
  const files = ["app/session-review.ts", "app/session-review-question.ts", "app/session-review-dashboard.tsx", "app/practice-summary.tsx", "app/practice-review-panel.tsx", "app/practice-panel.tsx", "app/exam-panel.tsx"];
  const program = ts.createProgram(files, { strict: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true, jsx: ts.JsxEmit.ReactJSX });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => !d.file || /(?:session-review(?:-question|-dashboard)?|practice-summary|practice-review-panel|practice-panel|exam-panel|i18n)\.(?:ts|tsx)$/.test(d.file.fileName));
  assert.deepEqual(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});
test("contained responsive styles and existing light/dark highlight contracts remain present", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.session-review-table\s*\{[^}]*overflow-x: auto/);
  assert.match(css, /\.session-review-filters[^}]*minmax\(min\(100%/);
  assert.match(css, /\.session-dashboard pre[^}]*white-space: pre-wrap/);
  assert.match(css, /session-dashboard select:focus-visible/);
  assert.match(css, /review-bond-halo/); assert.match(css, /review-atom-ring/);
});
