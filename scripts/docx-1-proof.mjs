import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createDocxAssessmentModel, createNamingAssessmentConfig, namingAssessmentFilename } from "../app/docx-export-model.ts";
import { selectNamingAssessmentQuestions } from "../app/docx-assessment-selection.ts";
import { renderStudentDocxBuffer, renderTeacherDocxBuffer } from "../app/docx-export.ts";
import { getWordDocumentText, readZipEntries } from "./docx-archive.mjs";
import { renderDocxStructurePngAssets } from "./docx-structure-assets.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = join(root, "outputs", "docx-1");
const proofConfig = createNamingAssessmentConfig({
  locale: "es",
  questionCount: 10,
  difficulty: "intermediate",
  categories: ["alkane", "alkene", "alcohol"],
  seed: "DOCX-1-NAMING-ASSESSMENT",
});
const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
});

function inspectDocx(buffer, { locale, teacher, answers, expectedQuestions }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("DOCX renderer returned an empty package.");
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml")?.toString("utf8");
  if (!documentXml) throw new Error("DOCX package is missing word/document.xml.");
  const text = getWordDocumentText(documentXml);
  const media = [...entries.keys()].filter((name) => name.startsWith("word/media/") && !name.endsWith("/"));
  const questions = locale === "es" ? "Nombra la siguiente estructura." : "Name the following structure.";
  const answerHeader = locale === "es" ? "Respuestas" : "Answer Key";
  const teacherLabel = locale === "es" ? "Versión docente" : "Teacher Version";
  const bodyQuestions = (text.match(new RegExp(questions.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  if (bodyQuestions !== expectedQuestions
    || (documentXml.match(/<a:blip\b/g) ?? []).length !== expectedQuestions
    || media.length !== expectedQuestions
    || (teacher && (!text.includes(answerHeader) || !text.includes(teacherLabel)
      || answers.some((answer) => !text.includes(answer))))
    || (!teacher && (text.includes(answerHeader) || text.includes("Teacher Version") || text.includes("Versión docente")))) {
    throw new Error(`DOCX validation failed (teacher=${teacher}, prompts=${bodyQuestions}, media=${media.length}).`);
  }
  if (!teacher) {
    for (const answer of answers) {
      const needle = Buffer.from(answer, "utf8");
      for (const [name, entry] of entries) {
        if (entry.includes(needle)) throw new Error(`Student package leaks a reference answer in ${name}.`);
      }
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
  const questions = selectNamingAssessmentQuestions(proofConfig, generate);
  const structureAssets = await renderDocxStructurePngAssets(questions, engine.MoleculeHistoryPreview);
  const model = createDocxAssessmentModel({ config: proofConfig, questions, structureAssets });
  const [studentBuffer, teacherBuffer] = await Promise.all([
    renderStudentDocxBuffer(model), renderTeacherDocxBuffer(model),
  ]);
  const answers = model.questions.map(({ referenceAnswer }) => referenceAnswer);
  const student = inspectDocx(studentBuffer, { locale: model.locale, teacher: false, answers, expectedQuestions: model.questions.length });
  const teacher = inspectDocx(teacherBuffer, { locale: model.locale, teacher: true, answers, expectedQuestions: model.questions.length });
  if (model.questions.some(({ referenceAnswer }) => !referenceAnswer)
    || !model.questions.some(({ referenceAnswer }) => referenceAnswer.length >= 18)) {
    throw new Error("The proof must include a long, nonempty engine reference answer.");
  }
  const studentPath = join(outputDirectory, namingAssessmentFilename("student"));
  const teacherPath = join(outputDirectory, namingAssessmentFilename("teacher"));
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([writeFile(studentPath, studentBuffer), writeFile(teacherPath, teacherBuffer)]);
  console.log(JSON.stringify({
    status: "PASS",
    config: proofConfig,
    questionCategories: model.questions.map(({ category }) => category),
    referenceAnswerLengths: answers.map((answer) => answer.length),
    student: { path: studentPath, bytes: student.bytes, mediaAssets: student.media },
    teacher: { path: teacherPath, bytes: teacher.bytes, mediaAssets: teacher.media },
    studentAnswerLeakCheck: "PASS",
  }, null, 2));
} finally {
  await server.close();
}
