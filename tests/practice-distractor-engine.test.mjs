import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, test } from "node:test";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { getMainChainStereoDescriptors } from "../app/double-bond-stereochemistry.ts";
import { createDeterministicDistractorEngine, dedupeDistractorCandidates, DISTRACTOR_RECIPE_ORDER } from "../app/practice-distractor-engine.ts";
import { validateMultipleChoiceOptions } from "../app/practice-multiple-choice.ts";
import { matchesHydrocarbonReferenceName } from "../app/practice-reference-answer.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry;
let generate;
let generateDistractors;

before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createRestrictedChemicalGenerator(chemistry.oracles);
  generateDistractors = createDeterministicDistractorEngine(chemistry.engine);
});
after(async () => chemistry?.close());

function generated(category, seed, locale = "es", index = 0) {
  const config = createPracticeConfig([category], 5, locale, seed, ["naming"], "basic", 1);
  return generate(config, index);
}

function generatedWithConfiguration(wanted, prefix) {
  for (let index = 0; index < 24; index += 1) {
    const molecule = generated("ez", `${prefix}-${index}`);
    const analysis = chemistry.engine.analyzeMolecule(molecule.molecule);
    const descriptor = getMainChainStereoDescriptors(molecule.molecule, analysis.mainChain, true)[0];
    if (descriptor?.configuration === wanted) return { molecule, descriptor, seed: `${prefix}-${index}` };
  }
  assert.fail(`No ${wanted} fixture found in the bounded deterministic seed sweep.`);
}

function assertExactSingleDescriptorChange(reference, candidate, locant, from, to) {
  const prefix = new RegExp(`^\\(([^)]*)\\)-`, "u");
  for (const locale of ["es", "en"]) {
    const match = prefix.exec(reference[locale]);
    assert.ok(match);
    const items = match[1].split(",");
    const replacements = items.map((item) => item === `${locant}${from}` ? `${locant}${to}` : item);
    assert.equal(replacements.filter((item, index) => item !== items[index]).length, 1);
    assert.equal(candidate[locale], `(${replacements.join(",")})-${reference[locale].slice(match[0].length)}`);
  }
}

test("E reference produces a Z distractor; only the declared descriptor changes", () => {
  const { molecule, descriptor } = generatedWithConfiguration("E", "ez-E");
  const [candidate] = generateDistractors({ generatedMolecule: molecule, questionSeed: molecule.question.seed });
  assert.ok(candidate);
  assertExactSingleDescriptorChange(molecule.reference.names, candidate.name, descriptor.locant, "E", "Z");
  assert.deepEqual(candidate.origin.transformation, {
    kind: "opposite-ez-descriptor", locant: descriptor.locant, from: "E", to: "Z",
  });
  assert.equal(matchesHydrocarbonReferenceName(candidate.name.es, molecule.reference.names.es, "es"), false);
  assert.equal(matchesHydrocarbonReferenceName(candidate.name.en, molecule.reference.names.en, "en"), false);
  assert.equal(validateMultipleChoiceOptions({ referenceNames: molecule.reference.names, options: [
    { id: "reference", kind: "reference", name: molecule.reference.names, correct: true, origin: { kind: "reference" } }, candidate,
  ] }).valid, true);
});

test("Z reference produces an E distractor using the same localized transformation", () => {
  const { molecule, descriptor } = generatedWithConfiguration("Z", "ez-Z");
  const [candidate] = generateDistractors({ generatedMolecule: molecule, questionSeed: molecule.question.seed });
  assert.ok(candidate);
  assertExactSingleDescriptorChange(molecule.reference.names, candidate.name, descriptor.locant, "Z", "E");
  assert.equal(candidate.origin.transformation.from, "Z");
  assert.equal(candidate.origin.transformation.to, "E");
  assert.equal(candidate.origin.diagnosticCode, "WRONG_EZ_DESCRIPTOR");
});

test("recipe order is explicit; generation is repeatable, locale-neutral, and stable in a fresh process", () => {
  const { molecule, seed } = generatedWithConfiguration("E", "ez-cross-process");
  const input = { generatedMolecule: molecule, questionSeed: molecule.question.seed };
  const first = generateDistractors(input);
  const second = generateDistractors(input);
  assert.deepEqual(first, second);
  assert.deepEqual(DISTRACTOR_RECIPE_ORDER, ["WRONG_EZ_DESCRIPTOR", "WRONG_SUBSTITUENT_LOCANT", "MISSING_SUBSTITUENT", "WRONG_FUNCTIONAL_GROUP_LOCANT", "WRONG_UNSATURATION_LOCANT", "WRONG_PARENT_LENGTH"]);

  const changedQuestionSeed = `independent:${molecule.question.seed}`;
  const sameGraphDifferentQuestion = { ...molecule, question: { ...molecule.question, seed: changedQuestionSeed } };
  const differentQuestionCandidate = generateDistractors({
    generatedMolecule: sameGraphDifferentQuestion,
    questionSeed: changedQuestionSeed,
  });
  assert.equal(differentQuestionCandidate.length, first.length);
  assert.deepEqual(differentQuestionCandidate.map(({ name, origin }) => ({ name, origin })),
    first.map(({ name, origin }) => ({ name, origin })));
  assert.notEqual(differentQuestionCandidate[0].id, first[0].id);

  const englishMolecule = generated("ez", seed, "en");
  assert.equal(englishMolecule.question.seed, molecule.question.seed);
  const english = generateDistractors({ generatedMolecule: englishMolecule, questionSeed: englishMolecule.question.seed });
  assert.equal(english.length, first.length);
  assert.equal(english[0].id, first[0].id);
  assert.deepEqual(english[0].name, first[0].name);
  assert.deepEqual(english[0].origin, first[0].origin);
  assert.notEqual(english[0].name.es, english[0].name.en);

  const analysis = chemistry.engine.analyzeMolecule(molecule.molecule);
  const legacy = chemistry.engine.buildLegacyEnglishNameModel(molecule.molecule, analysis);
  const payload = JSON.stringify({ molecule, analysis, legacy });
  const enginePath = new URL("../app/practice-distractor-engine.ts", import.meta.url).href;
  const script = `import { createDeterministicDistractorEngine } from ${JSON.stringify(enginePath)};\n`
    + `const p=JSON.parse(process.argv[1]);\n`
    + `Math.random=()=>{throw new Error("Math.random prohibited")}; const D=Date; globalThis.Date=class extends D{constructor(){throw new Error("Date prohibited")}; static now(){throw new Error("Date.now prohibited")}};\n`
    + `const e=createDeterministicDistractorEngine({analyzeMolecule:()=>p.analysis,buildLegacyEnglishNameModel:()=>p.legacy});\n`
    + `process.stdout.write(JSON.stringify(e({generatedMolecule:p.molecule,questionSeed:p.molecule.question.seed})));`;
  const childResult = execFileSync(process.execPath, ["--input-type=module", "-e", script, payload], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(childResult), first);
});

