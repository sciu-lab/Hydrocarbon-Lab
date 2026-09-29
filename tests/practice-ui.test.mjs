import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import ts from "typescript";
import { uiText } from "../app/i18n.ts";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createExerciseChemistryOracles } from "../app/exercise-chemistry-oracles.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { inspectDoubleBondStereochemistry } from "../app/double-bond-stereochemistry.ts";
import { createPracticeConfig, localizePracticeState, startPractice, submitPracticeAnswer, updatePracticeAnswer } from "../app/practice-session.ts";

let server, engine, ui, generate;
before(async () => {
  server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "error",
    appType: "custom", plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false } });
  engine = await server.ssrLoadModule("/app/page.tsx");
  ui = await server.ssrLoadModule("/app/practice-panel.tsx");
  generate = createRestrictedChemicalGenerator(createExerciseChemistryOracles(engine));
});
after(async () => { await server?.close(); });
const noop = () => {};
const actions = { answer: noop, check: noop, next: noop, end: noop, retry: noop, configure: noop };
const renderStructure = (molecule, label, width, height) => React.createElement(engine.MoleculeHistoryPreview, {
  molecule, ariaLabel: label, width, height, practiceView: true,
});
const config = () => createPracticeConfig(["ester"], 5, "es", "PRACTICE-UI");
const htmlFor = (state, language = "es") => renderToStaticMarkup(React.createElement(ui.PracticeSessionView, {
  state: localizePracticeState(state, language), language, actions, renderStructure,
}));

test("Practice entry is adjacent to How to use, controls its view, and preserves the mounted Lab", () => {
  const source = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /guidedTourControlsText\.open\}[\s\S]*?<\/button>\s*<button[^>]*practice-launch/);
  assert.match(source, /aria-expanded=\{practiceOpen\} aria-controls="practice-panel"/);
  assert.match(source, /<div className="lab-workspace" hidden=\{practiceOpen\} inert=\{practiceOpen\}>/);
  assert.match(source, /if \(practiceOpen\) return;/);
  assert.match(source, /requestAnimationFrame\(\(\) => practiceTriggerRef\.current\?\.focus\(\)\)/);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.practice-question-heading \.scope-pill\s*\{\s*display: inline-flex;/);
});

for (const language of ["es", "en"]) test(`configuration ${language}: topics, defaults, disabled Exam and no future controls`, () => {
  const html = renderToStaticMarkup(React.createElement(ui.PracticePanel, {
    language, onLanguageChange: noop, onBackToLab: noop, generate, renderStructure,
  }));
  assert.ok(html.includes(uiText(language, "Práctica / Examen")));
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*>/);
  assert.match(html, new RegExp(`<button[^>]*disabled=""[^>]*>${uiText(language, "Examen")} · ${uiText(language, "Próximamente")}`));
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 17);
  assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  assert.match(html, /<option value="10" selected="">10<\/option>/);
  assert.match(html, /<option value="endless">/);
  assert.ok(html.includes(uiText(language, "Semilla (opcional)")));
  assert.ok(html.includes(uiText(language, "Iniciar práctica")));
  assert.doesNotMatch(html, /Multiple Choice|Build the Molecule|Difficulty|Dificultad|score|Score|timer/);
  assert.deepEqual(ui.PRACTICE_TOPIC_GROUPS.flatMap((group) => group.topics.map(([id]) => id)).sort(), [...EXERCISE_CATEGORIES].sort());
});

test("QUESTION has a read-only structure and input without names, analysis, reasoning or answer attributes", () => {
  const state = startPractice(config(), generate);
  const html = htmlFor(state);
  assert.match(html, /Pregunta 1 de 5/);
  assert.match(html, /<svg[^>]*role="img"/);
  assert.match(html, /id="practice-answer"/);
  assert.match(html, /Comprobar respuesta/);
  for (const name of Object.values(state.question.reference.names)) assert.ok(!html.includes(name));
  assert.doesNotMatch(html, /data-bond-a|tabindex="0"|reasoning|PubChem|IUPAC:|Reference name|Nombre de referencia/);
});

test("correct feedback reveals the localized reference, locks the input and offers only Next", () => {
  const state = startPractice(config(), generate);
  const feedback = submitPracticeAnswer(updatePracticeAnswer(state, state.question.reference.names.es), "es");
  const html = htmlFor(feedback);
  assert.match(html, /✓ Correcto/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /id="practice-answer"[^>]*disabled=""/);
  assert.ok(html.includes(feedback.question.reference.names.es));
  assert.match(html, /Siguiente/);
  assert.doesNotMatch(html, /Comprobar respuesta|Try again|Intentar de nuevo/);
});

