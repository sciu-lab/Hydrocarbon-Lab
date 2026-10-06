import {
  Document, ImageRun, PageBreak, Packer, Paragraph, TextRun,
} from "docx";
import type { DocxAssessment } from "./docx-export-model.ts";

export type DocxAudience = "student" | "teacher";

function structureSize(width: number, height: number) {
  const scale = Math.min(220 / width, 110 / height, 1);
  return { width: Math.max(1, width * scale), height: Math.max(1, height * scale) };
}

export function createDocxDocument(model: DocxAssessment, audience: DocxAudience) {
  if (audience !== "student" && audience !== "teacher") throw new TypeError("Invalid DOCX audience.");
  const english = model.locale === "en";
  const children: Paragraph[] = [
    new Paragraph({ text: "Hydrocarbon Lab", spacing: { after: 80 } }),
    new Paragraph({ text: model.title, heading: "Title", spacing: { after: 120 }, keepNext: true }),
  ];
  if (audience === "teacher") {
    children.push(new Paragraph({
      children: [new TextRun({ text: english ? "Teacher Version" : "Versión docente", bold: true })],
      spacing: { after: 220 },
      keepNext: true,
    }));
  }
  children.push(
    new Paragraph({ text: english ? "Name: ______________________" : "Nombre: ______________________", spacing: { after: 100 } }),
    new Paragraph({ text: english ? "Course: _____________________" : "Curso: _______________________", spacing: { after: 100 } }),
    new Paragraph({ text: english ? "Date: _______________________" : "Fecha: _______________________", spacing: { after: 280 } }),
  );

  for (const question of model.questions) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${question.number}. ${question.prompt}`, bold: true })],
      spacing: { before: 180, after: 80 },
      keepNext: true,
    }));
    children.push(new Paragraph({
      children: [new ImageRun({
        type: "png",
        data: question.structure.data,
        transformation: structureSize(question.structure.width, question.structure.height),
        altText: {
          name: `Chemical structure ${question.number}`,
          description: `Chemical structure for question ${question.number}`,
          title: `Question ${question.number}`,
        },
      })],
      spacing: { after: 60 },
      keepNext: true,
    }));
    if (question.questionType === "multiple-choice") {
      question.options.forEach((option, optionIndex) => {
        children.push(new Paragraph({
          children: [new TextRun({ text: `${String.fromCharCode(65 + optionIndex)}. ${option.text}` })],
          indent: { left: 360 },
          spacing: { after: 45 },
          keepLines: true,
        }));
      });
      children.push(new Paragraph({ text: "", spacing: { after: 130 } }));
    } else {
      children.push(new Paragraph({
        text: english ? "Answer: ______________________________" : "Respuesta: ______________________________",
        spacing: { after: 160 },
      }));
    }
  }

  if (audience === "teacher") {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({
      text: english ? "Answer Key" : "Respuestas",
      heading: "Heading1",
      spacing: { after: 200 },
    }));
    for (const question of model.questions) {
      const answer = question.questionType === "multiple-choice"
        ? `${String.fromCharCode(65 + question.correctOptionIndex)}. ${question.referenceAnswer}`
        : question.referenceAnswer;
      children.push(new Paragraph({
        children: [new TextRun({ text: `${question.number}. `, bold: true }), new TextRun({ text: answer })],
        spacing: { after: 120 },
        keepLines: true,
      }));
    }
  }

  const version = audience === "teacher" ? (english ? "Teacher Version" : "Versión docente") : "Student Version";
  return new Document({
    creator: "Hydrocarbon Lab",
    title: `${model.title} — ${version}`,
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838 },
        margin: { top: 900, right: 1080, bottom: 900, left: 1080 },
      } },
      children,
    }],
    styles: { default: { document: { run: { font: "Arial", size: 22 } } } },
  });
}

export async function renderStudentDocxBuffer(model: DocxAssessment): Promise<Uint8Array> {
  return Packer.toBuffer(createDocxDocument(model, "student"));
}

export async function renderTeacherDocxBuffer(model: DocxAssessment): Promise<Uint8Array> {
  return Packer.toBuffer(createDocxDocument(model, "teacher"));
}

export async function renderStudentDocxBlob(model: DocxAssessment): Promise<Blob> {
  return Packer.toBlob(createDocxDocument(model, "student"));
}

export async function renderTeacherDocxBlob(model: DocxAssessment): Promise<Blob> {
  return Packer.toBlob(createDocxDocument(model, "teacher"));
}
