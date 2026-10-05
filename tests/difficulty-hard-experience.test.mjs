import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { Molecule as OCLMolecule } from "openchemlib";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { HARD_FOUNDATION_FAMILIES } from "../app/exercise-advanced-profile.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createPracticeQuestionGenerator, validateMultipleChoiceQuestion, InsufficientSafeDistractorsError, assembleMultipleChoiceQuestion } from "../app/practice-question.ts";
import { PRACTICE_MCQ_SEARCH_LIMIT } from "../app/session-question-selection.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { formatPracticeReviewMessage } from "../app/practice-review-i18n.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { evaluateSessionAnswer } from "../app/session-answer-evaluation.ts";
import { matchesHydrocarbonReferenceName, normalizeReferenceNameTypography } from "../app/practice-reference-answer.ts";
import { deriveReasoningNameFragments, deriveUnsaturationNameContributions } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
import { getMainChainStereoDescriptors, setDoubleBondGeometry } from "../app/double-bond-stereochemistry.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

let chemistry, chemical, generate, review, evaluate;
const families = new Set(), rows = [];
const totals = { questions: 0, namingReviews: 0, mcqReviews: 0, buildReviews: 0, mcqQuestions: 0,
  localizedOptions: 0, alternativeGraphs: 0, buildComparisons: 0, fragmentNames: 0, mcqCapabilityRejects: 0, violations: 0 };
const extras = { halogenated: [1], alcohol: [1, 4, 6, 7], ketone: [1], "carboxylic-acid": [1, 3, 6] };
before(async () => {
  chemistry = await loadExerciseChemistry(); chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  review = createPracticeReviewer(chemistry.engine); evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
});
after(async () => {
  mkdirSync("outputs/difficulty-d7", { recursive: true });
  writeFileSync("outputs/difficulty-d7/experience-sweep.json", JSON.stringify({ totals, families: [...families].sort(), rows }, null, 2));
  await chemistry?.close();
});
const configFor = (category, seed) => createPracticeConfig([category], 5, "es", seed, ["naming"], "advanced", 4);
const record = (q, locale, extra = {}) => createInitialAttempt({ question: q, displayOrdinal: 1, generationIndex: 0,
  answer: q.reference.names[locale], correct: true, locale, started: { monotonicMs: 0, wallTimeMs: 1700000000000 },
  submitted: { monotonicMs: 10, wallTimeMs: 1700000000010 }, ...extra });
function checkModel(model, q, locale) {
  const atoms = new Set(q.molecule.atoms.map(a => a.id)), bonds = new Set(q.molecule.bonds.map(([a, b]) => reviewBondId(a, b)));
  assert.ok(model.steps.length); assert.equal(model.reference.structuralIdentity, q.reference.structuralIdentity);
  for (const item of [...model.steps, ...model.issues]) {
    const text = formatPracticeReviewMessage(item.messageKey, item.params, locale);
    assert.ok(text.length); assert.doesNotMatch(text, /review\.|WRONG_|UNKNOWN_|undefined|NaN|\{\w+\}/);
    assert.ok((item.highlightAtomIds ?? item.relatedAtomIds).every(id => atoms.has(id)));
    assert.ok((item.highlightBondIds ?? item.relatedBondIds).every(id => bonds.has(id)));
  }
}
function redraw(m) {
  const ids = new Map(m.atoms.map((a, i) => [a.id, 2000 + i * 17]));
  return { atoms: m.atoms.map(a => ({ ...a, id: ids.get(a.id), x: -2 * a.y + 8, y: 2 * a.x - 7 })).reverse(),
    bonds: m.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse(),
    rings: m.rings.map(r => ({ ...r, atomIds: r.atomIds.map(id => ids.get(id)).reverse() })) };
}
function checkFragments(q, a, locale) {
  const descriptors = getMainChainStereoDescriptors(q.molecule, a.mainChain, true);
  const spanishSteps = chemistry.engine.buildIupacReasoningSteps(q.molecule, a);
  const steps = locale === "en" ? chemistry.engine.buildEnglishReasoningSteps(spanishSteps, q.molecule, a) : spanishSteps;
  const name = q.reference.names[locale], fragments = deriveReasoningNameFragments({ analysis: a, displayedName: name,
    generatedNames: Object.values(q.reference.names), language: locale, steps, canHighlight: true });
  const parts = buildReasoningNameLinkParts(name, fragments, steps);
  assert.equal(parts.map(p => p.text).join(""), name);
  for (const f of Object.values(fragments).flatMap(f => [f, ...f.additionalFragments ?? []])) {
    assert.ok(f.text); const start = f.start ?? name.indexOf(f.text);
    assert.equal(name.slice(start, start + f.text.length), f.text);
    assert.ok(f.atomIds?.every(id => q.molecule.atoms.some(a => a.id === id)) ?? true);
  }
  const unsaturation = deriveUnsaturationNameContributions(a, name, locale, Object.values(q.reference.names));
  assert.deepEqual([...new Set(unsaturation.map(f => f.semanticId))].sort(),
    [...a.doubleBondLocants.map(l => `unsaturation:double:${l}`), ...a.tripleBondLocants.map(l => `unsaturation:triple:${l}`)].sort());
  for (const d of descriptors) {
    const linked = parts.find(p => p.semanticId === `stereo:ez:${d.locant}`);
    assert.ok(linked, `${name}: E/Z descriptor needs structured evidence`);
    assert.equal(linked.text, `(${d.locant}${d.configuration})`); assert.deepEqual(linked.atomIds, d.atomIds);
  }
  totals.fragmentNames++;
}

