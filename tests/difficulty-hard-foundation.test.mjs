import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { exerciseStructuralIdentity, createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { createPracticeQuestionGenerator, validateMultipleChoiceQuestion } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { validateExerciseChemistry, validateExerciseDomain } from "../app/exercise-domain.ts";
import { validateHardFoundationExercise, HARD_FOUNDATION_FAMILIES } from "../app/exercise-advanced-profile.ts";
import { classifyMinimumExerciseDifficulty } from "../app/exercise-difficulty-classification.ts";
import { validateEasyExercise } from "../app/exercise-easy-profile.ts";
import { validateIntermediateExercise } from "../app/exercise-intermediate-profile.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeReviewer, reviewBondId } from "../app/practice-review.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { formatPracticeReviewMessage } from "../app/practice-review-i18n.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";

const fixture=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d4-hard-foundation.json",import.meta.url)));
const functionalFixture=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d4-2a-hard-functional.json",import.meta.url)));
const structuralFixture=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d4-2b-hard-structural.json",import.meta.url)));
let chemistry, validate, evaluate, currentValidate, currentEvaluate, review;
before(async()=>{
  chemistry=await loadExerciseChemistry();
  validate=createBuildSubmissionValidator(chemistry.oracles,"hard-foundation");
  evaluate=createStructuralAnswerEvaluator(chemistry.oracles,"hard-foundation");
  currentValidate=createBuildSubmissionValidator(chemistry.oracles);
  currentEvaluate=createStructuralAnswerEvaluator(chemistry.oracles);
  review=createPracticeReviewer(chemistry.engine);
});
after(async()=>chemistry?.close());
const graph=s=>{const r=moleculeFromSmiles(s);assert.ok(r.ok,r.error);return r.molecule;};
const hard=(m,category)=>validateHardFoundationExercise(m,category,chemistry.oracles);
function redraw(m) {
  const ids=new Map(m.atoms.map((a,i)=>[a.id,1000+i*17]));
  return {atoms:m.atoms.map(a=>({...a,id:ids.get(a.id),x:-a.y*3+7,y:a.x*3+21})).reverse(),
    bonds:m.bonds.map(([a,b,...rest])=>[ids.get(b),ids.get(a),...rest]).reverse(),
    rings:(m.rings??[]).map(r=>({...r,atomIds:r.atomIds.map(id=>ids.get(id)).reverse()}))};
}
for(const f of fixture.fixtures) test(`D4 graph anchor #${f.id}: ${f.names.es}`,()=>{
  const m=graph(f.smiles),original=structuredClone(m),r=chemistry.oracles.reference(m),analysis=chemistry.engine.analyzeMolecule(m);
  assert.ok(validateExerciseChemistry(m,chemistry.oracles).valid);
  assert.ok(r.namingSupported);assert.deepEqual(r.names,f.names);assert.equal(r.principalFunctionalGroup,f.principalGroup);
  assert.equal(exerciseStructuralIdentity(m),f.structuralIdentity);
  assert.deepEqual(analysis.functionalGroups.map(g=>g.kind).sort(),f.groups);
  assert.deepEqual(analysis.doubleBondLocants,f.doubleLocants);assert.deepEqual(analysis.tripleBondLocants,f.tripleLocants);
  assert.deepEqual(analysis.functionalGroups.map(g=>({kind:g.kind,locants:g.carbonIds.filter(id=>analysis.numberedAtoms.has(id)).map(id=>analysis.numberedAtoms.get(id))})),f.functionalLocants);
  assert.equal(classifyMinimumExerciseDifficulty(m,f.category,chemistry.oracles),f.minimumDifficulty);
  assert.equal(validateEasyExercise(m,f.category,chemistry.oracles).valid,false);
  assert.equal(validateIntermediateExercise(m,f.category,chemistry.oracles).valid,f.minimumDifficulty==="intermediate");
  const admission=hard(m,f.category);
  assert.equal(admission.valid,f.minimumDifficulty==="advanced",JSON.stringify(admission));
  if(admission.valid) {
    assert.equal(admission.evidence.principalGroup,f.principalGroup);
    assert.equal(admission.evidence.carbonDoubleBondCount,f.doubleCount);
    assert.equal(admission.evidence.carbonTripleBondCount,f.tripleCount);
    assert.deepEqual(admission.evidence.secondaryGroups.map(g=>g.kind).sort(),f.groups.filter(g=>g!==f.principalGroup));
    assert.equal(currentValidate(m).valid,false,"published Build capability stays frozen");
    assert.equal(currentEvaluate({referenceMolecule:m,submittedMolecule:m,category:f.category}).status,"UNSUPPORTED_COMPARISON");
    assert.equal(validateExerciseDomain(m,f.category,chemistry.oracles,"intermediate").valid,false,"generation domain stays frozen");
  }
  assert.ok(validate(m).valid);
  const exported=moleculeToSmiles(m);assert.ok(exported.ok,exported.error);
  const restored=graph(exported.smiles);
  assert.equal(exerciseStructuralIdentity(restored),f.structuralIdentity);
  assert.deepEqual(chemistry.oracles.reference(restored).names,f.names);
  assert.equal(classifyMinimumExerciseDifficulty(restored,f.category,chemistry.oracles),f.minimumDifficulty);
  for(const submitted of [structuredClone(m),redraw(m),restored]) {
    const answer=evaluate({referenceMolecule:m,submittedMolecule:submitted,category:f.category});
    assert.equal(answer.correct,true,JSON.stringify(answer));assert.equal(answer.status,"EQUIVALENT");
  }
  // Remove the actual graph's methyl branch, never edit the written name.
  const parent=new Set(r.parent.atomIds),branch=m.atoms.find(a=>(a.element??"C")==="C" && !parent.has(a.id)
    && m.bonds.filter(([x,y])=>x===a.id||y===a.id).length===1
    && m.bonds.some(([x,y])=>x===a.id&&parent.has(y)||y===a.id&&parent.has(x)));
  assert.ok(branch);
  const mutated={atoms:m.atoms.filter(a=>a.id!==branch.id),bonds:m.bonds.filter(([a,b])=>a!==branch.id&&b!==branch.id),rings:[]};
  const wrong=evaluate({referenceMolecule:m,submittedMolecule:mutated,category:f.category});
  assert.ok(wrong.checks.submissionValid);assert.equal(wrong.correct,false);assert.match(wrong.status,/^DIFFERENT_/);
  assert.deepEqual(m,original,"all profile/comparison operations are pure");
});

test("v4 Hard production smoke: real target, safe MCQ and version-gated Build", () => {
  const c = createPracticeConfig(["alcohol"], 1, "es", "D5-CRITICAL", ["naming"], "advanced", 4);
  const generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  const q = generate(c, 0, { questionType: "multiple-choice", displayIndex: 0 });
  assert.equal(classifyMinimumExerciseDifficulty(q.molecule, q.category, chemistry.oracles), "advanced");
  assert.ok(validateMultipleChoiceQuestion(q)); assert.equal(q.options.length, 4);
  assert.equal(currentEvaluate({ referenceMolecule: q.molecule, submittedMolecule: redraw(q.molecule), category: q.category, config: c }).status, "EQUIVALENT");
});

test("minimum eligible profile is explicit and does not use molecular size or names",()=>{
  assert.equal(classifyMinimumExerciseDifficulty(graph("CCC(O)C"),"alcohol",chemistry.oracles),"basic");
  assert.equal(classifyMinimumExerciseDifficulty(graph("CCCCCCCCCCCC"),"alkane",chemistry.oracles),"basic");
  const m=graph(fixture.fixtures[6].smiles),r=chemistry.oracles.reference(m);
  const noNames={...chemistry.oracles,reference:()=>({...r,names:{es:"opaque ES",en:"opaque EN"},name:"opaque"})};
  assert.equal(classifyMinimumExerciseDifficulty(m,"aldehyde",noNames),"advanced");
  assert.equal(classifyMinimumExerciseDifficulty(m,"alcohol",chemistry.oracles),"unsupported","suffix category requires the principal group");
});

test("principal/prefix roles, repeated functions, and feature categories use the real hierarchy",()=>{
  for(const id of [7,8,9,10,11]) {
    const f=fixture.fixtures.find(f=>f.id===id),r=hard(graph(f.smiles),f.category);assert.ok(r.valid);
    assert.equal(r.evidence.principalGroup,f.principalGroup);
    const count=f.groups.filter(g=>g===f.principalGroup).length;
    assert.equal(r.evidence.principalInstances.length,count);
    assert.deepEqual(r.evidence.repeatedFunctions,count===2?[{kind:f.principalGroup,count:2}]:[]);
  }
  const alkoxy=graph(fixture.fixtures[4].smiles);
  assert.ok(hard(alkoxy,"alcohol").valid);assert.ok(hard(alkoxy,"ether").valid);
  assert.equal(hard(alkoxy,"halogenated").valid,false);
  const halo=graph(fixture.fixtures[7].smiles);
  assert.ok(hard(halo,"ketone").valid);assert.ok(hard(halo,"halogenated").valid);
  assert.equal(hard(halo,"alcohol").valid,false);
});

test("all admission families have independently analyzed positive evidence, including D4.2A/B",()=>{
  const seen=new Set(fixture.fixtures.filter(f=>f.minimumDifficulty==="advanced").map(f=>hard(graph(f.smiles),f.category).evidence.family));
  for(const {smiles,category,family:id,names,structuralIdentity} of fixture.additionalFixtures) {
    const m=graph(smiles),r=hard(m,category);assert.ok(r.valid,JSON.stringify(r));assert.equal(r.evidence.family,id);
    assert.ok(chemistry.oracles.reference(m).namingSupported);
    assert.deepEqual(chemistry.oracles.reference(m).names,names);
    assert.equal(exerciseStructuralIdentity(m),structuralIdentity);
    const out=moleculeToSmiles(m);assert.ok(out.ok);assert.ok(hard(graph(out.smiles),category).valid);
    assert.equal(evaluate({referenceMolecule:m,submittedMolecule:redraw(m),category}).correct,true);seen.add(id);
  }
  // One smoke assertion per new family keeps the existing critical gate small.
  for(const f of functionalFixture.fixtures.filter(f=>f.id.endsWith("-branched"))) {
    const m=graph(f.smiles),r=hard(m,f.category);assert.ok(r.valid,JSON.stringify(r));
    assert.equal(r.evidence.family,f.family);assert.equal(classifyMinimumExerciseDifficulty(m,f.category,chemistry.oracles),"advanced");
    assert.equal(validateEasyExercise(m,f.category,chemistry.oracles).valid,false);
    assert.equal(validateIntermediateExercise(m,f.category,chemistry.oracles).valid,false);
    assert.deepEqual(chemistry.oracles.reference(m).names,f.names);
    assert.equal(exerciseStructuralIdentity(m),f.structuralIdentity);
    assert.equal(evaluate({referenceMolecule:m,submittedMolecule:redraw(m),category:f.category}).correct,true);seen.add(f.family);
  }
  for(const f of structuralFixture.fixtures.filter(f=>f.id.endsWith("-primary"))) {
    const m=graph(f.smiles),r=hard(m,f.category);assert.ok(r.valid,JSON.stringify(r));
    assert.equal(r.evidence.family,f.family);assert.equal(classifyMinimumExerciseDifficulty(m,f.category,chemistry.oracles),"advanced");
    assert.equal(validateEasyExercise(m,f.category,chemistry.oracles).valid,false);
    assert.equal(validateIntermediateExercise(m,f.category,chemistry.oracles).valid,false);
    assert.deepEqual(chemistry.oracles.reference(m).names,f.names);
    assert.equal(exerciseStructuralIdentity(m),f.structuralIdentity);
    assert.equal(evaluate({referenceMolecule:m,submittedMolecule:redraw(m),category:f.category}).correct,true);seen.add(f.family);
  }
  assert.deepEqual([...seen].sort(),HARD_FOUNDATION_FAMILIES.map(f=>f.id).sort());
});

const unsupported=[
  ["alcohol","CC(O)C#C(Br)C(C)CC","overvalent sp carbon"],
  ["alcohol","CCCCCCS","sulfur"], ["alcohol","OCC1CCOCC1","heterocycle"],
  ["alcohol","OC1CCCCC1","functional ring"], ["alcohol","OC1CCC2CCCCC2C1","fused rings"],
  ["alcohol","OC(C)CC(O)CC(O)C","triol"], ["ketone","CC(=O)CC(=O)CC(=O)C","trione"],
  ["carboxylic-acid","O=C(O)CCCCC(=O)O","two acids"], ["aldehyde","O=CCCCCC=O","two aldehydes"],
  ["amine","NCCCCCCN","two amines"], ["alcohol","OCCC(NC)CCC","N substitution"],
  ["alcohol","OCCC=CCC=CC","diene function not certified"], ["alcohol","OCCC#CCC#CC","diyne function not certified"],
  ["alcohol","OCCC=C=CCC","cumulene"], ["alcohol","OCCC=CCC=CC=C","three axes"],
  ["alcohol","OCCCCCC(=O)OC","multifunctional ester"], ["alcohol","OCCCCCC#N","multifunctional nitrile"],
  ["alcohol","OCCCCCC(=O)N","multifunctional amide"], ["carboxylic-acid","O=C(O)CCC(=O)CC","oxo-acid deferred"],
  ["alcohol","OCC=C(C)C(O)C([N+](=O)[O-])C","Hard nitro variant deferred"],
  ["alcohol","CC(O)(O)CCCC","geminal repeated OH"],
];
for(const [category,smiles,label] of unsupported) test(`Hard foundation rejects ${label}`,()=>{
  const m=graph(smiles);assert.equal(hard(m,category).valid,false);
  assert.equal(classifyMinimumExerciseDifficulty(m,category,chemistry.oracles),"unsupported");
  assert.equal(validate(m).valid,false);
});
test("stereochemistry/charge/schema boundaries remain fail-closed",()=>{
  for(const smiles of ["OCCCCC[NH3+]","OCCCCC[O-]"])assert.equal(moleculeFromSmiles(smiles).ok,false,"SMILES importer already rejects unsupported ions");
  const m=graph(fixture.fixtures[5].smiles);
  for(const mutate of [m=>{m.atoms[0].tetrahedralParity=1;},m=>{m.atoms[0].tetrahedralBondTo=2;},
    m=>{m.bonds.find(b=>b[2]===2)[3]=true;},m=>{m.atoms[0].charge=1;},
    m=>{m.rings=[{id:1,kind:"cycloalkane",atomIds:[1,2,3]}];},m=>{m.bonds.pop();}]) {
    const other=structuredClone(m);mutate(other);assert.equal(hard(other,"alcohol").valid,false);assert.equal(validate(other).valid,false);
  }
  const failed={...chemistry.oracles,reference:()=>{throw Error("unavailable oracle");}};
  assert.equal(validateHardFoundationExercise(m,"alcohol",failed).valid,false);
  assert.equal(classifyMinimumExerciseDifficulty(m,"alcohol",failed),"unsupported");
});

test("Build accepts safe lower-profile mistakes and distinguishes locants/bond orders/groups",()=>{
  const m=graph("CC(O)C=CC(C)C#CC");
  for(const smiles of ["CCC(O)=CC(C)C#CC","CC(O)CCC(C)C#CC","CCC=CC(C)C#CC","CCCCCCO"]) {
    const submitted=graph(smiles),a=evaluate({referenceMolecule:m,submittedMolecule:submitted,category:"alcohol"});
    assert.ok(a.checks.submissionValid,JSON.stringify(a));assert.equal(a.correct,false);assert.match(a.status,/^DIFFERENT_/);
  }
});

test("manual Hard Build targets produce consistent bilingual ReviewModels and semantic unsaturation provenance",()=>{
  for(const f of fixture.fixtures.filter(f=>f.minimumDifficulty==="advanced")) {
    const molecule=graph(f.smiles),analysis=chemistry.engine.analyzeMolecule(molecule),names=f.names;
    const q={type:"build",molecule,category:f.category,question:{id:`D4:${f.id}`,seed:`manual:${f.id}`,generatorVersion:3},
      reference:{names,name:names.es,structuralIdentity:f.structuralIdentity,smiles:f.smiles,formula:analysis.formula,
        profiles:{es:"local-systematic-es",en:"iupac-1979-legacy-en"}}};
    const answer=evaluate({referenceMolecule:molecule,submittedMolecule:redraw(molecule),category:f.category});
    const legacy=chemistry.engine.buildLegacyEnglishNameModel(molecule,analysis);
    for(const locale of ["es","en"]) {
      const attempt=createInitialAttempt({question:q,displayOrdinal:7,generationIndex:11,answer:"",correct:true,locale,
        structuralAnswer:answer,started:{monotonicMs:0,wallTimeMs:1700000000000},submitted:{monotonicMs:100,wallTimeMs:1700000000100}});
      const model=review(q,attempt);assert.equal(model.status,"CORRECT");assert.deepEqual(model.issues,[]);
      assert.deepEqual(model.reference.names,names);assert.equal(model.steps.some(s=>s.kind==="ez"),false);
      const functionStep=model.steps.find(s=>s.kind==="function");assert.equal(functionStep.params.group,f.principalGroup);
      const bonds=new Set(molecule.bonds.map(([a,b])=>reviewBondId(a,b)));
      for(const step of model.steps) {
        assert.ok(step.highlightAtomIds.length);assert.ok(step.highlightBondIds.every(b=>bonds.has(b)));
        assert.doesNotMatch(formatPracticeReviewMessage(step.messageKey,step.params,locale),/undefined|NaN|\{\w+\}/);
      }
      assert.equal(model.steps.filter(s=>s.kind==="unsaturation").length,f.doubleCount+f.tripleCount);
      const spanish=chemistry.engine.buildIupacReasoningSteps(molecule,analysis);
      const steps=locale==="es"?spanish:chemistry.engine.buildEnglishReasoningSteps(spanish,molecule,analysis);
      const fragments=deriveReasoningNameFragments({analysis,displayedName:names[locale],generatedNames:Object.values(names),language:locale,steps,canHighlight:true});
      const links=buildReasoningNameLinkParts(names[locale],fragments,steps);
      assert.equal(links.map(l=>l.text).join(""),names[locale]);
      // Existing legacy EN multi-axis text navigation is a documented D7 gap.
      if(locale==="es" || f.doubleCount+f.tripleCount===1) {
        for(const [type,locants] of [["double",f.doubleLocants],["triple",f.tripleLocants]])for(const locant of locants)
          assert.ok(links.some(l=>l.semanticId===`unsaturation:${type}:${locant}`),`${f.id}/${locale}/${type}:${locant}`);
      }
      for(const [type,locants] of [["double",f.doubleLocants],["triple",f.tripleLocants]])for(const locant of locants) {
        const step=steps.flatMap(s=>s.unsaturationContributions??[]).find(s=>s.semanticId===`unsaturation:${type}:${locant}`);
        assert.ok(step);assert.ok(step.bondIds.every(([a,b])=>bonds.has(reviewBondId(a,b))));
      }
    }
    assert.equal(legacy.functionalGroups.filter(g=>g.kind===f.principalGroup).length,f.groups.filter(g=>g===f.principalGroup).length);
  }
});
