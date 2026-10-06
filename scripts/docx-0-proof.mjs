import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createDocxAssessmentModel } from "../app/docx-export-model.ts";
import { renderDocxBuffer } from "../app/docx-export.ts";
import { readZipEntries, getWordDocumentText } from "./docx-archive.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
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
  const [sessionModule, selectionModule, chemistryModule, questionModule, distractorModule, oracleModule] = await Promise.all([
    server.ssrLoadModule("/app/practice-session.ts"),
    server.ssrLoadModule("/app/session-question-selection.ts"),
    server.ssrLoadModule("/app/exercise-chemical-generator.ts"),
    server.ssrLoadModule("/app/practice-question.ts"),
    server.ssrLoadModule("/app/practice-distractor-engine.ts"),
    server.ssrLoadModule("/app/exercise-chemistry-oracles.ts"),
  ]);
  const config = sessionModule.createPracticeConfig(
    ["alkane", "alkene", "alkyne"], 5, "en", "DOCX-0-PROOF-NAMING", ["naming"], "basic", 4,
  );
  const oracles = oracleModule.createExerciseChemistryOracles(engine);
  const generateMolecule = chemistryModule.createRestrictedChemicalGenerator(oracles);
  const distractors = distractorModule.createDeterministicDistractorEngine({
    analyzeMolecule: engine.analyzeMolecule,
    buildLegacyEnglishNameModel: engine.buildLegacyEnglishNameModel,
  }, oracles);
  const generate = questionModule.createPracticeQuestionGenerator(generateMolecule, distractors);

  const questions = [];
  let context = { config, index: 0, generationIndex: 0, recentIdentities: [], usedExerciseKeys: [] };
  for (let index = 0; index < 5; index += 1) {
    const selected = selectionModule.selectSessionQuestion(context, generate);
    if (!selected.ok) throw new Error(`Practice selection failed at question ${index + 1}: ${selected.reason ?? "unknown"}`);
    questions.push(selected.question);
    context = {
      ...context,
      index: index + 1,
      generationIndex: selected.generationIndex + 1,
      recentIdentities: selected.recentIdentities,
      usedExerciseKeys: selected.usedExerciseKeys,
    };
  }

  const structureAssets = await Promise.all(questions.map(async (question, index) => {
    const svg = renderToStaticMarkup(createElement(engine.MoleculeHistoryPreview, {
      molecule: question.molecule,
      width: 360,
      height: 180,
      practiceView: true,
      ariaLabel: `Chemical structure for question ${index + 1}`,
    }));
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return { data: new Uint8Array(png), width: 360, height: 180, altText: `Chemical structure for question ${index + 1}` };
  }));
  const model = createDocxAssessmentModel({ config, questions, structureAssets, includeAnswerKey: true });
  const buffer = await renderDocxBuffer(model);
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml")?.toString("utf8");
  if (!documentXml) throw new Error("DOCX package is missing word/document.xml.");
  const text = getWordDocumentText(documentXml);
  const mediaCount = [...entries.keys()].filter((name) => name.startsWith("word/media/") && !name.endsWith("/")).length;
  if ((text.match(/What is the IUPAC name\?/g) ?? []).length !== 5
    || !text.includes("Answer Key")
    || !documentXml.includes('w:type="page"')
    || model.questions.some(({ referenceAnswer }) => !text.includes(referenceAnswer))
    || mediaCount !== 5) {
    throw new Error(`Generated DOCX checks failed: prompts=${(text.match(/What is the IUPAC name\?/g) ?? []).length}, answerKey=${text.includes("Answer Key")}, media=${mediaCount}, answers=${model.questions.map(({ referenceAnswer }) => text.includes(referenceAnswer))}.`);
  }

  const output = `${root}/outputs/docx-0/hydrocarbon-lab-naming-proof.docx`;
  await mkdir(`${root}/outputs/docx-0`, { recursive: true });
  await writeFile(output, buffer);
  console.log(JSON.stringify({
    path: output,
    bytes: buffer.length,
    questions: model.questions.length,
    answers: model.questions.map(({ referenceAnswer }) => referenceAnswer),
    mediaAssets: mediaCount,
    seed: config.seed,
    generatorVersion: config.generatorVersion,
    difficulty: config.difficulty,
    categories: [...config.categories],
    locale: config.locale,
    uniqueQuestionCategories: model.questions.map(({ category }) => category),
    zipEntries: entries.size,
    status: "PASS",
  }, null, 2));
} finally {
  await server.close();
}
