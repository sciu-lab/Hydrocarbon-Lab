import assert from "node:assert/strict";
import test from "node:test";

import { createSeededRng, deriveSeed, seedToUint32 } from "../app/seeded-rng.ts";

const vector = [
  0.08202507765963674, 0.07884407718665898, 0.8340105426032096,
  0.9839546377770603, 0.32963780080899596, 0.93178107496351,
];

function sequence(seed, count = 100) {
  const rng = createSeededRng(seed);
  return Array.from({ length: count }, () => rng.next());
}

test("v1 freezes the hydrocarbon internal seed and exact Mulberry32 next vector", () => {
  assert.equal(seedToUint32("hydrocarbon"), 309391524);
  assert.deepEqual(sequence("hydrocarbon", vector.length), vector);
});

test("numeric-looking, public and class seeds have stable vectors", () => {
  for (const [seed, internal, expected] of [
    ["12345", 1136836824, [0.7282438434194773, 0.6955078737810254, 0.9925868620630354]],
    ["CHEM-A7F3", 3053609628, [0.3091235412284732, 0.24350319732911885, 0.30114621296525]],
    ["class-3b-student-17", 2167200324, [0.9108207682147622, 0.06001269747503102, 0.65576151618734]],
  ]) {
    assert.equal(seedToUint32(seed), internal);
    assert.deepEqual(sequence(seed, expected.length), expected);
  }
});

test("instances and restarts with the same seed reproduce long sequences", () => {
  assert.deepEqual(sequence("hydrocarbon", 10000), sequence("hydrocarbon", 10000));
  const consumed = createSeededRng("hydrocarbon");
  for (let index = 0; index < 1000; index += 1) consumed.next();
  assert.deepEqual(sequence("hydrocarbon", vector.length), vector);
});

test("clearly different seeds yield different sequences", () => {
  assert.notDeepEqual(sequence("hydrocarbon"), sequence("hydrocarbon-2"));
});

test("the seed contract preserves UTF-16, case and whitespace exactly", () => {
  assert.equal(seedToUint32("química🧪"), 3902560668);
  assert.deepEqual(sequence("química🧪", 3), [0.36240645544603467, 0.4045866532251239, 0.012804392958059907]);
  for (const variant of ["Hydrocarbon", " hydrocarbon", "hydrocarbon "]) {
    assert.notDeepEqual(sequence(variant), sequence("hydrocarbon"));
  }
  assert.notEqual(seedToUint32("é"), seedToUint32("e\u0301"));
});

test("seed inputs reject empty strings and implicit coercion", () => {
  for (const seed of ["", 12345, null, undefined, {}, ["seed"]]) {
    assert.throws(() => seedToUint32(seed), TypeError);
    assert.throws(() => createSeededRng(seed), TypeError);
  }
});

test("next always returns a finite number in [0, 1)", () => {
  const rng = createSeededRng("range-check");
  for (let index = 0; index < 50000; index += 1) {
    const value = rng.next();
    assert.ok(Number.isFinite(value) && value >= 0 && value < 1);
  }
});

test("int is deterministic with inclusive endpoints, including negative ranges", () => {
  const left = createSeededRng("hydrocarbon");
  const right = createSeededRng("hydrocarbon");
  const actual = Array.from({ length: 8 }, () => left.int(-5, 5));
  assert.deepEqual(actual, [1, 5, 3, 0, 2, 4, 3, 4]);
  assert.deepEqual(actual, Array.from({ length: 8 }, () => right.int(-5, 5)));
  const rng = createSeededRng("integer-range");
  const seen = new Set();
  for (let index = 0; index < 10000; index += 1) {
    const value = rng.int(-3, 7);
    assert.ok(Number.isInteger(value) && value >= -3 && value <= 7);
    seen.add(value);
  }
  assert.ok(seen.has(-3) && seen.has(7), "both inclusive endpoints can be selected");
});

test("int supports the full uint32 span and safe integer endpoints", () => {
  const rng = createSeededRng("hydrocarbon");
  assert.equal(rng.int(0, 0xffffffff), 352295026);
  assert.equal(rng.int(-0x80000000, 0x7fffffff), 338632733 - 0x80000000);
  for (const min of [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 10]) {
    for (let index = 0; index < 100; index += 1) {
      const value = rng.int(min, min + 10);
      assert.ok(Number.isSafeInteger(value) && value >= min && value <= min + 10);
    }
  }
});