test("incorrect feedback uses scoped language, then relocalizes without changing its outcome", () => {
  const state = submitPracticeAnswer(updatePracticeAnswer(startPractice(config(), generate), "wrong"), "es");
  const es = htmlFor(state), en = htmlFor(state, "en");
  assert.match(es, /No exactamente\./);
  assert.match(en, /Not quite\./);
  assert.match(es, /Nombre de referencia de Hydrocarbon Lab:/);
  assert.match(en, /Hydrocarbon Lab&#x27;s reference name:/);
  assert.ok(en.includes(state.question.reference.names.en));
  assert.doesNotMatch(en, /Invalid chemical name|Try again|Check answer/);
});

test("COMPLETE offers another practice without score; ERROR offers safe retry/configuration", () => {
  const complete = htmlFor({ phase: "COMPLETE", config: config() }, "en");
  assert.match(complete, /Practice complete/);
  assert.match(complete, /Start another practice/);
  assert.doesNotMatch(complete, /Score|Accuracy|practice-answer/);
  const error = htmlFor({ phase: "ERROR", config: config(), index: 0, generationIndex: 0, recentIdentities: [] }, "en");
  assert.match(error, /role="alert"/);
  assert.match(error, /Retry/);
  assert.match(error, /Back to configuration/);
  assert.doesNotMatch(error, /stack|ChemicalGenerationError/);
});

test("Practice renderer uses real hydrogen/charge labels and preserves both E/Z geometries", () => {
  for (const category of ["alkane", "alcohol", "amine", "nitro"]) {
    const result = generate(createPracticeConfig([category], 5, "es", "preview"), 0);
    const html = renderToStaticMarkup(renderStructure(result.molecule, "structure", 600, 300));
    assert.match(html, /practice-molecule-preview/);
    if (category === "nitro") { assert.match(html, /baseline-shift="super"/); assert.ok(html.includes("−")); }
  }
  const configurations = new Set();
  for (let index = 0; index < 12; index += 1) {
    const result = generate(createPracticeConfig(["ez"], 5, "es", "preview"), index);
    const html = renderToStaticMarkup(renderStructure(result.molecule, "structure", 600, 300));
    const positions = [...html.matchAll(/<g[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)];
    assert.equal(positions.length, result.molecule.atoms.length);
    const displayed = { ...result.molecule, atoms: result.molecule.atoms.map((atom, i) => ({ ...atom, x: +positions[i][1], y: +positions[i][2] })) };
    const bond = result.molecule.bonds.find((bond) => bond[3]);
    const original = inspectDoubleBondStereochemistry(result.molecule, bond[0], bond[1]);
    const projected = inspectDoubleBondStereochemistry(displayed, bond[0], bond[1]);
    assert.equal(projected.configuration, original.configuration);
    configurations.add(projected.configuration);
  }
  assert.deepEqual([...configurations].sort(), ["E", "Z"]);
});

test("every Practice label has EN/ES text and the dictionary has no duplicate Practice keys", () => {
  const panel = readFileSync(new URL("../app/practice-panel.tsx", import.meta.url), "utf8");
  const labels = [...panel.matchAll(/(?:t|uiText)\((?:language, )?"([^"]+)"\)/g)].map((match) => match[1]);
  labels.push(...ui.PRACTICE_TOPIC_GROUPS.flatMap((group) => [group.label, ...group.topics.map(([, label]) => label)]));
  for (const label of labels) {
    assert.equal(uiText("es", label), label);
    assert.notEqual(uiText("en", label), label, `Missing EN label: ${label}`);
  }
  const source = ts.createSourceFile("i18n.ts", readFileSync(new URL("../app/i18n.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const keys = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "ENGLISH_UI") {
      keys.push(...node.initializer.properties.map((property) => property.name.text));
    } else ts.forEachChild(node, visit);
  }
  visit(source);
  for (const label of labels) assert.equal(keys.filter((key) => key === label).length, 1);
});

test("Practice TypeScript modules typecheck against the real session and generated molecular model", () => {
  const files = ["practice-reference-answer.ts", "practice-session.ts", "practice-panel.tsx"].map((name) =>
    fileURLToPath(new URL(`../app/${name}`, import.meta.url)).replace(/\\/g, "/"));
  const program = ts.createProgram(files, { strict: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true, jsx: ts.JsxEmit.ReactJSX });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
    !diagnostic.file || files.includes(diagnostic.file.fileName.replace(/\\/g, "/")));
  assert.deepEqual(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});
