import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  createDocxAssessmentModel, createNamingAssessmentConfig, namingAssessmentFilename,
  namingAssessmentSessionConfig, normalizeNamingAssessmentConfig,
} from "../app/docx-export-model.ts";
import { selectNamingAssessmentQuestions } from "../app/docx-assessment-selection.ts";
import { renderStudentDocxBuffer, renderTeacherDocxBuffer } from "../app/docx-export.ts";
import { getWordDocumentText, readZipEntries } from "../scripts/docx-archive.mjs";
import { inspectDocxStructureRaster, renderDocxStructurePngAssets, renderDocxStructureSvg } from "../scripts/docx-structure-assets.mjs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

const onePixelPng = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jW5kAAAAASUVORK5CYII=", "base64",
));
let chemistry;
let modules;

before(async () => {
  chemistry = await loadExerciseChemistry();
  modules = {
    question: await chemistry.loadModule("/app/practice-question.ts"),
    generator: await chemistry.loadModule("/app/exercise-chemical-generator.ts"),
    distractor: await chemistry.loadModule("/app/practice-distractor-engine.ts"),
    oracle: await chemistry.loadModule("/app/exercise-chemistry-oracles.ts"),
  };
});

after(async () => { await chemistry?.close(); });

function engineGenerator() {
  const oracles = modules.oracle.createExerciseChemistryOracles(chemistry.engine);
  const generateMolecule = modules.generator.createRestrictedChemicalGenerator(oracles);
  const distractors = modules.distractor.createDeterministicDistractorEngine({
    analyzeMolecule: chemistry.engine.analyzeMolecule,
    buildLegacyEnglishNameModel: chemistry.engine.buildLegacyEnglishNameModel,
  }, oracles);
  return modules.question.createPracticeQuestionGenerator(generateMolecule, distractors);
}

function syntheticQuestions(config) {
  return Array.from({ length: config.questionCount }, (_, index) => ({
    question: { id: `exercise:${index}`, seed: `question:${index}`, generatorVersion: config.generatorVersion },
    category: config.categories[index % config.categories.length],
    reference: {
      structuralIdentity: `structure:${index}`,
      names: { en: `engine reference ${index}`, es: `referencia del motor ${index}` },
    },
  }));
}

function syntheticAssets(count) {
  return Array.from({ length: count }, () => ({ data: new Uint8Array(onePixelPng), width: 1, height: 1 }));
}

function docxImageTargets(entries) {
  const documentXml = entries.get("word/document.xml").toString("utf8");
  const relationships = entries.get("word/_rels/document.xml.rels").toString("utf8");
  const targets = new Map([...relationships.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)]
    .map((match) => [match[1], match[2]]));
  return [...documentXml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)].map((match) => targets.get(match[1]));
}

function assertNoAnswerBytes(entries, answers) {
  for (const answer of answers) {
    const needle = Buffer.from(answer, "utf8");
    for (const [name, data] of entries) assert.equal(data.includes(needle), false, `Student package leaks a reference answer in ${name}.`);
  }
}

