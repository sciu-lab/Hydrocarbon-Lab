import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("v4 Hard all-category three-type plans repeat exactly in three fresh ES/EN processes", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/difficulty-d5-hard-v4-session.json", import.meta.url)));
  assert.equal(fixture.capturedAtHead, "3f31484"); assert.equal(fixture.snapshot.generatorVersion, 4);
  assert.equal(fixture.snapshot.runs.length, 17);
  for (const locale of ["es", "es", "en"]) {
    const script = `import {captureHardV4Snapshot} from './tests/helpers/difficulty-hard-v4-snapshot.mjs';
      console.log('SNAPSHOT='+JSON.stringify(await captureHardV4Snapshot('${locale}')));`;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 600000 });
    assert.deepEqual(JSON.parse(output.split("SNAPSHOT=")[1].trim()), fixture.snapshot);
  }
  for (const run of fixture.snapshot.runs) {
    assert.equal(run.config.difficulty, "advanced"); assert.equal(run.config.generatorVersion, 4);
    assert.deepEqual(run.questions.map(q => q.type).sort(), ["build", "multiple-choice", "naming"]);
    for (const q of run.questions) { assert.ok(q.structuralIdentity && q.payloadSha256 && q.family); assert.ok(q.generationIndex >= q.displayOrdinal - 1); }
  }
});
