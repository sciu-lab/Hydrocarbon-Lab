import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

import {
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  GENERATOR_VERSION,
  QUESTION_TYPES,
  normalizeSessionConfig,
  serializeSessionConfig,
} from "../app/exercise-model.ts";

const config = {
  mode: "practice", questionCount: 12, questionTypes: ["naming"],
  categories: ["alcohol", "alkane"], difficulty: "basic", locale: "es",
  seed: "CHEM-A7F3", generatorVersion: 1,
};

const serialized = '{"mode":"practice","questionCount":12,"questionTypes":["naming"],"categories":["alkane","alcohol"],"difficulty":"basic","locale":"es","seed":"CHEM-A7F3","generatorVersion":1}';

test("v1 freezes canonical keys, set order and the generator version", () => {
  assert.equal(GENERATOR_VERSION, 1);
  assert.equal(serializeSessionConfig(config), serialized);
  assert.deepEqual(normalizeSessionConfig(config), JSON.parse(serialized));
});

test("category and question-type selection order and duplicates have no semantics", () => {
  const left = {
    ...config,
    questionTypes: ["build", "naming", "multiple-choice", "naming"],
    categories: ["nitro", "alcohol", "alkane", "alcohol"],
  };
  const right = {
    ...config,
    categories: ["alkane", "nitro", "alcohol"],
    questionTypes: ["multiple-choice", "build", "naming"],
  };
  assert.deepEqual(normalizeSessionConfig(left), normalizeSessionConfig(right));
  assert.equal(serializeSessionConfig(left), serializeSessionConfig(right));
  assert.deepEqual(normalizeSessionConfig(left).questionTypes, ["naming", "multiple-choice", "build"]);
});

test("object insertion order does not change canonical configuration", () => {
  const reordered = Object.fromEntries(Object.entries(config).reverse());
  assert.equal(serializeSessionConfig(reordered), serialized);
});

test("normalization is idempotent and copies frozen inputs without mutation", () => {
  const input = Object.freeze({
    ...config,
    categories: Object.freeze(["alcohol", "alkane", "alcohol"]),
    questionTypes: Object.freeze(["naming"]),
  });
  const actual = normalizeSessionConfig(input);
  assert.deepEqual(normalizeSessionConfig(actual), actual);
  assert.notEqual(actual, input);
  assert.notEqual(actual.categories, input.categories);
  assert.notEqual(actual.questionTypes, input.questionTypes);
  actual.categories.push("ether");
  assert.deepEqual(input.categories, ["alcohol", "alkane", "alcohol"]);
});

test("meaningful configuration changes remain visible after normalization", () => {
  const original = normalizeSessionConfig(config);
  for (const change of [
    { mode: "exam" }, { questionCount: 13 }, { questionCount: "endless" },
    { locale: "en" }, { difficulty: "intermediate" }, { difficulty: "advanced" },
    { questionTypes: ["multiple-choice"] }, { questionTypes: ["build"] },
    { categories: ["alkane"] }, { seed: "CHEM-B8G4" },
  ]) {
    assert.notDeepEqual(normalizeSessionConfig({ ...config, ...change }), original);
    assert.notEqual(serializeSessionConfig({ ...config, ...change }), serialized);
  }
});

test("Practice permits endless while Exam requires a finite count", () => {
  assert.equal(normalizeSessionConfig({ ...config, questionCount: "endless" }).questionCount, "endless");
  assert.equal(normalizeSessionConfig({ ...config, mode: "exam", questionCount: 1 }).questionCount, 1);
  assert.throws(() => normalizeSessionConfig({ ...config, mode: "exam", questionCount: "endless" }), RangeError);
  assert.equal(normalizeSessionConfig({ ...config, questionCount: Number.MAX_SAFE_INTEGER }).questionCount, Number.MAX_SAFE_INTEGER);
});

test("configuration JSON round-trips finite and endless sessions without information loss", () => {
  for (const input of [config, { ...config, questionCount: "endless" }, { ...config, mode: "exam" }]) {
    const normalized = normalizeSessionConfig(input);
    const restored = JSON.parse(JSON.stringify(normalized));
    assert.deepEqual(restored, normalized);
    assert.deepEqual(normalizeSessionConfig(restored), normalized);
    assert.equal(serializeSessionConfig(restored), serializeSessionConfig(input));
  }
});

test("all category IDs and future question types are representable without behavior or translated labels", () => {
  const normalized = normalizeSessionConfig({ ...config, categories: [...EXERCISE_CATEGORIES], questionTypes: [...QUESTION_TYPES] });
  assert.deepEqual(normalized.categories, EXERCISE_CATEGORIES);
  assert.deepEqual(normalized.questionTypes, QUESTION_TYPES);
  assert.deepEqual(EXERCISE_CATEGORIES, [
    "alkane", "alkene", "alkyne", "halogenated", "alcohol", "aldehyde", "ketone",
    "carboxylic-acid", "ether", "ester", "amine", "amide", "simple-carbocycle",
    "aromatic", "ez", "nitrile", "nitro",
  ]);
  assert.deepEqual(EXERCISE_DIFFICULTIES, ["basic", "intermediate", "advanced"]);
});

