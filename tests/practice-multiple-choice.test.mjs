import assert from "node:assert/strict";
import { test } from "node:test";
import { DISTRACTOR_RECIPE_SUPPORT, validateMultipleChoiceOptions } from "../app/practice-multiple-choice.ts";
import { REVIEW_DIAGNOSIS_SUPPORT } from "../app/practice-review-diagnosis.ts";

const referenceNames = {
  es: "(2E,4E,6E)-octa-2,4,6-trieno",
  en: "(2E,4E,6E)-octa-2,4,6-triene",
};

function optionsFor(names = referenceNames) {
  const options = [{ id: "reference", kind: "reference", correct: true, origin: { kind: "reference" }, name: names }];
  for (const locant of [2, 4, 6]) {
    const es = names.es.replace(`(${locant}E`, `(${locant}Z`).replace(`,${locant}E`, `,${locant}Z`);
    const en = names.en.replace(`(${locant}E`, `(${locant}Z`).replace(`,${locant}E`, `,${locant}Z`);
    options.push({
      id: `ez-${locant}`, kind: "distractor", correct: false,
      origin: { kind: "recipe", recipeId: `flip-ez-${locant}`, diagnosticCode: "WRONG_EZ_DESCRIPTOR",
        transformation: { kind: "opposite-ez-descriptor", locant, from: "E", to: "Z" } },
      name: { es, en },
    });
  }
  return options;
}

function validate(options, names = referenceNames) {
  return validateMultipleChoiceOptions({ referenceNames: names, options });
}

test("one reference and three controlled, locale-paired distractors satisfy the option contract", () => {
  const options = optionsFor();
  assert.deepEqual(validate(options), { valid: true, issues: [] });
  assert.equal(options.filter((option) => option.correct).length, 1);
  assert.equal(options[1].origin.recipeId, "flip-ez-2");
  assert.equal(options[1].origin.diagnosticCode, "WRONG_EZ_DESCRIPTOR");
  assert.equal(DISTRACTOR_RECIPE_SUPPORT.WRONG_EZ_DESCRIPTOR, "SUPPORTED");
});

test("rejects zero or multiple correct answers", () => {
  assert.ok(validate(optionsFor().map((option) => ({ ...option, correct: false }))).issues.some((x) => x.code === "ZERO_CORRECT_OPTIONS"));
  const options = optionsFor();
  options[1] = { ...options[1], correct: true };
  assert.ok(validate(options).issues.some((x) => x.code === "MULTIPLE_CORRECT_OPTIONS"));
});

test("rejects a distractor equal to the reference and duplicate options after normalization", () => {
  const sameAsReference = optionsFor();
  sameAsReference[1] = { ...sameAsReference[1], name: { ...referenceNames } };
  assert.ok(validate(sameAsReference).issues.some((x) => x.code === "DISTRACTOR_MATCHES_REFERENCE"));

  const duplicates = optionsFor();
  duplicates[2] = { ...duplicates[2], name: { ...duplicates[1].name } };
  assert.ok(validate(duplicates).issues.some((x) => x.code === "DUPLICATE_NORMALIZED_OPTIONS"));
});

test("uses the Practice evaluator normalizer for dash and Spanish acute-accent equivalence", () => {
  const dashOptions = [
    { id: "r", kind: "reference", correct: true, origin: { kind: "reference" }, name: { es: "3-metilhexano", en: "3-methylhexane" } },
    { id: "d", kind: "distractor", correct: false, origin: { kind: "recipe", recipeId: "locant", diagnosticCode: "WRONG_SUBSTITUENT_LOCANT",
      transformation: { kind: "replace-locant", component: "substituent", from: 3, to: 4 } },
      name: { es: "3–metilhexano", en: "3–methylhexane" } },
  ];
  assert.ok(validate(dashOptions, { es: "3-metilhexano", en: "3-methylhexane" }).issues
    .some((x) => x.code === "DISTRACTOR_MATCHES_REFERENCE"));

  const acidOptions = [
    { id: "r", kind: "reference", correct: true, origin: { kind: "reference" }, name: { es: "ácido propanoico", en: "propanoic acid" } },
    { id: "d", kind: "distractor", correct: false, origin: { kind: "recipe", recipeId: "suffix", diagnosticCode: "WRONG_SUFFIX",
      transformation: { kind: "replace-suffix", from: "oico", to: "oato" } },
      name: { es: "acido propanoico", en: "propanoic acid" } },
  ];
  assert.ok(validate(acidOptions, { es: "ácido propanoico", en: "propanoic acid" }).issues
    .some((x) => x.code === "DISTRACTOR_MATCHES_REFERENCE"));
});

