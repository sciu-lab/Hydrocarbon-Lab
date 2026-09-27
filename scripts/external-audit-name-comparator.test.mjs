import assert from "node:assert/strict";
import { test } from "node:test";
import { compareEzDescriptors } from "./external-audit-name-comparator.mjs";

for (const [referenceName, generatedName, geometry] of [
  ["(E)-but-2-ene", "(2E)-but-2-eno", "E"],
  ["(Z)-but-2-ene", "(2Z)-but-2-eno", "Z"],
  ["(E)-hex-3-ene", "(3E)-hex-3-eno", "E"],
  ["(Z)-hex-3-ene", "(3Z)-hex-3-eno", "Z"],
  ["(E)-but-2-ene", "(E)-but-2-eno", "E"],
  ["(Z)-but-2-ene", "(Z)-but-2-eno", "Z"],
  ["(2E)-but-2-ene", "(E)-but-2-eno", "E"],
]) {
  test(`${generatedName} matches ${referenceName} and the defined structure`, () => {
    assert.equal(compareEzDescriptors({
      referenceName, generatedName, structureConfigurations: [geometry],
    }).status, "PASS");
  });
}

for (const [referenceName, generatedName, geometry] of [
  ["(E)-but-2-ene", "(2Z)-but-2-eno", "E"],
  ["(Z)-but-2-ene", "(2E)-but-2-eno", "Z"],
  ["(E)-but-2-ene", "but-2-eno", "E"],
  ["but-2-ene", "(2E)-but-2-eno", null],
  ["(E)-but-2-ene", "(3E)-but-2-eno", "E"],
  ["(3E)-hex-3-ene", "(2E)-hex-2-eno", "E"],
]) {
  test(`${generatedName} rejects incorrect or unsupported E/Z for ${referenceName}`, () => {
    assert.equal(compareEzDescriptors({
      referenceName, generatedName, structureConfigurations: [geometry],
    }).status, "FAIL");
  });
}

test("a structure and name with unspecified E/Z are not penalized", () => {
  assert.equal(compareEzDescriptors({
    referenceName: "but-2-ene",
    generatedName: "but-2-eno",
    structureConfigurations: [null],
  }).status, "PASS");
});

test("multiple E/Z descriptors retain their locant-to-geometry mapping", () => {
  const referenceName = "(2E,4Z)-hexa-2,4-diene";
  assert.equal(compareEzDescriptors({
    referenceName,
    generatedName: "(2E,4Z)-hexa-2,4-dieno",
    structureConfigurations: ["E", "Z"],
  }).status, "PASS");
  assert.equal(compareEzDescriptors({
    referenceName,
    generatedName: "(2Z,4E)-hexa-2,4-dieno",
    structureConfigurations: ["E", "Z"],
  }).status, "FAIL");
});
