import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";

/** Node-only bridge: rasterizes the production React SVG preview for scripts/tests. */
export async function renderDocxStructurePngAssets(questions, MoleculeHistoryPreview) {
  return Promise.all(questions.map(async (question, index) => {
    const svg = renderToStaticMarkup(createElement(MoleculeHistoryPreview, {
      molecule: question.molecule,
      width: 360,
      height: 180,
      practiceView: true,
      ariaLabel: `Chemical structure for question ${index + 1}`,
    }));
    const { data, info } = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), width: info.width, height: info.height };
  }));
}
