import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { EXERCISE_CATEGORIES } from "../app/exercise-model.ts";
import { createPracticeQuestionGenerator, schedulePracticeQuestionType } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeStructure, submitPracticeStructure,
  submitPracticeAnswer, updatePracticeAnswer, endPractice, startPracticeCorrections, nextPracticeQuestion, localizePracticeState } from "../app/practice-session.ts";
import { calculatePracticeMetrics } from "../app/practice-metrics.ts";
import { calculatePracticeMastery } from "../app/practice-corrections.ts";
import { createPracticeReviewer } from "../app/practice-review.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { uiText } from "../app/i18n.ts";
let chemistry, generate, evaluate, reviewer, ui;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles);
  reviewer = createPracticeReviewer(chemistry.engine);
  // Reuse the test loader's production Vite module graph for TSX.
  ui = await chemistry.loadModule("/app/practice-panel.tsx");
});
after(async () => chemistry?.close());
const clock = (ms) => ({monotonicMs:ms,wallTimeMs:100000+ms});
const config = (category="alkane", count=5, seed="BUILD-SESSION", types=["build"]) => createPracticeConfig([category],count,"es",seed,types);
function submit(s, molecule=s.question.molecule, ms=2000) {
  return submitPracticeStructure(updatePracticeStructure(markPracticeQuestionAvailable(s,clock(1000)),molecule),"es",clock(ms),evaluate);
}
const methane = () => moleculeFromSmiles("C").molecule;
test("all 17 Build targets are deterministic and use the same generator without graph duplication", () => {
  for(const category of EXERCISE_CATEGORIES) {
    const c=config(category), a=generate(c,0), b=generate({...c,locale:"en"},0);
    assert.equal(a.type,"build"); assert.deepEqual(a.molecule,b.molecule); assert.deepEqual(a,generate(c,0));
    assert.equal(evaluate({referenceMolecule:a.molecule,submittedMolecule:a.molecule,category}).correct,true);
  }
});
test("three types occur once per seeded block; two-type frozen scheduling is unchanged", () => {
  const c=config("alkane", "endless", "BUILD-SCHEDULE", ["naming","multiple-choice","build"]);
  for(let i=0;i<30;i+=3) assert.deepEqual([0,1,2].map(n=>schedulePracticeQuestionType(c,i+n)).sort(),["build","multiple-choice","naming"]);
  assert.deepEqual(Array.from({length:30},(_,i)=>schedulePracticeQuestionType(c,i)),Array.from({length:30},(_,i)=>schedulePracticeQuestionType({...c,locale:"en"},i)));
});
test("finite Build: independent timing, compact submission, immutable source, locked submission", () => {
  let s=startPractice(config(),generate); const original=structuredClone(s.question);
  s=submit(s); assert.equal(s.phase,"FEEDBACK"); assert.equal(s.correct,true);
  const a=s.attempts[0]; assert.equal(a.questionType,"build"); assert.equal(a.attemptNumber,1); assert.equal(a.responseTimeMs,1000);
  assert.ok(a.structuralAnswer.submittedSmiles); assert.ok(a.structuralAnswer.submittedIdentity);
  assert.equal("molecule" in a,false); assert.equal(a.answer,a.structuralAnswer.submittedSmiles);
  assert.deepEqual(s.question,original);
  assert.equal(updatePracticeStructure(s,methane()),s); assert.equal(submitPracticeStructure(s,"es",clock(3000),evaluate),s);
  for(let i=1;i<5;i++) { s=nextPracticeQuestion(s,generate); assert.equal(s.studentMolecule,undefined); s=submit(s); }
  s=nextPracticeQuestion(s,generate); assert.equal(s.phase,"COMPLETE"); assert.equal(s.attempts.length,5);
  assert.deepEqual(calculatePracticeMetrics(s.attempts).byQuestionType,[{id:"build",correct:5,answered:5,accuracy:100}]);
});
test("Build corrections append attempts 2/3, reconstruct exact index and preserve initial metrics", () => {
  let s=submit(startPractice(config("alcohol","endless"),generate),methane());
  assert.equal(s.correct,false); const initial=calculatePracticeMetrics(s.attempts), original=structuredClone(s.question);
  s=startPracticeCorrections(endPractice(s),generate); assert.deepEqual(s.question,original); assert.equal(s.studentMolecule,undefined);
  s=submit(s,methane(),4500); assert.equal(s.attempts[1].attemptNumber,2); assert.equal(s.attempts[1].responseTimeMs,3500);
  s=startPracticeCorrections(nextPracticeQuestion(s,generate),generate); assert.equal(s.studentMolecule,undefined);
  s=submit(s,s.question.molecule,6500); assert.equal(s.attempts[2].attemptNumber,3); assert.equal(s.correct,true);
  assert.deepEqual(calculatePracticeMetrics(s.attempts),initial);
  assert.deepEqual(s.attempts.map(a=>a.attemptNumber),[1,2,3]); assert.equal(calculatePracticeMastery(s.attempts).finalMastery,100);
  assert.equal(calculatePracticeMastery(s.attempts).remainingMistakes,0);
});
test("real duplicate avoidance uses generationIndex, not displayOrdinal, for Build correction", () => {
  let s=startPractice(config("alkane","endless","BUILD-DUPLICATES"),generate), found=false;
  for(let i=0;i<35;i++) {
    if(s.generationIndex!==s.index) {
      found=true; const q=structuredClone(s.question), index=s.generationIndex;
      s=submit(s,methane()); assert.equal(s.correct,false);
      const c=startPracticeCorrections(endPractice(s),generate);
      // Earlier correct questions are excluded; the skipped-index failure is first.
      assert.equal(c.generationIndex,index); assert.deepEqual(c.question,q);
      assert.equal(c.original.structuralIdentity,q.reference.structuralIdentity);
      console.log("BUILD_RECONSTRUCTION", JSON.stringify({displayOrdinal:c.original.displayOrdinal,generationIndex:index,structuralIdentity:c.original.structuralIdentity}));
      break;
    }
    s=nextPracticeQuestion(submit(s),generate);
  }
  assert.equal(found,true,"frozen seed must exercise a real duplicate skip");
});
test("invalid and technical errors leave timer and log intact; naming submission cannot bypass Build", () => {
  let s=markPracticeQuestionAvailable(startPractice(config(),generate),clock(1000));
  s=updatePracticeStructure(s,{atoms:[],bonds:[]}); const r=submitPracticeStructure(s,"es",clock(2000),evaluate);
  assert.equal(r.phase,"QUESTION"); assert.equal(r.buildError,"INVALID_SUBMISSION"); assert.equal(r.attempts.length,0); assert.deepEqual(r.timing,s.timing);
  const failed=submitPracticeStructure(r,"es",clock(3000),()=>{throw new Error("toolkit");});
  assert.equal(failed.buildError,"UNSUPPORTED_COMPARISON"); assert.equal(failed.attempts.length,0);
  assert.equal(submitPracticeAnswer(updatePracticeAnswer(s,s.question.reference.name),"es",clock(2000)).phase,"QUESTION");
});
test("locale switch preserves target, partial drawing, timer and frozen submitted outcome", () => {
  const s=updatePracticeStructure(markPracticeQuestionAvailable(startPractice(config("alcohol"),generate),clock(1000)),methane());
  const en=localizePracticeState(s,"en"); assert.equal(en.question.molecule,s.question.molecule);
  assert.equal(en.studentMolecule,s.studentMolecule); assert.equal(en.timing,s.timing);
  assert.equal(en.question.reference.name,s.question.reference.names.en);
  const sent=submitPracticeStructure(en,"en",clock(2200),evaluate), es=localizePracticeState(sent,"es");
  assert.equal(es.correct,false); assert.equal(es.attempts,sent.attempts); assert.equal(es.attempts[0].localeAtSubmission,"en");
});
test("reset to the default carbon and repeated editor readiness preserve target, timing and attempts", () => {
  const s=updatePracticeStructure(markPracticeQuestionAvailable(startPractice(config(),generate),clock(1000)),methane());
  const reset=markPracticeQuestionAvailable(updatePracticeStructure(s,methane()),clock(8000));
  assert.equal(reset.question,s.question); assert.equal(reset.generationIndex,s.generationIndex);
  assert.equal(reset.timing,s.timing); assert.equal(reset.attempts,s.attempts);
  const checked=submitPracticeStructure(reset,"es",clock(9000),evaluate);
  assert.equal(checked.attempts[0].responseTimeMs,8000);
});
test("mixed finite and Endless share one log, summary, correction queue and mastery", () => {
  for(const count of ["endless",5]) {
    let s=startPractice(config("alcohol",count,"BUILD-MIXED",["naming","multiple-choice","build"]),generate);
    const types=[];
    for(let i=0;i<3;i++) {
      types.push(s.question.type??"naming");
      s=markPracticeQuestionAvailable(s,clock(1000));
      if(s.question.type==="build") s=submit(s,methane());
      else s=submitPracticeAnswer(updatePracticeAnswer(s,s.question.type==="multiple-choice"?s.question.options.find(o=>!o.correct).id:"wrong"),"es",clock(2200));
      s=nextPracticeQuestion(s,generate);
    }
    assert.deepEqual(types.sort(),["build","multiple-choice","naming"]);
    s=endPractice(s); assert.equal(s.attempts.length,3); assert.equal(calculatePracticeMetrics(s.attempts).answeredQuestions,3);
    s=startPracticeCorrections(s,generate); assert.equal(s.queue.length,3);
    for(let i=0;i<3;i++) {
      s=markPracticeQuestionAvailable(s,clock(1000));
      s=s.question.type==="build"?submit(s):submitPracticeAnswer(updatePracticeAnswer(s,s.question.type==="multiple-choice"?s.question.correctOptionId:s.question.reference.name),"es",clock(3000));
      s=nextPracticeQuestion(s,generate);
    }
    assert.equal(s.phase,"CORRECTION_SUMMARY"); assert.equal(calculatePracticeMastery(s.attempts).finalMastery,100);
    assert.equal(calculatePracticeMetrics(s.attempts).firstAttemptAccuracy,0);
  }
});
test("Reviewer uses structural outcome for correct, constitutional mismatch and E/Z mismatch", () => {
  for(const category of ["alkane","ez"]) {
    let s=startPractice(config(category),generate); const good=submit(s);
    assert.equal(reviewer(good.question,good.attempts[0]).status,"CORRECT");
    const wrong=category==="ez"?moleculeFromSmiles(s.question.reference.smiles.replace(/[/\\]/,char=>char==="/"?"\\":"/")).molecule:methane();
    const bad=submit(s,wrong); const r=reviewer(bad.question,bad.attempts[0]);
    if(category==="ez") assert.equal(bad.attempts[0].structuralAnswer.status,"DIFFERENT_STEREOCHEMISTRY");
    assert.equal(r.status,"INCORRECT"); assert.equal(r.issues[0].code,"UNKNOWN_STRUCTURAL_MISMATCH");
  }
});

