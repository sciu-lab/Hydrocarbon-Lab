import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import sharp from "sharp";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import { inspectDocxStructureRaster, renderDocxStructureSvg } from "./docx-structure-assets.mjs";

const baseline = process.argv.includes("--baseline");
const stage = baseline ? "before" : "after";
const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "outputs", "docx-vis-2", stage);
const cases = [
  ["alkane", "pentano"], ["alkene", "pent-2-eno"], ["alkyne", "pent-2-ino"],
  ["branch", "2-metilpentano"], ["alcohol", "pentan-1-ol"], ["halogen", "2-cloropentano"],
];
const server = await createServer({ root, configFile: false, logLevel: "error", appType: "custom",
  plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false } });
try {
  await mkdir(output, { recursive: true });
  const engine = await server.ssrLoadModule("/app/page.tsx");
  const report = [];
  const tiles = [];
  for (const [index, [id, name]] of cases.entries()) {
    const built = buildHydrocarbonFromIupacName(name);
    assert.ok(built.ok, `${name} must build`);
    const question = { molecule: built.molecule };
    const svg = renderDocxStructureSvg(question, engine.MoleculeHistoryPreview, index);
    const png = await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).png().toBuffer();
    const ink = await inspectDocxStructureRaster(question, svg, png);
    const carbonCircles = [...svg.matchAll(/<circle\b[^>]*class="history-carbon"[^>]*>/g)].length;
    let layoutUnchanged;
    if (!baseline) {
      const previous = await readFile(join(root, "outputs", "docx-vis-2", "before", `${id}.svg`), "utf8")
        .catch((error) => { if (error.code === "ENOENT") return null; throw error; });
      if (previous) {
        const geometry = (markup) => [...markup.matchAll(/<(?:line|g)\b[^>]*>/g)].map(([tag]) => tag);
        assert.deepEqual(geometry(svg), geometry(previous), `${id} must keep exact bond endpoints and atom transforms`);
        layoutUnchanged = true;
      }
    }
    assert.equal(ink.visibleCarbonBondSegments, ink.carbonBondSegments, `${id} must retain every C-C stroke`);
    assert.ok(ink.carbonBondSegments > 0);
    if (!baseline) assert.equal(carbonCircles, 0, `${id} must not paint implicit-carbon circles`);
    else assert.ok(carbonCircles > 0, `${id} must reproduce the original carbon circles`);
    const terminal = built.molecule.atoms.find((atom) => (atom.element ?? "C") === "C"
      && built.molecule.bonds.filter(([a, b]) => a === atom.id || b === atom.id).length === 1);
    const bond = built.molecule.bonds.find(([a, b]) => a === terminal.id || b === terminal.id);
    const neighbor = bond[0] === terminal.id ? bond[1] : bond[0];
    const position = (id) => {
      const tag = [...svg.matchAll(/<g\b[^>]*>/g)].map(([tag]) => tag).find((tag) => tag.includes(`data-atom-id="${id}"`));
      return tag.match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
    };
    const [x, y] = position(terminal.id), [nx, ny] = position(neighbor);
    const length = Math.hypot(x - nx, y - ny);
    const probe = [Math.round(x + 2.6 * (x - nx) / length), Math.round(y + 2.6 * (y - ny) / length)];
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const offset = (probe[1] * info.width + probe[0]) * 4;
    const terminalDotInk = data[offset] < 145 && data[offset + 1] < 170 && data[offset + 2] < 165;
    assert.equal(terminalDotInk, baseline, `${id} pixel outside the bond cap must ${baseline ? "reproduce the dot" : "be clear"}`);
    if (id === "alcohol") assert.match(svg, />OH<\/text>/);
    if (id === "halogen") assert.match(svg, />Cl<\/text>/);
    await writeFile(join(output, `${id}.svg`), svg);
    await writeFile(join(output, `${id}.png`), png);
    tiles.push({ input: png, left: index % 2 * 360, top: Math.floor(index / 2) * 180 });
    report.push({ id, name, carbonCircles, terminalDotInk, terminalProbe: probe, layoutUnchanged, ...ink });
  }
  await sharp({ create: { width: 720, height: 540, channels: 4, background: "#ffffff" } })
    .composite(tiles).png().toFile(join(output, "contact-sheet.png"));
  await writeFile(join(output, "report.json"), JSON.stringify({ stage, report }, null, 2));
  console.log(JSON.stringify({ stage, output, report }, null, 2));
} finally {
  await server.close();
}
