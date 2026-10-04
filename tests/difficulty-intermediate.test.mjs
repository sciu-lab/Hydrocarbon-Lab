import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { EXERCISE_CATEGORIES, GENERATOR_VERSION } from "../app/exercise-model.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createRestrictedChemicalGenerator, exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { buildIntermediateChemicalCandidate } from "../app/exercise-intermediate-candidate.ts";
import { validateIntermediateExercise, validateIntermediateParent } from "../app/exercise-intermediate-profile.ts";
import { validateEasyExercise } from "../app/exercise-easy-profile.ts";
import { validateExerciseChemistry, validateExerciseDomain } from "../app/exercise-domain.ts";
import { createStructuralAnswerEvaluator, createBuildSubmissionValidator } from "../app/practice-structural-answer.ts";
import { createPracticeQuestionGenerator, validateMultipleChoiceQuestion } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { matchesHydrocarbonReferenceName } from "../app/practice-reference-answer.ts";
import { buildPracticeReviewSteps } from "../app/practice-review.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

let chemistry, chemical, generate, evaluate, validate;
before(async () => {
  chemistry = await loadExerciseChemistry(); chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles); validate = createBuildSubmissionValidator(chemistry.oracles);
});
after(async () => chemistry?.close());
const graph = (s) => { const r = moleculeFromSmiles(s); assert.ok(r.ok, r.error); return r.molecule; };
const config = (category, seed = "D3-CONTRACT", difficulty = "intermediate", version = 3) =>
  createPracticeConfig([category], 5, "es", seed, ["naming"], difficulty, version);
const anchors = [
  ["alcohol", "CC(O)C=CC(C)C", "5-metilhex-3-en-2-ol", "5-methyl-3-hexen-2-ol"],
  ["alcohol", "CC(O)C=C(Br)C(C)CC", "4-bromo-5-metilhept-3-en-2-ol", "4-bromo-5-methyl-3-hepten-2-ol"],
  ["ketone", "CC(=O)C=C(C)C(Cl)C", "5-cloro-4-metilhex-3-en-2-ona", "5-chloro-4-methyl-3-hexen-2-one"],
  ["alcohol", "OCC=CC(C)C([N+](=O)[O-])C", "4-metil-5-nitrohex-2-en-1-ol", "4-methyl-5-nitro-2-hexen-1-ol"],
  ["alcohol", "CC(O)C#CC(C)C", "5-metilhex-3-in-2-ol", "5-methyl-3-hexyn-2-ol"],
];
for (const [category, smiles, es, en] of anchors) test(`Intermediate structural anchor ${es}`, () => {
  const m = graph(smiles), before = structuredClone(m), r = chemistry.oracles.reference(m);
  assert.deepEqual(r.names, { es, en }); assert.ok(r.namingSupported);
  assert.ok(validateIntermediateExercise(m, category, chemistry.oracles).valid);
  assert.ok(validateIntermediateParent(m, category, r).valid);
  assert.equal(validateEasyExercise(m, category, chemistry.oracles).valid, false);
  assert.equal(validateExerciseDomain(m, category, chemistry.oracles).valid, false, "legacy envelope stays frozen");
  assert.ok(validate(m).valid);
  assert.equal(evaluate({ referenceMolecule: m, submittedMolecule: structuredClone(m), category }).correct, true);
  assert.equal(exerciseStructuralIdentity(m), exerciseStructuralIdentity(graph(smiles)));
  assert.deepEqual(m, before);
});

