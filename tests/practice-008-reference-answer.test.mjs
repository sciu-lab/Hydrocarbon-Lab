import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { evaluateSessionAnswer } from "../app/session-answer-evaluation.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer,
  submitPracticeAnswer, endPractice, startPracticeCorrections } from "../app/practice-session.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { calculatePracticeMastery } from "../app/practice-corrections.ts";
import { createExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, navigateExam,
  submitExam } from "../app/exam-session.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry, generate;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createRestrictedChemicalGenerator(chemistry.oracles);
});
after(async () => chemistry?.close());

test("PRACTICE-008: exact 3,7-dietilnonano reference shown is accepted by the shared evaluator", () => {
  const displayedReference = "3,7-dietilnonano";
  const question = { category: "alkane", reference: { name: displayedReference,
    names: { es: "3,6-dietilnonano", en: "3,7-diethylnonane" } } };
  for (const answer of [displayedReference, "3,7-DIETILNONANO", `  ${displayedReference}  `,
    "3,7-\u200bdietilnonano"]) {
    const evaluation = evaluateSessionAnswer(question, answer, "es");
    assert.equal(evaluation.ok && evaluation.correct, true, answer);
  }
  for (const answer of ["3,6-dietilnonano", "3,7-dimetilnonano", "3,7-dietilnoneno"]) {
    const evaluation = evaluateSessionAnswer(question, answer, "es");
    assert.equal(evaluation.ok && evaluation.correct, false, answer);
  }
});

test("reference used to submit an actual Practice question is the same localized value presented in feedback", () => {
  const config = createPracticeConfig(["alkane"], 5, "es", "PRACTICE-008-FLOW");
  const question = startPractice(config, generate);
  const displayedReference = question.question.reference.name;
  const state = markPracticeQuestionAvailable(question, { monotonicMs: 100, wallTimeMs: 1700000000100 });
  const feedback = submitPracticeAnswer(updatePracticeAnswer(state, displayedReference), "es",
    { monotonicMs: 200, wallTimeMs: 1700000000200 });
  assert.equal(feedback.phase, "FEEDBACK");
  assert.equal(feedback.correct, true);
  assert.equal(feedback.question.reference.name, displayedReference);
  assert.equal(feedback.attempts.at(-1).answer, displayedReference);
  assert.equal(feedback.attempts.at(-1).correct, feedback.correct);
  assert.equal(feedback.attempts.at(-1).questionId, question.question.question.id);
  assert.equal(feedback.attempts.at(-1).generationIndex, question.generationIndex);
  assert.equal(feedback.attempts.at(-1).structuralIdentity, question.question.reference.structuralIdentity);
});

test("PRACTICE-008 exact-name answer records a correct first Practice attempt and initial metrics", () => {
  const referenceName = "3,7-dietilnonano";
  const template = generate(createPracticeConfig(["alkane"], 1, "es", "PRACTICE-008-EXACT"), 0);
  const parsed = moleculeFromSmiles("CCC(CC)CCCC(CC)CC");
  assert.ok(parsed.ok);
  const oracle = chemistry.oracles.reference(parsed.molecule);
  assert.equal(oracle.names.es, referenceName);
  const smiles = moleculeToSmiles(parsed.molecule);
  assert.ok(smiles.ok);
  const question = { ...template, molecule: parsed.molecule, reference: { ...template.reference,
    name: referenceName, names: oracle.names, formula: oracle.formula, smiles: smiles.smiles,
    structuralIdentity: exerciseStructuralIdentity(parsed.molecule) } };
  const state = startPractice(createPracticeConfig(["alkane"], 1, "es", "PRACTICE-008-EXACT"), () => question);
  const ready = markPracticeQuestionAvailable(state, { monotonicMs: 100, wallTimeMs: 1700000000100 });
  const feedback = submitPracticeAnswer(updatePracticeAnswer(ready, referenceName), "es",
    { monotonicMs: 8300, wallTimeMs: 1700000008300 });
  const attempt = feedback.attempts[0];
  assert.equal(feedback.phase, "FEEDBACK");
  assert.equal(feedback.question.reference.name, referenceName);
  assert.equal(feedback.correct, true);
  assert.equal(attempt.correct, true);
  assert.equal(attempt.answer, referenceName);
  assert.equal(attempt.attemptNumber, 1);
  assert.equal(attempt.questionId, question.question.id);
  assert.equal(attempt.generationIndex, 0);
  assert.equal(attempt.structuralIdentity, exerciseStructuralIdentity(parsed.molecule));
  assert.equal(attempt.responseTimeMs, 8200);
  assert.equal(attempt.localeAtSubmission, "es");
  assert.equal(calculatePracticeMetrics(feedback.attempts).correctAnswers, 1);
  assert.equal(calculatePracticeMetrics(feedback.attempts).questionsToReview, 0);
});

