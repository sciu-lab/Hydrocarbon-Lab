import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import { createServer } from "vite";

import { getMainChainStereoDescriptors } from "../app/double-bond-stereochemistry.ts";
import { ringFusionError } from "../app/fused-ring.ts";
import { generateFormulaIsomers } from "../app/formula-isomers.ts";
import { dynamicUiText, uiText } from "../app/i18n.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

// LANG-012 is not asserted: the audit recommends choosing IDH versus DoU, but no
// project-wide English convention has been approved. Editorial LOW findings
// LANG-014 through LANG-019 are outside this objective regression suite.

const root = fileURLToPath(new URL("..", import.meta.url));
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../app/i18n.ts", import.meta.url), "utf8");
const pageAst = ts.createSourceFile("page.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const layoutAst = ts.createSourceFile("layout.tsx", layoutSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const i18nAst = ts.createSourceFile("i18n.ts", i18nSource, ts.ScriptTarget.Latest, true);

function findAll(ast, predicate) {
  const matches = [];
  function visit(node) {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return matches;
}

function variable(ast, name) {
  const found = findAll(ast, (node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
  assert.equal(found.length, 1, `expected one ${name} declaration`);
  return found[0];
}

function translationEntries(name) {
  const object = variable(i18nAst, name).initializer;
  assert.ok(ts.isObjectLiteralExpression(object), `${name} must remain a translation object`);
  return object.properties.filter(ts.isPropertyAssignment).map((property) => {
    assert.ok(ts.isStringLiteral(property.name) && ts.isStringLiteral(property.initializer));
    return [property.name.text, property.initializer.text];
  });
}

function collectAppSource(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectAppSource(path, files);
    else if (/\.tsx?$/.test(entry.name)) files.push(path);
  }
  return files;
}

const LANG_002_KEYS = [
  "Acercar",
  "Admite grupos funcionales, sustituyentes entre paréntesis y descriptores estereoquímicos E/Z y R/S.",
  "Ajustar",
  "Ajustar molécula a la vista",
  "Alejar",
  "Constructor molecular",
  "El anillo elegido compartirá los dos carbonos y el enlace resaltado.",
  "Fusionar con enlace seleccionado",
  "Fusionar enlace",
  "La fusión aromática aún no está disponible.",
  "La fusión de heterociclos aún no está disponible.",
  "La fusión reutiliza el enlace resaltado: los dos anillos comparten exactamente dos átomos y un enlace.",
  "No hay centros E/Z o R/S definidos en esta estructura",
  "Nombre IUPAC",
  "Nombre tradicional",
  "Sistema de anillos detectado",
  "Unir al carbono seleccionado",
  "Vista ampliada del constructor molecular",
  "Zoom del constructor",
  "solo cicloalcanos de 5 o 6 miembros",
];

function referencedLiteralTranslationKeys() {
  const keys = new Set();
  for (const file of collectAppSource(join(root, "app"))) {
    const source = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const call of findAll(ast, (node) => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t")) {
      const key = call.arguments[0];
      if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) keys.add(key.text);
    }
  }
  return keys;
}

function jsxAttribute(opening, name) {
  const attr = opening.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === name);
  assert.ok(attr, `missing ${name} on ${opening.tagName.getText()}`);
  return attr;
}

function openingWithClass(ast, className) {
  const matches = findAll(ast, (node) => {
    if (!ts.isJsxOpeningElement(node)) return false;
    const attr = node.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.text === "className");
    return attr?.initializer?.getText(ast).includes(className);
  });
  assert.ok(matches.length > 0, `missing JSX class ${className}`);
  return matches[0];
}

function attributeValue(attr, ast, scope = {}) {
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  assert.ok(ts.isJsxExpression(attr.initializer) && attr.initializer.expression);
  return evaluateExpression(attr.initializer.expression.getText(ast), scope);
}

function evaluateExpression(source, scope = {}) {
  return new Function(...Object.keys(scope), `return (${source});`)(...Object.values(scope));
}

