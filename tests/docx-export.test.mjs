import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createDocxAssessmentModel } from "../app/docx-export-model.ts";
import { renderDocxBuffer } from "../app/docx-export.ts";
import { getWordDocumentText, readZipEntries } from "../scripts/docx-archive.mjs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

const onePixelPng = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jW5kAAAAASUVORK5CYII=", "base64",
));
let chemistry;
let modules;

before(async () => {
  chemistry = await loadExerciseChemistry();
  modules = {
    session: await chemistry.loadModule("/app/practice-session.ts"),
    selection: await chemistry.loadModule("/app/session-question-selection.ts"),
    generator: await chemistry.loadModule("/app/exercise-chemical-generator.ts"),
    question: await chemistry.loadModule("/app/practice-question.ts"),
    distractor: await chemistry.loadModule("/app/practice-distractor-engine.ts"),
    oracle: await chemistry.loadModule("/app/exercise-chemistry-oracles.ts"),
  };
});

after(async () => { await chemistry?.close(); });

function fixture(locale = "en") {
  const config = modules.session.createPracticeConfig(
    ["alkane", "alkene", "alkyne"], 5, locale, "DOCX-0-MODEL-TEST", ["naming"], "basic", 4,
  );
  const oracles = modules.oracle.createExerciseChemistryOracles(chemistry.engine);
  const generateMolecule = modules.generator.createRestrictedChemicalGenerator(oracles);
  const distractors = modules.distractor.createDeterministicDistractorEngine({
    analyzeMolecule: chemistry.engine.analyzeMolecule,
    buildLegacyEnglishNameModel: chemistry.engine.buildLegacyEnglishNameModel,
  }, oracles);
  const generate = modules.question.createPracticeQuestionGenerator(generateMolecule, distractors);
  const questions = [];
  let context = { config, index: 0, generationIndex: 0, recentIdentities: [], usedExerciseKeys: [] };
  for (let index = 0; index < 5; index += 1) {
    const selected = modules.selection.selectSessionQuestion(context, generate);
    assert.equal(selected.ok, true);
    questions.push(selected.question);
    context = { ...context, index: index + 1, generationIndex: selected.generationIndex + 1,
      recentIdentities: selected.recentIdentities, usedExerciseKeys: selected.usedExerciseKeys };
  }
  const structureAssets = Array.from({ length: 5 }, (_, index) => ({
    data: new Uint8Array(onePixelPng), width: 1, height: 1, altText: `Structure ${index + 1}`,
  }));
  return { config, questions, structureAssets };
}

test("DOCX model is deterministic, read-only, locale-ready, and renders a valid five-answer package", async () => {
  const input = fixture("en");
  const beforeInput = structuredClone({ config: input.config, questions: input.questions,
    structureAssets: input.structureAssets.map((asset) => ({ ...asset, data: [...asset.data] })) });
  const english = createDocxAssessmentModel(input);
  const repeated = createDocxAssessmentModel(input);
  assert.deepEqual(english, repeated);
  assert.equal(english.questions.length, 5);
  assert.deepEqual(english.questions.map(({ referenceAnswer }) => referenceAnswer),
    input.questions.map((question) => question.reference.names.en));
  assert.deepEqual({ config: input.config, questions: input.questions,
    structureAssets: input.structureAssets.map((asset) => ({ ...asset, data: [...asset.data] })) }, beforeInput);

  const spanishInput = { ...input, config: { ...input.config, locale: "es" } };
  const spanish = createDocxAssessmentModel(spanishInput);
  assert.equal(spanish.locale, "es");
  assert.deepEqual(spanish.questions.map(({ referenceAnswer }) => referenceAnswer),
    input.questions.map((question) => question.reference.names.es));

  const buffer = await renderDocxBuffer(english);
  assert.ok(buffer.length > 0);
  const entries = readZipEntries(buffer);
  assert.ok(entries.has("word/document.xml"));
  const xml = entries.get("word/document.xml").toString("utf8");
  const text = getWordDocumentText(xml);
  assert.equal((text.match(/What is the IUPAC name\?/g) ?? []).length, 5);
  assert.ok(text.includes("Answer Key"));
  assert.ok(xml.includes('w:type="page"'));
  for (const question of english.questions) assert.ok(text.includes(question.referenceAnswer));
  assert.equal((xml.match(/<a:blip\b/g) ?? []).length, 5);
  assert.ok([...entries.keys()].some((name) => name.startsWith("word/media/") && !name.endsWith("/")));
});
