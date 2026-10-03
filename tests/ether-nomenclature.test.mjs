import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { generateLegacyEnglishName } from "../app/legacy-english-nomenclature.ts";
import { functionalNameEvidence } from "../app/reasoning-functional-groups.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { validateExerciseDomain } from "../app/exercise-domain.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { assembleMultipleChoiceQuestion, createPracticeQuestionGenerator, validateMultipleChoiceQuestion } from "../app/practice-question.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { reconstructPracticeCorrection } from "../app/practice-corrections.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";

let chemistry, chemical, distractors, generate, review;
before(async () => {
  chemistry = await loadExerciseChemistry();
  chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  distractors = createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, distractors);
  review = createPracticeReviewer(chemistry.engine);
});
after(async () => chemistry?.close());

const fixtures = [
  ["COCCC", "1-metoxipropano", "1-methoxypropane", 1],
  ["COCCCC", "1-metoxibutano", "1-methoxybutane", 1],
  ["COC(C)C", "2-metoxipropano", "2-methoxypropane", 2],
  ["CCC(OC)C", "2-metoxibutano", "2-methoxybutane", 2],
  ["CCOC(C)CC", "2-etoxibutano", "2-ethoxybutane", 2],
  ["CCCOC(C)CCC", "2-propoxipentano", "2-propoxypentane", 2],
  ["CCCC(OC)CCC", "4-metoxiheptano", "4-methoxyheptane", 4],
  ["COC(C)CC(C)C", "2-metil-4-metoxipentano", "4-methoxy-2-methylpentane", 4],
  ["CCCOCCCC", "1-propoxibutano", "1-propoxybutane", 1],
  ["CC(C)OCCCC", "1-(1-metiletoxi)butano", "1-(1-methylethoxy)butane", 1],
  ["CCCOCCC", "1-propoxipropano", "1-propoxypropane", 1],
];
function molecule(smiles) {
  const parsed = moleculeFromSmiles(smiles);
  assert.equal(parsed.ok, true, parsed.error);
  return parsed.molecule;
}
function attachment(m, analysis) {
  const ether = analysis.functionalGroups.find((group) => group.kind === "ether");
  const parentAtom = ether.carbonIds.find((id) => analysis.numberedAtoms.has(id));
  const sideAtom = ether.carbonIds.find((id) => id !== parentAtom);
  assert.ok(m.bonds.some(([a, b, order]) => order === 1
    && ((a === ether.heteroAtomId && b === parentAtom) || (b === ether.heteroAtomId && a === parentAtom))));
  const prefix = analysis.substituents.find((item) => item.atomIds.includes(ether.heteroAtomId));
  assert.equal(prefix.locant, analysis.numberedAtoms.get(parentAtom));
  return { ether, parentAtom, sideAtom, prefix };
}
function explicitQuestion(m) {
  const reference = chemistry.oracles.reference(m);
  const exported = moleculeToSmiles(m);
  assert.equal(exported.ok, true);
  // Explicit Lab fixture, not a claim that the Practice recipe generates it.
  return { molecule: m, question: { id: `ether-fixture:${exerciseStructuralIdentity(m)}`,
    seed: "NOM-ETHER-INTERNAL", generatorVersion: 1 }, category: "ether",
    reference: { name: reference.names.es, names: reference.names, formula: reference.formula,
      structuralIdentity: exerciseStructuralIdentity(m), smiles: exported.smiles,
      profiles: { es: "local-systematic-es", en: "iupac-1979-legacy-en" } } };
}
function alkoxyAtomIds(m, oxygenId, parent) {
  const seen = new Set(parent), result = [], pending = [oxygenId];
  while (pending.length) {
    const id = pending.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    for (const [a, b] of m.bonds) {
      if (a === id) pending.push(b);
      if (b === id) pending.push(a);
    }
  }
  return result;
}
function record(q, selectedOptionId, generationIndex = 0, displayOrdinal = 1) {
  const selected = q.options.find((option) => option.id === selectedOptionId);
  return createInitialAttempt({ question: q, generationIndex, displayOrdinal, selectedOptionId,
    answer: selected.name.es, correct: selected.correct, locale: "es",
    started: { monotonicMs: 1000, wallTimeMs: 100000 },
    submitted: { monotonicMs: 5000, wallTimeMs: 104000 } });
}

