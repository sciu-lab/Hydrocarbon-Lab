import {
  Document, ImageRun, PageBreak, Packer, Paragraph, TextRun,
} from "docx";
import type { DocxAssessment } from "./docx-export-model.ts";

export function createDocxDocument(model: DocxAssessment) {
  const english = model.locale === "en";
  const children: Paragraph[] = [
    new Paragraph({ text: model.title, heading: "Title", spacing: { after: 240 } }),
    new Paragraph({ text: english ? "Name: ______________________" : "Nombre: ______________________", spacing: { after: 100 } }),
    new Paragraph({ text: english ? "Course: _____________________" : "Curso: _______________________", spacing: { after: 100 } }),
    new Paragraph({ text: english ? "Date: _______________________" : "Fecha: _______________________", spacing: { after: 360 } }),
  ];

  for (const question of model.questions) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${question.number}. ${question.prompt}`, bold: true })],
      spacing: { before: 220, after: 100 },
      keepNext: true,
    }));
    children.push(new Paragraph({
      children: [new ImageRun({
        type: "png",
        data: question.structure.data,
        transformation: { width: 180, height: 90 },
        altText: { name: `Structure ${question.number}`, description: question.structure.altText, title: question.structure.altText },
      })],
      spacing: { after: 90 },
    }));
    children.push(new Paragraph({
      text: english ? "Answer: ______________________________" : "Respuesta: ______________________________",
      spacing: { after: 200 },
    }));
  }

  if (model.includeAnswerKey) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({
      text: english ? "Answer Key" : "Respuestas",
      heading: "Heading1",
      spacing: { after: 200 },
    }));
    for (const question of model.questions) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${question.number}. `, bold: true }),
          new TextRun({ text: question.referenceAnswer }),
        ],
        spacing: { after: 120 },
        keepLines: true,
      }));
    }
  }

  return new Document({
    creator: "Hydrocarbon Lab",
    title: model.title,
    description: `Seed ${model.metadata.seed}; generator v${model.metadata.generatorVersion}; ${model.metadata.difficulty}`,
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

export async function renderDocxBuffer(model: DocxAssessment): Promise<Buffer> {
  return Packer.toBuffer(createDocxDocument(model));
}

export async function renderDocxBlob(model: DocxAssessment): Promise<Blob> {
  return Packer.toBlob(createDocxDocument(model));
}