for(const locale of ["es","en"]) test(`Build UI ${locale}: target name only, student editor, guarded Check and reference reveal after review`, () => {
  const state=startPractice(config("alcohol"),generate), s=localizePracticeState(state,locale);
  let renderedTarget=false;
  const actions={answer(){},check(){},next(){},end(){},retry(){},configure(){},back(){},correctMistakes(){},structure(){}};
  const render=(s) => renderToStaticMarkup(React.createElement(ui.PracticeSessionView,{
    state:s,language:locale,actions,review:reviewer,
    renderBuilder:()=>React.createElement("div",{"data-student-editor":true},"Student editor"),
    renderStructure:()=>{ renderedTarget=true; return React.createElement("svg"); },
  }));
  const html=render(s);
  assert.ok(html.includes(s.question.reference.name)); assert.match(html,/data-student-editor/);
  assert.equal(renderedTarget,false); assert.doesNotMatch(html,/<svg|practice-answer|reference\.smiles|<input/);
  assert.ok(html.includes(uiText(locale,"Reiniciar estructura"))); assert.match(html,/<button[^>]*disabled/);
  const feedback=localizePracticeState(submit(s,methane()),locale), out=render(feedback);
  assert.doesNotMatch(out,/data-student-editor/); assert.ok(out.includes(uiText(locale,"Revisar respuesta")));
  assert.ok(out.includes(uiText(locale,"Siguiente"))); assert.equal(renderedTarget,true);
});
test("actual shared editor Build entry contains construction controls, no Lab outputs or target bridge", () => {
  const html=renderToStaticMarkup(React.createElement(chemistry.engine.default,{
    buildEditor:{language:"es",disabled:false,onChange(){},onReady(){}},
  }));
  assert.match(html,/practice-build-editor/); assert.match(html,/direction-pad/); assert.match(html,/functional-button/);
  assert.doesNotMatch(html,/analysis-panel|iupac-dock|practice-panel|name-builder-toggle|canvas-export-button|personal-history-control/);
});