test("config applies explicit defaults and strictly validates finite Naming assessment options", () => {
  const defaults = createNamingAssessmentConfig({ seed: "DOCX-CONFIG-DEFAULT" });
  assert.deepEqual({ locale: defaults.locale, questionCount: defaults.questionCount, difficulty: defaults.difficulty,
    categories: defaults.categories, questionType: defaults.questionType, generatorVersion: defaults.generatorVersion }, {
    locale: "en", questionCount: 10, difficulty: "basic", categories: ["alkane", "alkene", "alkyne"],
    questionType: "naming", generatorVersion: 4,
  });

  for (const questionCount of [5, 10, 20, 30]) {
    assert.equal(createNamingAssessmentConfig({ seed: "DOCX-COUNT", questionCount }).questionCount, questionCount);
  }
  assert.deepEqual(createNamingAssessmentConfig({ seed: "DOCX-CATEGORIES", categories: ["alkyne", "alkane"] }).categories,
    ["alkane", "alkyne"]);
  assert.equal(createNamingAssessmentConfig({ seed: "DOCX-ADVANCED", difficulty: "advanced" }).difficulty, "advanced");
  assert.equal(namingAssessmentSessionConfig(defaults).generatorVersion, 4);
  assert.equal(namingAssessmentFilename("student"), "hydrocarbon-lab-naming-student.docx");
  assert.equal(namingAssessmentFilename("teacher"), "hydrocarbon-lab-naming-teacher.docx");

  for (const questionCount of [0, -1, 3, 100, Number.NaN, "10"]) {
    assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", questionCount }), /questionCount/);
  }
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", difficulty: "Hard" }), /difficulty/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", locale: "fr" }), /locale/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", categories: [] }), /category/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", categories: ["all"] }), /canonical category/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", categories: ["alkane", "alkane"] }), /unique/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", questionType: "multiple-choice" }), /Naming/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", generatorVersion: 3 }), /generatorVersion 4/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "  " }), /seed/);
  assert.throws(() => normalizeNamingAssessmentConfig({ seed: "DOCX-INVALID", extra: true }), /Unexpected/);
});

test("5/10/20/30 model matrix retains locale, Difficulty, category and generator metadata without mutation", () => {
  const matrix = [
    { locale: "en", questionCount: 5, difficulty: "basic", categories: ["alkane"] },
    { locale: "es", questionCount: 10, difficulty: "intermediate", categories: ["alkane", "alkene"] },
    { locale: "en", questionCount: 20, difficulty: "advanced", categories: ["alkene"] },
    { locale: "es", questionCount: 30, difficulty: "basic", categories: ["alkane", "alkyne"] },
  ];
  for (const [index, selection] of matrix.entries()) {
    const config = createNamingAssessmentConfig({ ...selection, seed: `DOCX-MATRIX-${index}` });
    const questions = syntheticQuestions(config);
    const assets = syntheticAssets(config.questionCount);
    const before = JSON.stringify({ config, questions, assets: assets.map((asset) => ({ ...asset, data: [...asset.data] })) });
    const model = createDocxAssessmentModel({ config, questions, structureAssets: assets });
    assert.equal(model.questions.length, config.questionCount);
    assert.equal(model.metadata.questionCount, config.questionCount);
    assert.equal(model.locale, config.locale);
    assert.equal(model.metadata.locale, config.locale);
    assert.equal(model.metadata.difficulty, config.difficulty);
    assert.deepEqual(model.metadata.categories, config.categories);
    assert.equal(model.metadata.generatorVersion, 4);
    assert.deepEqual(model.questions.map((question) => question.difficulty), Array(config.questionCount).fill(config.difficulty));
    assert.equal(JSON.stringify({ config, questions, assets: assets.map((asset) => ({ ...asset, data: [...asset.data] })) }), before);
  }

  const config = createNamingAssessmentConfig({ seed: "DOCX-MODEL-ERRORS", questionCount: 5, categories: ["alkane"] });
  const questions = syntheticQuestions(config);
  const assets = syntheticAssets(5);
  assert.throws(() => createDocxAssessmentModel({ config, questions: questions.slice(0, 4), structureAssets: assets }), /exactly one/);
  assert.throws(() => createDocxAssessmentModel({ config, questions, structureAssets: assets.slice(0, 4) }), /exactly one/);
  assert.throws(() => createDocxAssessmentModel({ config, questions, structureAssets: assets.map((asset, index) =>
    index === 0 ? { ...asset, data: new Uint8Array([1, 2, 3]) } : asset) }), /valid PNG/);
  assert.throws(() => createDocxAssessmentModel({ config, questions: questions.map((question, index) => index === 0
    ? { ...question, reference: { ...question.reference, names: { en: "", es: "" } } } : question), structureAssets: assets }), /no en reference answer/);
  assert.throws(() => createDocxAssessmentModel({ config, questions: questions.map((question, index) => index === 0
    ? { ...question, type: "build" } : question), structureAssets: assets }), /Naming questions only/);
  assert.throws(() => createDocxAssessmentModel({ config, questions: questions.map((question, index) => index === 0
    ? { ...question, question: { ...question.question, generatorVersion: 3 } } : question), structureAssets: assets }), /generator version/);
});

