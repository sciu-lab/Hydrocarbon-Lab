import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { parseClassCsv } from "./helpers/class-csv-parser.mjs";
import { EXERCISE_CATEGORIES, normalizeSessionConfig } from "../app/exercise-model.ts";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { validateIntermediateExercise } from "../app/exercise-intermediate-profile.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createBuildSubmissionValidator, createStructuralAnswerEvaluator } from "../app/practice-structural-answer.ts";
import { createPracticeConfig, startPractice, markPracticeQuestionAvailable, updatePracticeAnswer, updatePracticeStructure,
  submitPracticeAnswer, submitPracticeStructure, nextPracticeQuestion, localizePracticeState, startPracticeCorrections, endPractice } from "../app/practice-session.ts";
import { createExamConfig, startExam, markExamQuestionAvailable, updateExamAnswer, updateExamStructure, navigateExam,
  submitExam, localizeExamState } from "../app/exam-session.ts";
import { getExerciseUniquenessKey, PRACTICE_DUPLICATE_LIMIT, PRACTICE_MCQ_SEARCH_LIMIT, PRACTICE_RECENT_LIMIT } from "../app/session-question-selection.ts";
import { buildCompletedSessionReview } from "../app/session-review.ts";
import { createInitialAttempt } from "../app/practice-attempt.ts";
import { reconstructPracticeCorrection } from "../app/practice-corrections.ts";
import { reconstructSessionReviewQuestion } from "../app/session-review-question.ts";
import { createClassAssignmentConfig, generateClassAssignments, participantSessionConfig, classConfigFingerprint,
  CLASS_SCHEMA_VERSION, CLASS_DERIVATION_VERSION } from "../app/class-assignment.ts";
import { serializeClassAssignmentCsv, reconstructClassSessionFromCsvRow, CLASS_ASSIGNMENT_CSV_COLUMNS } from "../app/class-assignment-csv.ts";

