import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { EXERCISE_CATEGORIES, EXERCISE_DIFFICULTIES } from "../app/exercise-model.ts";
import {
  createDefaultDocxExportUiSettings,
  createDocxExportRequest,
  DOCX_EXPORT_QUESTION_COUNTS,
} from "../app/docx-export-ui-model.ts";
import { renderDocxStructurePngAssetsBrowser } from "../app/docx-structure-assets-browser.ts";
import { downloadWorksheetFiles } from "../app/docx-browser-export.ts";

const pixelPng = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jW5kAAAAASUVORK5CYII=", "base64",
));

test("worksheet defaults follow the app language and expose all canonical supported categories", () => {
  for (const locale of ["es", "en"]) {
    const defaults = createDefaultDocxExportUiSettings(locale);
    assert.deepEqual(defaults, {
      questionType: "naming", questionCount: 10, difficulty: "basic",
      categories: EXERCISE_CATEGORIES, documentLanguage: locale, seed: "", output: "both",
    });
    assert.equal(defaults.categories.length, 17);
  }
});

test("public counts, type IDs, Difficulty IDs, locale, categories and output map without relabeling", () => {
  for (const questionCount of DOCX_EXPORT_QUESTION_COUNTS) {
    for (const questionType of ["naming", "multiple-choice"]) {
      for (const difficulty of EXERCISE_DIFFICULTIES) {
        const source = {
          ...createDefaultDocxExportUiSettings("es"), questionType, questionCount, difficulty,
          categories: ["alcohol", "alkene"], documentLanguage: "en", seed: "MY-CLASS-2026", output: "teacher",
        };
        let generated = 0;
        const request = createDocxExportRequest(source, () => { generated += 1; return "should-not-be-used"; });
        assert.deepEqual(request.config, {
          questionType, questionCount, difficulty, categories: ["alcohol", "alkene"],
          locale: "en", seed: "MY-CLASS-2026",
        });
        assert.equal(request.output, "teacher");
        assert.equal(request.generatedSeed, false);
        assert.equal(generated, 0);
      }
    }
  }
});

test("blank seed is created once through the session seed helper and can feed both outputs", () => {
  const source = { ...createDefaultDocxExportUiSettings("es"), seed: "  ", output: "both" };
  let generated = 0;
  const request = createDocxExportRequest(source, () => { generated += 1; return "worksheet-secure-id"; });
  assert.equal(request.config.seed, "worksheet-secure-id");
  assert.equal(request.generatedSeed, true);
  assert.equal(request.output, "both");
  assert.equal(generated, 1);
});

test("an empty category selection is rejected without silently choosing a topic", () => {
  const source = { ...createDefaultDocxExportUiSettings("en"), categories: [] };
  assert.throws(() => createDocxExportRequest(source, () => "unused"), /Select one or more/);
});

test("browser raster adapter materializes SVG paint and returns PNG bytes without Sharp", async () => {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const capturedSvgBlobs = [];
  const pixels = new Uint8ClampedArray(360 * 180 * 4);
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      return {
        width: 0, height: 0,
        getContext(kind) {
          assert.equal(kind, "2d");
          return { fillStyle: "", fillRect() {}, drawImage() {}, getImageData() { return { data: pixels }; } };
        },
        toBlob(callback) { callback(new Blob([pixelPng], { type: "image/png" })); },
      };
    },
  };
  globalThis.Image = class {
    set src(value) { queueMicrotask(() => this.onload?.({ target: this, src: value })); }
  };
  URL.createObjectURL = (blob) => { capturedSvgBlobs.push(blob); return `blob:docx-test/${capturedSvgBlobs.length}`; };
  URL.revokeObjectURL = () => {};
  try {
    function Preview() {
      return React.createElement("svg", { className: "practice-molecule-preview", viewBox: "0 0 360 180" },
        React.createElement("line", { x1: 30, y1: 90, x2: 330, y2: 90 }));
    }
    const assets = await renderDocxStructurePngAssetsBrowser([{ molecule: { atoms: [], bonds: [] } }], Preview);
    assert.equal(assets.length, 1);
    assert.deepEqual([...assets[0].data.slice(0, 8)], [...pixelPng.slice(0, 8)]);
    assert.equal(assets[0].width, 360);
    assert.equal(assets[0].height, 180);
    const svg = await capturedSvgBlobs[0].text();
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="360" height="180"/);
    assert.match(svg, /stroke-width: 2\.4px/);
    assert.match(svg, /stroke-linecap: round/);
  } finally {
    globalThis.document = originalDocument;
    globalThis.Image = originalImage;
    if (originalCreateObjectURL === undefined) delete URL.createObjectURL;
    else URL.createObjectURL = originalCreateObjectURL;
    if (originalRevokeObjectURL === undefined) delete URL.revokeObjectURL;
    else URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

test("Both downloads retain separate object URLs until the browser handoff delay expires", async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const anchors = [];
  const created = [];
  const revoked = [];
  const delayedRevocations = [];
  globalThis.document = {
    body: { appendChild() {} },
    createElement(tag) {
      assert.equal(tag, "a");
      const anchor = { style: {}, href: "", download: "", click() { anchors.push({ href: this.href, filename: this.download }); }, remove() {} };
      return anchor;
    },
  };
  globalThis.window = { setTimeout(callback, delay) {
    if (delay === 180) { callback(); return 0; }
    delayedRevocations.push(callback);
    return delayedRevocations.length;
  } };
  URL.createObjectURL = () => { const url = `blob:docx-both/${created.length + 1}`; created.push(url); return url; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    await downloadWorksheetFiles([
      { filename: "hydrocarbon-lab-naming-student.docx", blob: new Blob(["student"]) },
      { filename: "hydrocarbon-lab-naming-teacher.docx", blob: new Blob(["teacher"]) },
    ]);
    assert.deepEqual(anchors.map(({ filename }) => filename), [
      "hydrocarbon-lab-naming-student.docx", "hydrocarbon-lab-naming-teacher.docx",
    ]);
    assert.deepEqual(anchors.map(({ href }) => href), created);
    assert.equal(delayedRevocations.length, 2);
    assert.deepEqual(revoked, [], "download object URLs must not be revoked before the browser handoff delay");
    delayedRevocations.forEach((revoke) => revoke());
    assert.deepEqual(revoked, created, "each temporary download URL must be released after handoff");
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    if (originalCreateObjectURL === undefined) delete URL.createObjectURL;
    else URL.createObjectURL = originalCreateObjectURL;
    if (originalRevokeObjectURL === undefined) delete URL.revokeObjectURL;
    else URL.revokeObjectURL = originalRevokeObjectURL;
  }
});
