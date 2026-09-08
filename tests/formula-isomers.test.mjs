import assert from "node:assert/strict";
import test from "node:test";
import OCL from "openchemlib";

import {
  calculateDegreeOfUnsaturation,
  generateFormulaIsomers,
  parseMolecularFormula,
} from "../app/formula-isomers.ts";

test("parses plain and Unicode-subscript molecular formulas", () => {
  const plain = parseMolecularFormula("C6H12O");
  const unicode = parseMolecularFormula(" C₆H₁₂O ");
  const lowercase = parseMolecularFormula("c6h12o");
  assert.equal(plain.ok, true);
  assert.equal(unicode.ok, true);
  assert.equal(lowercase.ok, true);
  if (!plain.ok || !unicode.ok || !lowercase.ok) return;
  assert.deepEqual(unicode.atoms, plain.atoms);
  assert.deepEqual(lowercase.atoms, plain.atoms);
  assert.equal(plain.asciiFormula, "C6H12O");
  assert.equal(plain.formula, "C₆H₁₂O");
});

test("calculates the degree of unsaturation with halogens and oxygen handled correctly", () => {
  assert.equal(calculateDegreeOfUnsaturation({ C: 6, H: 14 }), 0);
  assert.equal(calculateDegreeOfUnsaturation({ C: 6, H: 12, O: 1 }), 1);
  assert.equal(calculateDegreeOfUnsaturation({ C: 2, H: 5, Cl: 1 }), 0);
});

test("returns the complete five-isomer catalog for C6H14", () => {
  const result = generateFormulaIsomers("C6H14");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.complete, true);
  assert.equal(result.isomers.length, 5);
  assert.deepEqual(
    result.isomers.map((isomer) => isomer.nameEs),
    ["hexano", "2-metilpentano", "3-metilpentano", "2,2-dimetilbutano", "2,3-dimetilbutano"],
  );
});

test("returns all seven constitutional isomers for C4H10O", () => {
  const result = generateFormulaIsomers("C₄H₁₀O");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.complete, true);
  assert.equal(result.isomers.length, 7);
  assert.ok(result.isomers.some((isomer) => isomer.nameEs === "butan-1-ol"));
  assert.ok(result.isomers.some((isomer) => isomer.nameEs === "etoxietano"));
  assert.ok(result.isomers.some((isomer) => isomer.nameEs === "2-metoxipropano"));
});

test("supports complete small amine and monohaloalkane catalogs", () => {
  const amines = generateFormulaIsomers("C3H9N");
  const chlorides = generateFormulaIsomers("C4H9Cl");
  assert.equal(amines.ok, true);
  assert.equal(chlorides.ok, true);
  if (!amines.ok || !chlorides.ok) return;
  assert.equal(amines.complete, true);
  assert.equal(amines.isomers.length, 4);
  assert.equal(chlorides.complete, true);
  assert.equal(chlorides.isomers.length, 4);
  assert.ok(chlorides.isomers.some((isomer) => isomer.nameEs === "2-cloro-2-metilpropano"));

  for (const formula of ["CH3F", "C3H7Br", "C4H9I"]) {
    const result = generateFormulaIsomers(formula);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.complete, true);
  }
});

test("labels broad catalogs as representative instead of falsely exhaustive", () => {
  const result = generateFormulaIsomers("C6H12O");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.complete, false);
  assert.equal(result.scope, "representative");
  assert.ok(result.isomers.some((isomer) => isomer.nameEs === "hexanal"));
  assert.ok(result.isomers.some((isomer) => isomer.nameEs === "ciclohexanol"));
});

test("every catalog SMILES resolves to the requested molecular formula", () => {
  for (const formula of ["C6H14", "C4H10O", "C3H9N", "C4H9Cl", "C3H6O", "C5H10", "C6H12O"]) {
    const result = generateFormulaIsomers(formula);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    for (const isomer of result.isomers) {
      const molecularFormula = OCL.Molecule.fromSmiles(isomer.smiles).getMolecularFormula().formula;
      assert.equal(molecularFormula, formula, `${isomer.nameEs} must match ${formula}`);
    }
  }
});

test("rejects malformed or chemically impossible formulas", () => {
  assert.equal(generateFormulaIsomers("C6H12O-").ok, false);
  assert.equal(generateFormulaIsomers("H2O").ok, false);
  assert.equal(generateFormulaIsomers("C2H9").ok, false);
});
