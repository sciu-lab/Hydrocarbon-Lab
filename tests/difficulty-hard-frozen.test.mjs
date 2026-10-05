import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { GENERATOR_VERSION, SUPPORTED_GENERATOR_VERSIONS } from "../app/exercise-model.ts";
import { exerciseGenerationProfile, exerciseDomainPolicy } from "../app/exercise-generation-profile.ts";
import { createClassAssignmentConfig, generateClassAssignments, classConfigFingerprint, participantSessionConfig,
  CLASS_SCHEMA_VERSION, CLASS_DERIVATION_VERSION } from "../app/class-assignment.ts";
import { serializeClassAssignmentCsv, reconstructClassSessionFromCsvRow, CLASS_ASSIGNMENT_CSV_COLUMNS } from "../app/class-assignment-csv.ts";
import { parseClassCsv } from "./helpers/class-csv-parser.mjs";

test("D4 preserves all v3 difficulty plans captured before foundation edits in fresh ES/EN processes",()=>{
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d4-frozen-v3-session.json",import.meta.url)));
  assert.equal(fixture.capturedAtHead,"e4f9d2f");assert.equal(GENERATOR_VERSION,4);assert.deepEqual(SUPPORTED_GENERATOR_VERSIONS,[1,2,3,4]);
  for(const locale of ["es","en"]) {
    const source=`import {captureDifficultySessions} from './tests/helpers/difficulty-session-snapshot.mjs';
      const sessions={};for(const d of ['basic','intermediate','advanced'])sessions[d]=await captureDifficultySessions(d,'${locale}',3);
      console.log('SNAPSHOT='+JSON.stringify(sessions));`;
    const actual=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",source],{encoding:"utf8",timeout:120000}).split("SNAPSHOT=")[1].trim());
    assert.deepEqual(actual,fixture.sessions);
  }
  for(const v of [1,2,3]) {
    assert.equal(exerciseGenerationProfile({generatorVersion:v,difficulty:"advanced"}),"legacy");
    assert.equal(exerciseDomainPolicy({generatorVersion:v}),v===3?"intermediate":"legacy");
  }
});

test("D4 freezes complete CHEM-4B-2026 fingerprints, participant seeds and CSV bytes for v1/v2/v3",()=>{
  const fixture=JSON.parse(readFileSync(new URL("./fixtures/difficulty-d4-frozen-v3-session.json",import.meta.url)));
  assert.equal(CLASS_SCHEMA_VERSION,1);assert.equal(CLASS_DERIVATION_VERSION,1);
  for(const row of fixture.classAssignments) {
    const selection={mode:"exam",questionCount:15,categories:["alkane","alcohol"],questionTypes:["naming","multiple-choice","build"],difficulty:row.difficulty};
    const config=createClassAssignmentConfig(selection,"CHEM-4B-2026",row.version);
    const manifest=generateClassAssignments(config,["001","002"]);
    assert.equal(classConfigFingerprint(config),row.fingerprint);assert.deepEqual(manifest.participants,row.participants);
    if(row.difficulty==="basic") {
      const legacy={...selection};delete legacy.difficulty;
      assert.deepEqual(generateClassAssignments(createClassAssignmentConfig(legacy,"CHEM-4B-2026",row.version),["001","002"]),manifest);
    }
    for(const {locale,sha256} of row.csv) {
      const csv=serializeClassAssignmentCsv(manifest,locale),parsed=parseClassCsv(csv);
      assert.equal(createHash("sha256").update(csv).digest("hex"),sha256);
      assert.ok(csv.startsWith('\uFEFF"schema_version"'));assert.ok(csv.endsWith("\r\n"));
      assert.equal(csv.replaceAll("\r\n","").includes("\n"),false);assert.deepEqual(parsed.header,[...CLASS_ASSIGNMENT_CSV_COLUMNS]);
      for(const [i,record]of parsed.rows.entries())assert.deepEqual(reconstructClassSessionFromCsvRow(record),participantSessionConfig(config,manifest.participants[i],locale));
    }
  }
});