for (const category of EXERCISE_CATEGORIES) test(`D7 ${category}: certified families, safe bilingual Review, MCQ and Build`, () => {
  const seeds = [0, ...extras[category] ?? []].map(i => `D5-FAMILY-CAPABILITY:${i}`);
  seeds.push(`D7-EXPERIENCE:${category}`);
  for (const seed of seeds) {
    const config = configFor(category, seed);
    let mcq, generationIndex = 0;
    // Raw targets can legitimately lack three safe distractors. Apply the
    // existing bounded capability limit and retain the accepted real index.
    for (; generationIndex < PRACTICE_MCQ_SEARCH_LIMIT; generationIndex++) {
      try { mcq = generate(config, generationIndex, { questionType: "multiple-choice", displayIndex: 0 }); break; }
      catch (error) { if (!(error instanceof InsufficientSafeDistractorsError)) throw error; totals.mcqCapabilityRejects++; }
    }
    assert.ok(mcq, `${category}/${seed}: bounded MCQ capability`);
    const q = chemical(config, generationIndex), snapshot = structuredClone(q);
    const attemptFor = (...args) => ({ ...record(...args), generationIndex });
    const a = chemistry.engine.analyzeMolecule(q.molecule), family = q.generation.family;
    families.add(family); totals.questions++; rows.push({ category, seed, generationIndex, family, structuralIdentity: q.reference.structuralIdentity });
    assert.equal(mcq.reference.structuralIdentity, q.reference.structuralIdentity); assert.ok(validateMultipleChoiceQuestion(mcq));
    assert.equal(mcq.options.length, 4); assert.equal(mcq.options.filter(o => o.correct).length, 1); totals.mcqQuestions++;
    assert.deepEqual(generate({ ...config, locale: "en" }, generationIndex, { questionType: "multiple-choice", displayIndex: 0 }).options, mcq.options);
    assert.deepEqual(generate(config, generationIndex, { questionType: "multiple-choice", displayIndex: 0 }), mcq);
    for (const option of mcq.options.filter(o => !o.correct)) {
      const transform = option.origin.transformation;
      if (transform.kind === "opposite-ez-descriptor") {
        const d = getMainChainStereoDescriptors(q.molecule, a.mainChain, true).find(d => d.locant === transform.locant);
        assert.equal(d.configuration, transform.from);
        assert.equal(transform.to, transform.from === "E" ? "Z" : "E");
        const changed = setDoubleBondGeometry(q.molecule, ...d.atomIds, transform.to); assert.ok(changed.ok);
        assert.deepEqual(chemistry.oracles.reference(changed.molecule).names, option.name);
      } else {
        const proof = option.origin.verification;
        assert.equal(proof.kind, "validated-alternative-graph"); assert.equal(proof.referenceStructuralIdentity, q.reference.structuralIdentity);
        const parsed = moleculeFromSmiles(OCLMolecule.fromIDCode(proof.alternativeStructuralIdentity).toIsomericSmiles()); assert.ok(parsed.ok);
        assert.equal(exerciseStructuralIdentity(parsed.molecule), proof.alternativeStructuralIdentity);
        assert.deepEqual(chemistry.oracles.reference(parsed.molecule).names, option.name);
        assert.notEqual(proof.alternativeStructuralIdentity, proof.referenceStructuralIdentity); totals.alternativeGraphs++;
        assert.ok(["replace-parent-length", "replace-locant", "omit-substituent"].includes(transform.kind));
        if (transform.kind === "replace-locant") assert.notEqual(transform.from, transform.to);
      }
    }
    const build = generate(config, generationIndex, { questionType: "build", displayIndex: 0 });
    assert.equal(build.reference.structuralIdentity, q.reference.structuralIdentity);
    const compare = m => { totals.buildComparisons++; return evaluate({ referenceMolecule: q.molecule, submittedMolecule: m, category, config }); };
    assert.equal(compare(q.molecule).status, "EQUIVALENT"); assert.equal(compare(redraw(q.molecule)).status, "EQUIVALENT");
    const reflected = structuredClone(q.molecule); reflected.atoms.forEach(atom => { atom.x = -atom.x; });
    assert.equal(compare(reflected).status, "EQUIVALENT");
    const parent = new Set(a.mainChain), branch = q.molecule.atoms.find(atom => (atom.element ?? "C") === "C" && !parent.has(atom.id)
      && q.molecule.bonds.filter(([x, y]) => x === atom.id || y === atom.id).length === 1
      && q.molecule.bonds.some(([x, y]) => x === atom.id && parent.has(y) || y === atom.id && parent.has(x)));
    assert.ok(branch);
    const missing = structuredClone(q.molecule); missing.atoms = missing.atoms.filter(atom => atom.id !== branch.id);
    missing.bonds = missing.bonds.filter(([x, y]) => x !== branch.id && y !== branch.id);
    const result = compare(missing); assert.equal(result.status, "DIFFERENT_ELEMENTS"); assert.ok(result.checks.submissionValid);
    const edge = q.molecule.bonds.find(([x, y]) => x === branch.id || y === branch.id);
    const root = edge[0] === branch.id ? edge[1] : edge[0];
    let connectivity;
    for (const target of a.mainChain.filter(id => id !== root)) {
      const moved = structuredClone(q.molecule);
      moved.bonds = moved.bonds.filter(([x, y]) => !(x === edge[0] && y === edge[1])); moved.bonds.push([branch.id, target, 1]);
      const tested = compare(moved);
      if (tested.status === "DIFFERENT_STRUCTURE") { connectivity = tested; break; }
    }
    assert.ok(connectivity?.checks.submissionValid);
    for (const locale of ["es", "en"]) {
      const localized = { ...q, reference: { ...q.reference, name: q.reference.names[locale] } };
      assert.equal(evaluateSessionAnswer(localized, q.reference.names[locale], locale).correct, true);
      for (const correct of [true, false]) {
        const model = review(q, attemptFor(q, locale, correct ? {} : { answer: "uninterpretable answer with several errors", correct: false }));
        checkModel(model, q, locale); totals.namingReviews++;
        if (correct) assert.deepEqual(model.issues, []); else assert.equal(model.issues[0].code, "UNKNOWN_MISMATCH");
      }
      checkFragments(q, a, locale);
      assert.equal(new Set(mcq.options.map(o => normalizeReferenceNameTypography(o.name[locale], locale))).size, 4);
      for (const o of mcq.options) {
        assert.equal(matchesHydrocarbonReferenceName(o.name[locale], mcq.reference.names[locale], locale), o.correct);
        const model = review(mcq, attemptFor(mcq, locale, { answer: o.name[locale], correct: o.correct, selectedOptionId: o.id }));
        checkModel(model, mcq, locale); totals.mcqReviews++; totals.localizedOptions++;
      }
      const model = review(build, attemptFor(build, locale, { answer: result.submittedSmiles, correct: false, structuralAnswer: result }));
      checkModel(model, build, locale); totals.buildReviews++;
      assert.equal(model.issues[0].messageKey, "review.build.DIFFERENT_ELEMENTS");
      const movedReview = review(build, attemptFor(build, locale, { answer: connectivity.submittedSmiles, correct: false, structuralAnswer: connectivity }));
      checkModel(movedReview, build, locale); totals.buildReviews++;
      assert.equal(movedReview.issues[0].messageKey, "review.build.DIFFERENT_STRUCTURE");
    }
    assert.deepEqual(q, snapshot);
  }
});

