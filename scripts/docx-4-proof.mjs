import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { xml2js } from "xml-js";
import sharp from "sharp";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import {
  createDocxAssessmentModel,
  createMultipleChoiceAssessmentConfig,
  createNamingAssessmentConfig,
} from "../app/docx-export-model.ts";
import { renderStudentDocxBuffer, renderTeacherDocxBuffer } from "../app/docx-export.ts";
import { readZipEntries, getWordDocumentText } from "./docx-archive.mjs";
import { inspectDocxStructureRaster, renderDocxStructurePngAssets, renderDocxStructureSvg } from "./docx-structure-assets.mjs";
import { DOCX_STRUCTURE_SVG_STYLES } from "../app/docx-structure-svg-style.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = join(root, "outputs", "docx-4");
const allCases = [
  { id: "A-naming-student-5-en-basic", type: "naming", locale: "en", questionCount: 5,
    difficulty: "basic", categories: ["alkane", "alkene", "alkyne"], seed: "DOCX-4-A-NAMING-5" },
  { id: "B-naming-teacher-10-es-hard", type: "naming", locale: "es", questionCount: 10,
    difficulty: "advanced", categories: ["alkane", "alkene", "alkyne", "halogenated", "alcohol", "aromatic", "simple-carbocycle", "ez"],
    seed: "DOCX-4-B-NAMING-10" },
  { id: "C-mcq-student-10-en-intermediate", type: "multiple-choice", locale: "en", questionCount: 10,
    difficulty: "intermediate", categories: ["alkane", "alkene", "alcohol"],
    seed: "DOCX-2-MCQ-ASSESSMENT" },
  { id: "D-mcq-teacher-10-es-hard", type: "multiple-choice", locale: "es", questionCount: 10,
    difficulty: "advanced", categories: ["alkane", "alkene", "alcohol", "ketone", "halogenated", "aromatic", "simple-carbocycle", "ez"],
    seed: "DOCX-4-D-MCQ-10" },
  { id: "E-mcq-teacher-30-en-hard", type: "multiple-choice", locale: "en", questionCount: 30,
    difficulty: "advanced", categories: ["alkane", "alkene", "alcohol", "ketone", "halogenated", "aromatic", "simple-carbocycle", "ez"],
    seed: "DOCX-4-E-MCQ-30" },
  { id: "F-naming-student-20-en-intermediate", type: "naming", locale: "en", questionCount: 20,
    difficulty: "intermediate", categories: ["alkane", "alkene", "alcohol"], seed: "DOCX-4-F-NAMING-20" },
];
const diagnosticArgument = process.argv.find((argument) => argument.startsWith("--diagnose=")
  || argument.startsWith("--diagnose-legacy="));
const diagnosticCase = diagnosticArgument?.slice(diagnosticArgument.indexOf("=") + 1);
const useLegacyMixedModuleLoader = diagnosticArgument?.startsWith("--diagnose-legacy=") ?? false;
const cases = diagnosticCase ? allCases.filter(({ id }) => id === diagnosticCase) : allCases;
if (diagnosticCase && cases.length === 0) throw new Error(`Unknown DOCX proof case ${diagnosticCase}.`);

const xmlAttribute = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];