test("one real assessment gives identical ES/EN chemistry and one shared Student/Teacher question set", async () => {
  const base = { seed: "DOCX-1-ES-EN-IDENTITY", questionCount: 10, difficulty: "intermediate",
    categories: ["alkane", "alkene", "alcohol"] };
  const spanishConfig = createNamingAssessmentConfig({ ...base, locale: "es" });
  const englishConfig = createNamingAssessmentConfig({ ...base, locale: "en" });
  const generate = engineGenerator();
  const spanishQuestions = selectNamingAssessmentQuestions(spanishConfig, generate);
  const englishQuestions = selectNamingAssessmentQuestions(englishConfig, generate);
  assert.deepEqual(spanishQuestions.map((question) => question.question.id), englishQuestions.map((question) => question.question.id));
  assert.deepEqual(spanishQuestions.map((question) => question.reference.structuralIdentity),
    englishQuestions.map((question) => question.reference.structuralIdentity));
  assert.deepEqual(spanishQuestions.map((question) => question.category), englishQuestions.map((question) => question.category));
  const repeatedSpanishQuestions = selectNamingAssessmentQuestions(spanishConfig, generate);
  assert.deepEqual(spanishQuestions.map((question) => question.question.id),
    repeatedSpanishQuestions.map((question) => question.question.id), "same seed and locale must repeat the same question order");
  assert.deepEqual(spanishQuestions.map((question) => question.reference.structuralIdentity),
    repeatedSpanishQuestions.map((question) => question.reference.structuralIdentity));
  assert.ok(spanishQuestions.some((question, index) => question.reference.names.es !== englishQuestions[index].reference.names.en));

  const assets = await renderDocxStructurePngAssets(spanishQuestions, chemistry.engine.MoleculeHistoryPreview);
  const visualProbes = ["alkane", "alkene", "alcohol"].map((category) => {
    const index = spanishQuestions.findIndex((question) => question.category === category);
    assert.ok(index >= 0, `expected a real ${category} question for the image proof`);
    return { category, question: spanishQuestions[index], asset: assets[index], index };
  });
  for (const { category, question, asset, index } of visualProbes) {
    const svg = renderDocxStructureSvg(question, chemistry.engine.MoleculeHistoryPreview, index);
    const ink = await inspectDocxStructureRaster(question, svg, asset.data);
    assert.match(svg, /<style>[\s\S]*practice-molecule-preview line/);
    assert.ok(!svg.includes("var("), "the isolated SVG must not depend on external CSS variables");
    assert.ok(ink.carbonBondSegments > 0, `${category} should have carbon-carbon bond segments`);
    assert.equal(ink.visibleCarbonBondSegments, ink.carbonBondSegments,
      `${category} must rasterize ink on every carbon-carbon bond segment`);
  }
  assert.ok(visualProbes.find(({ category }) => category === "alkene").question.molecule.bonds
    .some((bond) => (bond[2] ?? 1) === 2), "the alkene probe must include a double bond");
  assert.ok(visualProbes.find(({ category }) => category === "alcohol").question.molecule.atoms
    .some((atom) => atom.element === "O"), "the substituent probe must include its oxygen atom");
  const studentModel = createDocxAssessmentModel({ config: spanishConfig, questions: spanishQuestions, structureAssets: assets });
  const teacherModel = studentModel;
  assert.equal(studentModel, teacherModel);
  assert.equal(studentModel.questions.length, 10);
  assert.ok(studentModel.questions.some((question) => question.referenceAnswer.length >= 18), "expected a long reference answer");
  assert.deepEqual(studentModel.questions.map(({ structuralIdentity }) => structuralIdentity),
    teacherModel.questions.map(({ structuralIdentity }) => structuralIdentity));
  assert.deepEqual(studentModel.questions.map(({ exerciseId }) => exerciseId), teacherModel.questions.map(({ exerciseId }) => exerciseId));

  const snapshot = JSON.stringify(studentModel, (key, value) => value instanceof Uint8Array ? [...value] : value);
  const [studentBuffer, teacherBuffer] = await Promise.all([
    renderStudentDocxBuffer(studentModel), renderTeacherDocxBuffer(teacherModel),
  ]);
  assert.equal(JSON.stringify(studentModel, (key, value) => value instanceof Uint8Array ? [...value] : value), snapshot,
    "rendering either version must leave the shared model unchanged");
  assert.ok(studentBuffer.length > 0);
  assert.ok(teacherBuffer.length > 0);
  const studentEntries = readZipEntries(studentBuffer);
  const teacherEntries = readZipEntries(teacherBuffer);
  for (const entries of [studentEntries, teacherEntries]) assert.ok(entries.has("word/document.xml"));
  const studentXml = studentEntries.get("word/document.xml").toString("utf8");
  const teacherXml = teacherEntries.get("word/document.xml").toString("utf8");
  const studentText = getWordDocumentText(studentXml);
  const teacherText = getWordDocumentText(teacherXml);
  const answers = studentModel.questions.map(({ referenceAnswer }) => referenceAnswer);
  assert.ok(studentText.includes("Hydrocarbon Lab"));
  assert.ok(studentText.includes("Nomenclatura orgánica"));
  assert.ok(studentText.includes("Nombre:") && studentText.includes("Curso:") && studentText.includes("Fecha:"));
  assert.equal((studentText.match(/Nombra la siguiente estructura\./g) ?? []).length, 10);
  assert.ok(!studentText.includes("Respuestas"));
  assert.ok(teacherText.includes("Versión docente") && teacherText.includes("Respuestas"));
  assert.ok(teacherXml.includes('w:type="page"'));
  for (const answer of answers) assert.ok(teacherText.includes(answer));
  assertNoAnswerBytes(studentEntries, answers);
  assert.deepEqual(docxImageTargets(studentEntries), docxImageTargets(teacherEntries),
    "both packages must embed the exact same structure images in the same order");
  for (const entries of [studentEntries, teacherEntries]) {
    assert.equal([...entries.keys()].filter((name) => name.startsWith("word/media/") && !name.endsWith("/")).length, 10);
    assert.equal((entries.get("word/document.xml").toString("utf8").match(/<a:blip\b/g) ?? []).length, 10);
  }

  const englishAssets = await renderDocxStructurePngAssets(englishQuestions, chemistry.engine.MoleculeHistoryPreview);
  const englishModel = createDocxAssessmentModel({ config: englishConfig, questions: englishQuestions, structureAssets: englishAssets });
  const [englishStudentBuffer, englishTeacherBuffer] = await Promise.all([
    renderStudentDocxBuffer(englishModel), renderTeacherDocxBuffer(englishModel),
  ]);
  const englishStudentEntries = readZipEntries(englishStudentBuffer);
  const englishTeacherEntries = readZipEntries(englishTeacherBuffer);
  const englishStudentText = getWordDocumentText(englishStudentEntries.get("word/document.xml").toString("utf8"));
  const englishTeacherText = getWordDocumentText(englishTeacherEntries.get("word/document.xml").toString("utf8"));
  assert.ok(englishStudentText.includes("Organic Nomenclature"));
  assert.ok(englishStudentText.includes("Name:") && englishStudentText.includes("Course:") && englishStudentText.includes("Date:"));
  assert.equal((englishStudentText.match(/Name the following structure\./g) ?? []).length, 10);
  assert.ok(englishTeacherText.includes("Teacher Version") && englishTeacherText.includes("Answer Key"));
  assert.deepEqual(docxImageTargets(studentEntries), docxImageTargets(englishStudentEntries),
    "locale must not alter the generated structure image order");
  assertNoAnswerBytes(englishStudentEntries, englishModel.questions.map(({ referenceAnswer }) => referenceAnswer));
  for (const answer of englishModel.questions.map(({ referenceAnswer }) => referenceAnswer)) assert.ok(englishTeacherText.includes(answer));
});