test("question seed must match; source graph is unchanged and Math.random/time are unnecessary", () => {
  const { molecule } = generatedWithConfiguration("E", "ez-pure");
  const snapshot = JSON.stringify(molecule.molecule);
  const savedRandom = Math.random;
  const savedNow = Date.now;
  const SavedDate = Date;
  try {
    Math.random = () => { throw new Error("Math.random is prohibited"); };
    globalThis.Date = class extends SavedDate {
      constructor(...args) {
        if (args.length === 0) throw new Error("new Date() is prohibited");
        super(...args);
      }
      static now() { throw new Error("Date.now is prohibited"); }
    };
    const input = { generatedMolecule: molecule, questionSeed: molecule.question.seed };
    assert.deepEqual(generateDistractors(input), generateDistractors(input));
    assert.throws(() => generateDistractors({ ...input, questionSeed: "wrong-seed" }), /seed does not match/u);
  } finally {
    Math.random = savedRandom;
    globalThis.Date = SavedDate;
    Date.now = savedNow;
  }
  assert.equal(JSON.stringify(molecule.molecule), snapshot);
});

test("no-recipe chemistry returns no options, with a small category sweep passing contract validation", () => {
  for (const category of ["alkane", "alcohol", "halogenated", "aromatic"]) {
    const molecule = generated(category, `sweep-${category}`);
    assert.deepEqual(generateDistractors({ generatedMolecule: molecule, questionSeed: molecule.question.seed }), []);
  }
  for (const [category, seeds] of [["ez", ["sweep-ez-a", "sweep-ez-b"]], ["alkane", ["sweep-a"]],
    ["alcohol", ["sweep-oh"]], ["halogenated", ["sweep-x"]], ["aromatic", ["sweep-ar"]]]) {
    for (const seed of seeds) {
      const molecule = generated(category, seed);
      const candidates = generateDistractors({ generatedMolecule: molecule, questionSeed: molecule.question.seed });
      const all = [{ id: "reference", kind: "reference", name: molecule.reference.names, correct: true, origin: { kind: "reference" } }, ...candidates];
      assert.equal(validateMultipleChoiceOptions({ referenceNames: molecule.reference.names, options: all }).valid, true);
      assert.ok(candidates.every((candidate) => candidate.origin.diagnosticCode !== "UNKNOWN_MISMATCH"));
      assert.ok(candidates.every((candidate) => !matchesHydrocarbonReferenceName(candidate.name.es, molecule.reference.names.es, "es")));
      assert.ok(candidates.every((candidate) => !matchesHydrocarbonReferenceName(candidate.name.en, molecule.reference.names.en, "en")));
    }
  }
});

test("normalized candidate dedupe preserves the first recipe in canonical order", () => {
  const make = (id, es, en) => ({ id, kind: "distractor", name: { es, en }, correct: false,
    origin: { kind: "recipe", recipeId: id, diagnosticCode: "WRONG_EZ_DESCRIPTOR",
      transformation: { kind: "opposite-ez-descriptor", locant: 2, from: "E", to: "Z" } } });
  assert.deepEqual(dedupeDistractorCandidates([
    make("first", "3-metilhexano", "3-methylhexane"),
    make("dash", "3–metilhexano", "3–methylhexane"),
    make("accent", "ácido propanoico", "propanoic acid"),
    make("accent-variant", "acido propanoico", "propanoic acid"),
  ]).map(({ id }) => id), ["first", "accent"]);
});

test("distractor engine core passes strict TypeScript checking", async () => {
  const ts = await import("typescript");
  const { fileURLToPath } = await import("node:url");
  const paths = ["practice-distractor-engine.ts", "practice-multiple-choice.ts", "exercise-chemical-generator.ts"]
    .map((name) => fileURLToPath(new URL(`../app/${name}`, import.meta.url)).replace(/\\/g, "/"));
  const options = { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true };
  const program = ts.createProgram(paths, options);
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => !diagnostic.file
    || paths.includes(diagnostic.file.fileName.replace(/\\/g, "/")));
  assert.deepEqual(diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});