function feedbackExpression(className) {
  const opening = openingWithClass(pageAst, className);
  const parent = opening.parent;
  assert.ok(ts.isJsxElement(parent));
  const paragraph = parent.children.find((child) => ts.isJsxElement(child) && child.openingElement.tagName.getText(pageAst) === "p");
  assert.ok(paragraph, `missing paragraph in ${className}`);
  const content = paragraph.children.find((child) => ts.isJsxExpression(child) && child.expression);
  assert.ok(content, `missing dynamic feedback in ${className}`);
  return content.expression.getText(pageAst);
}

function localizedDynamicTextFor(language) {
  // Evaluate the existing page helper, with only its unrelated name-formatting dependencies stubbed.
  const expression = variable(pageAst, "localizedDynamicText").initializer.getText(pageAst);
  const compiled = ts.transpileModule(
    `function make(language, t, localizedIupac, localizedCommonAlkylName, dynamicUiText, translateCommonName) { const localizedDynamicText = ${expression}; return localizedDynamicText; }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const make = new Function(`${compiled}; return make;`)();
  return make(language, (value) => uiText(language, value), (value) => value, (value) => value, dynamicUiText, (value) => value);
}

function localizedFeedbackMessageFor(language) {
  const expression = variable(pageAst, "resolveLocalizedFeedbackMessage").initializer.getText(pageAst);
  const compiled = ts.transpileModule(
    `function make(language, t, localizedIupac, localizedDynamicText) { const resolveLocalizedFeedbackMessage = ${expression}; return resolveLocalizedFeedbackMessage; }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const make = new Function(`${compiled}; return make;`)();
  return make(language, (value) => uiText(language, value), (value) => value, localizedDynamicTextFor(language));
}

function localizedRingFusionOptionErrorFor(language, error) {
  const expression = variable(pageAst, "localizedRingFusionOptionError").initializer.getText(pageAst);
  const compiled = ts.transpileModule(
    `function make(ringFusionOptionError, localizedDynamicText) { const localizedRingFusionOptionError = ${expression}; return localizedRingFusionOptionError; }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const make = new Function(`${compiled}; return make;`)();
  return make(() => error, localizedDynamicTextFor(language));
}

function formulaErrorStored(error) {
  const candidates = findAll(pageAst, (node) => ts.isCallExpression(node)
    && node.expression.getText(pageAst) === "setFormulaFeedback"
    && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])
    && node.arguments[0].getText(pageAst).includes("result.error"));
  assert.equal(candidates.length, 1, "expected the invalid-formula feedback branch");
  const message = candidates[0].arguments[0].properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(pageAst) === "message");
  assert.ok(message);
  return evaluateExpression(message.initializer.getText(pageAst), { result: { error } });
}

function emptySmilesFeedbackStored() {
  const candidates = findAll(pageAst, (node) => ts.isCallExpression(node)
    && node.expression.getText(pageAst) === "setSmilesFeedback"
    && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])
    && node.arguments[0].getText(pageAst).includes('id: "smiles.empty"'));
  assert.equal(candidates.length, 1, "expected the empty-SMILES feedback branch");
  const message = candidates[0].arguments[0].properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText(pageAst) === "message");
  assert.ok(message);
  return evaluateExpression(message.initializer.getText(pageAst));
}

function loadedReasoning(smiles) {
  const parsed = moleculeFromSmiles(smiles);
  assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.error);
  const analysis = analyzeMolecule(parsed.molecule);
  const spanish = buildIupacReasoningSteps(parsed.molecule, analysis);
  const english = buildEnglishReasoningSteps(spanish, parsed.molecule, analysis);
  return { molecule: parsed.molecule, analysis, spanish, english };
}

let server;
let analyzeMolecule;
let buildIupacReasoningSteps;
let buildEnglishReasoningSteps;

before(async () => {
  server = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, buildIupacReasoningSteps, buildEnglishReasoningSteps } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

// LANG-001 — OTHER — HIGH. Current: CC=CC is explained as 2E. Expected: reasoning uses only explicit E/Z.
test("LANG-001 — OTHER — HIGH — unspecified alkene reasoning assigns no E/Z in either language", () => {
  const { molecule, analysis, spanish, english } = loadedReasoning("CC=CC");
  const explicit = getMainChainStereoDescriptors(molecule, analysis.mainChain, true);
  assert.deepEqual(explicit, []);
  assert.doesNotMatch(analysis.name, /\([0-9]*[EZ]\)/);
  for (const [language, steps] of [["ES", spanish], ["EN", english]]) {
    const assigned = [...steps.flatMap((step) => [...step.explanation.matchAll(/\b\d+[EZ]\b/g)].map(([value]) => value))];
    assert.deepEqual(assigned, [], `${language}: an unspecified alkene must not receive a stereodescriptor`);
  }
});

for (const [smiles, configuration] of [["C/C=C/C", "E"], ["C/C=C\\C", "Z"]]) {
  test(`LANG-001 — OTHER — HIGH — explicit ${configuration} reasoning agrees with the molecular graph in EN and ES`, () => {
    const { molecule, analysis, spanish, english } = loadedReasoning(smiles);
    const explicit = getMainChainStereoDescriptors(molecule, analysis.mainChain, true)
      .map(({ locant, configuration: value }) => `${locant}${value}`);
    assert.deepEqual(explicit, [`2${configuration}`]);
    assert.match(analysis.name, new RegExp(`\\(2${configuration}\\)`));
    for (const steps of [spanish, english]) {
      const explained = [...new Set(steps.flatMap((step) =>
        [...step.explanation.matchAll(/\b\d+[EZ]\b/g)].map(([value]) => value)))];
      assert.deepEqual(explained, explicit);
    }
  });
}

// LANG-002 — MISSING-TRANSLATION — MEDIUM. Current: 20 literal t() keys silently fall back to ES. Expected: complete nonempty EN pairs, with usable ES source keys and matching placeholders.
test("LANG-002 — MISSING-TRANSLATION — MEDIUM — every literal UI translation call has an English entry", () => {
  const known = new Set([...translationEntries("ENGLISH_UI"), ...translationEntries("dynamicExact")].map(([key]) => key));
  const missing = [...referencedLiteralTranslationKeys()].filter((key) => !known.has(key));
  assert.deepEqual(missing.sort(), [], `${missing.length} used keys lack an English translation`);
});

test("LANG-002 — MISSING-TRANSLATION — MEDIUM — every used LANG-002 key has explicit bilingual text and matching placeholders", () => {
  const used = referencedLiteralTranslationKeys();
  assert.deepEqual(LANG_002_KEYS.filter((key) => used.has(key)).sort(), [...LANG_002_KEYS].sort(), "the LANG-002 keys must remain used by the app");

  const entries = translationEntries("ENGLISH_UI");
  const placeholders = (value) => [...value.matchAll(/\$\{[^{}]+\}|\{[^{}]+\}|%\d*\$?[sd]/g)].map(([token]) => token).sort();
  for (const key of LANG_002_KEYS) {
    const matchingEntries = entries.filter(([spanish]) => spanish === key);
    assert.equal(matchingEntries.length, 1, `${key} must have exactly one ENGLISH_UI entry`);
    const [spanish, english] = matchingEntries[0];
    assert.ok(spanish.trim(), `${key} is missing its ES source`);
    assert.ok(english.trim(), `${key} has an empty EN translation`);
    assert.notEqual(english, key, `${key} returns the key instead of English text`);
    assert.equal(uiText("es", spanish), spanish, `${key} changed in ES`);
    assert.equal(uiText("en", spanish), english, `${key} does not resolve to its explicit EN entry`);
    assert.deepEqual(placeholders(english), placeholders(spanish), `${key} has mismatched placeholders`);
  }
});

test("LANG-002 — MISSING-TRANSLATION — MEDIUM — representative EN controls resolve without Spanish leakage", () => {
  const samples = [
    ["Vista ampliada del constructor molecular", "Expanded molecular builder view"],
    ["Fusionar con enlace seleccionado", "Fuse using the selected bond"],
    ["No hay centros E/Z o R/S definidos en esta estructura", "No E/Z or R/S centers are defined in this structure."],
  ];
  for (const [spanish, expectedEnglish] of samples) {
    const resolvedEnglish = uiText("en", spanish);
    assert.equal(resolvedEnglish, expectedEnglish);
    assert.notEqual(resolvedEnglish, spanish);
    assert.equal(uiText("es", spanish), spanish);
  }
});

test("LANG-002 — MISSING-TRANSLATION — MEDIUM — Spanish source keys exist and both language entries are nonempty", () => {
  for (const [name, entries] of [["ENGLISH_UI", translationEntries("ENGLISH_UI")], ["dynamicExact", translationEntries("dynamicExact")]]) {
    assert.ok(entries.length > 0, name);
    for (const [spanish, english] of entries) {
      assert.ok(spanish.trim(), `${name}: missing Spanish source key`);
      assert.ok(english.trim(), `${name}: empty English value for ${spanish}`);
    }
  }
});

test("LANG-002 — MISSING-TRANSLATION — MEDIUM — EN/ES placeholders preserve the same data and multiplicity", () => {
  const placeholders = (value) => [...value.matchAll(/\$\{[^{}]+\}|\{[^{}]+\}|%\d*\$?[sd]/g)].map(([token]) => token).sort();
  for (const [spanish, english] of [...translationEntries("ENGLISH_UI"), ...translationEntries("dynamicExact")]) {
    assert.deepEqual(placeholders(english), placeholders(spanish), `${spanish} loses or duplicates a placeholder`);
  }
});

// LANG-003 — DYNAMIC-LANGUAGE — MEDIUM. Current: SMILES feedback stores localized text and renders it unchanged. Expected: the visible message follows the current language in both directions.
for (const [createdIn, shownIn] of [["en", "es"], ["es", "en"]]) {
  test(`LANG-003 — DYNAMIC-LANGUAGE — MEDIUM — direct SMILES error updates ${createdIn.toUpperCase()}→${shownIn.toUpperCase()}`, () => {
    const spanishSource = "Escribe o pega un SMILES antes de cargarlo.";
    const stored = emptySmilesFeedbackStored();
    assert.notEqual(uiText("en", spanishSource), uiText("es", spanishSource));
    assert.deepEqual(stored, { id: "smiles.empty" });
    const visible = evaluateExpression(feedbackExpression("smiles-feedback"), {
      smilesFeedback: { kind: "error", message: stored },
      language: shownIn,
      resolveLocalizedFeedbackMessage: localizedFeedbackMessageFor(shownIn),
    });
    assert.equal(visible, uiText(shownIn, spanishSource));
    assert.equal(evaluateExpression("smilesFeedback.kind", { smilesFeedback: { kind: "error", message: stored } }), "error");

    const successMessage = { id: "smiles.imported", suggestedName: "ciclohexano", importedRecords: 2 };
    const success = evaluateExpression(feedbackExpression("smiles-feedback"), {
      smilesFeedback: { kind: "success", message: successMessage },
      resolveLocalizedFeedbackMessage: localizedFeedbackMessageFor(shownIn),
    });
    assert.match(success, shownIn === "en" ? /SMILES imported.*2 records/ : /SMILES importado.*2 registros/);
  });
}

// LANG-004 — LANGUAGE-LEAK — MEDIUM. Current: CP's unsupported-P error remains Spanish in EN. Expected: the same element and support limit are expressed in the selected language.
test("LANG-004 — LANGUAGE-LEAK — MEDIUM — unsupported CP error is English in EN", () => {
  for (const [smiles, element] of [["CP", "P"], ["CB", "B"]]) {
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, false);
    assert.match(converted.error, new RegExp(`\\b${element}\\b`));
    const visible = localizedDynamicTextFor("en")(converted.error);
    assert.equal(visible, `The structure contains ${element}. The lab currently supports C, O, N, S, and halogens.`);
    assert.match(visible, /C, O, N, S, and halogens/);
    assert.doesNotMatch(visible, /\b(?:La estructura|contiene|Por ahora|admite|halógenos)\b/i);
  }
});

test("LANG-004 — LANGUAGE-LEAK — MEDIUM — unsupported CP error retains its chemical detail in ES", () => {
  for (const [smiles, element] of [["CP", "P"], ["CB", "B"]]) {
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, false);
    const visible = localizedDynamicTextFor("es")(converted.error);
    assert.equal(visible, converted.error);
    assert.match(visible, new RegExp(`\\b${element}\\b`));
    assert.match(visible, /La estructura contiene/);
    assert.match(visible, /C, O, N, S y halógenos/);
  }
});

// LANG-005 — DYNAMIC-LANGUAGE — MEDIUM. Current: formula feedback may store English and cannot translate it back to ES. Expected: render uses the current locale.
for (const [createdIn, shownIn] of [["en", "es"], ["es", "en"]]) {
  test(`LANG-005 — DYNAMIC-LANGUAGE — MEDIUM — formula error updates ${createdIn.toUpperCase()}→${shownIn.toUpperCase()}`, () => {
    const result = generateFormulaIsomers("");
    assert.equal(result.ok, false);
    const stored = formulaErrorStored(result.error);
    assert.deepEqual(stored, { id: "formula.empty" });
    const visible = evaluateExpression(feedbackExpression("formula-builder-feedback"), {
      formulaFeedback: { kind: "error", message: stored },
      resolveLocalizedFeedbackMessage: localizedFeedbackMessageFor(shownIn),
    });
    assert.equal(visible, uiText(shownIn, result.error));

    const formulaMessage = { id: "formula.isomers", formula: "C6H12O", count: 3, complete: true };
    const formulaFeedback = evaluateExpression(feedbackExpression("formula-builder-feedback"), {
      formulaFeedback: { kind: "success", message: formulaMessage },
      resolveLocalizedFeedbackMessage: localizedFeedbackMessageFor(shownIn),
    });
    assert.match(formulaFeedback, /C6H12O/);
    assert.match(formulaFeedback, /3/);
    assert.match(formulaFeedback, shownIn === "en" ? /constitutional isomers/ : /isómeros constitucionales/);
  });
}

// LANG-006 — LANGUAGE-LEAK — MEDIUM. Ring-fusion errors are localized in notices and disabled-option titles.
for (const [smiles, invalidBond, expected, expectedEnglish] of [
  ["C1CCCCC1", true, /enlace periférico/, /\b(?:ring|bond)\b/i],
  ["C1(C)(C)CCCCC1", false, /valencia del carbono/, /\bvalence\b/i],
]) {
  test(`LANG-006 — LANGUAGE-LEAK — MEDIUM — ${invalidBond ? "invalid ring bond" : "ring-fusion valence"} is localized in notices and titles`, () => {
    const parsed = moleculeFromSmiles(smiles);
    assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.error);
    const [a, b] = parsed.molecule.rings[0].atomIds;
    const error = ringFusionError(parsed.molecule, a, invalidBond ? -1 : b);
    assert.match(error, expected);
    const englishNotice = localizedDynamicTextFor("en")(error);
    const spanishNotice = localizedDynamicTextFor("es")(error);
    assert.doesNotMatch(englishNotice, /\b(?:Selecciona|enlace periférico|La fusión|valencia del carbono)\b/i);
    assert.match(englishNotice, expectedEnglish);
    assert.equal(spanishNotice, error);

    const title = jsxAttribute(openingWithClass(pageAst, "ring-option"), "title");
    for (const [language, expectedTitle] of [["en", englishNotice], ["es", error]]) {
      const visibleTitle = attributeValue(title, pageAst, {
        language,
        localizedRingFusionOptionError: localizedRingFusionOptionErrorFor(language, error),
        t: (value) => uiText(language, value),
        ringLibraryContext: "fuse",
        template: { label: "ciclohexano", size: 6 },
        localizedIupac: (value) => language === "en" ? "cyclohexane" : value,
      });
      assert.equal(visibleTitle, expectedTitle);
    }
  });
}

test("LANG-006 — LANGUAGE-LEAK — MEDIUM — ring-fusion validation remains informative in ES", () => {
  const parsed = moleculeFromSmiles("C1(C)(C)CCCCC1");
  assert.equal(parsed.ok, true);
  const [a, b] = parsed.molecule.rings[0].atomIds;
  const error = ringFusionError(parsed.molecule, a, b);
  assert.match(localizedDynamicTextFor("es")(error), /fusión.*valencia/i);
});

// LANG-007 — ACCESSIBILITY — MEDIUM. Deselect and ring-button help follows the selected language.
for (const [className, englishPhrase, spanishPhrase, shortcut] of [
  ["canvas-deselect-button", /Cancel tool \/ clear selection/i, /Cancelar herramienta \/ limpiar selección/i, "Esc"],
  ["ring-button", /Add ring/i, /Añadir anillo/i, "R"],
]) {
  test(`LANG-007 — ACCESSIBILITY — MEDIUM — ${className} help is localized in EN and ES`, () => {
    const opening = openingWithClass(pageAst, className);
    const title = jsxAttribute(opening, "title");
    const spanish = attributeValue(title, pageAst, { language: "es", t: (value) => uiText("es", value) });
    const english = attributeValue(title, pageAst, { language: "en", t: (value) => uiText("en", value) });
    assert.match(english, englishPhrase);
    assert.match(spanish, spanishPhrase);
    assert.match(english, new RegExp(`\\b${shortcut}\\b`));
    assert.match(spanish, new RegExp(`\\b${shortcut}\\b`));
  });
}

test("LANG-007 — ACCESSIBILITY — MEDIUM — direct SMILES field has linked bilingual label and error description", () => {
  const input = findAll(pageAst, (node) => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(pageAst) === "input"
    && node.attributes.properties.some((item) => ts.isJsxAttribute(item) && item.name.text === "id" && item.initializer?.text === "smiles-text-input"));
  assert.equal(input.length, 1);
  const label = findAll(pageAst, (node) => ts.isJsxOpeningElement(node)
    && node.tagName.getText(pageAst) === "label"
    && node.attributes.properties.some((item) => ts.isJsxAttribute(item) && item.name.text === "htmlFor" && item.initializer?.text === "smiles-text-input"));
  assert.equal(label.length, 1);
  assert.match(jsxAttribute(input[0], "aria-describedby").getText(pageAst), /smiles-feedback/);
  assert.notEqual(uiText("en", "Pega o escribe un SMILES"), uiText("es", "Pega o escribe un SMILES"));
});

// LANG-008 — HARDCODED-UI — MEDIUM. Current: the ring title appends a Spanish drag instruction in EN. Expected: all human text in the title follows the locale.
for (const language of ["en", "es"]) {
  test(`LANG-008 — HARDCODED-UI — MEDIUM — ring-fusion tooltip is coherent in ${language.toUpperCase()}`, () => {
    const title = jsxAttribute(openingWithClass(pageAst, "ring-option"), "title");
    const visible = attributeValue(title, pageAst, {
      language,
      ringFusionOptionError: () => null,
      localizedRingFusionOptionError: () => null,
      ringLibraryContext: "fuse",
      template: { label: "ciclohexano", size: 6 },
      t: (value) => uiText(language, value),
      localizedIupac: (value) => language === "en" ? "cyclohexane" : value,
    });
    if (language === "en") {
      assert.doesNotMatch(visible, /Arrastra sobre un enlace de anillo/i);
      assert.match(visible, /Drag a ring onto a ring bond to fuse it/i);
      assert.match(visible, /cyclohexane/i);
      assert.equal(visible, "Load cyclohexane. Drag a ring onto a ring bond to fuse it.");
    } else {
      assert.match(visible, /Arrastra sobre un enlace de anillo para fusionar\./i);
      assert.doesNotMatch(visible, /\b(?:Load|Drag|fuse)\b/i);
      assert.match(visible, /ciclohexano/i);
    }
  });
}

// LANG-009 — HARDCODED-UI — MEDIUM. Current: alkyl titles use English Add/Shortcut in ES. Expected: human help words localize while M stays M.
for (const language of ["en", "es"]) {
  test(`LANG-009 — HARDCODED-UI — MEDIUM — alkyl tooltip is coherent in ${language.toUpperCase()}`, () => {
    const title = jsxAttribute(openingWithClass(pageAst, "alkyl-option"), "title");
    for (const sample of [
      { id: "methyl", spanish: "metilo", english: "methyl", shortcut: "M" },
      { id: "ethyl", spanish: "etilo", english: "ethyl", shortcut: "E" },
      { id: "propyl", spanish: "propilo", english: "propyl", shortcut: "P" },
    ]) {
      const visible = attributeValue(title, pageAst, {
        language,
        template: { id: sample.id, label: sample.spanish },
        localizedCommonAlkylName: () => language === "en" ? sample.english : sample.spanish,
        localizedAlkylShortcut: () => ` — ${uiText(language, "Atajo")}: ${sample.shortcut}`,
        t: (value) => uiText(language, value),
      });
      assert.match(visible, new RegExp(`\\b${sample.shortcut}\\b`));
      if (language === "es") {
        assert.doesNotMatch(visible, /\b(?:Add|Shortcut)\b/);
        assert.equal(visible, `Añade ${sample.spanish} — Atajo: ${sample.shortcut}`);
      } else {
        assert.match(visible, new RegExp(`Add ${sample.english} — Shortcut: ${sample.shortcut}`, "i"));
      }
    }
  });
}

// LANG-010 — LANGUAGE-LEAK — MEDIUM. Current: English placement notices interpolate Spanish template.label. Expected: group/ring names are localized before insertion.
test("LANG-010 — LANGUAGE-LEAK — MEDIUM — English placement notices never insert raw Spanish template labels", () => {
  const unsafe = findAll(pageAst, (node) => ts.isCallExpression(node)
    && node.expression.getText(pageAst) === "setNotice"
    && node.arguments[0] && ts.isConditionalExpression(node.arguments[0])
    && node.arguments[0].whenTrue.getText(pageAst).includes("Click a carbon on the canvas to place")
    && node.arguments[0].whenTrue.getText(pageAst).includes("${template.label}"));
  assert.deepEqual(unsafe.map((call) => pageAst.getLineAndCharacterOfPosition(call.getStart(pageAst)).line + 1), []);
});

// LANG-011 — PLACEHOLDER — MEDIUM. Current: English numbering drops C1 versus C2 and suggests a tie. Expected: both computed positions survive translation.
for (const smiles of ["CC(=O)O", "CNCC"]) {
  test(`LANG-011 — PLACEHOLDER — MEDIUM — English numbering preserves C1 versus C2 for ${smiles}`, () => {
    const { spanish, english } = loadedReasoning(smiles);
    const es = spanish.find((step) => step.number === "03")?.explanation;
    const en = english.find((step) => step.number === "03")?.explanation;
    assert.ok(es && en);
    assert.match(es, /\bC1\b/);
    assert.match(es, /\bC2\b/);
    assert.match(en, /\bC1\b/);
    assert.match(en, /\bC2\b/);
    assert.doesNotMatch(en, /if both directions remain equivalent/i);
  });
}

// LANG-013 — ACCESSIBILITY — MEDIUM. Current: initial /en/ HTML has lang=es. Expected: initial document language matches each route before hydration.
for (const language of ["en", "es"]) {
  test(`LANG-013 — ACCESSIBILITY — MEDIUM — initial /${language}/ document language is ${language}`, () => {
    const html = findAll(layoutAst, (node) => ts.isJsxOpeningElement(node) && node.tagName.getText(layoutAst) === "html");
    assert.equal(html.length, 1);
    const initial = attributeValue(jsxAttribute(html[0], "lang"), layoutAst, {
      language,
      params: { lang: language },
    });
    assert.equal(initial, language);
  });
}