const types = ["naming", "multiple-choice", "build"];
const time = ms => ({ monotonicMs: ms, wallTimeMs: 1700000000000 + ms });
let chemistry, chemical, generate, evaluate, validate;
before(async () => {
  chemistry = await loadExerciseChemistry(); chemical = createRestrictedChemicalGenerator(chemistry.oracles);
  generate = createPracticeQuestionGenerator(chemical, createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  evaluate = createStructuralAnswerEvaluator(chemistry.oracles); validate = createBuildSubmissionValidator(chemistry.oracles);
});
after(async () => chemistry?.close());
function submit(s, correct = true, ms = 1000) {
  s = markPracticeQuestionAvailable(s, time(ms)); const q = s.question;
  if (q.type === "build") return submitPracticeStructure(updatePracticeStructure(s, q.molecule), s.config.locale, time(ms+100), evaluate);
  return submitPracticeAnswer(updatePracticeAnswer(s, q.type === "multiple-choice" ? q.options.find(o=>o.correct===correct).id
    : correct ? q.reference.names[s.config.locale] : "wrong"), s.config.locale, time(ms+100));
}
function assertTarget(q) {
  assert.equal(q.question.generatorVersion, 3);
  assert.ok(validateIntermediateExercise(q.molecule, q.category, chemistry.oracles).valid);
}
function capture(difficulty, version, locale) {
  const source = `import {captureDifficultySessions} from './tests/helpers/difficulty-session-snapshot.mjs';
    console.log('SNAPSHOT='+JSON.stringify(await captureDifficultySessions('${difficulty}','${locale}',${version})));`;
  return JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",source],{encoding:"utf8",timeout:60000}).split("SNAPSHOT=")[1].trim());
}
test("all certified categories submit their exact reference as correct in both locales", () => {
  for(const category of EXERCISE_CATEGORIES)for(const locale of ["es","en"]) {
    const c=createPracticeConfig([category],1,locale,"D3-SELF-ACCEPT",["naming"],"intermediate");
    const s=submit(startPractice(c,generate));assert.equal(s.phase,"FEEDBACK");assert.equal(s.correct,true,`${category}/${locale}`);
  }
});
test("v1/v2/v3 replay ordinal 7 with real generationIndex 11 through corrections and Session Review", () => {
  for(const version of [1,2,3]) {
    const c=createPracticeConfig(["alcohol"],7,"es","D3-REPLAY",["naming"],"intermediate",version);
    const q=generate(c,11,{questionType:"naming",displayIndex:6});
    const attempt=createInitialAttempt({question:q,displayOrdinal:7,generationIndex:11,answer:"wrong",correct:false,
      started:time(0),submitted:time(100),locale:"es"});
    const calls=[],rebuild=(config,index,context)=>{calls.push([config.generatorVersion,config.difficulty,index,context.displayIndex]);return generate(config,index,context);};
    const original=normalizeSessionConfig(JSON.parse(JSON.stringify(c)));
    assert.deepEqual(reconstructPracticeCorrection(original,attempt,rebuild),q);
    const review=reconstructSessionReviewQuestion(original,{...attempt,attempts:[attempt]},rebuild);
    assert.ok(review.ok);assert.deepEqual(review.detail.question,q);
    assert.deepEqual(calls,[[version,"intermediate",11,6],[version,"intermediate",11,6]]);
    assert.equal(reconstructSessionReviewQuestion({...original,generatorVersion:version===3?2:3},{...attempt,attempts:[attempt]},generate).ok,false);
  }
});
test("v2 all three difficulties stay frozen, including full MCQ/Build payloads and real generationIndex", () => {
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d3-frozen-v2-session.json",import.meta.url)));
  assert.equal(fixture.capturedAtHead,"0729971");
  for(const d of ["basic","intermediate","advanced"]) assert.deepEqual(capture(d,2,"es"),fixture.sessions[d]);
});
test("v3 Intermediate mixed plan fixture repeats in fresh ES/EN processes without time or random entropy", () => {
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d3-intermediate-session.json",import.meta.url)));
  assert.equal(fixture.generatorVersion,3); assert.equal(fixture.difficulty,"intermediate");
  const a=capture("intermediate",3,"es"); assert.deepEqual(a,fixture.sessions);
  assert.deepEqual(capture("intermediate",3,"es"),a); assert.deepEqual(capture("intermediate",3,"en"),a);
});
test("v3 Practice mixed grading, original attempts, corrections and Session Review retain configuration and target", () => {
  const config=createPracticeConfig(["alkane","alcohol","ketone","ether","ez"],6,"es","D3-LIFECYCLE",types,"intermediate");
  let s=startPractice(config,generate); const questions=[];
  while(s.phase==="QUESTION") {
    assertTarget(s.question); questions.push(s.question); const i=s.index;
    s=localizePracticeState(s,"en"); s=submit(s,i!==0,i*1000);
    assert.equal(s.phase,"FEEDBACK"); s=nextPracticeQuestion(s,generate);
  }
  assert.equal(s.phase,"COMPLETE"); assert.equal(s.attempts.length,6);
  assert.equal(new Set(questions.map(getExerciseUniquenessKey)).size,6);
  assert.deepEqual([...new Set(s.attempts.map(a=>a.questionType))].sort(),[...types].sort());
  assert.ok(s.attempts.some(a=>!a.correct));
  const original=structuredClone(s.attempts), initial=buildCompletedSessionReview(s); assert.ok(initial.ok);
  s=startPracticeCorrections(s,(c,...args)=>{assert.equal(c.generatorVersion,3);assert.equal(c.difficulty,"intermediate");return generate(c,...args);});
  assert.equal(s.phase,"CORRECTION_QUESTION"); assertTarget(s.question);
  const wrong=original.find(a=>!a.correct); assert.equal(s.question.reference.structuralIdentity,wrong.structuralIdentity);
  s=nextPracticeQuestion(submit(s,true,10000),generate); assert.equal(s.phase,"CORRECTION_SUMMARY");
  assert.deepEqual(s.attempts.slice(0,6),original); assert.equal(s.attempts.at(-1).attemptNumber,2);
  const review=buildCompletedSessionReview(s); assert.ok(review.ok); assert.deepEqual(review.model.initialResults,initial.model.initialResults);
  const reconstructedConfig=normalizeSessionConfig(JSON.parse(JSON.stringify(review.model.config)));
  for(const entry of review.model.questions) {
    const result=reconstructSessionReviewQuestion(reconstructedConfig,entry,generate); assert.ok(result.ok); assertTarget(result.detail.question);
    assert.equal(result.detail.question.reference.structuralIdentity,entry.firstAttempt.structuralIdentity);
  }
});
test("v3 Exam preserves neutral drafts/navigation/locale and frozen plan, then grades atomically with post-submit Review", () => {
  let s=startExam(createExamConfig(["alcohol","ketone","ether","ez"],6,"es","D3-EXAM",types,"intermediate"),generate);
  assert.equal(s.phase,"EXAM_QUESTION"); const plan=s.plan; s=localizeExamState(s,"en"); assert.equal(s.plan,plan);
  for(let i=0;i<6;i++) {
    const q=plan.slots[i].question; assertTarget(q);
    s=markExamQuestionAvailable(s,time(i*1000),{index:i,questionId:plan.slots[i].questionIdentity});
    s=q.type==="build" ? updateExamStructure(s,q.molecule,validate)
      : updateExamAnswer(s,q.type==="multiple-choice" ? q.correctOptionId : q.reference.names.en);
    assert.deepEqual(s.attempts,[]);
    if(i===1) {const draft=s.drafts[i];s=navigateExam(s,0,time(1100));s=navigateExam(s,1,time(1200));assert.equal(s.drafts[i],draft);}
    s=navigateExam(s,i+1,time(i*1000+500));
  }
  assert.equal(s.phase,"EXAM_REVIEW"); assert.deepEqual(s.attempts,[]);
  s=submitExam(s,"en",time(7000),evaluate); assert.equal(s.phase,"EXAM_RESULTS");
  assert.ok(s.attempts.every(a=>a.correct && a.generatorVersion===3)); assert.equal(submitExam(s,"en",time(8000),evaluate),s);
  const review=buildCompletedSessionReview(s);assert.ok(review.ok);
  for(const entry of review.model.questions) {
    const result=reconstructSessionReviewQuestion(review.model.config,entry,()=>{throw Error("Frozen plan");},plan.slots[entry.displayOrdinal-1].question);
    assert.ok(result.ok); assertTarget(result.detail.question);
  }
});
test("v3 Endless accepts Intermediate and retains bounded history; unsupported Easy E/Z still fails safely", () => {
  let s=startPractice(createPracticeConfig(["alcohol","ester","ez"],"endless","es","D3-ENDLESS",["naming"],"intermediate"),generate);
  for(let i=0;i<24;i++) {assert.equal(s.phase,"QUESTION");assertTarget(s.question);assert.ok(s.recentIdentities.length<=8);
    assert.ok(s.usedExerciseKeys.length<=8);s=nextPracticeQuestion(submit(s,true,i*1000),generate);}
  assert.equal(endPractice(s).phase,"COMPLETE");
  const exam=startExam(createExamConfig(["ez"],5,"en","D3-EASY-EZ"),generate);
  assert.equal(exam.phase,"EXAM_ERROR");assert.deepEqual(exam.attempts,[]);
  assert.deepEqual([PRACTICE_DUPLICATE_LIMIT,PRACTICE_MCQ_SEARCH_LIMIT,PRACTICE_RECENT_LIMIT],[4,12,8]);
});
test("17 categories × 2 modes × 2 seeds: finite Intermediate sweep records validation, duplicates and safe exhaustion", () => {
  const start=performance.now(),stats={};
  for(const category of EXERCISE_CATEGORIES) {
    const stat=stats[category]={sessions:0,candidates:0,accepted:0,profileRejects:0,chemistryRejects:0,oracleRejects:0,
      duplicateRejects:0,exhaustions:0,violations:0,maxChemicalRetries:0,maxQuestionRetries:0};
    for(const mode of ["practice","exam"]) for(const seed of [0,1]) {
      stat.sessions++; const seen=new Set();
      const builder=mode==="exam"?createExamConfig:createPracticeConfig;
      const c=builder([category],5,"en",`D3-FINITE:${seed}`,["naming"],"intermediate");
      const tracked=(...args)=>{
        const q=chemical(...args); stat.candidates+=q.generation.attempt+1;
        for(const r of q.generation.rejections) {if(r.stage==="intermediate")stat.profileRejects++;else if(r.stage==="chemical")stat.chemistryRejects++;else stat.oracleRejects++;}
        stat.maxChemicalRetries=Math.max(stat.maxChemicalRetries,q.generation.attempt);assertTarget(q);
        const key=getExerciseUniquenessKey(q);if(seen.has(key))stat.duplicateRejects++;else{seen.add(key);stat.accepted++;}return q;
      };
      let s=mode==="exam"?startExam(c,tracked):startPractice(c,tracked),previous=-1;
      if(mode==="practice")while(s.phase==="QUESTION") {
        stat.maxQuestionRetries=Math.max(stat.maxQuestionRetries,s.generationIndex-previous-1);previous=s.generationIndex;
        s=nextPracticeQuestion(submit(s,true,s.index*1000),tracked);
      } else if(s.phase==="EXAM_QUESTION")for(const slot of s.plan.slots) {
        stat.maxQuestionRetries=Math.max(stat.maxQuestionRetries,slot.generationIndex-previous-1);previous=slot.generationIndex;
      }
      if(s.phase==="ERROR"||s.phase==="EXAM_ERROR") {stat.exhaustions++;assert.equal(s.reason,"insufficient-unique-questions");if(mode==="exam")assert.deepEqual(s.attempts,[]);}
      else {assert.equal(seen.size,5);assert.equal(s.phase,mode==="practice"?"COMPLETE":"EXAM_QUESTION");}
    }
  }
  mkdirSync("outputs/difficulty-d3",{recursive:true});
  writeFileSync("outputs/difficulty-d3/session-sweep.json",JSON.stringify({elapsedMs:performance.now()-start,stats},null,2));
});
test("Class v2 fingerprints/seeds are frozen; v3 namespaces and CSV preserve original version/difficulty with schema 1", () => {
  const frozen=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d3-frozen-v2-session.json",import.meta.url)));
  const expected={basic:"a471c87b8da1343ebf2e30c57372d45f824e113aaabb91ebdf506dd9aefaf567",
    intermediate:"2da396172e466eb18d14dde9d6cf04aa53b81954bf73ad6b904b2461f0e5b978",
    advanced:"56f590cf932881b7fda94157af9a40543aae2d624fd359ad073418d412320498"};
  const namespaces=new Set(),rows=[];
  for(const version of [2,3])for(const difficulty of ["basic","intermediate","advanced"]) {
    const config=createClassAssignmentConfig({mode:"exam",questionCount:15,categories:["alkane","alcohol"],questionTypes:types,difficulty},"CHEM-4B-2026",version);
    const manifest=generateClassAssignments(config,["001","002"]);
    const fingerprint=classConfigFingerprint(config),seed=manifest.participants[0].sessionSeed;
    assert.equal(fingerprint,JSON.stringify(["class-config-v1","exam",15,["alkane","alcohol"],types,version,...(difficulty==="basic"?[]:[["difficulty",difficulty]])]));
    const digest=createHash("sha256").update(seed).digest("hex");if(version===2)assert.equal(digest,expected[difficulty]);
    namespaces.add(seed);assert.deepEqual(generateClassAssignments(config,["001","002"]),manifest);
    for(const locale of ["es","en"]) {
      const csv=serializeClassAssignmentCsv(manifest,locale),parsed=parseClassCsv(csv);
      assert.ok(csv.startsWith('\uFEFF"schema_version"'));assert.ok(csv.endsWith("\r\n"));assert.deepEqual(parsed.header,[...CLASS_ASSIGNMENT_CSV_COLUMNS]);
      assert.equal(csv.replaceAll("\r\n","").includes("\n"),false);
      if(version===2)assert.equal(createHash("sha256").update(csv).digest("hex"),frozen.classCsv.find(r=>r.difficulty===difficulty && r.locale===locale).csvSha256);
      for(const [i,row]of parsed.rows.entries())assert.deepEqual(reconstructClassSessionFromCsvRow(row),participantSessionConfig(config,manifest.participants[i],locale));
      rows.push({version,difficulty,locale,fingerprint,seedSha256:digest,csvSha256:createHash("sha256").update(csv).digest("hex")});
    }
  }
  assert.equal(namespaces.size,6);assert.equal(CLASS_SCHEMA_VERSION,1);assert.equal(CLASS_DERIVATION_VERSION,1);
  const c=createClassAssignmentConfig({mode:"exam",questionCount:6,categories:["alcohol","ether","ez"],questionTypes:types,difficulty:"intermediate"},"CHEM-4B-2026");
  for(const participant of generateClassAssignments(c,["001","002","003"]).participants) {
    const a=startExam(participantSessionConfig(c,participant,"es"),generate),b=startExam(participantSessionConfig(c,participant,"en"),generate);
    assert.equal(a.phase,"EXAM_QUESTION");assert.equal(b.phase,"EXAM_QUESTION");
    for(let i=0;i<6;i++) {assertTarget(a.plan.slots[i].question);assert.equal(a.plan.slots[i].generationIndex,b.plan.slots[i].generationIndex);
      assert.deepEqual(a.plan.slots[i].question.molecule,b.plan.slots[i].question.molecule);}
  }
  writeFileSync("outputs/difficulty-d3/class-seed.json",JSON.stringify(rows,null,2));
});
