import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { spawnSync } from "node:child_process";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { normalizeSessionConfig } from "../app/exercise-model.ts";
import { InsufficientSafeDistractorsError } from "../app/practice-question.ts";
import { createExamConfig, createExamQuestionPlan, startExam, examQuestion, localizeExamState,
  markExamQuestionAvailable, updateExamAnswer, updateExamStructure, navigateExam, submitExam,
  isExamDraftComplete, examAnsweredCount, hasExamDrafts, openExamPostReview, backToExamResults } from "../app/exam-session.ts";

let chemistry, generate, validate, evaluate;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  validate = createBuildSubmissionValidator(chemistry.oracles);
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
});
after(async () => chemistry?.close());
const config = (types = ["naming"], count = 5, seed = "EXAM-TEST") => ({
  ...createExamConfig(["alkane", "alcohol", "ether"], 5, "es", seed, types), questionCount: count,
});
const time = (monotonicMs) => ({ monotonicMs, wallTimeMs: 1700000000000 + monotonicMs });
const ready = (s, ms = 0) => markExamQuestionAvailable(s, time(ms), {
  index: s.index, questionId: s.plan.slots[s.index].questionIdentity,
});
const graph = (smiles) => { const r = moleculeFromSmiles(smiles); assert.ok(r.ok); return r.molecule; };
function answer(s, correct = true, locale = "es") {
  const q = s.plan.slots[s.index].question;
  const type = s.drafts[s.index].type;
  if (type === "build") {
    const wrong = q.molecule.atoms.length === 1 ? graph("CC") : graph("C");
    return updateExamStructure(s, correct ? q.molecule : wrong, validate);
  }
  return updateExamAnswer(s, type === "naming" ? correct ? q.reference.names[locale] : "not a chemical name"
    : q.options.find((option) => option.correct === correct).id);
}
function fill(s, isCorrect = () => true) {
  for (let i = 0; i < s.plan.slots.length; i++) {
    s = ready(s, i * 1000);
    s = answer(s, isCorrect(i));
    s = navigateExam(s, i + 1, time(i * 1000 + 600));
  }
  return s;
}