for (const [smiles, es, en, locant] of fixtures) {
  test(`ether ${smiles}: structured attachment, ES/EN, reasoning and unchanged graph`, () => {
    const m = molecule(smiles), snapshot = structuredClone(m);
    const analysis = chemistry.engine.analyzeMolecule(m);
    const { ether, parentAtom, prefix } = attachment(m, analysis);
    assert.equal(prefix.locant, locant);
    assert.equal(analysis.name, es);
    const legacy = chemistry.engine.buildLegacyEnglishNameModel(m, analysis);
    const english = generateLegacyEnglishName(legacy);
    assert.equal(english.name, en);
    assert.equal(legacy.functionalGroups.find((group) => group.kind === "ether").locant, locant);
    assert.ok(english.reasoning.numbering.substituentLocants.includes(locant));
    assert.deepEqual(chemistry.oracles.reference(m).names, { es, en });
    assert.equal(validateExerciseDomain(m, "ether", chemistry.oracles).valid, true);
    const spanishSteps = chemistry.engine.buildIupacReasoningSteps(m, analysis);
    for (const language of ["es", "en"]) {
      const steps = language === "es" ? spanishSteps : chemistry.engine.buildEnglishReasoningSteps(spanishSteps, m, analysis);
      const name = language === "es" ? es : en;
      const evidence = functionalNameEvidence(analysis, name, language)
        .find((item) => item.contributions.some((origin) => origin.group === "ether"));
      assert.ok(evidence, `${name}: ether prefix keeps functional provenance`);
      assert.equal(name.slice(evidence.start, evidence.start + evidence.text.length), evidence.text);
      const explanation = steps.find((step) => step.nameRole === "substituent").explanation;
      assert.ok(explanation.includes(evidence.text), explanation);
      const fragments = deriveReasoningNameFragments({ analysis, displayedName: name, generatedNames: [es, en],
        language, steps, canHighlight: true });
      const parts = buildReasoningNameLinkParts(name, fragments, steps);
      assert.equal(parts.map((part) => part.text).join(""), name);
      const linked = parts.find((part) => part.text === evidence.text);
      assert.ok(linked?.stepNumber, `${name}: the corrected prefix stays interactive`);
      assert.ok(linked.contributions.some((origin) => origin.group === "ether"));
      assert.ok(linked.atomIds.includes(ether.heteroAtomId));
      if (prefix.complex && language === "en") {
        assert.doesNotMatch(explanation, /skeleton: 1-1-methylethoxy/);
      }
    }
    const q = explicitQuestion(m);
    const mcq = assembleMultipleChoiceQuestion(q, distractors({ generatedMolecule: q, questionSeed: q.question.seed }));
    const model = review(mcq, record(mcq, mcq.correctOptionId));
    const side = model.steps.find((step) => step.id === `substituent:${prefix.name}`);
    assert.deepEqual(side.params.locants, [locant]);
    assert.ok(side.highlightAtomIds.includes(ether.heteroAtomId));
    assert.ok(side.highlightBondIds.includes(reviewBondId(ether.heteroAtomId, parentAtom)));
    assert.ok(alkoxyAtomIds(m, ether.heteroAtomId, analysis.mainChain)
      .every((id) => side.highlightAtomIds.includes(id)), "complete alkoxy fragment highlighted");
    assert.deepEqual(model.steps.at(-1).params.name, { es, en });
    assert.deepEqual(m, snapshot);
  });
}

test("NOM-ETHER-001: terminal and secondary C3 attachments retain distinct alkoxy descriptors with the same butane parent", () => {
  const normal = molecule("CCCOCCCC"), secondary = molecule("CC(C)OCCCC");
  assert.notEqual(exerciseStructuralIdentity(normal), exerciseStructuralIdentity(secondary));
  const analyses = [normal, secondary].map((m) => chemistry.engine.analyzeMolecule(m));
  const sides = [normal, secondary].map((m, i) => attachment(m, analyses[i]));
  assert.deepEqual(analyses.map((a) => a.mainChain), [[5, 6, 7, 8], [5, 6, 7, 8]]);
  assert.deepEqual(analyses.map((a) => [...a.numberedAtoms]), [
    [[5, 1], [6, 2], [7, 3], [8, 4]], [[5, 1], [6, 2], [7, 3], [8, 4]],
  ]);
  assert.deepEqual(sides.map((side) => side.parentAtom), [5, 5]);
  assert.deepEqual(sides.map((side) => side.sideAtom), [3, 2]);
  const carbonNeighbors = (m, id) => m.bonds.filter(([a, b]) => (a === id && b !== 4) || (b === id && a !== 4)).length;
  assert.equal(carbonNeighbors(normal, sides[0].sideAtom), 1);
  assert.equal(carbonNeighbors(secondary, sides[1].sideAtom), 2);
  assert.deepEqual(sides.map((side) => side.prefix.name), ["propoxi", "1-metiletoxi"]);
  assert.deepEqual(sides.map((side) => side.prefix.complex), [false, true]);
  assert.notEqual(analyses[0].name, analyses[1].name);
  assert.equal(analyses[0].formula, analyses[1].formula);
});

