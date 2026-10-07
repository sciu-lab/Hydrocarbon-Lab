import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import { renderDocxStructurePngAssetsBrowser } from "../app/docx-structure-assets-browser.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry;
before(async () => { chemistry = await loadExerciseChemistry(); });
after(async () => { await chemistry?.close(); });

const cases = ["pentano", "pent-2-eno", "pent-2-ino", "2-metilpentano", "pentan-1-ol", "2-cloropentano"];
const moleculeFor = (name) => {
  const result = buildHydrocarbonFromIupacName(name);
  assert.ok(result.ok, result.error);
  return result.molecule;
};

test("static and Practice previews omit implicit-carbon paint while preserving bonds, labels and source graphs", () => {
  for (const name of cases) for (const practiceView of [false, true]) {
    const molecule = moleculeFor(name), snapshot = structuredClone(molecule);
    const svg = renderToStaticMarkup(React.createElement(chemistry.engine.MoleculeHistoryPreview,
      { molecule, width: 360, height: 180, practiceView }));
    assert.doesNotMatch(svg, /history-carbon/);
    assert.equal((svg.match(/<line\b/g) ?? []).length,
      molecule.bonds.reduce((count, bond) => count + (bond[2] ?? 1), 0), name);
    assert.equal((svg.match(/<circle\b/g) ?? []).length,
      molecule.atoms.filter((atom) => (atom.element ?? "C") !== "C").length,
      "only explicit label backdrops may paint circles");
    for (const [, contents] of svg.matchAll(/<g\b[^>]*>(.*?)<\/g>/g)) {
      assert.doesNotMatch(contents, /<text\b[^>]*>C<\/text>/, "implicit carbons have no C label");
    }
    if (name === "pentan-1-ol") assert.match(svg, practiceView ? />OH<\/text>/ : />O<\/text>/);
    if (name === "2-cloropentano") assert.match(svg, />Cl<\/text>/);
    assert.deepEqual(molecule, snapshot);
  }
});

test("isolated methane retains an explicit CH4 label in static and Practice previews", () => {
  for (const practiceView of [false, true]) {
    const svg = renderToStaticMarkup(React.createElement(chemistry.engine.MoleculeHistoryPreview,
      { molecule: moleculeFor("metano"), practiceView }));
    assert.match(svg, /CH<tspan[^>]*>4<\/tspan>/);
    assert.doesNotMatch(svg, /history-carbon/);
  }
});

test("Browser DOCX passes the real clean structural SVG to rasterization for every bond order and heteroatom", async () => {
  const originals = { document: globalThis.document, Image: globalThis.Image,
    create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const blobs = new Map(), captured = [], revoked = [];
  URL.createObjectURL = (blob) => { const url = `blob:structural/${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.Image = class {
    set src(url) {
      void (async () => {
        try {
          const svg = await blobs.get(url).text(); captured.push(svg);
          this.png = await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).png().toBuffer();
          this.pixels = (await sharp(this.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
          this.onload?.();
        } catch (error) { this.onerror?.(error); }
      })();
    }
  };
  globalThis.document = { createElement(tag) {
    assert.equal(tag, "canvas");
    let image;
    return { width: 0, height: 0,
      getContext: () => ({ fillRect() {}, drawImage(value) { image = value; }, getImageData: () => ({ data: image.pixels }) }),
      toBlob: (callback) => callback(new Blob([image.png], { type: "image/png" })),
    };
  } };
  try {
    const assets = await renderDocxStructurePngAssetsBrowser(cases.map((name) => ({ molecule: moleculeFor(name) })),
      chemistry.engine.MoleculeHistoryPreview);
    assert.equal(assets.length, cases.length);
    assert.equal(revoked.length, cases.length);
    for (const [index, svg] of captured.entries()) {
      assert.doesNotMatch(svg, /history-carbon|var\(/);
      assert.match(svg, /stroke-linecap: round/);
      assert.equal((await sharp(assets[index].data).metadata()).format, "png");
      assert.deepEqual([assets[index].width, assets[index].height], [360, 180]);
    }
    assert.match(captured[4], />OH<\/text>/);
    assert.match(captured[5], />Cl<\/text>/);
  } finally {
    globalThis.document = originals.document; globalThis.Image = originals.Image;
    URL.createObjectURL = originals.create; URL.revokeObjectURL = originals.revoke;
  }
});