test("PRACTICE-008 invisible zero-width input formatting cannot make a visually exact Practice answer wrong", () => {
  const referenceName = "3,7-dietilnonano";
  const template = generate(createPracticeConfig(["alkane"], 1, "es", "PRACTICE-008-ZWSP"), 0);
  const parsed = moleculeFromSmiles("CCC(CC)CCCC(CC)CC");
  assert.ok(parsed.ok);
  const oracle = chemistry.oracles.reference(parsed.molecule);
  const smiles = moleculeToSmiles(parsed.molecule);
  assert.ok(smiles.ok);
  const question = { ...template, molecule: parsed.molecule, reference: { ...template.reference,
    name: referenceName, names: oracle.names, formula: oracle.formula, smiles: smiles.smiles,
    structuralIdentity: exerciseStructuralIdentity(parsed.molecule) } };
  const state = startPractice(createPracticeConfig(["alkane"], 1, "es", "PRACTICE-008-ZWSP"), () => question);
  const ready = markPracticeQuestionAvailable(state, { monotonicMs: 100, wallTimeMs: 1700000000100 });
  const visuallyExactInput = "3,7-\u200bdietilnonano";
  const feedback = submitPracticeAnswer(updatePracticeAnswer(ready, visuallyExactInput), "es",
    { monotonicMs: 200, wallTimeMs: 1700000000200 });
  assert.equal(feedback.correct, true);
  assert.equal(feedback.question.reference.name, referenceName);
  assert.equal(feedback.attempts[0].answer, visuallyExactInput, "Attempt Log retains the raw submitted text");
  assert.equal(feedback.attempts[0].correct, true);
});

test("PRACTICE-008 exact reference during Correction is attempt 2 and is counted as mastered", () => {
  const referenceName = "3,7-dietilnonano";
  const template = generate(createPracticeConfig(["alkane"], 1, "es", "PRACTICE-008-CORRECTION"), 0);
  const parsed = moleculeFromSmiles("CCC(CC)CCCC(CC)CC");
  assert.ok(parsed.ok);
  const oracle = chemistry.oracles.reference(parsed.molecule);
  const smiles = moleculeToSmiles(parsed.molecule);
  assert.ok(smiles.ok);
  const question = { ...template, molecule: parsed.molecule, reference: { ...template.reference,
    name: referenceName, names: oracle.names, formula: oracle.formula, smiles: smiles.smiles,
    structuralIdentity: exerciseStructuralIdentity(parsed.molecule) } };
  const config = createPracticeConfig(["alkane"], 1, "es", "PRACTICE-008-CORRECTION");
  const first = startPractice(config, () => question);
  let state = markPracticeQuestionAvailable(first, { monotonicMs: 100, wallTimeMs: 1700000000100 });
  state = submitPracticeAnswer(updatePracticeAnswer(state, "respuesta incorrecta"), "es",
    { monotonicMs: 200, wallTimeMs: 1700000000200 });
  const correction = startPracticeCorrections(endPractice(state), () => question);
  assert.equal(correction.phase, "CORRECTION_QUESTION");
  assert.equal(correction.question.reference.name, referenceName);
  state = markPracticeQuestionAvailable(correction, { monotonicMs: 300, wallTimeMs: 1700000000300 });
  state = submitPracticeAnswer(updatePracticeAnswer(state, referenceName), "es",
    { monotonicMs: 500, wallTimeMs: 1700000000500 });
  assert.equal(state.phase, "CORRECTION_FEEDBACK");
  assert.equal(state.correct, true);
  assert.deepEqual(state.attempts.map((attempt) => [attempt.attemptNumber, attempt.answer, attempt.correct]), [
    [1, "respuesta incorrecta", false], [2, referenceName, true],
  ]);
  assert.equal(state.attempts[1].questionId, state.attempts[0].questionId);
  assert.equal(state.attempts[1].generationIndex, state.attempts[0].generationIndex);
  assert.equal(state.attempts[1].structuralIdentity, exerciseStructuralIdentity(parsed.molecule));
  const metrics = calculatePracticeMetrics(state.attempts);
  assert.equal(metrics.correctAnswers, 0);
  assert.equal(metrics.questionsToReview, 1);
  const mastery = calculatePracticeMastery(state.attempts);
  assert.equal(mastery.correctedQuestions, 1);
  assert.equal(mastery.remainingMistakes, 0);
  assert.equal(mastery.finalMasteredQuestions, 1);
  assert.equal(mastery.finalMastery, 100);
});

