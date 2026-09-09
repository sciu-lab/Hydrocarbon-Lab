import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import {
  addSubstituents,
  generarNombreTradicional,
  getPriorityGroup,
} from "../app/traditional-nomenclature.ts";

function structure(carbonCount, overrides = {}) {
  return {
    carbonCount,
    bondType: "simple",
    bondPositions: [],
    groups: [],
    mainChain: "",
    substituents: [],
    family: "acyclic",
    ...overrides,
  };
}

test("generates traditional alcohol and polyol names from structure", () => {
  for (const [input, expected] of [
    [structure(6, { groups: [{ pos: 1, type: "alcohol" }] }), "hexanol"],
    [structure(6, { groups: [{ pos: 2, type: "alcohol" }] }), "2-hexanol"],
    [structure(4, { groups: [{ pos: 1, type: "alcohol" }, { pos: 4, type: "alcohol" }] }), "1,4-butanodiol"],
    [structure(5, { groups: [{ pos: 2, type: "alcohol" }, { pos: 3, type: "alcohol" }] }), "2,3-pentanodiol"],
  ]) {
    assert.equal(generarNombreTradicional(input), expected);
  }
});

test("applies the traditional rules for aldehydes, ketones and acids", () => {
  assert.equal(
    generarNombreTradicional(structure(6, { groups: [{ pos: 1, type: "aldehyde" }] })),
    "hexanal",
  );
  assert.equal(
    generarNombreTradicional(structure(5, { groups: [{ pos: 2, type: "ketone" }] })),
    "2-pentanona",
  );
  assert.equal(
    generarNombreTradicional(structure(3, { groups: [{ pos: 2, type: "ketone" }] })),
    "propanona",
  );
  assert.equal(
    generarNombreTradicional(structure(3, { groups: [{ pos: 1, type: "acid" }] })),
    "ácido propanoico",
  );
});

test("moves alkene and alkyne locants before the traditional parent", () => {
  assert.equal(
    generarNombreTradicional(structure(4, {
      bondType: "doble",
      bondPositions: [2],
    })),
    "2-buteno",
  );
  assert.equal(
    generarNombreTradicional(structure(5, {
      bondType: "triple",
      bondPositions: [2],
    })),
    "2-pentino",
  );
  assert.equal(
    generarNombreTradicional(structure(4, {
      bondType: "doble",
      bondPositions: [1, 3],
    })),
    "1,3-butadieno",
  );
});

test("honors functional-group priority and alphabetizes substituents", () => {
  const input = structure(5, {
    groups: [
      { pos: 2, type: "alcohol" },
      { pos: 3, type: "halide", name: "cloro" },
    ],
    substituents: [{ pos: 3, name: "cloro" }],
  });
  assert.equal(getPriorityGroup(input), "alcohol");
  assert.equal(generarNombreTradicional(input), "3-cloro-2-pentanol");

  assert.equal(
    addSubstituents("butano", [
      { pos: 3, name: "cloro" },
      { pos: 2, name: "bromo" },
    ]),
    "2-bromo-3-clorobutano",
  );
});

test("preserves complex substituents as parenthesized units", () => {
  assert.equal(
    generarNombreTradicional(structure(5, {
      parentCarbonCount: 4,
      substituents: [{ pos: 2, name: "clorometil", complex: true }],
    })),
    "2-(clorometil)butano",
  );

  assert.equal(
    generarNombreTradicional(structure(12, {
      parentCarbonCount: 7,
      groups: [{ pos: 1, type: "acid" }],
      substituents: [
        { pos: 5, name: "metil" },
        { pos: 4, name: "metoxicarbonil", complex: true },
        { pos: 2, name: "etil" },
      ],
    })),
    "ácido 2-etil-5-metil-4-(metoxicarbonil)heptanoico",
  );
});

test("retains C1 only for branched primary alcohols", () => {
  assert.equal(
    generarNombreTradicional(structure(4, {
      parentCarbonCount: 3,
      groups: [{ pos: 1, type: "alcohol" }],
      substituents: [{ pos: 2, name: "metil" }],
      hasBranches: true,
    })),
    "2-metilpropan-1-ol",
  );
});

test("generates ester and ether class names without a parser", () => {
  assert.equal(
    generarNombreTradicional(structure(2, {
      groups: [{ pos: 1, type: "ester", alkylNames: ["metilo"] }],
    })),
    "etanoato de metilo",
  );
  assert.equal(
    generarNombreTradicional(structure(2, {
      groups: [{ pos: 1, type: "ether", alkylNames: ["metil", "etil"] }],
    })),
    "etil metil éter",
  );
  assert.equal(
    generarNombreTradicional(structure(1, {
      groups: [{ pos: 1, type: "ether", alkylNames: ["metil", "metil"] }],
    })),
    "dimetil éter",
  );
});

test("keeps structural generation comfortably below 100 ms per name", () => {
  const input = structure(22, {
    parentCarbonCount: 20,
    groups: [{ pos: 2, type: "alcohol" }],
    substituents: [
      { pos: 3, name: "bromo" },
      { pos: 5, name: "metil" },
      { pos: 8, name: "clorometil", complex: true },
    ],
  });
  const iterations = 2_000;
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) generarNombreTradicional(input);
  const averageMilliseconds = (performance.now() - started) / iterations;
  assert.ok(averageMilliseconds < 100, `average was ${averageMilliseconds.toFixed(3)} ms`);
});
