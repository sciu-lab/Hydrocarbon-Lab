// Read-only inventory for reports/language-audit. No application code is loaded.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = new URL("..", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
const sourceFiles = [];
function collect(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) collect(path);
    else if (/\.(tsx?|css)$/.test(item.name)) sourceFiles.push(path);
  }
}
collect(join(root, "app"));

const i18nPath = join(root, "app", "i18n.ts");
const i18nSource = readFileSync(i18nPath, "utf8");
const i18nAst = ts.createSourceFile(i18nPath, i18nSource, ts.ScriptTarget.Latest, true);
function literal(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}
function objectEntries(name) {
  let object;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(i18nAst) === name && node.initializer && ts.isObjectLiteralExpression(node.initializer)) object = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(i18nAst);
  if (!object) throw new Error(`Missing ${name}`);
  return object.properties.filter(ts.isPropertyAssignment).map((property) => ({
    key: literal(property.name) ?? property.name.getText(i18nAst),
    value: literal(property.initializer),
    line: i18nAst.getLineAndCharacterOfPosition(property.getStart(i18nAst)).line + 1,
  }));
}
const ui = objectEntries("ENGLISH_UI");
const dynamic = objectEntries("dynamicExact");
const uiKeys = new Set(ui.map((item) => item.key));
const dynamicKeys = new Set(dynamic.map((item) => item.key));
const textCalls = [];
const jsxTexts = [];
const attributes = [];
const cssContent = [];
const dynamicMessages = [];
const translationCallNames = new Set(["t", "uiText", "dynamicUiText", "englishReasoningTitle"]);
const visibleAttributes = new Set(["aria-label", "aria-labelledby", "aria-describedby", "title", "alt", "placeholder"]);

for (const path of sourceFiles) {
  const file = relative(root, path).replaceAll("\\", "/");
  const source = readFileSync(path, "utf8");
  if (path.endsWith(".css")) {
    for (const match of source.matchAll(/\bcontent:\s*(["'])(.*?)\1/g)) {
      cssContent.push({ file, line: source.slice(0, match.index).split("\n").length, text: match[2] });
    }
    continue;
  }
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function location(node) { return { file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 }; }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && translationCallNames.has(node.expression.text)) {
      const argument = node.arguments[node.expression.text === "uiText" || node.expression.text === "dynamicUiText" ? 1 : 0];
      textCalls.push({ ...location(node), call: node.expression.text, key: argument ? literal(argument) : null });
    }
    if (ts.isJsxText(node)) {
      const text = node.getText(ast).replace(/\s+/g, " ").trim();
      if (/[\p{L}]/u.test(text)) jsxTexts.push({ ...location(node), text });
    }
    if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.text)) {
      attributes.push({ ...location(node), attribute: node.name.text, text: node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text : null });
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^set(?:Notice|ValenceAlert|.*Feedback)$/.test(node.expression.text)) {
      const first = node.arguments[0];
      if (first) dynamicMessages.push({ ...location(node), setter: node.expression.text, text: literal(first) });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

function duplicates(entries) {
  const seen = new Set();
  return entries.filter(({ key }) => seen.has(key) || !seen.add(key));
}
const usedLiteralKeys = new Set(textCalls.map((item) => item.key).filter(Boolean));
const missingStatic = [...usedLiteralKeys].filter((key) => !uiKeys.has(key) && !dynamicKeys.has(key));
const allSource = sourceFiles.filter((path) => !path.endsWith("i18n.ts") && !path.endsWith(".css"))
  .map((path) => readFileSync(path, "utf8")).join("\n");
const apparentDead = ui.filter(({ key }) => !allSource.includes(key));
const same = ui.filter(({ key, value }) => key === value);
const placeholderTokens = (value) => [...value.matchAll(/\$\{[^{}]+\}|\{[^{}]+\}|%\d*\$?[sd]/g)].map((match) => match[0]).sort();
const placeholderMismatches = [...ui, ...dynamic].filter(({ key, value }) =>
  JSON.stringify(placeholderTokens(key)) !== JSON.stringify(placeholderTokens(value ?? "")));
const metric = {
  filesScanned: sourceFiles.length,
  englishUiKeys: ui.length,
  spanishSourceKeys: ui.length,
  dynamicExactKeys: dynamic.length,
  duplicateUiKeys: duplicates(ui),
  duplicateDynamicKeys: duplicates(dynamic),
  crossMapDuplicateKeys: dynamic.filter(({ key }) => uiKeys.has(key)),
  emptyUiEntries: ui.filter(({ key, value }) => !key.trim() || !value?.trim()),
  emptyDynamicEntries: dynamic.filter(({ key, value }) => !key.trim() || !value?.trim()),
  placeholderMismatches,
  identicalUiEntries: same,
  translationCallSites: textCalls.length,
  translationLiteralCallSites: textCalls.filter((item) => item.key !== null).length,
  translationDynamicCallSites: textCalls.filter((item) => item.key === null).length,
  missingStaticKeys: missingStatic,
  missingStaticSites: textCalls.filter((item) => item.key && missingStatic.includes(item.key)),
  apparentDeadKeys: apparentDead,
  apparentDeadKeyCount: apparentDead.length,
  jsxTextContexts: jsxTexts.length,
  jsxTextSites: jsxTexts,
  accessibilityAndTooltipAttributes: attributes.length,
  literalAttributes: attributes.filter((item) => item.text !== null),
  cssGeneratedContent: cssContent,
  dynamicMessageSetters: dynamicMessages.length,
  contextsAudited: textCalls.length + jsxTexts.length + attributes.length + cssContent.length + dynamicMessages.length,
};
console.log(JSON.stringify(metric, null, 2));
