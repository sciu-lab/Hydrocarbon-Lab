import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { materializeDocxStructureSvg } from "./docx-structure-svg-style.js";
import type { PracticeQuestion } from "./practice-question.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { DocxPngAsset } from "./docx-export-model.ts";

export type DocxStructurePreviewProps = Readonly<{
  molecule: GeneratedMolecule;
  width: number;
  height: number;
  practiceView: true;
  ariaLabel: string;
}>;

export type DocxStructurePreview = ComponentType<DocxStructurePreviewProps>;

function loadSvgImage(svg: string): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The browser could not render a worksheet structure SVG."));
    };
    image.src = url;
  });
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The browser could not rasterize a worksheet structure.")), "image/png");
  });
}

function assertSvgBondInk(markup: string, context: CanvasRenderingContext2D, questionNumber: number) {
  const lines = [...markup.matchAll(/<line\b[^>]*>/g)].map(([tag]) => {
    const read = (name: string) => tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
    return { x1: Number(read("x1")), y1: Number(read("y1")), x2: Number(read("x2")), y2: Number(read("y2")) };
  });
  if (lines.length === 0) return;
  const pixels = context.getImageData(0, 0, 360, 180).data;
  const visible = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const px = Math.round(x) + dx, py = Math.round(y) + dy;
      if (px < 0 || py < 0 || px >= 360 || py >= 180) continue;
      const offset = (py * 360 + px) * 4;
      if (pixels[offset + 3] > 16 && pixels[offset] < 145 && pixels[offset + 1] < 170 && pixels[offset + 2] < 165) return true;
    }
    return false;
  };
  const invisible = lines.filter((line) => !visible((line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2));
  if (invisible.length > 0) {
    throw new Error(`Browser DOCX rasterization hid ${invisible.length} of ${lines.length} bond strokes in question ${questionNumber}.`);
  }
}

/** Uses the same production SVG component as Practice, then rasterizes with browser APIs only. */
export async function renderDocxStructurePngAssetsBrowser(
  questions: readonly PracticeQuestion[],
  Preview: DocxStructurePreview,
): Promise<readonly DocxPngAsset[]> {
  const assets: DocxPngAsset[] = [];
  for (const [index, question] of questions.entries()) {
    const markup = renderToStaticMarkup(createElement(Preview, {
      molecule: question.molecule,
      width: 360,
      height: 180,
      practiceView: true,
      ariaLabel: `Chemical structure for question ${index + 1}`,
    }));
    const styledSvg = materializeDocxStructureSvg(markup)
      .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="180" preserveAspectRatio="xMidYMid meet" ');
    const { image, url } = await loadSvgImage(styledSvg);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 360;
      canvas.height = 180;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas 2D is unavailable for worksheet structures.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      assertSvgBondInk(styledSvg, context, index + 1);
      const blob = await canvasPng(canvas);
      assets.push(Object.freeze({ data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return Object.freeze(assets);
}