test("singleton int and pick consume no entropy", () => {
  const rng = createSeededRng("hydrocarbon");
  assert.equal(rng.int(0, 0), 0);
  assert.equal(rng.int(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  assert.equal(rng.pick(["only"]), "only");
  assert.equal(rng.next(), vector[0]);
});

test("invalid int bounds throw and do not change RNG state", () => {
  const rng = createSeededRng("hydrocarbon");
  for (const [min, max] of [
    [2, 1], [1.5, 2], [0, 2.5], [NaN, 2], [0, Infinity],
    [-Infinity, 2], [0, 0x100000000], [0, Number.MAX_SAFE_INTEGER + 1],
    [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], ["0", 2],
  ]) {
    assert.throws(() => rng.int(min, max), RangeError);
  }
  assert.equal(rng.next(), vector[0]);
});

test("int rejection sampling skips values outside the unbiased interval", () => {
  const rng = createSeededRng("hydrocarbon");
  assert.deepEqual(Array.from({ length: 3 }, () => rng.int(0, 0x80000000)), [352295026, 338632733, 1415783574]);
  assert.equal(rng.next(), vector[5], "two rejected uint32 draws were consumed");
});

test("pick returns deterministic members without mutating the collection", () => {
  const items = Object.freeze([{ id: "a" }, { id: "b" }, { id: "c" }]);
  const left = createSeededRng("pick");
  const right = createSeededRng("pick");
  for (let index = 0; index < 100; index += 1) {
    const item = left.pick(items);
    assert.equal(item, right.pick(items));
    assert.ok(items.includes(item));
  }
  assert.deepEqual(items.map((item) => item.id), ["a", "b", "c"]);
});

test("pick rejects an empty collection without consuming entropy", () => {
  const rng = createSeededRng("hydrocarbon");
  assert.throws(() => rng.pick([]), RangeError);
  assert.equal(rng.next(), vector[0]);
});

test("shuffle freezes a deterministic Fisher–Yates vector and preserves the input", () => {
  const items = Object.freeze(["a", "b", "c", "d", "e", "f"]);
  const actual = createSeededRng("hydrocarbon").shuffle(items);
  assert.deepEqual(actual, ["f", "c", "a", "b", "d", "e"]);
  assert.deepEqual(actual, createSeededRng("hydrocarbon").shuffle(items));
  assert.deepEqual(items, ["a", "b", "c", "d", "e", "f"]);
  assert.notEqual(actual, items);
  assert.equal(actual.length, items.length);
  assert.deepEqual([...actual].sort(), [...items].sort());
});

test("shuffle retains duplicates, references and empty/singleton inputs as copies", () => {
  const object = { id: "object" };
  const items = Object.freeze([object, object, null, "a", "a"]);
  const actual = createSeededRng("duplicates").shuffle(items);
  assert.equal(actual.length, items.length);
  for (const item of new Set(items)) {
    assert.equal(actual.filter((value) => value === item).length, items.filter((value) => value === item).length);
  }
  const rng = createSeededRng("hydrocarbon");
  for (const input of [[], [object]]) {
    const copy = rng.shuffle(input);
    assert.deepEqual(copy, input);
    assert.notEqual(copy, input);
  }
  assert.equal(rng.next(), vector[0]);
});

test("seeded operations work when Math.random throws", () => {
  const original = Math.random;
  Math.random = () => { throw new Error("Unseeded randomness is forbidden"); };
  try {
    assert.deepEqual(sequence("hydrocarbon", vector.length), vector);
    const rng = createSeededRng(deriveSeed("public", "question:0"));
    assert.ok(rng.int(1, 10) >= 1);
    assert.ok(["a", "b"].includes(rng.pick(["a", "b"])));
    assert.equal(rng.shuffle([1, 2, 3]).length, 3);
  } finally {
    Math.random = original;
  }
});

test("deriveSeed freezes exact tuple framing and supports question:0, question:1 and question:10", () => {
  assert.equal(deriveSeed("CHEM-A7F3", "question:0"), '["hydrocarbon-lab-seed","CHEM-A7F3","question:0"]');
  const contexts = ["question:0", "question:1", "question:10"];
  const seeds = contexts.map((context) => deriveSeed("CHEM-A7F3", context));
  assert.equal(new Set(seeds).size, contexts.length);
  for (const context of contexts) {
    assert.equal(deriveSeed("CHEM-A7F3", context), deriveSeed("CHEM-A7F3", context));
    assert.notEqual(deriveSeed("CHEM-A7F3", context), deriveSeed("CHEM-B8G4", context));
  }
  assert.notDeepEqual(sequence(seeds[0]), sequence(seeds[1]));
  assert.notDeepEqual(sequence(seeds[1]), sequence(seeds[2]));
});

test("seed derivation distinguishes boundaries, escaping, Unicode and nested contexts", () => {
  assert.notEqual(deriveSeed("ab", "c"), deriveSeed("a", "bc"));
  assert.notEqual(deriveSeed("a:b", "c"), deriveSeed("a", "b:c"));
  const parent = 'química🧪\u0000"';
  const context = 'question:\\0\n';
  const seed = deriveSeed(parent, context);
  assert.deepEqual(JSON.parse(seed), ["hydrocarbon-lab-seed", parent, context]);
  assert.equal(deriveSeed(seed, "layout"), deriveSeed(deriveSeed(parent, context), "layout"));
  assert.notEqual(deriveSeed(parent, ""), deriveSeed(parent, " "));
  assert.throws(() => deriveSeed("", "context"), TypeError);
  assert.throws(() => deriveSeed("parent", 0), TypeError);
});
