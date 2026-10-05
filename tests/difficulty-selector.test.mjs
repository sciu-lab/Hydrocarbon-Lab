import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_DIFFICULTIES, GENERATOR_VERSION, SUPPORTED_GENERATOR_VERSIONS } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createClassAssignmentConfig, classVariantInputSignature } from "../app/class-assignment.ts";
import { uiText } from "../app/i18n.ts";

let chemistry, generate, selector, panelSource, panelModules;
const require = createRequire(import.meta.url);
const compile = (name) => ts.transpileModule(readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const evaluate = (source, dependencies) => {
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", source)((id) => dependencies[id] ?? require(id), compiledModule, compiledModule.exports);
  return compiledModule.exports;
};
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  selector = await chemistry.loadModule("/app/difficulty-selector.tsx");
  panelSource = compile("practice-panel.tsx");
  panelModules = {};
  for (const [, id] of panelSource.matchAll(/require\("(\.\/[^\"]+)"\)/g)) {
    panelModules[id] = await chemistry.loadModule(`/app/${id.slice(2)}`);
  }
});
after(async () => { await chemistry?.close(); });

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}
const find = (tree, predicate) => elements(tree).find(predicate);
const difficultyControl = (tree) => find(tree, (node) => node.type?.name === "DifficultySelector");
const form = (tree) => find(tree, (node) => node.type === "form" && node.props.className === "practice-config");

/** Execute the real panel callbacks with a minimal deterministic hook host.
 * Only React's mounting/scheduling is substituted; builders, sessions and chemistry are production code.
 */
function mountPanel(initialMode = "practice", language = "es") {
  const values = [];
  let cursor = 0;
  const hooks = { ...React,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial;
      return [values[slot], (next) => { values[slot] = typeof next === "function" ? next(values[slot]) : next; }];
    },
    useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (fn) => fn,
  };
  const { PracticePanel } = evaluate(panelSource, { ...panelModules, react: hooks });
  const props = { initialMode, language, generate, renderStructure: () => null, review: () => null,
    onBackToLab: () => {}, onLanguageChange: (locale) => { props.language = locale; } };
  return { render() { cursor = 0; return PracticePanel(props); }, props };
}

for (const language of ["es", "en"]) for (const value of EXERCISE_DIFFICULTIES) {
  test(`${language}/${value}: native accessible single-select labels, checked state and internal-ID callback`, () => {
    const labels = language === "es" ? ["Fácil", "Intermedio", "Difícil"] : ["Easy", "Intermediate", "Hard"];
    const html = renderToStaticMarkup(React.createElement(selector.DifficultySelector, { language, value, onChange: () => {} }));
    assert.match(html, /<fieldset class="difficulty-selector" aria-describedby="[^"]+">/);
    assert.ok(html.includes(`<legend>${uiText(language, "Dificultad")}</legend>`));
    assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
    assert.equal((html.match(/checked=""/g) ?? []).length, 1);
    for (const label of labels) assert.ok(html.includes(`<span>${label}</span>`));
    assert.doesNotMatch(html, /<span>(basic|intermediate|advanced)<\/span>|disabled|tabindex|type="submit"/);
    assert.match(html, new RegExp(`value="${value}"`));
    let selected;
    const { DifficultySelector } = evaluate(compile("difficulty-selector.tsx"), {
      react: { useId: () => "d6" }, "./exercise-model.ts": { EXERCISE_DIFFICULTIES }, "./i18n.ts": { uiText },
    });
    const radios = elements(DifficultySelector({ language, value, onChange: (id) => { selected = id; } }))
      .filter((node) => node.type === "input");
    assert.deepEqual(radios.map((node) => node.props.value), [...EXERCISE_DIFFICULTIES]);
    for (const radio of radios) { radio.props.onChange(); assert.equal(selected, radio.props.value); }
    assert.equal(new Set(radios.map((node) => node.props.name)).size, 1);
  });
}

