import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import ts from "typescript";
import { createClassAssignmentConfig, generateClassAssignments, automaticParticipantIds } from "../app/class-assignment.ts";
import { uiText } from "../app/i18n.ts";

let server, ui;
before(async () => {
  server = await createServer({ configFile: false, logLevel: "error", appType: "custom", plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false } });
  ui = await server.ssrLoadModule("/app/class-variants-panel.tsx");
});
after(async () => server?.close());
const selection = { mode: "exam", questionCount: 15, categories: ["alkane", "alcohol"], questionTypes: ["naming", "multiple-choice", "build"] };
const manifest = (count = 36) => generateClassAssignments(createClassAssignmentConfig(selection, "CHEM-4B-2026"), automaticParticipantIds(count));
const render = (language, assignment, stale = false) => renderToStaticMarkup(React.createElement(ui.ClassVariantsPreview,
  { manifest: assignment, language, stale, onExport: () => {}, onUseSeed: () => {} }));
for (const language of ["es", "en"]) test(`class ${language}: accessible contained opt-in; preview has IDs/seeds and no solutions`, () => {
  const panel = renderToStaticMarkup(React.createElement(ui.ClassVariantsPanel, { selection, language, onUseSeed: () => {} }));
  assert.ok(panel.includes(uiText(language, "Generar variantes para una clase")));
  assert.match(panel, /type="checkbox"/);
  const assignment = manifest(), html = render(language, assignment);
  assert.equal((html.match(/scope="row"/g) ?? []).length, 36);
  assert.equal((html.match(/readonly=""/gi) ?? []).length, 36);
  assert.ok(html.includes("001")); assert.ok(html.includes("036"));
  assert.ok(html.includes(uiText(language, "Exportar CSV")));
  assert.doesNotMatch(html, /<svg|correctOptionId|data-correct|reference\.name|structuralIdentity|practice-answer|exam-answer/);
  assert.deepEqual(assignment, manifest());
});
test("stale preview disables both export and using a participant seed", () => {
  const html = render("en", manifest(3), true);
  assert.ok(html.includes("Configuration changed"));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 4);
});
test("large preview remains bounded without deleting export rows", () => {
  const assignment = manifest(1001);
  const html = render("en", assignment);
  assert.equal((html.match(/scope="row"/g) ?? []).length, 100);
  assert.ok(html.includes("CSV includes every assignment")); assert.equal(assignment.participants.length, 1001);
});
test("all new visible literals/error strings have EN translations and no duplicated dictionary entry", () => {
  const source = readFileSync("app/class-variants-panel.tsx", "utf8");
  const dictionary = readFileSync("app/i18n.ts", "utf8");
  const literals = [...source.matchAll(/\bt\("([^"\n]+)"\)/g)].map((match) => match[1]);
  literals.push(...[...source.matchAll(/\b[A-Z_]+: "([^"\n]+)"/g)].map((match) => match[1]));
  for (const text of new Set(literals)) {
    assert.notEqual(uiText("en", text), text, text);
    assert.equal(dictionary.split(`"${text}":`).length - 1, 1, text);
  }
});
test("class contracts/UI typecheck strictly alongside existing configuration integration", () => {
  const program = ts.createProgram(["app/class-assignment.ts", "app/class-assignment-csv.ts", "app/class-variants-panel.tsx", "app/practice-panel.tsx"], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX, strict: true, skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((entry) => /(?:class-assignment|class-assignment-csv|class-variants-panel|practice-panel|i18n)\.(?:ts|tsx)$/.test(entry.file?.fileName ?? ""));
  assert.deepEqual(diagnostics.map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, "\n")), []);
});