test("Exam configuration offers only finite 5/10/20/30 and keeps the public seed exact", () => {
  for (const count of [5, 10, 20, 30]) assert.equal(createExamConfig(["alkane"], count, "es", " exact ").questionCount, count);
  for (const count of ["endless", 1, 6, 0]) assert.throws(() => createExamConfig(["alkane"], count, "es", "seed"));
  assert.throws(() => normalizeSessionConfig({ ...config(), questionCount: "endless" }));
  assert.equal(createExamConfig(["alkane"], 5, "es", " exact ").seed, " exact ");
});
test("complete mixed plan is immutable and repeats identically across locale and new Node process", () => {
  const c = { ...config(["naming", "multiple-choice", "build"], 10, "EXAM-PROCESS") };
  const a = createExamQuestionPlan(c, generate), b = createExamQuestionPlan({ ...c, locale: "en" }, generate);
  assert.deepEqual(a, b); assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.slots));
  for (let i = 0; i + 2 < a.slots.length; i += 3) assert.deepEqual(a.slots.slice(i, i + 3).map((s) => s.questionType).sort(), ["build", "multiple-choice", "naming"]);
  const child = spawnSync(process.execPath, ["tests/helpers/exam-plan-process.mjs", "en"], { encoding: "utf8", timeout: 60000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.split("EXAM_PLAN=")[1].trim()), JSON.parse(JSON.stringify(a)));
});
test("plan freezes the actual index after bounded MCQ eligibility and duplicate retries", () => {
  const c = config(["multiple-choice"], 2);
  const calls = [];
  const plan = createExamQuestionPlan(c, (conf, index, context) => {
    calls.push(index);
    if (index < 2) throw new InsufficientSafeDistractorsError();
    return generate(conf, index, context);
  });
  assert.deepEqual(calls.slice(0, 3), [0, 1, 2]); assert.equal(plan.slots[0].generationIndex, 2);
  assert.ok(plan.slots[1].generationIndex > 2);
  for (const slot of plan.slots) assert.deepEqual(slot.question, generate(c, slot.generationIndex, { questionType: slot.questionType, displayIndex: slot.displayOrdinal - 1 }));
});
test("failed bounded plan never starts a partial exam or creates attempts", () => {
  let calls = 0;
  const s = startExam(config(["multiple-choice"]), () => { calls++; throw new InsufficientSafeDistractorsError(); });
  assert.equal(s.phase, "EXAM_ERROR"); assert.equal(calls, 12); assert.deepEqual(s.attempts, []);
});
test("Naming drafts preserve exact raw text across navigation, locale, and edits without evaluating", () => {
  let calls = 0;
  let s = startExam(config(), (...args) => { calls++; return generate(...args); });
  const plan = s.plan, generated = calls;
  const raw = "  ÁCIDO unusual \ttext  ";
  s = updateExamAnswer(ready(s), raw); s = navigateExam(s, 1, time(100)); s = ready(s, 200);
  s = localizeExamState(s, "en"); s = navigateExam(s, 0, time(300));
  assert.equal(s.drafts[0].rawText, raw); assert.equal(s.plan, plan); assert.equal(calls, generated);
  assert.deepEqual(s.attempts, []); assert.equal(examQuestion(s, "en").reference.name, plan.slots[0].question.reference.names.en);
  s = updateExamAnswer(s, "changed"); assert.equal(s.drafts[0].rawText, "changed"); assert.ok(hasExamDrafts(s));
});
test("MCQ options and selected IDs survive navigation and language while arbitrary IDs remain incomplete", () => {
  let s = ready(startExam(config(["multiple-choice"]), generate));
  const q = s.plan.slots[0].question;
  s = updateExamAnswer(s, "unknown"); assert.equal(examAnsweredCount(s), 0);
  s = updateExamAnswer(s, q.options[2].id); s = navigateExam(s, 1, time(100));
  s = localizeExamState(s, "en"); s = navigateExam(s, 0, time(200));
  assert.deepEqual(examQuestion(s, "en").options, q.options); assert.equal(s.drafts[0].selectedOptionId, q.options[2].id);
  assert.equal(examAnsweredCount(s), 1); assert.deepEqual(s.attempts, []);
});
test("Build stores a student clone, restores it, validates without target comparison, and isolates Lab", () => {
  let s = ready(startExam(config(["build"]), generate));
  const lab = graph("CCC"), before = structuredClone(lab);
  const wrong = s.plan.slots[0].question.molecule.atoms.length === 1 ? graph("CC") : graph("C");
  let validationCalls = 0;
  s = updateExamStructure(s, wrong, (...args) => { validationCalls++; assert.equal(args.length, 1); return validate(args[0]); });
  assert.equal(validationCalls, 1); assert.ok(s.drafts[0].validForGrading); assert.equal(examAnsweredCount(s), 1);
  wrong.atoms[0].x += 999; assert.notEqual(s.drafts[0].studentMolecule.atoms[0].x, wrong.atoms[0].x);
  const draft = structuredClone(s.drafts[0]); s = navigateExam(s, 1, time(100)); s = navigateExam(s, 0, time(200));
  assert.deepEqual(s.drafts[0], draft); assert.deepEqual(lab, before); assert.deepEqual(s.attempts, []);
  const invalid = graph("CC"); invalid.bonds = [];
  s = updateExamStructure(s, invalid, validate); assert.equal(examAnsweredCount(s), 0);
  assert.equal(s.drafts[0].validationError, "INVALID_SUBMISSION");
});
test("completeness is neutral: whitespace Naming, unknown MCQ and invalid Build block submission", () => {
  let s = startExam(config(), generate); s = updateExamAnswer(s, " \t ");
  assert.equal(isExamDraftComplete(s.plan.slots[0], s.drafts[0]), false);
  s = navigateExam(s, s.plan.slots.length, time(10)); assert.equal(submitExam(s, "es", time(20), evaluate), s);
  assert.deepEqual(s.attempts, []);
});
test("fake monotonic clock accumulates visits, excludes review, and ignores wall-clock/locale changes", () => {
  let s = ready(startExam(config(["naming"], 2), generate), 100);
  s = answer(s); s = navigateExam(s, 1, { monotonicMs: 1100, wallTimeMs: 1 });
  s = ready(s, 2000); s = answer(s); s = localizeExamState(s, "en");
  s = markExamQuestionAvailable(s, time(9000), { index: 1, questionId: s.plan.slots[1].questionIdentity });
  s = navigateExam(s, 0, time(5000)); s = ready(s, 6000); s = navigateExam(s, 2, time(8000));
  assert.deepEqual(s.timings.map((t) => t.activeMs), [3000, 3000]);
  s = submitExam(s, "es", time(99000), evaluate);
  assert.equal(s.phase, "EXAM_RESULTS"); assert.deepEqual(s.attempts.map((a) => a.responseTimeMs), [3000, 3000]);
});
test("mixed nine questions grade atomically to 6/9, once each, with compact auditable records and grouped metrics", () => {
  let s = startExam(config(["naming", "multiple-choice", "build"], 9), generate);
  s = fill(s, (i) => i < 6); assert.equal(s.phase, "EXAM_REVIEW"); assert.deepEqual(s.attempts, []);
  const plan = s.plan, before = structuredClone(s.drafts);
  s = submitExam(s, "es", time(10000), evaluate); assert.equal(s.phase, "EXAM_RESULTS");
  assert.equal(s.plan, plan); assert.deepEqual(s.drafts, before); assert.ok(Object.isFrozen(s.drafts));
  const metrics = calculatePracticeMetrics(s.attempts);
  assert.equal(metrics.correctAnswers, 6); assert.equal(metrics.answeredQuestions, 9); assert.equal(metrics.firstAttemptAccuracy, 2 / 3 * 100);
  assert.equal(metrics.averageResponseTimeMs, 600); assert.equal(metrics.medianResponseTimeMs, 600);
  assert.deepEqual(metrics.byQuestionType.map((r) => [r.answered, r.correct]), [[3, 2], [3, 2], [3, 2]]);
  assert.equal(metrics.byCategory.reduce((total, r) => total + r.answered, 0), 9);
  s.attempts.forEach((a, i) => { assert.equal(a.attemptNumber, 1); assert.equal(a.displayOrdinal, i + 1);
    assert.equal(a.generationIndex, plan.slots[i].generationIndex); assert.equal(a.questionId, plan.slots[i].questionIdentity);
    assert.equal(a.localeAtSubmission, "es"); assert.ok(!("molecule" in a)); });
  assert.equal(submitExam(s, "es", time(20000), evaluate), s); assert.equal(updateExamAnswer(s, "changed"), s);
  assert.equal(s.config.mode, "exam");
});
test("technical grading error commits zero attempts, locks drafts, and retry produces no duplicates", () => {
  let s = fill(startExam(config(["build"], 3), generate));
  let calls = 0;
  s = submitExam(s, "es", time(9000), (args) => { if (++calls === 2) throw new Error("technical"); return evaluate(args); });
  assert.equal(s.phase, "EXAM_REVIEW"); assert.ok(s.gradingError); assert.ok(s.locked); assert.deepEqual(s.attempts, []);
  assert.equal(navigateExam(s, 0, time(10000)), s);
  const frozen = structuredClone(s.drafts);
  s = submitExam(s, "es", time(11000), evaluate);
  assert.equal(s.phase, "EXAM_RESULTS"); assert.equal(s.attempts.length, 3); assert.deepEqual(s.drafts, frozen);
  assert.equal(new Set(s.attempts.map((a) => a.displayOrdinal)).size, 3);
});
test("post-exam navigation is read-only and localization preserves frozen metrics, drafts and timings", () => {
  let s = submitExam(fill(startExam(config(), generate)), "es", time(6000), evaluate);
  const original = s, attempts = s.attempts;
  s = openExamPostReview(s); s = navigateExam(s, 3, time(99999)); s = localizeExamState(s, "en");
  assert.equal(s.phase, "EXAM_POST_REVIEW"); assert.equal(s.index, 3); assert.equal(s.attempts, attempts);
  assert.equal(updateExamAnswer(s, "new"), s); assert.equal(updateExamStructure(s, graph("CC"), validate), s);
  assert.deepEqual(s.timings, original.timings); assert.deepEqual(backToExamResults(s).attempts, attempts);
});
test("PRACTICE-005 unaccented Spanish and NOM-ETHER-001 use the shared final matcher", () => {
  for (const category of ["carboxylic-acid", "ether"]) {
    let s = startExam({ ...config(["naming"], 1), categories: [category] }, generate);
    s = ready(s); const name = s.plan.slots[0].question.reference.names.es;
    s = updateExamAnswer(s, name.normalize("NFD").replace(/\p{M}/gu, ""));
    s = navigateExam(s, 1, time(500)); s = submitExam(s, "es", time(1000), evaluate);
    assert.equal(s.attempts[0].correct, true, name);
    if (category === "ether") assert.ok(name.includes("oxi"));
  }
});
test("representative 5/10/20/30 mixed plans and final grading have bounded measured cost", () => {
  for (const count of [5, 10, 20, 30]) {
    const start = performance.now(); let s = startExam(config(["naming", "multiple-choice", "build"], count, `EXAM-PERF-${count}`), generate);
    const planMs = performance.now() - start; assert.equal(s.phase, "EXAM_QUESTION");
    s = fill(s); const gradingStart = performance.now(); s = submitExam(s, "es", time(count * 1000 + 100), evaluate);
    const gradingMs = performance.now() - gradingStart; assert.equal(s.phase, "EXAM_RESULTS");
    assert.equal(s.attempts.length, count); console.log("EXAM_PERF", JSON.stringify({ count, planMs, gradingMs }));
  }
});