test("D7 covers all 22 production families across the 17 canonical categories", () => {
  assert.deepEqual([...families].sort(), HARD_FOUNDATION_FAMILIES.map(f => f.id).sort());
  assert.equal(new Set(rows.map(r => r.category)).size, 17); assert.equal(totals.questions, 43);
});

test("D7 stereo-only, absent stereo and combined connectivity/stereo get evidence-bounded Build feedback", () => {
  const config = configFor("ez", "D5-FAMILY-CAPABILITY:0"), q = generate(config, 0, { questionType: "build", displayIndex: 0 });
  const [d] = getMainChainStereoDescriptors(q.molecule, chemistry.engine.analyzeMolecule(q.molecule).mainChain, true);
  const opposite = setDoubleBondGeometry(q.molecule, ...d.atomIds, d.configuration === "E" ? "Z" : "E"); assert.ok(opposite.ok);
  const unspecified = structuredClone(q.molecule); unspecified.bonds.forEach(b => { delete b[3]; });
  for (const m of [opposite.molecule, unspecified]) {
    const result = evaluate({ referenceMolecule: q.molecule, submittedMolecule: m, category: "ez", config });
    assert.equal(result.status, "DIFFERENT_STEREOCHEMISTRY"); assert.ok(result.checks.constitutionEqual);
    for (const locale of ["es", "en"]) {
      const model = review(q, record(q, locale, { answer: result.submittedSmiles, correct: false, structuralAnswer: result }));
      assert.equal(model.issues[0].messageKey, "review.build.DIFFERENT_STEREOCHEMISTRY"); checkModel(model, q, locale);
    }
  }
  const a = chemistry.engine.analyzeMolecule(q.molecule), parent = new Set(a.mainChain);
  const branch = q.molecule.atoms.find(atom => !parent.has(atom.id) && q.molecule.bonds.filter(([x, y]) => x === atom.id || y === atom.id).length === 1);
  const edge = q.molecule.bonds.find(([x, y]) => x === branch.id || y === branch.id), root = edge[0] === branch.id ? edge[1] : edge[0];
  let combined;
  for (const target of a.mainChain.filter(id => id !== root)) {
    const m = structuredClone(opposite.molecule); m.bonds = m.bonds.filter(([x, y]) => !(x === edge[0] && y === edge[1])); m.bonds.push([branch.id, target, 1]);
    const result = evaluate({ referenceMolecule: q.molecule, submittedMolecule: m, category: "ez", config });
    if (result.status === "DIFFERENT_STRUCTURE") { combined = result; break; }
  }
  assert.ok(combined); assert.equal(combined.checks.constitutionEqual, false);
  assert.equal(review(q, record(q, "en", { answer: combined.submittedSmiles, correct: false, structuralAnswer: combined })).issues[0].messageKey,
    "review.build.DIFFERENT_STRUCTURE");
  const naming = chemical(config, 0);
  for (const locale of ["es", "en"]) {
    const correctName = naming.reference.names[locale], oppositeName = correctName.replace(`${d.locant}${d.configuration}`, `${d.locant}${d.configuration === "E" ? "Z" : "E"}`);
    assert.equal(review(naming, record(naming, locale, { answer: oppositeName, correct: false })).issues[0].code, "WRONG_EZ_DESCRIPTOR");
    assert.equal(review(naming, record(naming, locale, { answer: oppositeName + "x", correct: false })).issues[0].code, "UNKNOWN_MISMATCH");
    assert.equal(review(naming, record(naming, locale, { answer: correctName.slice(correctName.indexOf(")") + 2), correct: false })).issues[0].code, "UNKNOWN_MISMATCH");
  }
});