const negatives = [
  ["alcohol", "CCCC(O)C"], ["alkane", "CCCCCC"], ["alkane", "CCC(C)CCC"],
  ["alkene", "CCC=CCC"], ["alkyne", "CCC#CCC"], ["aromatic", "Cc1ccccc1"],
  ["simple-carbocycle", "CC1CCCCC1"], ["halogenated", "CCCCCCCl"],
  ["alcohol", "C=C(O)C(OCC)C(C)CC"], ["alcohol", "OCC=C(C)C(N)CC"],
  ["aldehyde", "O=CC=C(C)C(O)CC"], ["ketone", "CC(=O)C=C(C)C(O)C(Br)C"],
  ["carboxylic-acid", "O=C(O)C=C(C)C(O)C(N)C"], ["ketone", "CC(=O)C(C)=CCC(=O)C"],
  ["alcohol", "CC(O)C#CC(C)C(O)C"], ["alcohol", "CC(O)C=CC(C)C#CC"],
  ["carboxylic-acid", "O=C(O)C=CC(C)C#CC"], ["alcohol", "OCC=C(C)C(N)C(Br)C#C"],
  ["alkene", "CC=CC=CC"], ["alkyne", "CC#CC#CC"], ["amine", "CCNCC=CCC"],
  ["alcohol", "CC(O)C#C(Br)C(C)CC"],
];
for (const [category, smiles] of negatives) test(`Intermediate rejects Easy/Hard/unsafe graph ${category}: ${smiles}`, () => {
  const m = graph(smiles);
  assert.equal(validateIntermediateExercise(m, category, chemistry.oracles).valid, false);
});
test("invalid triple/halo graph never passes chemistry or neutral Build; Hard never enters the comparison expansion", () => {
  const invalid = graph("CC(O)C#C(Br)C(C)CC");
  assert.equal(validateExerciseChemistry(invalid, chemistry.oracles).reason, "invalid-valence");
  assert.equal(validate(invalid).valid, false);
  for (const [, smiles] of negatives.slice(8, 20)) assert.equal(validate(graph(smiles)).valid, false, smiles);
  const target = graph(anchors[0][1]), elementary = graph("CCCCCCO");
  const answer = evaluate({ referenceMolecule: target, submittedMolecule: elementary, category: "alcohol" });
  assert.equal(answer.checks.submissionValid, true); assert.equal(answer.correct, false);
  assert.notEqual(answer.status, "INVALID_SUBMISSION", "submissions do not inherit target difficulty");
});

test("principal suffix numbering outranks the lower reverse unsaturation locant", () => {
  const m=graph("CC(O)CC=CCC"),analysis=chemistry.engine.analyzeMolecule(m);
  assert.equal(analysis.name,"hept-4-en-2-ol");assert.deepEqual(analysis.doubleBondLocants,[4]);
  const names=chemistry.oracles.reference(m).names;
  const step=buildPracticeReviewSteps(m,analysis,chemistry.engine.buildLegacyEnglishNameModel(m,analysis),names).find(s=>s.kind==="numbering");
  assert.equal(step.messageKey,"review.numbering.function");assert.deepEqual(step.params.selected,[2]);assert.deepEqual(step.params.reverse,[6]);
});

test("17 families × 8 seeds × 2 indices: direct certified targets repeat in ES/EN, Build, and reference self-accept", () => {
  const rows = [], start = performance.now();
  assert.equal(GENERATOR_VERSION, 3);
  for (const category of EXERCISE_CATEGORIES) {
    let attempts = 0, doubles = 0, triples = 0;
    for (let seed = 0; seed < 8; seed++) for (const index of [0, 11]) {
      const c = config(category, `D3-SWEEP:${seed}`), q = chemical(c, index);
      attempts += q.generation.attempt;
      assert.ok(validateIntermediateExercise(q.molecule, category, chemistry.oracles).valid);
      assert.ok(validateIntermediateParent(q.molecule, category, chemistry.oracles.reference(q.molecule)).valid);
      assert.equal(validateEasyExercise(q.molecule, category, chemistry.oracles).valid, false);
      assert.deepEqual(chemical(c, index), q);
      const en = chemical({ ...c, locale: "en" }, index);
      assert.deepEqual({ ...en, reference: { ...en.reference, name: en.reference.names.es } }, q);
      assert.equal(q.generation.domainVersion, 2); assert.ok(validate(q.molecule).valid);
      const ids = new Map(q.molecule.atoms.map((a, i) => [a.id, 1000 + i * 13]));
      const other = { atoms: q.molecule.atoms.map((a) => ({ ...a, id: ids.get(a.id), x: -a.y * 2, y: a.x * 2 })).reverse(),
        bonds: q.molecule.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse(),
        rings: q.molecule.rings.map((r) => ({ ...r, atomIds: r.atomIds.map((id) => ids.get(id)) })) };
      assert.equal(evaluate({ referenceMolecule: q.molecule, submittedMolecule: other, category }).correct, true);
      for (const locale of ["es", "en"]) assert.ok(matchesHydrocarbonReferenceName(q.reference.names[locale], q.reference.names[locale], locale));
      const elements = new Map(q.molecule.atoms.map((a) => [a.id, a.element]));
      for (const [a,b,o] of q.molecule.bonds) if(elements.get(a)==="C" && elements.get(b)==="C") {
        doubles += o === 2 ? 1 : 0; triples += o === 3 ? 1 : 0;
      }
      assert.deepEqual(q.molecule, buildIntermediateChemicalCandidate(category, q.generation.candidateSeed));
    }
    assert.equal(attempts, 0, category); rows.push({ category, targets: 16, attempts, doubles, triples });
    if (!["alkane","alkene","alkyne","aromatic","simple-carbocycle","ez"].includes(category)) {
      assert.ok(doubles>0 && triples>0,`${category} certifies both single-unsaturation families`);
    }
  }
  mkdirSync("outputs/difficulty-d3", { recursive: true });
  writeFileSync("outputs/difficulty-d3/chemical-sweep.json", JSON.stringify({ durationMs: performance.now()-start, rows },null,2));
});

