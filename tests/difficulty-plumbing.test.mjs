import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { captureDifficultySessions } from "./helpers/difficulty-session-snapshot.mjs";
import { parseClassCsv } from "./helpers/class-csv-parser.mjs";
import { EXERCISE_DIFFICULTIES, GENERATOR_VERSION, normalizeExerciseDifficulty,
  normalizeSessionConfig, serializeSessionConfig } from "../app/exercise-model.ts";
import { deriveGenerationIdentity, deriveQuestionIdentity } from "../app/exercise-seed.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeReviewer } from "../app/practice-review.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { reconstructPracticeCorrection } from "../app/practice-corrections.ts";
import { buildCompletedSessionReview } from "../app/session-review.ts";
import { reconstructSessionReviewQuestion } from "../app/session-review-question.ts";
import { getExerciseUniquenessKey } from "../app/session-question-selection.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { createPracticeConfig as currentPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer,
  updatePracticeStructure, submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion,
  localizePracticeState, startPracticeCorrections, endPractice, PRACTICE_RECENT_LIMIT } from "../app/practice-session.ts";
import { createExamConfig as currentExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, updateExamStructure,
  navigateExam, submitExam, localizeExamState, openExamPostReview } from "../app/exam-session.ts";
import { createClassAssignmentConfig, normalizeClassAssignmentConfig, generateClassAssignments,
  participantSessionConfig, classConfigFingerprint, classVariantInputSignature,
  CLASS_SCHEMA_VERSION, CLASS_DERIVATION_VERSION } from "../app/class-assignment.ts";
import { serializeClassAssignmentCsv, reconstructClassSessionFromCsvRow,
  CLASS_ASSIGNMENT_CSV_COLUMNS } from "../app/class-assignment-csv.ts";

// Freeze these D1/D2 lifecycle inputs at their published v2 behavior.
const createPracticeConfig = (c,n,l,s,t = ['naming'],d = 'basic',v = 2) => currentPracticeConfig(c,n,l,s,t,d,v);
const createExamConfig = (c,n,l,s,t = ['naming'],d = 'basic',v = 2) => currentExamConfig(c,n,l,s,t,d,v);

const baseline = JSON.parse(readFileSync(new URL("./fixtures/difficulty-d1-basic-session.json", import.meta.url), "utf8"));
const nonBasic = JSON.parse(readFileSync(new URL("./fixtures/difficulty-d1-nonbasic-session.json", import.meta.url), "utf8"));
const types = ["naming", "multiple-choice", "build"];
const categories = ["alkane", "alcohol", "ether"];
const time = (ms) => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
const classSelection = { mode: "exam", questionCount: 15, categories: ["alcohol", "alkane"], questionTypes: types };
let chemistry, generate, validate, evaluate, reviewer;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  validate = createBuildSubmissionValidator(chemistry.oracles);
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
  reviewer = createPracticeReviewer(chemistry.engine);
});
after(async () => chemistry?.close());

function practiceSubmit(state, correct, ms) {
  const q = state.question;
  state = markPracticeQuestionAvailable(state, time(ms));
  if (q.type === "build") {
    const wrong = moleculeFromSmiles(q.molecule.atoms.length === 1 ? "CC" : "C");
    assert.ok(wrong.ok);
    return submitPracticeStructure(updatePracticeStructure(state, correct ? q.molecule : wrong.molecule),
      state.config.locale, time(ms + 100), evaluate);
  }
  return submitPracticeAnswer(updatePracticeAnswer(state, q.type === "multiple-choice"
    ? q.options.find((option) => option.correct === correct).id : correct ? q.reference.names[state.config.locale] : "incorrect answer"),
  state.config.locale, time(ms + 100));
}