test("ether locants and rooted descriptors survive reversed atom order, arbitrary IDs, bond order and coordinates", () => {
  for (const [smiles, es, en] of fixtures) {
    const m = molecule(smiles);
    const ids = new Map(m.atoms.map((atom, i) => [atom.id, 100 + (m.atoms.length - i) * 7]));
    const permuted = { ...m, atoms: m.atoms.map((atom) => ({ ...atom, id: ids.get(atom.id), x: -100 * atom.id, y: atom.id % 3 })).reverse(),
      bonds: m.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse() };
    const a = chemistry.engine.analyzeMolecule(permuted);
    attachment(permuted, a);
    assert.deepEqual(chemistry.oracles.reference(permuted).names, { es, en });
    assert.equal(exerciseStructuralIdentity(permuted), exerciseStructuralIdentity(m));
  }
});

test("128 real Practice ether seeds preserve terminal references, identities and bilingual reconstruction", () => {
  const distribution = { one: 0, two: 0, threePlus: 0 };
  const firstNames = [
    { es: "1-etoxipropano", en: "1-ethoxypropane" },
    { es: "1-etoxipentano", en: "1-ethoxypentane" },
    { es: "1-propoxibutano", en: "1-propoxybutane" },
  ];
  for (let i = 0; i < 128; i++) {
    const config = createPracticeConfig(["ether"], 5, "es", `NOM-ETHER-001-${i}`, ["naming"], "basic", 1);
    const g = chemical(config, 0), snapshot = structuredClone(g);
    const a = chemistry.engine.analyzeMolecule(g.molecule), { prefix } = attachment(g.molecule, a);
    distribution[prefix.locant === 1 ? "one" : prefix.locant === 2 ? "two" : "threePlus"]++;
    assert.deepEqual(g.reference.names, chemistry.oracles.reference(g.molecule).names);
    if (i < firstNames.length) assert.deepEqual(g.reference.names, firstNames[i]);
    const en = chemical({ ...config, locale: "en" }, 0);
    assert.deepEqual(en.molecule, g.molecule);
    assert.equal(en.reference.structuralIdentity, g.reference.structuralIdentity);
    assert.deepEqual(en.reference.names, g.reference.names);
    assert.deepEqual(g, snapshot);
  }
  // Characterize the existing recipe; do not expand generation to force internal ethers.
  assert.deepEqual(distribution, { one: 128, two: 0, threePlus: 0 });
  console.log("ETHER_SWEEP", JSON.stringify({ structures: 128, distribution, failures: 0 }));
});

test("real ether MCQ preserves four options, one correct, seeds, Reviewer and exact correction reconstruction", () => {
  const config = createPracticeConfig(["ether"], 5, "es", "NOM-ETHER-MCQ", ["multiple-choice"], "basic", 1);
  const q = generate(config, 3), snapshot = structuredClone(q);
  assert.equal(validateMultipleChoiceQuestion(q), true);
  assert.equal(q.options.length, 4);
  assert.equal(q.options.filter((option) => option.correct).length, 1);
  assert.deepEqual(generate(config, 3), q);
  const original = record(q, q.options.find((option) => !option.correct).id, 3, 1);
  const restored = reconstructPracticeCorrection({ ...config, locale: "en" }, original, generate);
  assert.deepEqual(restored.molecule, q.molecule);
  assert.equal(restored.reference.structuralIdentity, q.reference.structuralIdentity);
  assert.equal(restored.optionSetIdentity, q.optionSetIdentity);
  assert.equal(restored.correctOptionId, q.correctOptionId);
  assert.deepEqual(restored.options, q.options);
  assert.equal(review(restored, original).status, "INCORRECT");
  assert.deepEqual(q, snapshot);
});
