import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import { renderDocxStructurePngAssetsBrowser } from "../app/docx-structure-assets-browser.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createPracticeConfig, startPractice } from "../app/practice-session.ts";
import { createExamConfig, startExam } from "../app/exam-session.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry, practiceUI, examUI, generate;
before(async () => {
  chemistry = await loadExerciseChemistry();
  practiceUI = await chemistry.loadModule("/app/practice-panel.tsx");
  examUI = await chemistry.loadModule("/app/exam-panel.tsx");
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
});
after(async () => { await chemistry?.close(); });

const cases = ["pentano", "pent-2-eno", "pent-2-ino", "2-metilpentano", "pentan-1-ol", "2-cloropentano"];
const moleculeFor = (name) => {
  const result = buildHydrocarbonFromIupacName(name);
  assert.ok(result.ok, result.error);
  return result.molecule;
};
const activeCases = [
  ["alkane", "pentano"], ["alkane", "2-metilpentano"], ["alkene", "pent-2-eno"],
  ["alkyne", "pent-2-ino"], ["alcohol", "pentan-1-ol"], ["halogenated", "2-cloropentano"],
];
const actions = Object.fromEntries(["answer", "check", "next", "end", "retry", "configure", "back", "correctMistakes",
  "structure", "available", "go", "submit", "review", "results"].map((name) => [name, () => {}]));
const renderStructure = (molecule, label, width, height, highlights) => React.createElement(chemistry.engine.MoleculeHistoryPreview,
  { molecule, ariaLabel: label, width, height, practiceView: true, reviewHighlights: highlights });

function assertActiveStructure(svg, molecule, name) {
  assert.doesNotMatch(svg, /<circle\b[^>]*class="history-carbon"/, `${name}: no implicit-carbon SVG circles`);
  assert.equal((svg.match(/<circle\b/g) ?? []).length,
    molecule.atoms.filter((atom) => (atom.element ?? "C") !== "C").length, `${name}: only explicit atom backdrops remain`);
  assert.equal((svg.match(/<line\b/g) ?? []).length,
    molecule.bonds.reduce((count, bond) => count + (bond[2] ?? 1), 0), `${name}: bond orders remain visible`);
  assert.doesNotMatch(svg, /<text\b[^>]*>C<\/text>/, `${name}: no implicit carbon labels`);
  if (name === "pentan-1-ol") assert.match(svg, />OH<\/text>/);
  if (name === "2-cloropentano") assert.match(svg, />Cl<\/text>/);
}

for (const [category, name] of activeCases) test(`active Practice route renders ${name} without implicit-carbon dots`, () => {
  const molecule = moleculeFor(name);
  const state = startPractice(createPracticeConfig([category], 1, "es", `UI-VIS-002-${name}`, ["naming"]), generate);
  const viewState = { ...state, question: { ...state.question, molecule } };
  const html = renderToStaticMarkup(React.createElement(practiceUI.PracticeSessionView,
    { state: viewState, language: "es", actions, renderStructure }));
  const svg = /<svg\b[\s\S]*?<\/svg>/.exec(html)?.[0];
  assert.ok(svg, `${name}: active Practice question renders the SVG`);
  assertActiveStructure(svg, molecule, name);
});

for (const [category, name] of activeCases) test(`active Exam route renders ${name} without implicit-carbon dots`, () => {
  const molecule = moleculeFor(name);
  const state = startExam(createExamConfig([category], 1, "es", `UI-VIS-002-${name}`, ["naming"]), generate);
  const plan = { ...state.plan, slots: state.plan.slots.map((slot, index) => index === 0
    ? { ...slot, question: { ...slot.question, molecule } } : slot) };
  const viewState = { ...state, plan };
  const html = renderToStaticMarkup(React.createElement(examUI.ExamSessionView,
    { state: viewState, language: "es", actions, renderStructure, review: () => ({}) }));
  const svg = /<svg\b[\s\S]*?<\/svg>/.exec(html)?.[0];
  assert.ok(svg, `${name}: active Exam question renders the SVG`);
  assertActiveStructure(svg, molecule, name);
});

test("Practice/Exam active SVG stylesheet uses flat caps so bond ends cannot read as carbon dots", () => {
  const stylesheet = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const rule = /\.practice-molecule-preview line\s*\{([^}]*)\}/.exec(stylesheet)?.[1] ?? "";
  assert.match(rule, /stroke-linecap:\s*butt\s*;/);
});

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