test("D7 wrong enyne bond orders use the comparison evidence without inferring a changed functional group", () => {
  const config = configFor("ester", "D5-FAMILY-CAPABILITY:0"), q = generate(config, 0, { questionType: "build", displayIndex: 0 });
  const a = chemistry.engine.analyzeMolecule(q.molecule);
  for (const locant of [...a.doubleBondLocants, ...a.tripleBondLocants]) {
    const [x, y] = a.mainChain.slice(locant - 1, locant + 1), m = structuredClone(q.molecule);
    m.bonds.find(([left, right]) => left === x && right === y || left === y && right === x)[2] = 1;
    const result = evaluate({ referenceMolecule: q.molecule, submittedMolecule: m, category: "ester", config });
    assert.equal(result.status, "DIFFERENT_BOND_ORDERS"); assert.ok(result.checks.submissionValid);
    for (const locale of ["es", "en"]) {
      const model = review(q, record(q, locale, { answer: result.submittedSmiles, correct: false, structuralAnswer: result }));
      assert.equal(model.issues[0].messageKey, "review.build.DIFFERENT_BOND_ORDERS"); assert.deepEqual(model.issues[0].relatedAtomIds, []);
      checkModel(model, q, locale);
    }
  }
});

test("D7 E/Z fragments fail closed for missing inspection, a mismatched descriptor, hidden names and non-stereo targets", () => {
  const q = chemical(configFor("ez", "D5-FAMILY-CAPABILITY:0"), 0), a = chemistry.engine.analyzeMolecule(q.molecule);
  const steps = chemistry.engine.buildIupacReasoningSteps(q.molecule, a);
  const input = { analysis: a, displayedName: q.reference.names.es, language: "es", steps, generatedNames: Object.values(q.reference.names), canHighlight: true };
  assert.ok(Object.values(deriveReasoningNameFragments(input)).some(f => f.kind === "stereo"));
  for (const changed of [
    { ...input, canHighlight: false },
    { ...input, steps: steps.map(s => ({ ...s, stereoDescriptors: undefined })) },
    { ...input, displayedName: input.displayedName.replace(/([EZ])\)/, (_, d) => `${d === "E" ? "Z" : "E"})`) },
  ]) assert.deepEqual(deriveReasoningNameFragments(changed), {});
  const plain = chemical(configFor("alkane", "D5-FAMILY-CAPABILITY:0"), 0), analysis = chemistry.engine.analyzeMolecule(plain.molecule);
  assert.ok(!Object.values(deriveReasoningNameFragments({ ...input, analysis, displayedName: plain.reference.names.es,
    steps: chemistry.engine.buildIupacReasoningSteps(plain.molecule, analysis), generatedNames: Object.values(plain.reference.names) })).some(f => f.kind === "stereo"));
});

