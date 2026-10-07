import { createElement } from "react";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import { materializeDocxStructureSvg } from "../app/docx-structure-svg-style.js";

export function renderDocxStructureSvg(question, MoleculeHistoryPreview, index = 0) {
  const svg = renderToStaticMarkup(createElement(MoleculeHistoryPreview, {
    molecule: question.molecule,
    width: 360,
    height: 180,
    practiceView: true,
    ariaLabel: `Chemical structure for question ${index + 1}`,
  }));
  return materializeDocxStructureSvg(svg);
}

/** Counts rendered C-C bond midpoints in the PNG rather than trusting SVG markup alone. */
export async function inspectDocxStructureRaster(question, svg, png) {
  const carbonIds = new Set(question.molecule.atoms.filter((atom) => (atom.element ?? "C") === "C").map((atom) => atom.id));
  const lines = [...svg.matchAll(/<line\b[^>]*>/g)].map(([tag]) => {
    const attribute = (name) => tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];
    return {
      start: Number(attribute("data-bond-start")),
      end: Number(attribute("data-bond-end")),
      x1: Number(attribute("x1")),
      y1: Number(attribute("y1")),
      x2: Number(attribute("x2")),
      y2: Number(attribute("y2")),
      order: Number(attribute("data-bond-order")),
      halo: tag.includes("practice-review-bond-halo"),
    };
  }).filter((line) => !line.halo && carbonIds.has(line.start) && carbonIds.has(line.end));
  const { data, info } = await sharp(Buffer.from(png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const visible = ({ x, y }) => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const px = Math.round(x) + dx;
        const py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= info.width || py >= info.height) continue;
        const offset = (py * info.width + px) * info.channels;
        if (data[offset + 3] > 16 && data[offset] < 145 && data[offset + 1] < 170 && data[offset + 2] < 165) return true;
      }
    }
    return false;
  };
  const bondSegments = lines.map((line) => ({ ...line, inkAtMidpoint: visible({
    x: (line.x1 + line.x2) / 2,
    y: (line.y1 + line.y2) / 2,
  }) }));
  const orders = [...new Set(bondSegments.map(({ order }) => order))].sort();
  return {
    carbonBondSegments: bondSegments.length,
    visibleCarbonBondSegments: bondSegments.filter(({ inkAtMidpoint }) => inkAtMidpoint).length,
    singleBondSegments: bondSegments.filter(({ order }) => order === 1).length,
    doubleBondSegments: bondSegments.filter(({ order }) => order === 2).length,
    tripleBondSegments: bondSegments.filter(({ order }) => order === 3).length,
    lineOrders: orders,
  };
}

/** Node-only bridge: rasterizes the production React SVG preview for scripts/tests. */
export async function renderDocxStructurePngAssets(questions, MoleculeHistoryPreview) {
  return Promise.all(questions.map(async (question, index) => {
    const svg = renderDocxStructureSvg(question, MoleculeHistoryPreview, index);
    const { data, info } = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  }));
}
