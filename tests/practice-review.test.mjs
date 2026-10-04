import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { REVIEW_DIAGNOSIS_SUPPORT } from "../app/practice-review-diagnosis.ts";
import { formatPracticeReviewMessage } from "../app/practice-review-i18n.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { matchesHydrocarbonReferenceName } from "../app/practice-reference-answer.ts";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";

let chemistry, generate, review;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createRestrictedChemicalGenerator(chemistry.oracles);
  review = createPracticeReviewer(chemistry.engine);
});
after(async () => { await chemistry?.close(); });
function attempt(question, answer, locale = "en", number = 1) {
  return { ...createInitialAttempt({ question, displayOrdinal: 1, generationIndex: 0, answer, locale,
    correct: matchesHydrocarbonReferenceName(answer, question.reference.names[locale], locale),
    started: { monotonicMs: 1000, wallTimeMs: 1700000001000 },
    submitted: { monotonicMs: 5000, wallTimeMs: 1700000005000 } }), attemptNumber: number };
}
function fixture(input, smiles = false) {
  const parsed = smiles ? moleculeFromSmiles(input) : buildHydrocarbonFromIupacName(input);
  assert.equal(parsed.ok, true, parsed.error);
  const molecule = parsed.molecule, reference = chemistry.oracles.reference(molecule);
  return { molecule, question: { id: `fixture:${input}`, seed: "review-fixture", generatorVersion: 1 }, category: "alkane",
    reference: { ...reference, name: reference.names.en, structuralIdentity: exerciseStructuralIdentity(molecule),
      smiles: moleculeToSmiles(molecule).smiles, profiles: { es: "local-systematic-es", en: "iupac-1979-legacy-en" } } };
}
function validate(model, question) {
  assert.deepEqual(model.reference.names, question.reference.names);
  assert.equal(model.reference.structuralIdentity, question.reference.structuralIdentity);
  assert.equal(model.steps[0].kind, "parent");
  assert.equal(model.steps.at(-1).kind, "assembly");
  const atoms = new Set(question.molecule.atoms.map((a) => a.id));
  const bonds = new Set(question.molecule.bonds.map(([a, b]) => reviewBondId(a, b)));
  for (const step of model.steps) {
    assert.ok(step.highlightAtomIds.length);
    assert.ok(step.highlightAtomIds.every((id) => atoms.has(id)));
    assert.ok(step.highlightBondIds.every((id) => bonds.has(id)));
    assert.ok(step.numbering?.every(({ atomId, locant }) => atoms.has(atomId) && Number.isInteger(locant) && locant >= 1) ?? true);
    for (const language of ["es", "en"]) {
      const title = formatPracticeReviewMessage(step.titleKey, {}, language);
      const text = formatPracticeReviewMessage(step.messageKey, step.params, language);
      assert.ok(title && text);
      assert.doesNotMatch(text, /\{\w+\}|undefined|NaN/);
    }
  }
  for (const issue of model.issues) {
    assert.ok(issue.relatedAtomIds.every((id) => atoms.has(id)));
    assert.ok(issue.relatedBondIds.every((id) => bonds.has(id)));
    for (const language of ["es", "en"]) assert.ok(formatPracticeReviewMessage(issue.messageKey, issue.params, language));
  }
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
}

