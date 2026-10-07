import {
  createMultipleChoiceAssessmentConfig,
  createNamingAssessmentConfig,
  createDocxAssessmentModel,
} from "./docx-export-model.ts";
import type { DocxAssessmentConfigInput } from "./docx-export-model.ts";
import { selectMultipleChoiceAssessmentQuestions, selectNamingAssessmentQuestions } from "./docx-assessment-selection.ts";
import type { PracticeQuestionGenerator } from "./practice-question.ts";
import type { DocxStructurePreview } from "./docx-structure-assets-browser.ts";

export type WorksheetOutput = "student" | "teacher" | "both";
export type WorksheetFile = Readonly<{ filename: string; blob: Blob }>;

/** Builds a single seeded assessment and renders its requested audience copies from that snapshot. */
export async function createWorksheetFiles(input: Readonly<{
  config: DocxAssessmentConfigInput;
  generate: PracticeQuestionGenerator;
  Preview: DocxStructurePreview;
  output: WorksheetOutput;
}>): Promise<readonly WorksheetFile[]> {
  if (input.output !== "student" && input.output !== "teacher" && input.output !== "both") {
    throw new TypeError("Choose Student, Teacher, or Both output.");
  }
  const config = input.config.questionType === "multiple-choice"
    ? createMultipleChoiceAssessmentConfig(input.config)
    : createNamingAssessmentConfig(input.config);
  const questions = config.questionType === "multiple-choice"
    ? selectMultipleChoiceAssessmentQuestions(config, input.generate)
    : selectNamingAssessmentQuestions(config, input.generate);
  const { renderDocxStructurePngAssetsBrowser } = await import("./docx-structure-assets-browser.ts");
  const structureAssets = await renderDocxStructurePngAssetsBrowser(questions, input.Preview);
  const model = createDocxAssessmentModel({ config, questions, structureAssets });
  const renderer = await import("./docx-export.ts");
  const audienceVersions = input.output === "both" ? ["student", "teacher"] as const : [input.output];
  const filenamePrefix = config.questionType === "multiple-choice" ? "mcq" : "naming";
  const files: WorksheetFile[] = [];
  for (const audience of audienceVersions) {
    const blob = audience === "student"
      ? await renderer.renderStudentDocxBlob(model)
      : await renderer.renderTeacherDocxBlob(model);
    files.push(Object.freeze({ filename: `hydrocarbon-lab-${filenamePrefix}-${audience}.docx`, blob }));
  }
  return Object.freeze(files);
}

/** Triggers ordinary browser downloads; URL ownership stays local and is always released. */
export async function downloadWorksheetFiles(files: readonly WorksheetFile[]): Promise<void> {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Browser downloads are unavailable in this environment.");
  }
  for (const [index, file] of files.entries()) {
    const url = URL.createObjectURL(file.blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }
    if (index < files.length - 1) await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
  }
}