test("seed strings are preserved verbatim through normalization and JSON", () => {
  for (const seed of ["12345", "class-3b-student-17", " CHEM-A7F3 ", 'química🧪\u0000"']) {
    const normalized = normalizeSessionConfig({ ...config, seed });
    assert.equal(normalized.seed, seed);
    assert.equal(JSON.parse(serializeSessionConfig(normalized)).seed, seed);
  }
});

test("malformed counts, IDs, selections and versions are rejected rather than coerced", () => {
  for (const change of [
    { questionCount: 0 }, { questionCount: -1 }, { questionCount: 1.5 },
    { questionCount: NaN }, { questionCount: Infinity }, { questionCount: "12" },
    { questionCount: Number.MAX_SAFE_INTEGER + 1 },
    { categories: [] }, { categories: new Array(1) }, { categories: ["Alkanes"] },
    { categories: ["sulfur"] }, { categories: "alkane" }, { categories: ["alkane", null] },
    { questionTypes: [] }, { questionTypes: ["unknown"] }, { questionTypes: "naming" },
    { mode: "unknown" }, { locale: "fr" }, { difficulty: "easy" },
    { seed: "" }, { seed: 12345 }, { generatorVersion: "1" }, { generatorVersion: 0 }, { generatorVersion: 2 },
  ]) {
    assert.throws(() => normalizeSessionConfig({ ...config, ...change }), { name: /TypeError|RangeError/ });
  }
  for (const input of [null, undefined, [], "config", {}, { ...config, uiId: "random-id" }]) {
    assert.throws(() => normalizeSessionConfig(input), { name: /TypeError|RangeError/ });
  }
  for (const field of Object.keys(config)) {
    if (field === "difficulty") continue; // Legacy configs default this field to basic.
    const input = { ...config };
    delete input[field];
    assert.throws(() => normalizeSessionConfig(input), { name: /TypeError|RangeError/ });
  }
});

test("TypeScript enforces shared configuration and discriminated question metadata", () => {
  const path = fileURLToPath(new URL("./exercise-model-types.ts", import.meta.url)).replace(/\\/g, "/");
  const source = `
    import type { SessionConfig, Question, QuestionMetadata, NamingQuestion, MultipleChoiceQuestion, BuildQuestion } from "../app/exercise-model.ts";
    const practice: SessionConfig = { mode: "practice", questionCount: "endless", questionTypes: ["naming"], categories: ["alkane"], difficulty: "basic", locale: "es", seed: "typed", generatorVersion: 1 };
    const exam: SessionConfig = { ...practice, mode: "exam", questionCount: 12 };
    // @ts-expect-error Endless is a Practice configuration.
    const endlessExam: SessionConfig = { ...practice, mode: "exam", questionCount: "endless" };
    // @ts-expect-error Unknown versions cannot silently enter v1.
    const unsupportedVersion: SessionConfig = { ...exam, generatorVersion: 2 };
    // @ts-expect-error Categories are internal IDs.
    const labelCategory: SessionConfig = { ...practice, categories: ["Alkanes"] };
    // @ts-expect-error Selection arrays are readonly.
    practice.categories.push("alcohol");
    const metadata: QuestionMetadata = { id: "exercise-context", seed: "derived", generatorVersion: 1, category: "alkane", difficulty: "basic" };
    const naming: NamingQuestion = { ...metadata, type: "naming" };
    const multipleChoice: MultipleChoiceQuestion = { ...metadata, type: "multiple-choice" };
    const build: BuildQuestion = { ...metadata, type: "build" };
    const questions: Question[] = [naming, multipleChoice, build];
    // @ts-expect-error Each variant has a distinct discriminator.
    const wrongVariant: NamingQuestion = build;
    // @ts-expect-error Chemical payload is reserved for a later phase.
    const prematurePayload: NamingQuestion = { ...naming, molecule: {} };
    function identity(question: Question): string {
      switch (question.type) {
        case "naming": { const narrowed: NamingQuestion = question; return narrowed.id; }
        case "multiple-choice": { const narrowed: MultipleChoiceQuestion = question; return narrowed.id; }
        case "build": { const narrowed: BuildQuestion = question; return narrowed.id; }
        default: { const exhaustive: never = question; return exhaustive; }
      }
    }
    questions.map(identity);
  `;
  const options = {
    strict: true, noEmit: true, skipLibCheck: true, types: [],
    target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
  };
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => file === path
    ? ts.createSourceFile(file, source, languageVersion, true)
    : original(file, languageVersion, onError, shouldCreateNewSourceFile);
  const corePaths = ["exercise-model", "exercise-seed", "seeded-rng"].map((name) =>
    fileURLToPath(new URL(`../app/${name}.ts`, import.meta.url)).replace(/\\/g, "/"));
  const checkedPaths = new Set([path, ...corePaths]);
  const program = ts.createProgram([...checkedPaths], options, host);
  // Check the core against AppLanguage without auditing unrelated UI dictionaries.
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((item) =>
    !item.file || checkedPaths.has(item.file.fileName.replace(/\\/g, "/")));
  assert.deepEqual(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);
});
