import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createDocxAssessmentModel, createMultipleChoiceAssessmentConfig, createNamingAssessmentConfig,
  multipleChoiceAssessmentFilename, namingAssessmentFilename } from "../app/docx-export-model.ts";
import { selectMultipleChoiceAssessmentQuestions, selectNamingAssessmentQuestions } from "../app/docx-assessment-selection.ts";
import { renderStudentDocxBuffer, renderTeacherDocxBuffer } from "../app/docx-export.ts";
import { getWordDocumentText, readZipEntries } from "./docx-archive.mjs";
import { inspectDocxStructureRaster, renderDocxStructurePngAssets, renderDocxStructureSvg } from "./docx-structure-assets.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const isMcq = process.argv.includes("--mcq");
const outputDirectory = join(root, "outputs", isMcq ? "docx-2" : "docx-1");
const proofConfigInput = {
  locale: "es",
  questionCount: 10,
  difficulty: "intermediate",
  categories: ["alkane", "alkene", "alcohol"],
  seed: isMcq ? "DOCX-2-MCQ-ASSESSMENT" : "DOCX-1-NAMING-ASSESSMENT",
};
const proofConfig = isMcq ? createMultipleChoiceAssessmentConfig(proofConfigInput) : createNamingAssessmentConfig(proofConfigInput);
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
});

