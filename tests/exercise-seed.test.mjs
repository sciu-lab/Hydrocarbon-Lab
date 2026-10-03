import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { deriveGenerationIdentity, deriveQuestionIdentity } from "../app/exercise-seed.ts";
import { normalizeSessionConfig, serializeSessionConfig } from "../app/exercise-model.ts";
import { createSeededRng } from "../app/seeded-rng.ts";

const config = {
  mode: "practice", questionCount: 12, questionTypes: ["naming"],
  categories: ["alcohol", "alkane"], difficulty: "basic", locale: "es",
  seed: "CHEM-A7F3", generatorVersion: 1,
};

function draws(seed, count = 20) {
  const rng = createSeededRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

test("question identity freezes complete configuration framing and zero-based index", () => {
  const expectedConfig = '{"mode":"practice","questionCount":12,"questionTypes":["naming"],"categories":["alkane","alcohol"],"difficulty":"basic","locale":"es","seed":"CHEM-A7F3","generatorVersion":1}';
  const expectedSeed = JSON.stringify(["hydrocarbon-lab-seed", expectedConfig, "question:0"]);
  assert.deepEqual(deriveQuestionIdentity(config, 0), {
    id: `exercise:${expectedSeed}`, seed: expectedSeed, generatorVersion: 1,
  });
});

test("equivalent object and selection ordering yields identical question IDs, seeds and streams", () => {
  const reordered = Object.fromEntries(Object.entries({
    ...config, categories: ["alkane", "alcohol", "alkane"], questionTypes: ["naming", "naming"],
  }).reverse());
  for (const index of [0, 1, 10]) {
    const left = deriveQuestionIdentity(config, index);
    const right = deriveQuestionIdentity(reordered, index);
    assert.deepEqual(left, right);
    assert.deepEqual(draws(left.seed), draws(right.seed));
  }
});

test("question:0, question:1 and question:10 are distinct independent contexts", () => {
  const identities = [0, 1, 10].map((index) => deriveQuestionIdentity(config, index));
  assert.equal(new Set(identities.map((item) => item.id)).size, 3);
  assert.equal(new Set(identities.map((item) => item.seed)).size, 3);
  assert.notDeepEqual(draws(identities[0].seed), draws(identities[1].seed));
  assert.notDeepEqual(draws(identities[1].seed), draws(identities[2].seed));
});

test("extra draws in question 2 do not alter question 4", () => {
  const question4 = deriveQuestionIdentity(config, 4);
  const expected = draws(question4.seed);
  const question2Rng = createSeededRng(deriveQuestionIdentity(config, 2).seed);
  for (let index = 0; index < 10000; index += 1) question2Rng.next();
  assert.deepEqual(deriveQuestionIdentity(config, 4), question4);
  assert.deepEqual(draws(question4.seed), expected);
});

test("meaningful configuration differences produce different exercise contexts", () => {
  const original = deriveQuestionIdentity(config, 0);
  for (const change of [
    { mode: "exam" }, { questionCount: 13 }, { questionCount: "endless" },
    { seed: "CHEM-B8G4" }, { locale: "en" }, { difficulty: "advanced" },
    { categories: ["ether"] }, { questionTypes: ["multiple-choice"] }, { questionTypes: ["build"] },
  ]) {
    const different = deriveQuestionIdentity({ ...config, ...change }, 0);
    assert.notEqual(different.id, original.id);
    assert.notEqual(different.seed, original.seed);
  }
  assert.throws(() => deriveQuestionIdentity({ ...config, generatorVersion: 3 }, 0), RangeError);
});

test("configuration and question metadata JSON round-trips reconstruct the same sequence", () => {
  const restored = normalizeSessionConfig(JSON.parse(serializeSessionConfig(config)));
  const identity = deriveQuestionIdentity(config, 10);
  assert.deepEqual(deriveQuestionIdentity(restored, 10), identity);
  assert.deepEqual(JSON.parse(JSON.stringify(identity)), identity);
  assert.deepEqual(draws(deriveQuestionIdentity(restored, 10).seed), draws(identity.seed));
});

test("indices reject fractional, negative and unsafe values and support endless contexts", () => {
  for (const index of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0"]) {
    assert.throws(() => deriveQuestionIdentity(config, index), RangeError);
  }
  const endless = { ...config, questionCount: "endless" };
  assert.deepEqual(deriveQuestionIdentity(endless, Number.MAX_SAFE_INTEGER), deriveQuestionIdentity(endless, Number.MAX_SAFE_INTEGER));
});

test("session reconstruction matches in two fresh Node processes with entropy and clock APIs disabled", () => {
  const seedModule = new URL("../app/exercise-seed.ts", import.meta.url).href;
  const rngModule = new URL("../app/seeded-rng.ts", import.meta.url).href;
  const source = `
    const { deriveQuestionIdentity } = await import(${JSON.stringify(seedModule)});
    const { createSeededRng } = await import(${JSON.stringify(rngModule)});
    Math.random = () => { throw new Error("Math.random forbidden"); };
    globalThis.Date = class { constructor() { throw new Error("Date forbidden"); } static now() { throw new Error("Date.now forbidden"); } };
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: () => { throw new Error("randomUUID forbidden"); } });
    const config = JSON.parse(${JSON.stringify(serializeSessionConfig(config))});
    console.log(JSON.stringify([0, 1, 10].map((index) => {
      const identity = deriveQuestionIdentity(config, index);
      const rng = createSeededRng(identity.seed);
      return { identity, values: [rng.next(), rng.int(-5, 5), rng.pick(["a", "b"]), rng.shuffle([1, 2, 3])] };
    })));
  `;
  const run = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8" }));
  const first = run();
  assert.deepEqual(run(), first);
  const expected = [0, 1, 10].map((index) => {
    const identity = deriveQuestionIdentity(config, index);
    const rng = createSeededRng(identity.seed);
    return { identity, values: [rng.next(), rng.int(-5, 5), rng.pick(["a", "b"]), rng.shuffle([1, 2, 3])] };
  });
  assert.deepEqual(first, expected);
});

test("generation identity is locale-neutral while preserving v1 ES seeds and localized session identity", () => {
  const english = Object.freeze({ ...config, locale: "en" });
  for (const index of [0, 1, 10]) {
    const original = deriveQuestionIdentity(config, index);
    const es = deriveGenerationIdentity(config, index);
    const en = deriveGenerationIdentity(english, index);
    assert.deepEqual(es, original);
    assert.deepEqual(en, es);
    assert.deepEqual(draws(en.seed), draws(es.seed));
    assert.notEqual(deriveQuestionIdentity(english, index).seed, original.seed);
  }
  assert.equal(english.locale, "en");
  assert.equal(normalizeSessionConfig(english).locale, "en");
  assert.equal(JSON.parse(serializeSessionConfig(english)).locale, "en");
});

test("generation identity retains canonical ordering, index isolation and all other v1 seed fields", () => {
  const original = deriveGenerationIdentity(config, 0);
  const reordered = Object.fromEntries(Object.entries({
    ...config, locale: "en", categories: ["alkane", "alcohol", "alkane"],
  }).reverse());
  assert.deepEqual(deriveGenerationIdentity(reordered, 0), original);
  for (const change of [
    { mode: "exam" }, { questionCount: 13 }, { questionCount: "endless" },
    { seed: "CHEM-B8G4" }, { difficulty: "advanced" },
    { categories: ["ether"] }, { questionTypes: ["naming", "build"] },
  ]) {
    assert.notEqual(deriveGenerationIdentity({ ...config, ...change }, 0).seed, original.seed);
  }
  assert.notEqual(deriveGenerationIdentity(config, 1).seed, original.seed);
  assert.notEqual(deriveGenerationIdentity(config, 10).seed, original.seed);
  const restored = normalizeSessionConfig(JSON.parse(serializeSessionConfig(reordered)));
  assert.deepEqual(deriveGenerationIdentity(restored, 0), original);
});

test("generation projection validates the original locale, version and index before deriving seeds", () => {
  for (const locale of ["fr", undefined, null]) {
    assert.throws(() => deriveGenerationIdentity({ ...config, locale }, 0), TypeError);
  }
  assert.throws(() => deriveGenerationIdentity({ ...config, generatorVersion: 3 }, 0), RangeError);
  for (const index of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "0"]) {
    assert.throws(() => deriveGenerationIdentity(config, index), RangeError);
  }
  const endless = { ...config, questionCount: "endless" };
  assert.deepEqual(deriveGenerationIdentity(endless, Number.MAX_SAFE_INTEGER),
    deriveGenerationIdentity({ ...endless, locale: "en" }, Number.MAX_SAFE_INTEGER));
});