test("PRACTICE-008 Exam grades the current localized reference only at atomic Submit", () => {
  const template = generate(createExamConfig(["alkane"], 1, "en", "PRACTICE-008-EXAM"), 0);
  const parsed = moleculeFromSmiles("CCC(CC)CCCC(CC)CC");
  assert.ok(parsed.ok);
  const oracle = chemistry.oracles.reference(parsed.molecule);
  const smiles = moleculeToSmiles(parsed.molecule);
  assert.ok(smiles.ok);
  const question = { ...template, molecule: parsed.molecule, reference: { ...template.reference,
    name: oracle.names.en, names: oracle.names, formula: oracle.formula, smiles: smiles.smiles,
    structuralIdentity: exerciseStructuralIdentity(parsed.molecule) } };
  let state = startExam(createExamConfig(["alkane"], 1, "en", "PRACTICE-008-EXAM"), () => question);
  assert.deepEqual(state.attempts, []);
  state = markExamQuestionAvailable(state, { monotonicMs: 100, wallTimeMs: 1700000000100 }, {
    index: 0, questionId: state.plan.slots[0].questionIdentity,
  });
  state = updateExamAnswer(state, oracle.names.en);
  state = navigateExam(state, 1, { monotonicMs: 200, wallTimeMs: 1700000000200 });
  assert.deepEqual(state.attempts, []);
  state = submitExam(state, "en", { monotonicMs: 300, wallTimeMs: 1700000000300 });
  assert.equal(state.phase, "EXAM_RESULTS");
  assert.equal(state.attempts[0].correct, true);
  assert.equal(state.attempts[0].answer, oracle.names.en);
  assert.equal(state.attempts[0].localeAtSubmission, "en");
  assert.equal(state.attempts[0].structuralIdentity, exerciseStructuralIdentity(parsed.molecule));
});

test("generated Naming references are self-accepted for every supported category in EN and ES", () => {
  const seeds = ["PRACTICE-008-SWEEP-A", "PRACTICE-008-SWEEP-B", "PRACTICE-008-SWEEP-C"];
  let questionsChecked = 0;
  const failures = [];
  for (const category of EXERCISE_CATEGORIES) for (const locale of ["es", "en"]) for (const seed of seeds) {
    const config = createPracticeConfig([category], 5, locale, seed);
    for (const generationIndex of [0, 2]) {
      const question = generate(config, generationIndex);
      const reference = question.reference.name;
      const result = evaluateSessionAnswer(question, reference, locale);
      questionsChecked += 1;
      if (!result.ok || !result.correct) failures.push({ category, locale, seed, generationIndex,
        questionId: question.question.id, reference, evaluatedSource: question.reference.names[locale], result });
    }
  }
  assert.equal(questionsChecked, 204);
  assert.deepEqual(failures, []);
});
