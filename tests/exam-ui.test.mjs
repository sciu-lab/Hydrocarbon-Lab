import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeReviewer } from "../app/practice-review.ts";
import { uiText } from "../app/i18n.ts";
import { createExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, updateExamStructure,
  navigateExam, submitExam, localizeExamState, openExamPostReview } from "../app/exam-session.ts";

let chemistry, ui, practiceUI, generate, validate, evaluate, reviewer;
before(async () => {
  chemistry = await loadExerciseChemistry();
  ui = await chemistry.loadModule("/app/exam-panel.tsx"); practiceUI = await chemistry.loadModule("/app/practice-panel.tsx");
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  validate = createBuildSubmissionValidator(chemistry.oracles); evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
  reviewer = createPracticeReviewer(chemistry.engine);
});
after(async () => chemistry?.close());
const noop = () => {};
const actions = { answer: noop, structure: noop, available: noop, go: noop, submit: noop, configure: noop, back: noop, review: noop, results: noop };
const time = (ms) => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
const start = (types = ["naming"]) => startExam(createExamConfig(["alcohol"], 5, "es", "EXAM-UI", types), generate);
const renderStructure = (molecule, label, width, height) => React.createElement(chemistry.engine.MoleculeHistoryPreview,
  { molecule, ariaLabel: label, width, height, practiceView: true });
const render = (state, language = "es", props = {}) => renderToStaticMarkup(React.createElement(ui.ExamSessionView,
  { state: localizeExamState(state, language), language, actions, renderStructure, review: reviewer, ...props }));