for (const category of EXERCISE_CATEGORIES) test(`review walkthrough ${category}: real engine, three seeds/two indices, valid provenance and bilingual messages`, () => {
  for (const seed of ["REVIEW-1", "REVIEW-2", "REVIEW-3"]) for (const index of [0, 1]) {
    const question = generate(createPracticeConfig([category], 5, "es", seed, ["naming"], "basic", 1), index);
    const before = structuredClone(question);
    const record = { ...attempt(question, question.reference.names.es, "es"), generationIndex: index };
    const model = review(question, record);
    assert.equal(model.status, "CORRECT"); assert.deepEqual(model.issues, []);
    validate(model, question);
    const analysis = chemistry.engine.analyzeMolecule(question.molecule);
    assert.deepEqual(model.steps.find((s) => s.kind === "parent").highlightAtomIds, [...analysis.mainChain].sort((a, b) => a - b));
    if (analysis.primaryFunctionalGroup) assert.ok(model.steps.some((s) => s.kind === "function"));
    if (analysis.substituents.length) assert.ok(model.steps.some((s) => s.kind === "substituent"));
    if (category === "ester") assert.ok(model.steps.some((s) => s.kind === "ester-alkyl"));
    if (category === "ez") {
      const stereo = model.steps.find((s) => s.kind === "ez");
      assert.ok(stereo.highlightAtomIds.length === 4 && stereo.highlightBondIds.length === 3);
      assert.match(question.reference.names.en, new RegExp(`\\(${stereo.params.locant}${stereo.params.descriptor}\\)`));
    }
    if (category === "aromatic") assert.ok(!model.steps.some((s) => s.kind === "ez" || s.kind === "unsaturation"));
    assert.deepEqual(question, before, "review cannot mutate graph, coordinates, references or generation metadata");
  }
});

for (const [input, student, expected, locale, smiles] of [
  ["3-metilhexano", "4-methylhexane", "WRONG_SUBSTITUENT_LOCANT", "en"],
  ["3-metilhexano", "4-metilhexano", "WRONG_SUBSTITUENT_LOCANT", "es"],
  ["hexan-2-ol", "2-hexanone", "WRONG_SUFFIX", "en"],
  ["hexan-2-ol", "hexan-3-ol", "WRONG_FUNCTIONAL_GROUP_LOCANT", "es"],
  ["hex-2-eno", "3-hexene", "WRONG_UNSATURATION_LOCANT", "en"],
  ["hex-2-eno", "hex-3-eno", "WRONG_UNSATURATION_LOCANT", "es"],
  ["3-metilhexano", "hexane", "MISSING_SUBSTITUENT", "en"],
  ["CC(O)C(C)CCC", "4-methyl-5-hexanol", "WRONG_NUMBERING_DIRECTION", "en", true],
  ["3-etil-2-metilhexano", "2-methyl-3-ethylhexane", "WRONG_ALPHABETICAL_ORDER", "en"],
  ["hexano", "pentane", "WRONG_PARENT_LENGTH", "en"],
  ["3-metilhexano", "this is hard to interpret", "UNKNOWN_MISMATCH", "en"],
  ["3-metilhexano", "4-ethylpentane", "UNKNOWN_MISMATCH", "en"],
]) test(`safe diagnosis ${expected}: ${student}`, () => {
  const question = fixture(input, smiles), record = attempt(question, student, locale);
  assert.equal(record.correct, false);
  const model = review(question, record); validate(model, question);
  assert.deepEqual(model.issues.map((i) => i.code), [expected]);
});

test("wrong E/Z is descriptor-only; extra differences and missing stereo use the unknown fallback", () => {
  const question = generate(createPracticeConfig(["ez"], 5, "en", "REVIEW-EZ", ["naming"], "basic", 1), 0);
  const opposite = question.reference.names.en.replace(/(\d+)([EZ])/, (_, n, d) => n + (d === "E" ? "Z" : "E"));
  assert.equal(review(question, attempt(question, opposite)).issues[0].code, "WRONG_EZ_DESCRIPTOR");
  assert.equal(review(question, attempt(question, opposite + "x")).issues[0].code, "UNKNOWN_MISMATCH");
  assert.equal(review(question, attempt(question, question.reference.names.en.replace(/^\(\d+[EZ]\)-/, ""))).issues[0].code, "UNKNOWN_MISMATCH");
});