function inspectDocx(buffer, { locale, teacher, questionType, questions: assessmentQuestions, expectedQuestions }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("DOCX renderer returned an empty package.");
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml")?.toString("utf8");
  if (!documentXml) throw new Error("DOCX package is missing word/document.xml.");
  const text = getWordDocumentText(documentXml);
  const normalizedText = text.replace(/\s+/g, " ");
  const media = [...entries.keys()].filter((name) => name.startsWith("word/media/") && !name.endsWith("/"));
  const questionPrompt = questionType === "multiple-choice"
    ? locale === "es" ? "¿Cuál es el nombre IUPAC correcto?" : "What is the correct IUPAC name?"
    : locale === "es" ? "Nombra la siguiente estructura." : "Name the following structure.";
  const answerHeader = locale === "es" ? "Respuestas" : "Answer Key";
  const teacherLabel = locale === "es" ? "Versión docente" : "Teacher Version";
  const bodyQuestions = (text.match(new RegExp(questionPrompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  if (bodyQuestions !== expectedQuestions
    || (documentXml.match(/<a:blip\b/g) ?? []).length !== expectedQuestions
    || media.length !== expectedQuestions
    || (teacher && (!text.includes(answerHeader) || !text.includes(teacherLabel)
      || assessmentQuestions.some((question) => {
        const answer = question.questionType === "multiple-choice"
          ? `${String.fromCharCode(65 + question.correctOptionIndex)}. ${question.referenceAnswer}` : question.referenceAnswer;
        return !text.includes(answer);
      })))
    || (!teacher && (text.includes(answerHeader) || text.includes("Teacher Version") || text.includes("Versión docente")))) {
    throw new Error(`DOCX validation failed (teacher=${teacher}, prompts=${bodyQuestions}, media=${media.length}).`);
  }
  if (!teacher) {
    const studentMetadataMarkers = ["correctOptionIndex", "correctOptionId", "optionSetIdentity", "diagnosticCode", "recipeId"];
    for (const marker of studentMetadataMarkers) {
      for (const [name, entry] of entries) if (entry.includes(Buffer.from(marker))) {
        throw new Error(`Student package leaks correctness metadata (${marker}) in ${name}.`);
      }
    }
    if (questionType === "naming") for (const question of assessmentQuestions) {
      for (const [name, entry] of entries) if (entry.includes(Buffer.from(question.referenceAnswer, "utf8"))) {
        throw new Error(`Student package leaks a Naming answer in ${name}.`);
      }
    }
  }
  if (questionType === "multiple-choice") {
    for (const question of assessmentQuestions) {
      if (question.options.length !== 4) throw new Error(`MCQ ${question.number} does not have exactly four engine options.`);
      let previous = -1;
      for (const [index, option] of question.options.entries()) {
        const labeledOption = `${String.fromCharCode(65 + index)}. ${option.text}`;
        const position = text.indexOf(labeledOption, previous + 1);
        if (position <= previous) throw new Error(`DOCX package omits or reorders engine option ${question.number}:${option.optionId}.`);
        previous = position;
      }
      const answer = `${question.number}. ${String.fromCharCode(65 + question.correctOptionIndex)}. ${question.referenceAnswer}`;
      if (teacher && !normalizedText.includes(answer)) throw new Error(`Teacher Answer Key omits ${answer}.`);
    }
  }
  return { bytes: buffer.length, entries: entries.size, media: media.length, text };
}

try {
  const engine = await server.ssrLoadModule("/app/page.tsx");
  const [questionModule, distractorModule, oracleModule] = await Promise.all([
    server.ssrLoadModule("/app/practice-question.ts"),
    server.ssrLoadModule("/app/practice-distractor-engine.ts"),
    server.ssrLoadModule("/app/exercise-chemistry-oracles.ts"),
  ]);
  const oracles = oracleModule.createExerciseChemistryOracles(engine);
  const generateMolecule = (await server.ssrLoadModule("/app/exercise-chemical-generator.ts"))
    .createRestrictedChemicalGenerator(oracles);
  const distractors = distractorModule.createDeterministicDistractorEngine({
    analyzeMolecule: engine.analyzeMolecule,
    buildLegacyEnglishNameModel: engine.buildLegacyEnglishNameModel,
  }, oracles);
  const generate = questionModule.createPracticeQuestionGenerator(generateMolecule, distractors);
  const questions = isMcq
    ? selectMultipleChoiceAssessmentQuestions(proofConfig, generate)
    : selectNamingAssessmentQuestions(proofConfig, generate);
  const structureAssets = await renderDocxStructurePngAssets(questions, engine.MoleculeHistoryPreview);
  const visualPhase = process.argv.includes("--baseline") || process.argv.includes("baseline") ? "baseline" : "fixed";
  const visualDirectory = join(outputDirectory, "visual", visualPhase);
  const visualProbes = [];
  const visualQuestions = isMcq
    ? questions.map((question, index) => ({ question, index, category: question.category }))
    : ["alkane", "alkene", "alcohol"].map((category) => {
      const index = questions.findIndex((question) => question.category === category);
      if (index < 0) throw new Error(`Proof seed did not produce the required ${category} visual probe.`);
      return { question: questions[index], index, category };
    });
  for (const { question, index, category } of visualQuestions) {
    const artifactName = isMcq ? `${index + 1}-${category}` : category;
    const svg = renderDocxStructureSvg(question, engine.MoleculeHistoryPreview, index);
    const png = structureAssets[index].data;
    const rasterInspection = await inspectDocxStructureRaster(question, svg, png);
    await mkdir(visualDirectory, { recursive: true });
    await Promise.all([
      writeFile(join(visualDirectory, `${artifactName}.svg`), svg),
      writeFile(join(visualDirectory, `${artifactName}.png`), png),
    ]);
    if (rasterInspection.carbonBondSegments === 0) throw new Error(`${category} probe has no carbon-carbon bond segments.`);
    if (visualPhase === "fixed" && rasterInspection.visibleCarbonBondSegments !== rasterInspection.carbonBondSegments) {
      throw new Error(`${category} probe rasterized only ${rasterInspection.visibleCarbonBondSegments}/${rasterInspection.carbonBondSegments} carbon-carbon bond segments.`);
    }
    if (visualPhase === "baseline" && rasterInspection.visibleCarbonBondSegments !== 0) {
      throw new Error(`Expected the original unstyled SVG bug, but ${category} has visible bond ink.`);
    }
    visualProbes.push({
      category,
      atoms: question.molecule.atoms.length,
      bonds: question.molecule.bonds.length,
      ...rasterInspection,
      svg: join(visualDirectory, `${artifactName}.svg`),
      png: join(visualDirectory, `${artifactName}.png`),
    });
  }
  if (!isMcq) {
    const alkeneProbe = visualProbes.find(({ category }) => category === "alkene");
    if (alkeneProbe.doubleBondSegments === 0) throw new Error("The alkene visual probe has no double-bond segments.");
  }
  const model = createDocxAssessmentModel({ config: proofConfig, questions, structureAssets });
  const [studentBuffer, teacherBuffer] = await Promise.all([
    renderStudentDocxBuffer(model), renderTeacherDocxBuffer(model),
  ]);
  const questionType = isMcq ? "multiple-choice" : "naming";
  const student = inspectDocx(studentBuffer, { locale: model.locale, teacher: false, questionType,
    questions: model.questions, expectedQuestions: model.questions.length });
  const teacher = inspectDocx(teacherBuffer, { locale: model.locale, teacher: true, questionType,
    questions: model.questions, expectedQuestions: model.questions.length });
  if (model.questions.some(({ referenceAnswer }) => !referenceAnswer)
    || !model.questions.some(({ referenceAnswer }) => referenceAnswer.length >= 18)) {
    throw new Error("The proof must include a long, nonempty engine reference answer.");
  }
  const studentPath = join(outputDirectory, isMcq ? multipleChoiceAssessmentFilename("student") : namingAssessmentFilename("student"));
  const teacherPath = join(outputDirectory, isMcq ? multipleChoiceAssessmentFilename("teacher") : namingAssessmentFilename("teacher"));
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([writeFile(studentPath, studentBuffer), writeFile(teacherPath, teacherBuffer)]);
  console.log(JSON.stringify({
    status: "PASS",
    config: proofConfig,
    questionCategories: model.questions.map(({ category }) => category),
    optionCounts: isMcq ? model.questions.map(({ options }) => options.length) : undefined,
    answerKeyEntries: isMcq ? model.questions.length : undefined,
    correctOptionLetters: isMcq ? model.questions.map(({ correctOptionIndex }) => String.fromCharCode(65 + correctOptionIndex)) : undefined,
    visualPhase,
    visualProbes,
    referenceAnswerLengths: model.questions.map(({ referenceAnswer }) => referenceAnswer.length),
    student: { path: studentPath, bytes: student.bytes, mediaAssets: student.media },
    teacher: { path: teacherPath, bytes: teacher.bytes, mediaAssets: teacher.media },
    studentPrivacyCheck: isMcq ? "correctness metadata absent" : "Naming reference bytes absent",
  }, null, 2));
} finally {
  await server.close();
}
