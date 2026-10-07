/** Shared SVG paint required when a molecule preview is rendered outside the app CSS tree. */
export const DOCX_STRUCTURE_SVG_STYLES = `
.practice-molecule-preview line { stroke: #18312d; stroke-width: 2.4px; stroke-linecap: round; stroke-linejoin: round; fill: none; }
.practice-molecule-preview .history-hetero { fill: #ffffff; stroke: #266b78; stroke-width: 1.5px; }
.practice-molecule-preview text { fill: #18312d; font-family: Arial, Helvetica, sans-serif; font-size: 14px; font-weight: 800; }
`;

export function materializeDocxStructureSvg(markup) {
  return markup.replace(/(<svg\b[^>]*>)/, `$1<style>${DOCX_STRUCTURE_SVG_STYLES}</style>`);
}