test("rejects empty labels, empty option sets, duplicate stable IDs, and malformed provenance", () => {
  assert.ok(validate([]).issues.some((x) => x.code === "EMPTY_OPTIONS"));
  const empty = optionsFor(); empty[1] = { ...empty[1], name: { es: "  ", en: "" } };
  assert.ok(validate(empty).issues.some((x) => x.code === "EMPTY_OPTION_NAME"));
  const duplicateIds = optionsFor(); duplicateIds[1] = { ...duplicateIds[1], id: "reference" };
  assert.ok(validate(duplicateIds).issues.some((x) => x.code === "DUPLICATE_OPTION_ID"));
  const mismatch = optionsFor(); mismatch[1] = { ...mismatch[1], origin: { ...mismatch[1].origin, diagnosticCode: "WRONG_SUFFIX" } };
  assert.ok(validate(mismatch).issues.some((x) => x.code === "INVALID_TRANSFORMATION_METADATA"));
});

test("rejects UNKNOWN_MISMATCH, unknown origins, and recipes not approved by the taxonomy", () => {
  const unknown = optionsFor(); unknown[1] = { ...unknown[1], origin: { ...unknown[1].origin, diagnosticCode: "UNKNOWN_MISMATCH" } };
  assert.ok(validate(unknown).issues.some((x) => x.code === "UNKNOWN_DIAGNOSTIC_CODE"));
  const unregistered = optionsFor(); unregistered[1] = { ...unregistered[1], origin: { kind: "other" } };
  assert.ok(validate(unregistered).issues.some((x) => x.code === "INVALID_OPTION_ORIGIN"));
  const fabricated = optionsFor(); fabricated[1] = { ...fabricated[1], name: { es: "octano", en: "octane" } };
  assert.ok(validate(fabricated).issues.some((x) => x.code === "DIAGNOSTIC_RECIPE_MISMATCH"));
  const unsafe = optionsFor(); unsafe[1] = { ...unsafe[1], origin: { ...unsafe[1].origin, diagnosticCode: "WRONG_PARENT_CHAIN",
    transformation: { kind: "replace-parent-length", from: 8, to: 7 } } };
  assert.ok(validate(unsafe).issues.some((x) => x.code === "UNSAFE_RECIPE"));
  const restricted = optionsFor(); restricted[1] = { ...restricted[1], origin: { ...restricted[1].origin,
    diagnosticCode: "WRONG_SUBSTITUENT_LOCANT", transformation: { kind: "replace-locant", component: "substituent", from: 3, to: 4 } } };
  assert.ok(validate(restricted).issues.some((x) => x.code === "RECIPE_REQUIRES_RESTRICTIONS"));
  assert.equal(DISTRACTOR_RECIPE_SUPPORT.EXTRA_SUBSTITUENT, "NOT_SAFE_AS_DISTRACTOR");
  assert.equal(DISTRACTOR_RECIPE_SUPPORT.WRONG_SUBSTITUENT_LOCANT, "SUPPORTED_WITH_RESTRICTIONS");
});

test("locale changes option text only; stable IDs and recipe identity are shared", () => {
  const options = optionsFor();
  const semanticIdentity = options.map(({ id, kind, correct, origin }) => ({ id, kind, correct, origin }));
  const englishPresentation = options.map(({ id, name }) => ({ id, text: name.en }));
  const spanishPresentation = options.map(({ id, name }) => ({ id, text: name.es }));
  assert.deepEqual(englishPresentation.map(({ id }) => id), spanishPresentation.map(({ id }) => id));
  assert.notEqual(englishPresentation[1].text, spanishPresentation[1].text);
  assert.deepEqual(options.map(({ id, kind, correct, origin }) => ({ id, kind, correct, origin })), semanticIdentity);
  assert.ok(validate(options).valid);
});

test("the distractor taxonomy excludes the textual and structural UNKNOWN fallbacks", () => {
  assert.deepEqual(Object.keys(DISTRACTOR_RECIPE_SUPPORT).sort(),
    Object.keys(REVIEW_DIAGNOSIS_SUPPORT).filter((code) => !["UNKNOWN_MISMATCH", "UNKNOWN_STRUCTURAL_MISMATCH"].includes(code)).sort());
});

test("option core and Exercise Model types pass strict TypeScript checking", async () => {
  const ts = await import("typescript");
  const { fileURLToPath } = await import("node:url");
  const paths = ["practice-multiple-choice.ts", "exercise-model.ts"].map((name) =>
    fileURLToPath(new URL(`../app/${name}`, import.meta.url)).replace(/\\/g, "/"));
  const options = { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true };
  const program = ts.createProgram(paths, options);
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => !d.file || paths.includes(d.file.fileName.replace(/\\/g, "/")));
  assert.deepEqual(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});
