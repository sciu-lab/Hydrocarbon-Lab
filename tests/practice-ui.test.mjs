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
import { EXERCISE_CATEGORIES, QUESTION_TYPES } from "../app/exercise-model.ts";
import { createExerciseChemistryOracles } from "../app/exercise-chemistry-oracles.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { inspectDoubleBondStereochemistry } from "../app/double-bond-stereochemistry.ts";
import { calculatePracticeMolecule2DLayout } from "../app/practice-molecule-layout.ts";
import { createPracticeConfig, endPractice, localizePracticeState, markPracticeQuestionAvailable, nextPracticeQuestion, retryPracticeGeneration, startPractice, startPracticeCorrections, submitPracticeAnswer, updatePracticeAnswer } from "../app/practice-session.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createPracticeReviewer } from "../app/practice-review.ts";

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
const actions = { answer: noop, check: noop, next: noop, end: noop, retry: noop, configure: noop, back: noop, correctMistakes: noop };
const submit = (state, locale = "es") => submitPracticeAnswer(
  markPracticeQuestionAvailable(state, { monotonicMs: 1000, wallTimeMs: 1700000000000 }), locale,
  { monotonicMs: 5500, wallTimeMs: 1700000004500 });
const renderStructure = (molecule, label, width, height) => React.createElement(engine.MoleculeHistoryPreview, {
  molecule, ariaLabel: label, width, height, practiceView: true,
});
const config = () => createPracticeConfig(["ester"], 5, "es", "PRACTICE-UI", ["naming"], "basic", 1);
const htmlFor = (state, language = "es") => renderToStaticMarkup(React.createElement(ui.PracticeSessionView, {
  state: localizePracticeState(state, language), language, actions, renderStructure,
}));

for (const language of ["es", "en"]) test(`MCQ ${language}: four accessible options, selection, feedback and exact correction presentation`, () => {
  const wrapper = createPracticeQuestionGenerator(generate, createDeterministicDistractorEngine(engine, createExerciseChemistryOracles(engine)));
  const c = createPracticeConfig(["alcohol"], "endless", language, "MCQ-UI", ["multiple-choice"], "basic", 1);
  let state = markPracticeQuestionAvailable(startPractice(c, wrapper), { monotonicMs: 1, wallTimeMs: 1 });
  const render = (s) => renderToStaticMarkup(React.createElement(ui.PracticeSessionView, {
    state: s, language, actions, renderStructure, review: createPracticeReviewer(engine),
  }));
  let html = render(state);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 4);
  assert.match(html, /<fieldset class="practice-options">/);
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled/);
  assert.doesNotMatch(html, /is-correct|data-correct|✓/);
  const original = state.question.options;
  const wrong = original.find((option) => !option.correct).id;
  state = updatePracticeAnswer(state, wrong);
  html = render(state); assert.equal((html.match(/checked=""/g) ?? []).length, 1);
  state = submitPracticeAnswer(state, language, { monotonicMs: 1001, wallTimeMs: 1001 });
  html = render(state); assert.match(html, /is-correct/); assert.match(html, /is-incorrect/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 4);
  assert.ok(html.includes(uiText(language, "Revisar respuesta")));
  state = startPracticeCorrections(endPractice(state), wrapper);
  assert.deepEqual(state.question.options, original); assert.equal(state.answer, "");
  html = render(state); assert.equal((html.match(/type="radio"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /checked=""/);
  assert.ok(html.includes(uiText(language, "Corregir errores")));
});