test("D7 MCQ diagnosis highlights the declared triple bond rather than the first unsaturation step", () => {
  const q = chemical(configFor("alkyne", "D7-DIAG:1"), 0), a = chemistry.engine.analyzeMolecule(q.molecule);
  const candidates = createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles)({ generatedMolecule: q, questionSeed: q.question.seed });
  const option = candidates.find(o => o.origin.diagnosticCode === "WRONG_UNSATURATION_LOCANT"
    && a.tripleBondLocants.includes(o.origin.transformation.from)); assert.ok(option);
  const mcq = assembleMultipleChoiceQuestion(q, [option, ...candidates.filter(o => o.id !== option.id)].slice(0, 3));
  const from = option.origin.transformation.from, atoms = a.mainChain.slice(from - 1, from + 1), bond = reviewBondId(...atoms);
  for (const locale of ["es", "en"]) {
    const model = review(mcq, record(mcq, locale, { answer: option.name[locale], correct: false, selectedOptionId: option.id }));
    assert.equal(model.issues[0].code, "WRONG_UNSATURATION_LOCANT");
    assert.deepEqual(model.issues[0].relatedAtomIds, [...atoms].sort((x, y) => x - y));
    assert.deepEqual(model.issues[0].relatedBondIds, [bond]); checkModel(model, mcq, locale);
  }
});

test("D7 MCQ diagnosis does not claim unchanged written locants after canonical ring renumbering", () => {
  const q = chemical(configFor("aromatic", "D7-DIAG:1"), 0);
  const candidates = createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles)({ generatedMolecule: q, questionSeed: q.question.seed });
  const option = candidates.find(o => o.origin.diagnosticCode === "WRONG_SUBSTITUENT_LOCANT"
    && o.origin.transformation.name === "metil" && o.origin.transformation.from === 1 && o.origin.transformation.to === 2); assert.ok(option);
  assert.deepEqual(q.reference.names, { es: "2-etil-1,4-dimetilbenceno", en: "2-ethyl-1,4-dimethylbenzene" });
  assert.deepEqual(option.name, { es: "1-etil-2,3-dimetilbenceno", en: "1-ethyl-2,3-dimethylbenzene" });
  const mcq = assembleMultipleChoiceQuestion(q, [option, ...candidates.filter(o => o.id !== option.id)].slice(0, 3));
  for (const locale of ["es", "en"]) {
    const model = review(mcq, record(mcq, locale, { answer: option.name[locale], correct: false, selectedOptionId: option.id }));
    assert.equal(model.issues[0].code, "WRONG_SUBSTITUENT_LOCANT");
    assert.equal(model.issues[0].messageKey, "review.mcq.substituent-locant"); checkModel(model, mcq, locale);
    assert.doesNotMatch(formatPracticeReviewMessage(model.issues[0].messageKey, model.issues[0].params, locale), /rest of the name match|resto del nombre coinciden/);
  }
});