const ready = (s, i) => markExamQuestionAvailable(s, time(i * 1000), { index: s.index, questionId: s.plan.slots[s.index].questionIdentity });
function answered(types, wrong = false) {
  let s = start(types);
  for (let i = 0; i < 5; i++) {
    s = ready(s, i); const q = s.plan.slots[i].question;
    if (s.drafts[i].type === "build") s = updateExamStructure(s, q.molecule, validate);
    else s = updateExamAnswer(s, s.drafts[i].type === "naming" ? wrong ? "wrong" : q.reference.names.es
      : q.options.find((option) => option.correct !== wrong).id);
    s = navigateExam(s, i + 1, time(i * 1000 + 500));
  }
  return s;
}
for (const language of ["es", "en"]) {
  test(`Exam config ${language} enables Exam, shares topics/types, and excludes endless`, () => {
    const html = renderToStaticMarkup(React.createElement(practiceUI.PracticePanel, {
      initialMode: "exam", language, onLanguageChange: noop, onBackToLab: noop, generate, renderStructure, review: reviewer,
    }));
    assert.match(html, new RegExp(`<button[^>]*aria-pressed="true"[^>]*>${uiText(language, "Examen")}</button>`));
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 20);
    assert.deepEqual([...html.matchAll(/<option value="(\d+)"/g)].map((m) => +m[1]), [5, 10, 20, 30]);
    assert.ok(html.includes(uiText(language, "Iniciar examen"))); assert.doesNotMatch(html, /endless|Próximamente|Coming soon/);
  });
  test(`Naming pre-submit ${language} has exact student text, no reference/feedback/reviewer/answer data`, () => {
    let s = start(); s = updateExamAnswer(s, "  My draft  "); const q = s.plan.slots[0].question;
    const html = render(s, language); assert.match(html, /value="  My draft  "/);
    assert.ok(html.includes(uiText(language, "Anterior"))); assert.ok(html.includes(uiText(language, "Siguiente")));
    for (const name of Object.values(q.reference.names)) assert.ok(!html.includes(name), name);
    assert.doesNotMatch(html, /is-correct|is-incorrect|practice-feedback|practice-review|correctOptionId|data-correct|reference-name|Comprobar|Check answer|Correct mistakes|Corregir errores/);
    assert.deepEqual(s.attempts, []);
  });
  test(`MCQ pre-submit ${language} renders neutral options including selected wrong answer without provenance/correctness`, () => {
    let s = start(["multiple-choice"]); const q = s.plan.slots[0].question;
    s = updateExamAnswer(s, q.options.find((o) => !o.correct).id);
    const html = render(s, language);
    assert.equal((html.match(/type="radio"/g) ?? []).length, 4); assert.equal((html.match(/checked=""/g) ?? []).length, 1);
    q.options.forEach((o) => assert.ok(html.includes(o.name[language])));
    assert.doesNotMatch(html, /is-correct|is-incorrect|✓|✗|data-correct|provenance|correctOptionId|practice-feedback|Check answer|Comprobar|mcq:reference|mcq:distractor|diagnosticCode/);
    q.options.forEach((o) => assert.ok(!html.includes(o.id.replaceAll('"', '&quot;'))));
  });
  test(`pre-submit Review ${language} is a neutral completion list, not correctness`, () => {
    const complete = answered(["naming", "multiple-choice", "build"], true), html = render(complete, language);
    assert.equal((html.match(/<li>/g) ?? []).length, 5);
    assert.ok(html.includes(uiText(language, "Enviar examen"))); assert.ok(html.includes(uiText(language, "Respondida")));
    assert.doesNotMatch(html, /<svg|practice-feedback|is-correct|is-incorrect|Reference name|Nombre de referencia|correctOptionId/);
    complete.plan.slots.forEach((slot) => assert.ok(!html.includes(slot.question.reference.name)));
    const incomplete = navigateExam(start(), 5, time(100));
    assert.match(render(incomplete, language), new RegExp(`<button[^>]*disabled=""[^>]*>${uiText(language, "Enviar examen")}</button>`));
  });
  test(`Exam results ${language} reuse metrics and omit mastery/corrections`, () => {
    const results = submitExam(answered(["naming"], true), "es", time(9000), evaluate), html = render(results, language);
    assert.ok(html.includes(uiText(language, "Examen completado"))); assert.ok(html.includes("0 / 5"));
    for (const key of ["Revisar respuestas", "Acierto por categoría", "Acierto por tipo de pregunta", "Mediana del tiempo de respuesta"]) assert.ok(html.includes(uiText(language, key)));
    assert.doesNotMatch(html, /Correct mistakes|Corregir errores|Dominio final|Final mastery|Correcciones|Corrections|Puntuación inicial|Initial score/);
  });
}
test("Build draft is the sole editor seed; the target graph never reaches pre-submit renderer/editor", () => {
  let s = start(["build"]); const target = structuredClone(s.plan.slots[0].question.molecule);
  let seen;
  const renderBuilder = (props) => { seen = props; return React.createElement("div", { "data-student-editor": true }); };
  const noTargetRenderer = () => { throw new Error("Target structure must not render"); };
  render(s, "es", { renderBuilder, renderStructure: noTargetRenderer });
  assert.equal(seen.initialMolecule, undefined); assert.ok(!("target" in seen)); assert.ok(!("referenceMolecule" in seen));
  const student = structuredClone(target); student.atoms[0].x += 789;
  s = updateExamStructure(s, student, validate); s = navigateExam(s, 1, time(100)); s = navigateExam(s, 0, time(200));
  render(s, "en", { renderBuilder, renderStructure: noTargetRenderer });
  assert.deepEqual(seen.initialMolecule, student); assert.notDeepEqual(seen.initialMolecule, target);
  assert.deepEqual(s.plan.slots[0].question.molecule, target); assert.deepEqual(s.attempts, []);
});
test("invalid Build is neutral and blocks completion without target/attempt feedback", () => {
  let s = start(["build"]); s = updateExamStructure(s, { atoms: [], bonds: [] }, validate);
  const html = render(s); assert.match(html, /La estructura no es válida para enviar/);
  assert.doesNotMatch(html, /DIFFERENT_STRUCTURE|incorrect|is-correct|practice-feedback|Estructura de referencia/);
});
test("post-exam Reviewer uses the same frozen MCQ provenance and Build structural comparison", () => {
  for (const type of ["naming", "multiple-choice", "build"]) {
    const results = submitExam(answered([type], type !== "build"), "es", time(9000), evaluate);
    const state = openExamPostReview(results); const q = state.plan.slots[0].question, attempt = state.attempts[0];
    const model = reviewer(q, attempt); assert.equal(model.questionId, q.question.id); assert.equal(model.attemptNumber, 1);
    if (type === "multiple-choice") assert.ok(q.options.find((o) => o.id === attempt.selectedOptionId).origin.diagnosticCode);
    if (type === "build") assert.ok(attempt.structuralAnswer.submittedSmiles);
    const html = render(state); assert.ok(html.includes(q.reference.names.es)); assert.match(html, /Revisar respuesta/);
    assert.doesNotMatch(html, /Comprobar respuesta|Comprobar estructura|Corregir errores|Construir desde cero/);
    if (type === "naming") assert.match(html, /<input[^>]*disabled=""[^>]*value="wrong"/);
    if (type === "multiple-choice") assert.equal((html.match(/disabled=""/g) ?? []).length, 5);
    if (type === "build") { assert.match(html, /Tu estructura/); assert.match(html, /Estructura de referencia/); }
  }
});
test("every Exam UI literal has one English dictionary entry", () => {
  const source = readFileSync(new URL("../app/exam-panel.tsx", import.meta.url), "utf8");
  const keys = [...source.matchAll(/\bt\("([^"\n]+)"\)/g)].map((m) => m[1]);
  const dictionary = readFileSync(new URL("../app/i18n.ts", import.meta.url), "utf8");
  for (const key of new Set(keys)) {
    assert.equal(dictionary.split(JSON.stringify(key) + ":").length - 1, 1, key);
    assert.notEqual(uiText("en", key), key, key);
  }
});
test("Exam modules strictly typecheck against the real graph, attempts, and renderer contracts", () => {
  const program = ts.createProgram(["app/exam-session.ts", "app/exam-panel.tsx"], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX, strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => /(?:exam-|session-answer-evaluation|session-question-selection|practice-panel|practice-summary|practice-attempt|practice-build-editor|practice-structural-answer)\.(?:ts|tsx)$/.test(d.file?.fileName ?? ""));
  assert.deepEqual(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});