function assertPracticeGraphProjection(state, width = 600) {
  const original = structuredClone(state.question);
  let received;
  const html = renderToStaticMarkup(React.createElement(ui.PracticeSessionView, {
    state, language: state.config.locale, actions,
    renderStructure: (graph, label, _width, height) => {
      received = structuredClone(graph);
      return renderStructure(graph, label, width, height);
    },
  }));
  assert.deepEqual(received, original.molecule);
  assert.equal(exerciseStructuralIdentity(received), original.reference.structuralIdentity);
  assert.deepEqual(createExerciseChemistryOracles(engine).reference(received).names, original.reference.names);
  const attribute = (attributes, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
  const points = new Map();
  for (const [, attributes] of html.matchAll(/<g\b([^>]*data-atom-id[^>]*)>/g)) {
    const id = +attribute(attributes, "data-atom-id");
    const transform = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(attribute(attributes, "transform"));
    assert.ok(transform);
    assert.ok(!points.has(id), `atom ${id} is rendered once`);
    points.set(id, { x: +transform[1], y: +transform[2] });
  }
  assert.deepEqual([...points.keys()].sort((a, b) => a - b), received.atoms.map((atom) => atom.id).sort((a, b) => a - b));
  const edge = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const strokes = new Map();
  for (const [, attributes] of html.matchAll(/<line\b([^>]*)>/g)) {
    const a = +attribute(attributes, "data-bond-start"), b = +attribute(attributes, "data-bond-end");
    const order = +attribute(attributes, "data-bond-order");
    const key = edge(a, b);
    const entry = strokes.get(key) ?? { a, b, order, lines: [] };
    assert.equal(entry.order, order);
    const line = Object.fromEntries(["x1", "y1", "x2", "y2"].map((name) => [name, +attribute(attributes, name)]));
    entry.lines.push(line);
    strokes.set(key, entry);
  }
  assert.deepEqual([...strokes.keys()].sort(), received.bonds.map(([a, b]) => edge(a, b)).sort());
  for (const [a, b, order = 1] of received.bonds) {
    const entry = strokes.get(edge(a, b));
    assert.equal(entry.order, order);
    assert.equal(entry.lines.length, order);
    // The strokes' centers must terminate at their own atom positions, not at
    // another parent vertex. Relative geometry avoids fixed pixel snapshots.
    for (const [coordinate, vertex] of [["x1", entry.a], ["y1", entry.a], ["x2", entry.b], ["y2", entry.b]]) {
      const mean = entry.lines.reduce((sum, line) => sum + line[coordinate] / order, 0);
      assert.ok(Math.abs(mean - points.get(vertex)[coordinate[0]]) < 1e-8);
    }
  }
  for (const ring of received.rings ?? []) {
    ring.atomIds.forEach((id, i) => assert.ok(strokes.has(edge(id, ring.atomIds[(i + 1) % ring.atomIds.length]))));
  }
  const bounds = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(html);
  for (const point of points.values()) {
    assert.ok(Number.isFinite(point.x) && point.x > 0 && point.x < +bounds[1]);
    assert.ok(Number.isFinite(point.y) && point.y > 0 && point.y < +bounds[2]);
  }
  for (const { lines } of strokes.values()) for (const line of lines) {
    assert.ok(line.x1 >= 0 && line.x1 <= +bounds[1] && line.x2 >= 0 && line.x2 <= +bounds[1]);
    assert.ok(line.y1 >= 0 && line.y1 <= +bounds[2] && line.y2 >= 0 && line.y2 <= +bounds[2]);
  }
  const svgGraph = { ...received, atoms: received.atoms.map((atom) => ({ ...atom, ...points.get(atom.id) })),
    bonds: [...strokes.values()].map(({ a, b, order }) => {
      const source = received.bonds.find(([left, right]) => edge(left, right) === edge(a, b));
      return source[3] ? [a, b, order, true] : [a, b, order];
    }) };
  assert.equal(exerciseStructuralIdentity(svgGraph), original.reference.structuralIdentity);
  assert.deepEqual(state.question, original, "projection must not mutate the generated question");
  return { received, points, html };
}

test("PRACTICE-003: generated ethyl/methyl cyclopentane reaches the renderer with visible branches", () => {
  const config = createPracticeConfig(["simple-carbocycle"], 5, "es", "PRACTICE-003:59", ["naming"], "basic", 1);
  const state = startPractice(config, generate);
  const { molecule, reference } = state.question;
  assert.equal(state.generationIndex, 0);
  assert.equal(molecule.atoms.length, 8);
  assert.deepEqual(molecule.bonds, [[1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 1, 1], [2, 6, 1], [6, 7, 1], [5, 8, 1]]);
  assert.deepEqual(molecule.rings, [{ id: 1, kind: "cycloalkane", atomIds: [1, 2, 3, 4, 5] }]);
  assert.equal(reference.structuralIdentity, "daD@@DjURjjj`@");
  assert.equal(reference.name, "1-etil-3-metilciclopentano");
  assert.equal(reference.names.en, "1-ethyl-3-methylcyclopentane");
  assert.equal(reference.smiles, "CCC1CC(C)CC1");
  assert.equal(reference.formula, "C₈H₁₆");
  let received;
  const html = renderToStaticMarkup(React.createElement(ui.PracticeSessionView, {
    state, language: "es", actions, renderStructure: (graph, ...args) => {
      received = structuredClone(graph);
      return renderStructure(graph, ...args);
    },
  }));
  assert.deepEqual(received, molecule);
  assert.equal(exerciseStructuralIdentity(received), reference.structuralIdentity);
  assert.deepEqual(createExerciseChemistryOracles(engine).reference(received).names, reference.names);
  const points = [...html.matchAll(/<g[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)]
    .map((match) => ({ x: +match[1], y: +match[2] }));
  assert.equal(points.length, molecule.atoms.length);
  const positions = new Map(molecule.atoms.map((atom, index) => [atom.id, points[index]]));
  const length = ([a, b]) => Math.hypot(positions.get(a).x - positions.get(b).x, positions.get(a).y - positions.get(b).y);
  const ringLength = Math.max(...molecule.bonds.slice(0, 5).map(length));
  for (const branch of molecule.bonds.slice(5)) {
    assert.ok(length(branch) / ringLength > 0.5, `branch ${branch[0]}-${branch[1]} must not collapse relative to the ring`);
  }
  assertPracticeGraphProjection(state);
});

for (const category of ["simple-carbocycle", "aromatic", "alkane", "halogenated"]) {
  test(`Practice ${category}: complete graph, visible branches and unclipped SVG at desktop/mobile widths`, () => {
    const config = createPracticeConfig([category], 5, "es", "PRACTICE-003:coverage", ["naming"], "basic", 1);
    let foundBranch = false;
    for (let index = 0; index < 16; index += 1) {
      const question = generate(config, index);
      const state = { phase: "QUESTION", config, index, generationIndex: index, recentIdentities: [], question, answer: "" };
      const parent = new Set(engine.analyzeMolecule(question.molecule).mainChain);
      foundBranch ||= question.molecule.atoms.some((atom) => (atom.element ?? "C") === "C" && !parent.has(atom.id));
      for (const width of [319, 900]) {
        const { points, html } = assertPracticeGraphProjection(state, width);
        const lengths = question.molecule.bonds.map(([a, b]) => Math.hypot(points.get(a).x - points.get(b).x, points.get(a).y - points.get(b).y));
        if (!lengths.length) {
          assert.equal(question.molecule.atoms.length, 1);
          assert.match(html, /CH<tspan[^>]*>4<\/tspan>/);
          continue;
        }
        assert.ok(Math.min(...lengths) / Math.max(...lengths) > 0.5, `${category}/${index} preserves comparable bond lengths`);
        const vertices = [...points.values()];
        for (let a = 0; a < vertices.length; a += 1) for (let b = a + 1; b < vertices.length; b += 1) {
          assert.ok(Math.hypot(vertices[a].x - vertices[b].x, vertices[a].y - vertices[b].y) / Math.min(...lengths) > 0.15,
            `${category}/${index} keeps separate atoms visible`);
        }
      }
    }
    assert.ok(foundBranch, `${category} coverage must actually include carbon branches`);
  });
}

test("all Practice families project every atom/bond/ring from the same localized reference graph", () => {
  for (const category of EXERCISE_CATEGORIES) {
    const config = createPracticeConfig([category], 5, "es", "PRACTICE-003:all", ["naming"], "basic", 1);
    const state = startPractice(config, generate);
    assertPracticeGraphProjection(state, 319);
    assertPracticeGraphProjection(localizePracticeState(state, "en"), 900);
  }
});

test("duplicate skips, feedback and generation retry keep render/reference bundles synchronized", () => {
  const config = createPracticeConfig(["simple-carbocycle"], 5, "es", "PRACTICE-003:59", ["naming"], "basic", 1);
  const first = startPractice(config, generate);
  assertPracticeGraphProjection(first);
  const feedback = submit(updatePracticeAnswer(first, first.question.reference.name), "es");
  assertPracticeGraphProjection(feedback);
  const failed = nextPracticeQuestion(feedback, (_config, index) => {
    if (index < 4) return first.question;
    throw new Error("forced generator failure after duplicate skips");
  });
  assert.equal(failed.phase, "ERROR");
  assert.equal(failed.generationIndex, 4);
  assert.equal(Object.hasOwn(failed, "question"), false);
  const recovered = retryPracticeGeneration(failed, generate);
  assert.equal(recovered.phase, "QUESTION");
  assert.equal(recovered.generationIndex, 4);
  assertPracticeGraphProjection(recovered);
  assert.deepEqual(recovered.question, generate(config, 4));
});

test("Practice ring projection is invariant to coordinate units without changing the source graph", () => {
  const state = startPractice(createPracticeConfig(["simple-carbocycle"], 5, "es", "PRACTICE-003:59", ["naming"], "basic", 1), generate);
  const molecule = state.question.molecule;
  const snapshot = structuredClone(molecule);
  const parent = engine.analyzeMolecule(molecule).mainChain;
  const expected = calculatePracticeMolecule2DLayout(molecule, parent);
  for (const factor of [0.01, 1, 100]) {
    const scaled = { ...molecule, atoms: molecule.atoms.map((atom) => ({ ...atom, x: atom.x * factor, y: atom.y * factor })) };
    const actual = calculatePracticeMolecule2DLayout(scaled, parent);
    assert.equal(exerciseStructuralIdentity(scaled), state.question.reference.structuralIdentity);
    for (const [id, point] of expected) {
      assert.ok(Math.hypot(actual.get(id).x - point.x, actual.get(id).y - point.y) < 1e-8);
    }
  }
  assert.deepEqual(molecule, snapshot);
});

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

for (const language of ["es", "en"]) test(`configuration ${language}: topics, defaults, enabled Exam, class opt-in and public difficulty`, () => {
  const html = renderToStaticMarkup(React.createElement(ui.PracticePanel, {
    language, onLanguageChange: noop, onBackToLab: noop, generate, renderStructure,
  }));
  assert.ok(html.includes(uiText(language, "Práctica / Examen")));
  assert.match(html, /<button[^>]*aria-pressed="true"[^>]*>/);
  assert.match(html, new RegExp(`<button[^>]*aria-pressed="false"[^>]*>${uiText(language, "Examen")}</button>`));
  const topics = html.slice(html.indexOf('<div class="practice-topics">'), html.indexOf('<fieldset class="practice-question-types">'));
  const types = html.match(/<fieldset class="practice-question-types">[\s\S]*?<\/fieldset>/)[0];
  const classOptIn = html.match(/<section class="class-variants"[\s\S]*?<\/section>/)[0];
  assert.equal((topics.match(/type="checkbox"/g) ?? []).length, EXERCISE_CATEGORIES.length);
  assert.equal((types.match(/type="checkbox"/g) ?? []).length, QUESTION_TYPES.length);
  assert.equal((classOptIn.match(/type="checkbox"/g) ?? []).length, 1);
  assert.doesNotMatch(classOptIn, /checked=""/);
  assert.ok(classOptIn.includes(uiText(language, "Generar variantes para una clase")));
  assert.equal((html.match(/checked=""/g) ?? []).length, 3);
  assert.match(html, /type="number" min="1" step="1" aria-invalid="false" value="10"/);
  assert.ok(html.includes(uiText(language, "Sin límite")));
  assert.doesNotMatch(html, /\bmax="|<option/);
  assert.ok(html.includes(uiText(language, "Semilla (opcional)")));
  assert.ok(html.includes(uiText(language, "Iniciar práctica")));
  assert.ok(html.includes(uiText(language, "Opción múltiple")));
  assert.ok(html.includes(uiText(language, "Construir la molécula")));
  assert.ok(html.includes(uiText(language, "Dificultad")));
  assert.doesNotMatch(html, /Build the Molecule|score|Score|timer/);
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
  const feedback = submit(updatePracticeAnswer(state, state.question.reference.names.es), "es");
  const html = htmlFor(feedback);
  assert.match(html, /✓ Correcto/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /id="practice-answer"[^>]*disabled=""/);
  assert.ok(html.includes(feedback.question.reference.names.es));
  assert.match(html, /Siguiente/);
  assert.doesNotMatch(html, /Comprobar respuesta|Try again|Intentar de nuevo/);
});

test("incorrect feedback uses scoped language, then relocalizes without changing its outcome", () => {
  const state = submit(updatePracticeAnswer(startPractice(config(), generate), "wrong"), "es");
  const es = htmlFor(state), en = htmlFor(state, "en");
  assert.match(es, /No exactamente\./);
  assert.match(en, /Not quite\./);
  assert.match(es, /Nombre de referencia de Hydrocarbon Lab:/);
  assert.match(en, /Hydrocarbon Lab&#x27;s reference name:/);
  assert.ok(en.includes(state.question.reference.names.en));
  assert.doesNotMatch(en, /Invalid chemical name|Try again|Check answer/);
});

test("COMPLETE offers initial summary and new practice; ERROR offers safe retry/configuration", () => {
  const complete = htmlFor({ phase: "COMPLETE", config: config(), attempts: [] }, "en");
  assert.match(complete, /Practice complete/);
  assert.match(complete, /Start another practice/);
  assert.match(complete, /Initial results|First-attempt accuracy/);
  assert.doesNotMatch(complete, /practice-answer/);
  const error = htmlFor({ phase: "ERROR", config: config(), index: 0, generationIndex: 0, recentIdentities: [], attempts: [] }, "en");
  assert.match(error, /role="alert"/);
  assert.match(error, /Retry/);
  assert.match(error, /Back to configuration/);
  assert.doesNotMatch(error, /stack|ChemicalGenerationError/);
});

for (const language of ["es", "en"]) test(`initial summary ${language}: submitted results, timings, groups and real exit actions`, () => {
  const question = startPractice(config(), generate);
  const correct = submit(updatePracticeAnswer(question, question.question.reference.names.es));
  const next = nextPracticeQuestion(correct, generate);
  const wrong = submit(updatePracticeAnswer(next, "wrong"));
  const summary = { phase: "COMPLETE", config: config(), attempts: wrong.attempts };
  const snapshot = structuredClone(summary);
  const html = htmlFor(summary, language);
  assert.ok(html.includes(uiText(language, "Resultados iniciales")));
  assert.ok(html.includes(uiText(language, "Acierto en el primer intento")));
  assert.ok(html.includes(uiText(language, "Preguntas para repasar")));
  assert.ok(html.includes(uiText(language, "Acierto por categoría")));
  assert.ok(html.includes(uiText(language, "Acierto por tipo de pregunta")));
  assert.ok(html.includes(uiText(language, "Ésteres")));
  assert.ok(html.includes(uiText(language, "Nomenclatura")));
  assert.match(html, /1 \/ 2/);
  assert.match(html, /50\s*%/);
  assert.ok(html.includes(language === "es" ? "4,5 s" : "4.5 s"));
  assert.ok(html.includes(uiText(language, "Iniciar otra práctica")));
  assert.ok(html.includes(uiText(language, "Volver al laboratorio")));
  assert.ok(html.includes(uiText(language, "Corregir errores")));
  assert.doesNotMatch(html, /<svg|practice-answer|Reviewer|Multiple choice|Construir la molécula/);
  assert.equal(calculatePracticeMetrics(summary.attempts).questionsToReview, 1);
  assert.deepEqual(summary, snapshot);
});

test("Endless and empty summaries have defined results and omit unanswered category/type rows", () => {
  const summary = { phase: "COMPLETE", config: createPracticeConfig(["alkane"], "endless", "en", "summary", ["naming"], "basic", 1), attempts: [] };
  const html = htmlFor(summary, "en");
  assert.match(html, /Practice summary/);
  assert.match(html, /No answers were submitted/);
  assert.match(html, /0 \/ 0/);
  assert.doesNotMatch(html, /NaN|Infinity|<table|Practice complete/);
});

test("summary relocalization preserves log identity, immutable initial metrics and submission language", () => {
  const question = startPractice(config(), generate);
  const feedback = submit(updatePracticeAnswer(question, "wrong"));
  const summary = { phase: "COMPLETE", config: config(), attempts: feedback.attempts };
  const en = localizePracticeState(summary, "en");
  assert.equal(en.attempts, summary.attempts);
  assert.equal(en.attempts[0].localeAtSubmission, "es");
  assert.deepEqual(calculatePracticeMetrics(en.attempts), calculatePracticeMetrics(summary.attempts));
  assert.match(htmlFor(en, "en"), /Initial results/);
  assert.match(htmlFor(en, "es"), /Resultados iniciales/);
});

test("Practice renderer uses real hydrogen/charge labels and preserves both E/Z geometries", () => {
  for (const category of ["alkane", "alcohol", "amine", "nitro"]) {
    const result = generate(createPracticeConfig([category], 5, "es", "preview", ["naming"], "basic", 1), 0);
    const html = renderToStaticMarkup(renderStructure(result.molecule, "structure", 600, 300));
    assert.match(html, /practice-molecule-preview/);
    if (category === "nitro") { assert.match(html, /baseline-shift="super"/); assert.ok(html.includes("−")); }
  }
  const configurations = new Set();
  for (let index = 0; index < 12; index += 1) {
    const result = generate(createPracticeConfig(["ez"], 5, "es", "preview", ["naming"], "basic", 1), index);
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
  const panel = ["practice-panel.tsx", "practice-summary.tsx"].map((file) => readFileSync(new URL(`../app/${file}`, import.meta.url), "utf8")).join("\n");
  const labels = [...panel.matchAll(/(?:t|uiText)\((?:language, )?"([^"]+)"\)/g)].map((match) => match[1]);
  labels.push(...ui.PRACTICE_TOPIC_GROUPS.flatMap((group) => [group.label, ...group.topics.map(([, label]) => label)]));
  labels.push("Opción múltiple", "Construir la molécula");
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
  const files = ["practice-reference-answer.ts", "practice-session.ts", "practice-panel.tsx", "practice-molecule-layout.ts",
    "practice-attempt.ts", "practice-timing.ts", "practice-metrics.ts", "practice-summary.tsx", "practice-corrections.ts"].map((name) =>
    fileURLToPath(new URL(`../app/${name}`, import.meta.url)).replace(/\\/g, "/"));
  const program = ts.createProgram(files, { strict: true, noEmit: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true, jsx: ts.JsxEmit.ReactJSX });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) =>
    !diagnostic.file || files.includes(diagnostic.file.fileName.replace(/\\/g, "/")));
  assert.deepEqual(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});

test("summary offers Correct mistakes only for initial mistakes; empty/perfect sessions omit it", () => {
  const state = startPractice(config(), generate);
  const correct = htmlFor(endPractice(submit(updatePracticeAnswer(state, state.question.reference.name))), "en");
  const incorrect = htmlFor(endPractice(submit(updatePracticeAnswer(state, "wrong"))), "en");
  const empty = htmlFor(endPractice(state), "en");
  assert.doesNotMatch(correct, /Correct mistakes/);
  assert.doesNotMatch(empty, /Correct mistakes/);
  assert.match(incorrect, /Correct mistakes/);
});

for (const language of ["es", "en"]) test(`correction view ${language} preserves full SVG graph, empty input and existing feedback controls`, () => {
  const initial = startPractice(createPracticeConfig(["simple-carbocycle"], 5, "es", "PRACTICE-003:59", ["naming"], "basic", 1), generate);
  const summary = endPractice(submit(updatePracticeAnswer(initial, "wrong")));
  const correction = localizePracticeState(startPracticeCorrections(summary, generate), language);
  assertPracticeGraphProjection(correction, 319);
  const html = htmlFor(correction, language);
  assert.ok(html.includes(uiText(language, "Corregir errores")));
  assert.ok(html.includes(uiText(language, "Corrección {current} de {total}").replace("{current}", "1").replace("{total}", "1")));
  assert.match(html, /id="practice-answer"[^>]*value=""/);
  assert.ok(html.includes(uiText(language, "Comprobar respuesta")));
  assert.ok(html.includes(uiText(language, "Finalizar repaso")));
  assert.doesNotMatch(html, /Nombre de referencia|reference name/);
  const feedback = submit(updatePracticeAnswer(correction, correction.question.reference.names[language]), language);
  const rendered = htmlFor(feedback, language);
  assert.ok(rendered.includes(feedback.question.reference.names[language]));
  assert.ok(rendered.includes(uiText(language, "Siguiente")));
  assert.match(rendered, /id="practice-answer"[^>]*disabled=""/);
  assertPracticeGraphProjection(feedback, 900);
});

for (const language of ["es", "en"]) test(`correction summary ${language} separates unchanged initial results, mastery and explicit retry`, () => {
  const initial = startPractice(config(), generate);
  const summary = endPractice(submit(updatePracticeAnswer(initial, "wrong")));
  const correction = startPracticeCorrections(summary, generate);
  const failed = nextPracticeQuestion(submit(updatePracticeAnswer(correction, "wrong")), generate);
  const html = htmlFor(failed, language);
  assert.ok(html.includes(uiText(language, "Resultados iniciales")));
  assert.ok(html.includes(uiText(language, "Correcciones")));
  assert.ok(html.includes(uiText(language, "Dominio final")));
  assert.ok(html.includes(uiText(language, "Intentos de corrección")));
  assert.ok(html.includes(uiText(language, "Reintentar los errores pendientes")));
  assert.match(html, /0 \/ 1/);
  const retry = startPracticeCorrections(failed, generate);
  const fixed = nextPracticeQuestion(submit(updatePracticeAnswer(retry, retry.question.reference.names.es)), generate);
  const fixedHtml = htmlFor(fixed, language);
  assert.ok(fixedHtml.includes(uiText(language, "Todos los errores corregidos")));
  assert.doesNotMatch(fixedHtml, /Retry remaining mistakes|Reintentar los errores pendientes/);
  assert.match(fixedHtml, /100\s*%/);
  assert.match(fixedHtml, /0 \/ 1/);
  assert.match(fixedHtml, /1 \/ 1/);
  assert.equal(fixed.attempts.at(-1).attemptNumber, 3);
});

test("reconstruction error renders no SVG/answer/reference and provides retry plus Finish review", () => {
  const initial = startPractice(config(), generate);
  const summary = endPractice(submit(updatePracticeAnswer(initial, "wrong")));
  const error = startPracticeCorrections(summary, () => { throw new Error("private reconstruction failure"); });
  const html = htmlFor(error, "en");
  assert.match(html, /role="alert"/);
  assert.match(html, /original question could not be reconstructed/);
  assert.match(html, /Finish review/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /<svg|practice-answer|private reconstruction failure|reference name/);
});