test("correct answers and PRACTICE-005 accent variants never get a diagnosis, including attempts 2/3 and locale switch", () => {
  const question = fixture("ácido propanoico");
  assert.equal(question.reference.names.es, "ácido propanoico");
  for (const number of [1, 2, 3]) for (const answer of ["ácido propanoico", "acido propanoico", "ACIDO PROPANOICO"]) {
    const record = attempt(question, answer, "es", number), snapshot = structuredClone(record);
    const model = review(question, record);
    assert.equal(model.status, "CORRECT"); assert.deepEqual(model.issues, []);
    assert.deepEqual(review({ ...question, reference: { ...question.reference, name: question.reference.names.en } }, record), model);
    assert.deepEqual(record, snapshot);
  }
  // Frozen evaluator outcome is authoritative even when it cannot be inferred from current presentation.
  assert.equal(review(question, { ...attempt(question, "stored outcome"), correct: true }).status, "CORRECT");
});

test("ether highlight includes the full alkoxy branch; ester portions have disjoint carbon provenance", () => {
  const ether = fixture("CCCCOCCC", true), model = review(ether, attempt(ether, ether.reference.names.en));
  const parent = model.steps.find((s) => s.kind === "parent");
  const side = model.steps.find((s) => s.kind === "substituent");
  assert.ok(ether.molecule.atoms.filter((a) => !parent.highlightAtomIds.includes(a.id)).every((a) => side.highlightAtomIds.includes(a.id)));
  const ester = fixture("CCCC(=O)OCCC", true), esterModel = review(ester, attempt(ester, ester.reference.names.en));
  const acid = esterModel.steps.find((s) => s.kind === "parent"), alkyl = esterModel.steps.find((s) => s.kind === "ester-alkyl");
  assert.ok(!acid.highlightAtomIds.some((id) => alkyl.highlightAtomIds.includes(id)));
});

test("review rejects mismatched attempts/graphs/reference analysis and exposes explicit diagnosis support", () => {
  const question = fixture("hexano"), record = attempt(question, "wrong");
  assert.throws(() => review(question, { ...record, questionId: "other" }), /identity mismatch/);
  assert.throws(() => review(question, { ...record, structuralIdentity: "other" }), /identity mismatch/);
  assert.throws(() => review({ ...question, reference: { ...question.reference, names: { ...question.reference.names, es: "pentano" } } }, record), /reference analysis mismatch/);
  assert.equal(REVIEW_DIAGNOSIS_SUPPORT.WRONG_PARENT_CHAIN, "NOT_YET_DIAGNOSABLE");
  assert.equal(REVIEW_DIAGNOSIS_SUPPORT.WRONG_FUNCTIONAL_GROUP, "NOT_YET_DIAGNOSABLE");
});

test("review is deterministic after engine initialization with time and entropy APIs forbidden", () => {
  const question = generate(createPracticeConfig(["ez"], 5, "en", "REVIEW-DETERMINISM", ["naming"], "basic", 1), 0);
  const record = attempt(question, "unknown");
  const expected = review(question, record);
  const random = Math.random, now = Date.now;
  try {
    Math.random = () => { throw new Error("review cannot read randomness"); };
    Date.now = () => { throw new Error("review cannot read time"); };
    assert.deepEqual(review(question, record), expected);
    assert.deepEqual(review(question, record), expected);
  } finally { Math.random = random; Date.now = now; }
});

test("new reviewer core/presentation pass strict TypeScript checking", () => {
  const paths = ["practice-review.ts", "practice-review-diagnosis.ts", "practice-review-i18n.ts", "practice-review-panel.tsx", "practice-panel.tsx"]
    .map((name) => fileURLToPath(new URL(`../app/${name}`, import.meta.url)).replace(/\\/g, "/"));
  const options = { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true };
  const program = ts.createProgram(paths, options);
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => !d.file || paths.includes(d.file.fileName.replace(/\\/g, "/")));
  assert.deepEqual(diagnostics.map((d) => `${d.file?.fileName}:${d.start} ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`), []);
});