test("canonical difficulty validation defaults only absent legacy fields and preserves v1 framing", () => {
  const basic = createPracticeConfig(categories, 3, "es", "D1-CONFIG", types);
  const legacy = { ...basic }; delete legacy.difficulty;
  assert.deepEqual(normalizeSessionConfig(legacy), basic);
  assert.equal(serializeSessionConfig(legacy), serializeSessionConfig(basic));
  for (const index of [0, 11]) {
    assert.deepEqual(deriveQuestionIdentity(legacy, index), deriveQuestionIdentity(basic, index));
    assert.deepEqual(deriveGenerationIdentity(legacy, index), deriveGenerationIdentity(basic, index));
    assert.deepEqual(generate(legacy, index), generate(basic, index));
  }
  for (const difficulty of EXERCISE_DIFFICULTIES) {
    assert.equal(normalizeExerciseDifficulty(difficulty), difficulty);
    const config = normalizeSessionConfig({ ...basic, difficulty });
    assert.deepEqual(normalizeSessionConfig(JSON.parse(serializeSessionConfig(config))), config);
  }
  for (const difficulty of ["easy", "hard", "expert", "", "Fácil", null, undefined, 1]) {
    assert.throws(() => normalizeSessionConfig({ ...basic, difficulty }));
    if (difficulty !== undefined) {
      assert.throws(() => createPracticeConfig(categories, 3, "es", "D1", types, difficulty));
      assert.throws(() => createExamConfig(categories, 3, "es", "D1", types, difficulty));
    }
    assert.throws(() => createClassAssignmentConfig({ ...classSelection, difficulty }, "CLASS"));
  }
  assert.equal(createPracticeConfig(categories, 3, "es", "D1", types, undefined).difficulty, "basic");
  assert.equal(createExamConfig(categories, 3, "es", "D1", types, undefined).difficulty, "basic");
  assert.equal(GENERATOR_VERSION, 3);
});

test("historical basic targets, indices, MCQ IDs/order/provenance and Build payloads remain exact", async () => {
  assert.equal(baseline.capturedBeforeD1, "36fa14b");
  assert.deepEqual(await captureDifficultySessions(), baseline.sessions);
});

for (const difficulty of EXERCISE_DIFFICULTIES) {
  test(`${difficulty}: Practice mixed session, live locale, corrections and Review preserve original config`, () => {
    const config = createPracticeConfig(categories, 3, "es", "D1-LIFECYCLE", types, difficulty);
    let state = startPractice(config, generate);
    assert.equal(state.phase, "QUESTION");
    const original = state.question;
    state = localizePracticeState(state, "en");
    assert.equal(state.config.difficulty, difficulty);
    assert.equal(state.question.molecule, original.molecule);
    for (let i = 0; i < 3; i++) {
      assert.equal(state.phase, "QUESTION");
      state = practiceSubmit(state, i !== 0, i * 1000);
      assert.equal(state.phase, "FEEDBACK");
      state = nextPracticeQuestion(state, generate);
    }
    assert.equal(state.phase, "COMPLETE");
    const before = buildCompletedSessionReview(state); assert.ok(before.ok, JSON.stringify(before));
    assert.equal(before.model.config.difficulty, difficulty);
    assert.deepEqual(state.attempts.map((a) => a.questionType).sort(), [...types].sort());
    const firstAttempt = state.attempts[0];
    state = startPracticeCorrections(state, (c, index, context) => {
      assert.equal(c.difficulty, difficulty); return generate(c, index, context);
    });
    assert.equal(state.phase, "CORRECTION_QUESTION");
    assert.equal(state.question.reference.structuralIdentity, firstAttempt.structuralIdentity);
    state = nextPracticeQuestion(practiceSubmit(state, true, 10000), generate);
    assert.equal(state.phase, "CORRECTION_SUMMARY");
    assert.deepEqual(state.attempts[0], firstAttempt);
    assert.equal(state.attempts.at(-1).attemptNumber, 2);
    const after = buildCompletedSessionReview(state); assert.ok(after.ok, JSON.stringify(after));
    assert.deepEqual(after.model.initialResults, before.model.initialResults);
    assert.equal(after.model.masteryResults.remainingMistakes, 0);
    for (const entry of after.model.questions) {
      const result = reconstructSessionReviewQuestion(after.model.config, entry, generate);
      assert.ok(result.ok); assert.equal(reviewer(result.detail.question, entry.firstAttempt).questionId, entry.questionId);
      assert.ok(!("difficulty" in entry.firstAttempt));
    }
  });

  test(`${difficulty}: Exam drafts/navigation/locale remain neutral and grading/post-review are atomic`, () => {
    let state = startExam(createExamConfig(categories, 3, "es", "D1-EXAM", types, difficulty), generate);
    assert.equal(state.phase, "EXAM_QUESTION");
    const plan = state.plan;
    state = localizeExamState(state, "en");
    assert.equal(state.config.difficulty, difficulty); assert.equal(state.plan, plan);
    for (let i = 0; i < 3; i++) {
      state = markExamQuestionAvailable(state, time(i * 1000), { index: i, questionId: state.plan.slots[i].questionIdentity });
      const q = state.plan.slots[i].question;
      state = q.type === "build" ? updateExamStructure(state, q.molecule, validate)
        : updateExamAnswer(state, q.type === "multiple-choice" ? q.correctOptionId : q.reference.names.en);
      assert.deepEqual(state.attempts, []);
      if (i === 1) {
        const draft = state.drafts[1];
        state = navigateExam(state, 0, time(1100));
        state = navigateExam(state, 1, time(1200));
        assert.equal(state.drafts[1], draft);
      }
      state = navigateExam(state, i + 1, time(i * 1000 + 500));
    }
    assert.equal(state.phase, "EXAM_REVIEW"); assert.deepEqual(state.attempts, []);
    state = submitExam(state, "en", time(4000), evaluate);
    assert.equal(state.phase, "EXAM_RESULTS"); assert.equal(state.attempts.length, 3);
    assert.ok(state.attempts.every((a) => a.correct && a.attemptNumber === 1));
    assert.equal(submitExam(state, "en", time(5000), evaluate), state);
    const model = buildCompletedSessionReview(state); assert.ok(model.ok, JSON.stringify(model));
    assert.equal(model.model.config.difficulty, difficulty);
    for (const entry of model.model.questions) {
      const slot = plan.slots[entry.displayOrdinal - 1];
      const result = reconstructSessionReviewQuestion(model.model.config, entry,
        () => { throw new Error("Exam must use frozen plan"); }, slot.question);
      assert.ok(result.ok); assert.equal(reviewer(result.detail.question, entry.firstAttempt).status, "CORRECT");
    }
    assert.equal(openExamPostReview(state).config.difficulty, difficulty);
  });
}