test("v3 basic retains Easy and v3 advanced keeps deterministic legacy chemistry without Hard certification", () => {
  for (const category of EXERCISE_CATEGORIES) {
    if (category !== "ez") {
      const q = chemical(config(category, "D3-BASIC", "basic"), 0);
      assert.ok(validateEasyExercise(q.molecule, category, chemistry.oracles).valid);
    }
    const c = config(category,"D3-ADVANCED","advanced"), q = chemical(c,0);
    assert.deepEqual(chemical(c,0),q); assert.ok(validateExerciseDomain(q.molecule,category,chemistry.oracles).valid);
    assert.equal(q.generation.domainVersion,1);
  }
  assert.throws(() => chemical(config("ez","D3-EZ","basic"),0), e => e.code === "unsupported-request");
});

test("17 categories × 2 seeds: MCQ keeps the Intermediate target and deterministic safe alternatives or explicit exhaustion", () => {
  let accepted=0, exhausted=0;
  for (const category of EXERCISE_CATEGORIES) for (const seed of [0,1]) {
    const c={...config(category,`D3-MCQ:${seed}`),questionTypes:["multiple-choice"]};
    const target=chemical(c,0), frozen=structuredClone(target);
    try {
      const q=generate(c,0,{questionType:"multiple-choice",displayIndex:0});
      assert.ok(validateMultipleChoiceQuestion(q)); assert.ok(validateIntermediateExercise(q.molecule,category,chemistry.oracles).valid);
      assert.deepEqual(q.molecule,target.molecule); assert.deepEqual(q.reference,target.reference);
      assert.deepEqual(generate(c,0,{questionType:"multiple-choice",displayIndex:0}),q);
      assert.equal(q.options.filter(o=>o.correct).length,1);
      const en=generate({...c,locale:"en"},0,{questionType:"multiple-choice",displayIndex:0});
      assert.deepEqual(en.options,q.options); accepted++;
    } catch(e) { assert.equal(e.message,"insufficient-safe-distractors"); exhausted++; }
    assert.deepEqual(target,frozen);
  }
  assert.ok(accepted >= 30); writeFileSync("outputs/difficulty-d3/mcq-sweep.json",JSON.stringify({accepted,exhausted}));
});

test("D3 function, unsaturation, substitution and numbering retain bilingual semantic navigation; unspecified E/Z never becomes teaching metadata", () => {
  const m=graph(anchors[0][1]), analysis=chemistry.engine.analyzeMolecule(m), legacy=chemistry.engine.buildLegacyEnglishNameModel(m,analysis);
  const names=chemistry.oracles.reference(m).names;
  const review=buildPracticeReviewSteps(m,analysis,legacy,names);
  for(const kind of ["function","unsaturation","substituent","numbering"]) assert.ok(review.some(s=>s.kind===kind && s.highlightAtomIds.length));
  assert.equal(review.some(s=>s.kind==="ez"),false,"DIFFICULTY-D3-REVIEW-001: explicit stereo required");
  for(const language of ["es","en"]) {
    const spanish=chemistry.engine.buildIupacReasoningSteps(m,analysis);
    const steps=language==="es" ? spanish : chemistry.engine.buildEnglishReasoningSteps(spanish,m,analysis);
    const displayedName=names[language];
    const fragments=deriveReasoningNameFragments({analysis,displayedName,generatedNames:Object.values(names),language,steps,canHighlight:true});
    const links=buildReasoningNameLinkParts(displayedName,fragments,steps);
    assert.equal(links.map(l=>l.text).join(""),displayedName);
    for(const number of ["01","03","04"]) assert.ok(links.some(l=>l.stepNumber===number || l.relatedStepNumbers?.includes(number)),number);
    assert.ok(links.some(l=>l.semanticId === "unsaturation:double:3"));
  }
  const ez=chemical(config("ez"),0), a=chemistry.engine.analyzeMolecule(ez.molecule);
  assert.ok(buildPracticeReviewSteps(ez.molecule,a,chemistry.engine.buildLegacyEnglishNameModel(ez.molecule,a),ez.reference.names).some(s=>s.kind==="ez"));
});