for (const mode of ["practice", "exam"]) {
  test(`${mode}: changing difficulty preserves selected categories, all question types, length and seed`, () => {
    const mount = mountPanel(mode);
    let tree = mount.render();
    for (const key of ["alkene", "multiple-choice", "build"]) {
      const label = find(tree, (node) => node.type === "label" && node.key === key);
      find(label, (node) => node.type === "input").props.onChange({ target: { checked: true } });
    }
    find(tree, (node) => node.type === "input" && node.props.type === "number").props.onChange({ target: { value: "20" } });
    find(tree, (node) => node.type === "input" && node.props.autoComplete === "off").props.onChange({ target: { value: "D6-CONTROLS" } });
    if (mode === "practice") find(tree, (node) => node.type === "label" && node.props.className === "practice-endless")
      .props.children[0].props.onChange({ target: { checked: true } });
    for (const difficulty of EXERCISE_DIFFICULTIES) {
      difficultyControl(mount.render()).props.onChange(difficulty);
      tree = mount.render();
      const selection = find(tree, (node) => node.type?.name === "ClassVariantsPanel").props.selection;
      assert.equal(selection.difficulty, difficulty);
      assert.deepEqual(selection.categories, ["alkane", "alkene"]);
      assert.deepEqual(selection.questionTypes, ["naming", "multiple-choice", "build"]);
      assert.equal(selection.questionCount, mode === "practice" ? "endless" : 20);
      const count = find(tree, (node) => node.type === "input" && node.props.type === "number");
      assert.equal(count.props.value, "20"); assert.equal(count.props.disabled, mode === "practice");
      assert.equal(find(tree, (node) => node.type === "input" && node.props.autoComplete === "off").props.value, "D6-CONTROLS");
      assert.equal(find(tree, (node) => node.type === "button" && node.props.type === "submit").props.disabled, false);
    }
  });

  test(`${mode}: untouched default UI starts basic/current; all category/type/length controls remain available`, () => {
    const mount = mountPanel(mode);
    let tree = mount.render();
    assert.equal(difficultyControl(tree).props.value, "basic");
    const inputs = elements(tree).filter((node) => node.type === "input");
    assert.equal(inputs.filter((node) => node.props.type === "checkbox").length, mode === "practice" ? 21 : 20);
    const count = inputs.find((node) => node.props.type === "number");
    assert.equal(count.props.value, "10");
    count.props.onChange({ target: { value: "1" } });
    inputs.find((node) => node.props.autoComplete === "off").props.onChange({ target: { value: "D6-DEFAULT" } });
    tree = mount.render(); form(tree).props.onSubmit({ preventDefault() {} });
    tree = mount.render();
    const state = mode === "exam" ? tree.props.initialState : find(tree, (node) => node.type?.name === "PracticeSessionView").props.state;
    assert.equal(state.config.difficulty, "basic"); assert.equal(state.config.generatorVersion, 4);
    assert.equal(state.config.questionCount, 1); assert.equal(state.config.seed, "D6-DEFAULT");
  });

  for (const difficulty of EXERCISE_DIFFICULTIES) test(`${mode}/${difficulty}: UI selection reaches real session, survives locale and configure, remains absent when active`, () => {
    const mount = mountPanel(mode);
    let tree = mount.render();
    difficultyControl(tree).props.onChange(difficulty);
    find(tree, (node) => node.type === "input" && node.props.type === "number").props.onChange({ target: { value: "1" } });
    find(tree, (node) => node.type === "input" && node.props.autoComplete === "off").props.onChange({ target: { value: "D6-LEVEL" } });
    tree = mount.render();
    const classSelection = find(tree, (node) => node.type?.name === "ClassVariantsPanel").props.selection;
    assert.equal(classSelection.difficulty, difficulty);
    assert.equal(createClassAssignmentConfig(classSelection, "D6-CLASS").difficulty, difficulty);
    const otherDifficulty = difficulty === "basic" ? "advanced" : "basic";
    assert.notEqual(classVariantInputSignature(classSelection, "C", "automatic", "1", ""),
      classVariantInputSignature({ ...classSelection, difficulty: otherDifficulty }, "C", "automatic", "1", ""));
    mount.props.onLanguageChange("en"); tree = mount.render();
    assert.equal(difficultyControl(tree).props.value, difficulty);
    assert.ok(renderToStaticMarkup(tree).includes(uiText("en", "Dificultad")));
    form(tree).props.onSubmit({ preventDefault() {} });
    tree = mount.render();
    assert.equal(difficultyControl(tree), undefined); assert.equal(form(tree), undefined);
    const view = mode === "exam" ? tree : find(tree, (node) => node.type?.name === "PracticeSessionView");
    const state = mode === "exam" ? view.props.initialState : view.props.state;
    assert.equal(state.phase, mode === "exam" ? "EXAM_QUESTION" : "QUESTION");
    assert.equal(state.config.difficulty, difficulty); assert.equal(state.config.generatorVersion, 4);
    assert.equal(state.config.seed, "D6-LEVEL"); assert.equal(state.config.questionCount, 1);
    assert.deepEqual(state.config.categories, ["alkane"]); assert.deepEqual(state.config.questionTypes, ["naming"]);
    const originalQuestion = mode === "exam" ? state.plan.slots[0].question : state.question;
    mount.props.onLanguageChange("es"); tree = mount.render();
    const localizedView = mode === "exam" ? tree : find(tree, (node) => node.type?.name === "PracticeSessionView");
    const localized = mode === "exam" ? localizedView.props.initialState : localizedView.props.state;
    assert.equal(localized.config.difficulty, difficulty); assert.equal(localized.config.seed, state.config.seed);
    assert.equal(localized.config.generatorVersion, state.config.generatorVersion);
    const question = mode === "exam" ? localized.plan.slots[0].question : localized.question;
    assert.equal(question.question.id, originalQuestion.question.id);
    assert.deepEqual(question.molecule, originalQuestion.molecule);
    assert.equal(question.reference.structuralIdentity, originalQuestion.reference.structuralIdentity);
    // A configuration callback can only be reached by leaving the active view.
    if (mode === "exam") localizedView.props.onConfigure(); else localizedView.props.actions.configure();
    tree = mount.render();
    assert.equal(difficultyControl(tree).props.value, difficulty);
    assert.equal(find(tree, (node) => node.type === "input" && node.props.type === "number").props.value, "1");
    assert.equal(find(tree, (node) => node.type === "input" && node.props.autoComplete === "off").props.value, "D6-LEVEL");
    mount.props.onLanguageChange("en"); assert.equal(difficultyControl(mount.render()).props.value, difficulty);
  });
}

test("public UI uses shared canonical IDs; generator versions and scoped wrapping/focus tokens remain intact", () => {
  assert.deepEqual([...EXERCISE_DIFFICULTIES], ["basic", "intermediate", "advanced"]);
  assert.equal(GENERATOR_VERSION, 4); assert.deepEqual([...SUPPORTED_GENERATOR_VERSIONS], [1, 2, 3, 4]);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.difficulty-options \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.difficulty-options label \{[^}]*min-height: 44px/);
  assert.match(css, /\.difficulty-options label:has\(input:focus-visible\)[^}]*var\(--mint-strong\)/);
});