for (const difficulty of ["intermediate", "advanced"]) {
  test(`${difficulty}: fresh processes repeat exact plans and ES/EN chemistry/options remain identical`, () => {
    const snapshot = (locale) => {
      const script = `import { captureDifficultySessions } from './tests/helpers/difficulty-session-snapshot.mjs';
        console.log('D1_SNAPSHOT=' + JSON.stringify(await captureDifficultySessions('${difficulty}', '${locale}')));`;
      const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 60000 });
      return JSON.parse(output.split("D1_SNAPSHOT=")[1].trim());
    };
    const a = snapshot("es"), b = snapshot("es"), en = snapshot("en");
    assert.equal(nonBasic.generatorVersion, 1);
    assert.deepEqual(a, nonBasic.sessions[difficulty]);
    assert.deepEqual(a, b); assert.deepEqual(a, en);
    assert.notDeepEqual(a, baseline.sessions);
  });

  test(`${difficulty}: ordinal 7 / generationIndex 11 reconstructs original difficulty and target`, () => {
    const config = createPracticeConfig(categories, 7, "es", "D1-RECONSTRUCT", ["naming"], difficulty);
    const question = generate(config, 11, { questionType: "naming", displayIndex: 6 });
    const attempt = createInitialAttempt({ question, displayOrdinal: 7, generationIndex: 11, answer: "incorrect",
      correct: false, started: time(0), submitted: time(100), locale: "es" });
    const calls = [];
    const reconstructed = (c, index, context) => { calls.push([c.difficulty, index, context.displayIndex]); return generate(c, index, context); };
    const correction = reconstructPracticeCorrection(JSON.parse(serializeSessionConfig(config)), attempt, reconstructed);
    assert.equal(correction.reference.structuralIdentity, question.reference.structuralIdentity);
    const detail = reconstructSessionReviewQuestion(config, { ...attempt, attempts: [attempt] }, reconstructed);
    assert.ok(detail.ok); assert.deepEqual(calls, [[difficulty, 11, 6], [difficulty, 11, 6]]);
    assert.equal(reconstructSessionReviewQuestion({ ...config, difficulty: "basic" }, { ...attempt, attempts: [attempt] }, generate).ok, false);
    assert.equal(getExerciseUniquenessKey(question), getExerciseUniquenessKey({ ...question, difficulty: "basic" }));
    assert.equal(exerciseStructuralIdentity(correction.molecule), question.reference.structuralIdentity);
  });

  test(`${difficulty}: Endless retains bounded recent duplicate keys`, () => {
    let state = startPractice(createPracticeConfig(categories, "endless", "es", "D1-ENDLESS", ["naming"], difficulty), generate);
    for (let i = 0; i < 12; i++) {
      assert.equal(state.phase, "QUESTION"); assert.equal(state.config.difficulty, difficulty);
      assert.ok(state.recentIdentities.length <= PRACTICE_RECENT_LIMIT);
      assert.ok(state.usedExerciseKeys.length <= PRACTICE_RECENT_LIMIT);
      state = nextPracticeQuestion(practiceSubmit(state, true, i * 1000), generate);
    }
    assert.equal(endPractice(state).config.difficulty, difficulty);
  });
}

