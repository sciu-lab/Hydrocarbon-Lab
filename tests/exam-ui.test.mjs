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
import { EXERCISE_CATEGORIES, QUESTION_TYPES } from "../app/exercise-model.ts";
import { createPracticeConfig, startPractice } from "../app/practice-session.ts";
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
const start = (types = ["naming"]) => startExam(createExamConfig(["alcohol"], 5, "es", "EXAM-UI", types, "basic", 1), generate);
const renderStructure = (molecule, label, width, height) => React.createElement(chemistry.engine.MoleculeHistoryPreview,
  { molecule, ariaLabel: label, width, height, practiceView: true });
const render = (state, language = "es", props = {}) => renderToStaticMarkup(React.createElement(ui.ExamSessionView,
  { state: localizeExamState(state, language), language, actions, renderStructure, review: reviewer, ...props }));
const ready = (s, i) => markExamQuestionAvailable(s, time(i * 1000), { index: s.index, questionId: s.plan.slots[s.index].questionIdentity });

for (const category of ["alcohol", "ketone", "carboxylic-acid", "ester", "nitrile", "ez"]) {
  test(`category privacy ${category}: Practice scaffolding, Exam question/review omission, post-submit disclosure`, () => {
    for (const language of ["es", "en"]) for (const type of ["naming", "multiple-choice", "build"]) {
      const config = createExamConfig([category], 1, language, "PRIVACY-9.1", [type], "basic", 1);
      let exam = startExam(config, generate); assert.equal(exam.phase, "EXAM_QUESTION");
      const label = uiText(language, practiceUI.PRACTICE_TOPIC_GROUPS.flatMap((g) => g.topics).find(([id]) => id === category)[1]);
      let bridge;
      const html = render(exam, language, { renderBuilder: (props) => { bridge = props; return React.createElement(chemistry.engine.default, { buildEditor: props }); } });
      assert.ok(!html.includes(label), `${category}/${type}: category absent in text and attributes`);
      assert.doesNotMatch(html, /scope-pill|structure-family-badge|data-category/);
      if (type === "build") assert.equal(bridge.hideCategory, true);
      const question = exam.plan.slots[0].question;
      exam = ready(exam, 0);
      exam = type === "build" ? updateExamStructure(exam, question.molecule, validate)
        : updateExamAnswer(exam, type === "multiple-choice" ? question.correctOptionId : question.reference.names[language]);
      exam = navigateExam(exam, 1, time(100));
      assert.ok(!render(exam, language).includes(label));
      const results = submitExam(exam, language, time(200), evaluate);
      assert.equal(results.phase, "EXAM_RESULTS"); assert.ok(render(results, language).includes(label));
      assert.ok(render(openExamPostReview(results), language).includes(label));
      const practice = startPractice(createPracticeConfig([category], 1, language, "PRIVACY-9.1", [type], "basic", 1), generate);
      const practiceHTML = renderToStaticMarkup(React.createElement(practiceUI.PracticeSessionView,
        { state: practice, language, renderStructure, actions: { answer: noop, check: noop, next: noop, end: noop,
          retry: noop, configure: noop, back: noop, correctMistakes: noop } }));
      assert.ok(practiceHTML.includes(label));
    }
  });
}
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
    const topics = html.slice(html.indexOf('<div class="practice-topics">'), html.indexOf('<fieldset class="practice-question-types">'));
    const types = html.match(/<fieldset class="practice-question-types">[\s\S]*?<\/fieldset>/)[0];
    const classOptIn = html.match(/<section class="class-variants"[\s\S]*?<\/section>/)[0];
    assert.equal((topics.match(/type="checkbox"/g) ?? []).length, EXERCISE_CATEGORIES.length);
    assert.equal((types.match(/type="checkbox"/g) ?? []).length, QUESTION_TYPES.length);
    assert.equal((classOptIn.match(/type="checkbox"/g) ?? []).length, 1);
    assert.doesNotMatch(classOptIn, /checked=""/);
    assert.ok(classOptIn.includes(uiText(language, "Generar variantes para una clase")));
    assert.match(html, /type="number" min="1" step="1"/);
    assert.doesNotMatch(html, /\bmax="|<option/);
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
test("D7 Hard v4 Naming/MCQ/Build remain neutral in both locales before atomic submission", () => {
  for (const language of ["es", "en"]) for (const type of ["naming", "multiple-choice", "build"]) {
    let state = startExam(createExamConfig(["amide"], 1, language, "D7-HARD-PRIVACY", [type], "advanced", 4), generate);
    assert.equal(state.phase, "EXAM_QUESTION");
    const q = state.plan.slots[0].question, frozen = structuredClone(state.plan);
    let editor;
    const renderBuilder = props => { editor = props; return React.createElement("div", { "data-student-editor": true }); };
    const props = { renderBuilder, ...(type === "build" ? { renderStructure: () => { throw Error("Build target leaked"); } } : {}) };
    const html = render(state, language, props);
    assert.doesNotMatch(html, /practice-feedback|practice-review|is-correct|is-incorrect|correctOptionId|data-correct|diagnosticCode|review\.build|WRONG_|UNKNOWN_|mcq:reference/);
    if (type === "naming") for (const name of Object.values(q.reference.names)) assert.ok(!html.includes(name));
    if (type === "multiple-choice") {
      assert.equal((html.match(/type="radio"/g) ?? []).length, 4);
      for (const option of q.options) assert.ok(html.includes(option.name[language]));
    }
    if (type === "build") {
      // The requested name is the legitimate Build prompt; its answer graph,
      // evaluation and hidden naming dock must never reach the student editor.
      assert.equal(editor.initialMolecule, undefined); assert.equal(editor.hideCategory, true);
      assert.ok(!("target" in editor)); assert.ok(!("referenceMolecule" in editor));
    }
    state = ready(state, 0);
    state = type === "build" ? updateExamStructure(state, q.molecule, validate)
      : updateExamAnswer(state, type === "multiple-choice" ? q.options.find(o => !o.correct).id : "unrelated D7 draft");
    state = navigateExam(state, 1, time(100));
    assert.equal(state.phase, "EXAM_REVIEW");
    const neutral = render(state, language);
    assert.doesNotMatch(neutral, /practice-feedback|practice-review|is-correct|is-incorrect|correctOptionId|data-correct|review\.build|WRONG_|UNKNOWN_/);
    for (const name of Object.values(q.reference.names)) assert.ok(!neutral.includes(name));
    assert.deepEqual(state.attempts, []); assert.deepEqual(state.plan, frozen);
  }
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