async function validatePackage(buffer, model, audience) {
  assert.ok(Buffer.isBuffer(buffer) && buffer.length > 0, "renderer must return a nonempty DOCX buffer");
  const endRecord = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(endRecord >= 0 && endRecord + 22 <= buffer.length, "DOCX must have a ZIP end-of-central-directory record");
  const entries = readZipEntries(buffer);
  assert.equal(buffer.readUInt16LE(endRecord + 10), entries.size, "ZIP central directory entry count must match local entries");
  assert.equal(buffer.readUInt32LE(endRecord + 16) + buffer.readUInt32LE(endRecord + 12), endRecord,
    "ZIP central directory bounds must resolve to its end record");
  for (const required of ["[Content_Types].xml", "word/document.xml", "word/_rels/document.xml.rels"]) {
    assert.ok(entries.has(required), `package is missing ${required}`);
  }
  for (const required of ["docProps/core.xml", "docProps/app.xml"]) assert.ok(entries.has(required), `package is missing ${required}`);
  for (const optional of ["word/comments.xml", "word/footnotes.xml", "word/endnotes.xml"]) {
    if (entries.has(optional)) assert.equal(getWordDocumentText(entries.get(optional).toString("utf8")).trim(), "",
      `${optional} must not contain answer or teacher-authored text`);
  }
  if (entries.has("docProps/custom.xml")) {
    assert.doesNotMatch(entries.get("docProps/custom.xml").toString("utf8"), /<property\b/,
      "custom properties must not contain values");
  }
  for (const [name, entry] of entries) {
    if (/\.xml$|\.rels$/i.test(name)) {
      assert.doesNotThrow(() => xml2js(entry.toString("utf8")), `${name} must be well-formed XML`);
    }
  }
  const documentXml = entries.get("word/document.xml").toString("utf8");
  const relsXml = entries.get("word/_rels/document.xml.rels").toString("utf8");
  const documentText = getWordDocumentText(documentXml);
  const normalizedDocumentText = documentText.replace(/\s+/g, " ");
  const pageSize = documentXml.match(/<w:pgSz\b[^>]*\/?\s*>/)?.[0];
  const pageMargins = documentXml.match(/<w:pgMar\b[^>]*\/?\s*>/)?.[0];
  assert.ok(pageSize && pageMargins, "page size and margins must be explicit in OOXML");
  assert.deepEqual([xmlAttribute(pageSize, "w:w"), xmlAttribute(pageSize, "w:h")], ["11906", "16838"],
    "page must use explicit A4 portrait dimensions");
  assert.deepEqual(["w:top", "w:right", "w:bottom", "w:left"].map((name) => xmlAttribute(pageMargins, name)),
    ["900", "1080", "900", "1080"], "page margins must remain explicit and consistent");
  const media = [...entries.keys()].filter((name) => name.startsWith("word/media/") && !name.endsWith("/"));
  const targets = new Map([...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [
    xmlAttribute(tag, "Id"), xmlAttribute(tag, "Target"),
  ]));
  const imageReferences = [...documentXml.matchAll(/<a:blip\b[^>]*>/g)].map(([tag]) => xmlAttribute(tag, "r:embed"));
  assert.equal(imageReferences.length, model.questions.length, "each question must contain one picture reference");
  assert.equal(media.length, model.questions.length, "each question must have one media asset");
  const resolvedTargets = imageReferences.map((id) => {
    const target = targets.get(id);
    assert.ok(target, `image reference ${id} has no relationship`);
    const path = target.startsWith("/") ? target.slice(1) : `word/${target}`;
    assert.ok(entries.has(path), `image relationship ${id} points to missing ${path}`);
    return path;
  });
  assert.equal(new Set(resolvedTargets).size, model.questions.length, "one question must not duplicate its image media");
  const drawingExtents = [...documentXml.matchAll(/<wp:extent\b[^>]*\/?\s*>/g)].map(([tag]) => ({
    width: Number(xmlAttribute(tag, "cx")), height: Number(xmlAttribute(tag, "cy")),
  }));
  assert.equal(drawingExtents.length, model.questions.length, "each image must have a drawing extent");
  for (const [index, path] of resolvedTargets.entries()) {
    const metadata = await sharp(entries.get(path)).metadata();
    assert.equal(metadata.format, "png", `${path} must remain PNG media`);
    assert.equal(metadata.width, model.questions[index].structure.width);
    assert.equal(metadata.height, model.questions[index].structure.height);
    assert.ok(Math.abs(metadata.width / metadata.height - drawingExtents[index].width / drawingExtents[index].height) < 0.001,
      `image ${index + 1} drawing must preserve its aspect ratio`);
  }
  const paragraphs = [...documentXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(([paragraph]) => paragraph);
  for (const question of model.questions) {
    const prompt = paragraphs.find((paragraph) => paragraph.includes(question.prompt));
    assert.ok(prompt?.includes("<w:keepNext"), `question ${question.number} prompt must stay with its structure`);
    const promptIndex = paragraphs.indexOf(prompt);
    assert.ok(paragraphs[promptIndex + 1]?.includes("<w:drawing") && paragraphs[promptIndex + 1].includes("<w:keepNext"),
      `question ${question.number} image must stay with the following question content`);
  }
  for (const question of model.questions) {
    assert.ok(documentText.includes(question.prompt), `question ${question.number} prompt is absent`);
    if (question.questionType === "multiple-choice") {
      for (const [index, option] of question.options.entries()) {
        assert.ok(documentText.includes(`${String.fromCharCode(65 + index)}. ${option.text}`),
          `question ${question.number} option ${index + 1} was truncated or omitted`);
      }
      if (audience === "student") {
        assert.ok(!documentText.includes("Answer Key") && !documentText.includes("Respuestas"));
        assert.ok(!normalizedDocumentText.includes("Teacher Version") && !normalizedDocumentText.includes("Versión docente"));
        for (const marker of ["correctOptionIndex", "correctOptionId", "optionSetIdentity", "diagnosticCode", "recipeId", "optionId",
          "correctOptionLetter", "correctAnswer", "teacher", model.metadata.seed,
          ...model.questions.flatMap(({ exerciseId, structuralIdentity }) => [exerciseId, structuralIdentity])]) {
          for (const [name, entry] of entries) assert.ok(!entry.includes(Buffer.from(marker)), `Student metadata leak ${marker} in ${name}`);
        }
        for (const question of model.questions) {
          assert.ok(!normalizedDocumentText.includes(`${question.number}. ${String.fromCharCode(65 + question.correctOptionIndex)}. `),
            `Student output contains a numbered correct-letter key marker for question ${question.number}`);
        }
      } else {
        assert.ok(normalizedDocumentText.includes(`${question.number}. ${String.fromCharCode(65 + question.correctOptionIndex)}. ${question.referenceAnswer}`),
          `Teacher key omits question ${question.number}`);
      }
    } else if (audience === "student") {
      for (const [name, entry] of entries) assert.ok(!entry.includes(Buffer.from(question.referenceAnswer, "utf8")),
        `Naming Student answer leak in ${name}`);
      assert.ok(!documentText.includes("Answer Key") && !documentText.includes("Respuestas"));
    } else {
      assert.ok(documentText.includes(question.referenceAnswer), `Teacher key omits question ${question.number}`);
    }
  }
  if (audience === "teacher") {
    const keyHeading = model.locale === "en" ? "Answer Key" : "Respuestas";
    assert.ok(documentText.includes(keyHeading));
    const headingPosition = documentXml.indexOf(keyHeading);
    assert.ok(headingPosition > 0);
    const keyBreakPosition = documentXml.lastIndexOf('<w:br w:type="page"', headingPosition);
    assert.ok(keyBreakPosition >= 0, "Teacher Answer Key must follow an explicit page break");
    const answerEntries = model.questions.filter((question) => question.questionType === "multiple-choice"
      ? normalizedDocumentText.includes(`${question.number}. ${String.fromCharCode(65 + question.correctOptionIndex)}. ${question.referenceAnswer}`)
      : documentText.includes(question.referenceAnswer)).length;
    assert.equal(answerEntries, model.questions.length, "Teacher Answer Key must include every configured answer entry");
  }
  return { bytes: buffer.length, mediaAssets: media.length, imageRelationships: imageReferences.length,
    imageDimensions: drawingExtents.map(({ width, height }) => ({ width, height })),
    answerKeyEntries: audience === "teacher" ? model.questions.length : 0 };
}

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
});
try {
  const engine = await server.ssrLoadModule("/app/page.tsx");
  const [questionModule, selectionModule, generatorModule, distractorModule, oracleModule] = await Promise.all([
    server.ssrLoadModule("/app/practice-question.ts"),
    server.ssrLoadModule("/app/docx-assessment-selection.ts"),
    server.ssrLoadModule("/app/exercise-chemical-generator.ts"),
    server.ssrLoadModule("/app/practice-distractor-engine.ts"),
    server.ssrLoadModule("/app/exercise-chemistry-oracles.ts"),
  ]);
  const legacySelectionModule = useLegacyMixedModuleLoader
    ? await import("../app/docx-assessment-selection.ts") : null;
  const nativeQuestionModule = useLegacyMixedModuleLoader
    ? await import("../app/practice-question.ts") : null;
  const oracles = oracleModule.createExerciseChemistryOracles(engine);
  const generateMolecule = generatorModule.createRestrictedChemicalGenerator(oracles);
  const distractors = distractorModule.createDeterministicDistractorEngine({
    analyzeMolecule: engine.analyzeMolecule,
    buildLegacyEnglishNameModel: engine.buildLegacyEnglishNameModel,
  }, oracles);
  const generate = questionModule.createPracticeQuestionGenerator(generateMolecule, distractors);
  assert.match(DOCX_STRUCTURE_SVG_STYLES, /stroke:\s*#18312d/);
  assert.match(DOCX_STRUCTURE_SVG_STYLES, /\.history-carbon\s*\{\s*fill:\s*#18312d/);
  assert.match(DOCX_STRUCTURE_SVG_STYLES, /\.history-hetero\s*\{\s*fill:\s*#ffffff/);
  assert.doesNotMatch(DOCX_STRUCTURE_SVG_STYLES, /var\(|currentColor|prefers-color-scheme|\.dark\b/,
    "print SVG paint must not inherit dark/light theme tokens");
  const browserRasterSource = await readFile(join(root, "app", "docx-structure-assets-browser.ts"), "utf8");
  assert.match(browserRasterSource, /materializeDocxStructureSvg\(markup\)/);
  assert.match(browserRasterSource, /context\.fillStyle\s*=\s*"#ffffff"/,
    "browser rasterization must paint the PNG canvas white independently of the app theme");
  const instrumentedGenerate = diagnosticCase ? ((...args) => {
    const [, generationIndex, context] = args;
    try {
      const question = generate(...args);
      console.error(JSON.stringify({ generationIndex, questionType: context?.questionType, returnedType: question?.type,
        category: question?.category, validMcq: questionModule.isMultipleChoiceQuestion(question)
          ? questionModule.validateMultipleChoiceQuestion(question) : false }));
      return question;
    } catch (error) {
      console.error(JSON.stringify({ generationIndex, questionType: context?.questionType, thrown: error?.name,
        viteSafeDistractorError: error instanceof questionModule.InsufficientSafeDistractorsError,
        nativeSafeDistractorError: nativeQuestionModule ? error instanceof nativeQuestionModule.InsufficientSafeDistractorsError : undefined,
        message: error?.message }));
      throw error;
    }
  }) : generate;
  const proofs = [];

  for (const proofCase of cases) {
    const caseStarted = performance.now();
    const { id, type, ...configInput } = proofCase;
    const configFactory = type === "multiple-choice" ? createMultipleChoiceAssessmentConfig : createNamingAssessmentConfig;
    const config = configFactory({ ...configInput, questionType: type });
    let questions;
    const selectionStarted = performance.now();
    try {
      const selector = legacySelectionModule ?? selectionModule;
      questions = type === "multiple-choice"
        ? selector.selectMultipleChoiceAssessmentQuestions(config, instrumentedGenerate)
        : selector.selectNamingAssessmentQuestions(config, instrumentedGenerate);
    } catch (error) {
      console.error(JSON.stringify({ case: id, config, error: error?.message, stack: error?.stack }, null, 2));
      throw error;
    }
    const selectionMs = performance.now() - selectionStarted;
    const rasterStarted = performance.now();
    const assets = await renderDocxStructurePngAssets(questions, engine.MoleculeHistoryPreview);
    const visualChecks = [];
    for (const [index, question] of questions.entries()) {
      const svg = renderDocxStructureSvg(question, engine.MoleculeHistoryPreview, index);
      const inspection = await inspectDocxStructureRaster(question, svg, assets[index].data);
      assert.ok(inspection.carbonBondSegments > 0, `${id} question ${index + 1} needs visible C-C bonds`);
      assert.equal(inspection.visibleCarbonBondSegments, inspection.carbonBondSegments,
        `${id} question ${index + 1} lost a rendered carbon bond`);
      assert.match(svg, /<style>[\s\S]*practice-molecule-preview line/);
      assert.doesNotMatch(svg, /var\(|currentColor/);
      if (question.molecule.atoms.some((atom) => atom.element && atom.element !== "C")) {
        assert.match(svg, /<text\b/, `${id} question ${index + 1} must retain heteroatom labels`);
      }
      visualChecks.push(inspection);
    }
    const rasterMs = performance.now() - rasterStarted;
    const lineOrders = new Set(visualChecks.flatMap(({ lineOrders: orders }) => orders));
    assert.ok(lineOrders.has(1), `${id} must retain single bonds`);
    const hasAlkene = questions.some(({ molecule }) => molecule.bonds.some((bond) => (bond[2] ?? 1) === 2));
    const hasAlkyne = questions.some(({ molecule }) => molecule.bonds.some((bond) => (bond[2] ?? 1) === 3));
    if (hasAlkene) assert.ok(lineOrders.has(2), `${id} has a double bond but no double-bond SVG strokes`);
    if (hasAlkyne) assert.ok(lineOrders.has(3), `${id} has a triple bond but no triple-bond SVG strokes`);
    const model = createDocxAssessmentModel({ config, questions, structureAssets: assets });
    const [studentBuffer, teacherBuffer] = await Promise.all([
      renderStudentDocxBuffer(model), renderTeacherDocxBuffer(model),
    ]);
    const student = await validatePackage(studentBuffer, model, "student");
    const teacher = await validatePackage(teacherBuffer, model, "teacher");
    const studentEntries = readZipEntries(studentBuffer);
    const teacherEntries = readZipEntries(teacherBuffer);
    const studentXml = studentEntries.get("word/document.xml").toString("utf8");
    const teacherXml = teacherEntries.get("word/document.xml").toString("utf8");
    const studentTargets = [...studentXml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)].map(([, id]) => id);
    const teacherTargets = [...teacherXml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g)].map(([, id]) => id);
    assert.deepEqual(studentTargets, teacherTargets, "Student and Teacher must share identical question-image order");
    const bodyText = (xml) => getWordDocumentText(xml).replace(/\s+/g, " ")
      .replace(/Teacher Version|Versión docente/g, "").replace(/\s+/g, " ").split(/Answer Key|Respuestas/)[0].trim();
    assert.equal(bodyText(studentXml), bodyText(teacherXml), "Student and Teacher question bodies must be identical");
    const maxOptionLength = model.questions.flatMap((question) => question.questionType === "multiple-choice"
      ? question.options.map(({ text }) => text.length) : []).reduce((max, length) => Math.max(max, length), 0);
    const categories = model.questions.map(({ category }) => category);
    assert.equal(model.metadata.generatorVersion, 4);
    assert.equal(model.questions.length, proofCase.questionCount);
    const stem = `hydrocarbon-lab-${id}`;
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(outputDirectory, `${stem}-student.docx`), studentBuffer),
      writeFile(join(outputDirectory, `${stem}-teacher.docx`), teacherBuffer),
    ]);
    proofs.push({ id, locale: config.locale, questionType: config.questionType, seed: config.seed,
      questionCount: model.questions.length, difficulty: config.difficulty, categories,
      uniqueStructuralIdentities: new Set(model.questions.map(({ structuralIdentity }) => structuralIdentity)).size,
      maxOptionLength, longestReferenceAnswer: Math.max(...model.questions.map(({ referenceAnswer }) => referenceAnswer.length)),
      visual: { questions: visualChecks.length, carbonBondSegments: visualChecks.reduce((sum, check) => sum + check.carbonBondSegments, 0),
        visibleCarbonBondSegments: visualChecks.reduce((sum, check) => sum + check.visibleCarbonBondSegments, 0), lineOrders: [...lineOrders],
        hasAlkene, hasAlkyne },
      performanceMs: { selection: Math.round(selectionMs), raster: Math.round(rasterMs), total: Math.round(performance.now() - caseStarted) },
      student, teacher,
      studentPath: join(outputDirectory, `${stem}-student.docx`), teacherPath: join(outputDirectory, `${stem}-teacher.docx`),
    });
  }

  const report = { status: "PASS", generatorVersion: 4, proofCount: proofs.length, proofs };
  await writeFile(join(outputDirectory, "proof-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