test("Class basic/omitted fingerprint, participant seeds and full CSV bytes preserve CHEM-4B-2026", () => {
  const basic = createClassAssignmentConfig(classSelection, "CHEM-4B-2026", 1);
  const legacy = { ...basic }; delete legacy.difficulty;
  assert.deepEqual(normalizeClassAssignmentConfig(legacy), basic);
  const explicit = createClassAssignmentConfig({ ...classSelection, difficulty: "basic" }, "CHEM-4B-2026", 1);
  const manifest = generateClassAssignments(legacy, ["001", "002"]);
  assert.deepEqual(manifest.participants[0], baseline.classAssignment);
  assert.deepEqual(generateClassAssignments(explicit, ["001", "002"]), manifest);
  const csv = serializeClassAssignmentCsv(manifest, "es");
  assert.equal(createHash("sha256").update(csv).digest("hex"), baseline.classCsvSha256);
  assert.equal(reconstructClassSessionFromCsvRow(parseClassCsv(csv).rows[0]).difficulty, "basic");
  assert.equal(classVariantInputSignature(classSelection, "CLASS", "automatic", "36", ""),
    classVariantInputSignature({ ...classSelection, difficulty: "basic" }, "CLASS", "automatic", "36", ""));
  assert.equal(CLASS_SCHEMA_VERSION, 1); assert.equal(CLASS_DERIVATION_VERSION, 1);
});

test("Class non-basic config/seed/preview identity is distinct; unchanged CSV schema preserves it losslessly", () => {
  const seeds = new Set(), fingerprints = new Set(), signatures = new Set();
  for (const difficulty of EXERCISE_DIFFICULTIES) {
    const selection = { ...classSelection, difficulty };
    const config = createClassAssignmentConfig(selection, "CHEM-4B-2026", 1);
    const manifest = generateClassAssignments(JSON.parse(JSON.stringify(config)), ["001", "002"]);
    assert.equal(manifest.config.difficulty, difficulty);
    assert.deepEqual(manifest, generateClassAssignments(config, ["001", "002"]));
    const fingerprint = classConfigFingerprint(config);
    assert.equal(fingerprint, JSON.stringify(["class-config-v1", "exam", 15, ["alkane", "alcohol"], types, 1,
      ...(difficulty === "basic" ? [] : [["difficulty", difficulty]])]));
    seeds.add(manifest.participants[0].sessionSeed); fingerprints.add(fingerprint);
    signatures.add(classVariantInputSignature(selection, "CLASS", "automatic", "36", ""));
    for (const locale of ["es", "en"]) {
      const csv = serializeClassAssignmentCsv(manifest, locale);
      assert.ok(csv.startsWith('\uFEFF"schema_version"')); assert.ok(csv.endsWith("\r\n"));
      assert.equal(csv, serializeClassAssignmentCsv(manifest, locale));
      const parsed = parseClassCsv(csv); assert.deepEqual(parsed.header, [...CLASS_ASSIGNMENT_CSV_COLUMNS]);
      for (const [index, row] of parsed.rows.entries()) {
        const restored = reconstructClassSessionFromCsvRow(row);
        assert.equal(restored.difficulty, difficulty);
        assert.deepEqual(restored, participantSessionConfig(config, manifest.participants[index], locale));
        const other = participantSessionConfig(config, manifest.participants[index], locale === "es" ? "en" : "es");
        assert.deepEqual(generate(restored, 0).molecule, generate(other, 0).molecule);
      }
      const row = parsed.rows[0];
      const tuple = JSON.parse(row.config_fingerprint);
      for (const suffix of [["difficulty", "hard"], ["difficulty", ""], ["other", "advanced"], ["difficulty", "advanced", "extra"]]) {
        assert.throws(() => reconstructClassSessionFromCsvRow({ ...row, config_fingerprint: JSON.stringify([...tuple.slice(0, 6), suffix]) }));
      }
      if (difficulty !== "basic") assert.throws(() => reconstructClassSessionFromCsvRow({ ...row, config_fingerprint: JSON.stringify(tuple.slice(0, 6)) }));
    }
  }
  assert.equal(seeds.size, 3); assert.equal(fingerprints.size, 3); assert.equal(signatures.size, 3);
});
