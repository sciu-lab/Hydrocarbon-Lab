import assert from "node:assert/strict";
import test from "node:test";
import OCL from "openchemlib";
import { readFile } from "node:fs/promises";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

import {
  calculateDegreeOfUnsaturation,
  generateFormulaIsomers,
  normalizeMolecularFormulaCapitalization,
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

test("adds only the requested representative formula catalogs with verified structures", () => {
  const expected = {
    C2H4: ["ethene"],
    C2H2: ["ethyne"],
    C6H6: ["benzene"],
    C6H12: ["cyclohexane", "hex-1-ene"],
    C7H8: ["toluene"],
    C8H10: ["ethylbenzene", "1,2-dimethylbenzene", "1,3-dimethylbenzene", "1,4-dimethylbenzene"],
  };

  for (const [formula, names] of Object.entries(expected)) {
    const result = generateFormulaIsomers(formula);
    assert.equal(result.ok, true, `${formula} should parse and validate`);
    if (!result.ok) continue;
    assert.equal(result.scope, "representative", `${formula} must not claim exhaustive coverage`);
    assert.deepEqual(result.isomers.map((isomer) => isomer.nameEn), names);

    const canonicalStructures = new Set();
    for (const isomer of result.isomers) {
      const oclMolecule = OCL.Molecule.fromSmiles(isomer.smiles);
      assert.equal(oclMolecule.getMolecularFormula().formula, formula, `${isomer.nameEn} formula`);
      canonicalStructures.add(oclMolecule.toSmiles());
      const converted = moleculeFromSmiles(isomer.smiles);
      assert.equal(converted.ok, true, `${isomer.nameEn} must be accepted by the editor adapter`);
      if (converted.ok) {
        assert.ok(converted.molecule.atoms.length > 0);
        assert.ok(converted.molecule.bonds.length >= converted.molecule.atoms.length - 1);
        const neighbors = new Map(converted.molecule.atoms.map(({ id }) => [id, []]));
        const valence = new Map(converted.molecule.atoms.map(({ id }) => [id, 0]));
        for (const [left, right, order = 1] of converted.molecule.bonds) {
          neighbors.get(left).push(right);
          neighbors.get(right).push(left);
          valence.set(left, valence.get(left) + order);
          valence.set(right, valence.get(right) + order);
        }
        const reached = new Set();
        const pending = [converted.molecule.atoms[0].id];
        while (pending.length) {
          const atomId = pending.pop();
          if (reached.has(atomId)) continue;
          reached.add(atomId);
          pending.push(...neighbors.get(atomId));
        }
        assert.equal(reached.size, converted.molecule.atoms.length, `${isomer.nameEn} must be connected`);
        assert.ok([...valence.values()].every((atomValence) => atomValence <= 4), `${isomer.nameEn} carbon valences must be valid`);
      }
    }
    assert.equal(canonicalStructures.size, result.isomers.length, `${formula} must not contain duplicate connectivities`);
  }
});

test("xylene catalog entries preserve ortho, meta, and para ring positions", () => {
  const distances = { "1,2-dimethylbenzene": 1, "1,3-dimethylbenzene": 2, "1,4-dimethylbenzene": 3 };
  const result = generateFormulaIsomers("C8H10");
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const [name, expectedDistance] of Object.entries(distances)) {
    const isomer = result.isomers.find((candidate) => candidate.nameEn === name);
    assert.ok(isomer, `${name} should be present`);
    const converted = moleculeFromSmiles(isomer.smiles);
    assert.equal(converted.ok, true);
    if (!converted.ok) continue;

    const ringAtoms = converted.molecule.rings?.[0]?.atomIds ?? [];
    assert.equal(ringAtoms.length, 6, `${name} should contain a six-membered ring`);
    const ringSet = new Set(ringAtoms);
    const ringNeighbors = new Map(ringAtoms.map((id) => [id, []]));
    for (const [left, right] of converted.molecule.bonds) {
      if (ringSet.has(left) && ringSet.has(right)) {
        ringNeighbors.get(left).push(right);
        ringNeighbors.get(right).push(left);
      }
    }
    const substituentRingAtoms = converted.molecule.bonds.flatMap(([left, right]) => {
      if (!ringSet.has(left) && ringSet.has(right)) return [right];
      if (!ringSet.has(right) && ringSet.has(left)) return [left];
      return [];
    });
    assert.equal(substituentRingAtoms.length, 2, `${name} should have two ring substituents`);

    const [start, target] = substituentRingAtoms;
    const queue = [[start, 0]];
    const seen = new Set();
    let distance;
    while (queue.length) {
      const [atomId, steps] = queue.shift();
      if (atomId === target) { distance = steps; break; }
      if (seen.has(atomId)) continue;
      seen.add(atomId);
      for (const neighbor of ringNeighbors.get(atomId) ?? []) queue.push([neighbor, steps + 1]);
    }
    assert.equal(distance, expectedDistance, `${name} substituents should have the expected ring separation`);
  }
});

test("valid formulas without catalog entries remain distinct from invalid formulas", async () => {
  const validWithoutCatalog = generateFormulaIsomers("C6H12O6");
  const invalid = generateFormulaIsomers("C6H12O-");
  assert.equal(validWithoutCatalog.ok, true);
  if (validWithoutCatalog.ok) {
    assert.equal(validWithoutCatalog.scope, "unsupported");
    assert.equal(validWithoutCatalog.isomers.length, 0);
  }
  assert.equal(invalid.ok, false);

  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /kind: "info",\s*message: language === "en"\s*\? "Valid molecular formula, but no verified structures are available in the catalog yet\."/);
  assert.match(page, /formulaFeedback\.kind === "error" \? "alert" : "status"/);
});

test("capitalizes admitted formula symbols without changing input length or parser meaning", () => {
  const examples = [
    ["c6h12o6", "C6H12O6", "C₆H₁₂O₆"],
    ["C6H12O6", "C6H12O6", "C₆H₁₂O₆"],
    ["c2h6o", "C2H6O", "C₂H₆O"],
    ["ch3cl", "CH3Cl", "CH₃Cl"],
    ["ch3br", "CH3Br", "CH₃Br"],
  ];
  for (const [input, ascii, display] of examples) {
    const normalized = normalizeMolecularFormulaCapitalization(input);
    assert.equal(normalized, ascii);
    assert.equal(normalized.length, input.length, "capitalization should preserve caret offsets");
    const parsed = parseMolecularFormula(normalized);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.asciiFormula, ascii);
      assert.equal(parsed.formula, display);
    }
  }
  assert.equal(normalizeMolecularFormulaCapitalization("cl"), "Cl");
  assert.equal(normalizeMolecularFormulaCapitalization("br"), "Br");
  assert.equal(parseMolecularFormula("Cl").ok, false, "isolated halogens still require carbon");
  assert.equal(parseMolecularFormula("Br").ok, false, "isolated halogens still require carbon");
  assert.equal(normalizeMolecularFormulaCapitalization("hello world"), "hello world");

  const pasted = normalizeMolecularFormulaCapitalization("c6h12o6");
  assert.equal(pasted, "C6H12O6");
  const editedInMiddle = `${pasted.slice(0, 2)}h${pasted.slice(3)}`;
  assert.equal(normalizeMolecularFormulaCapitalization(editedInMiddle), "C6H12O6");
  const erased = pasted.slice(0, -1);
  assert.equal(normalizeMolecularFormulaCapitalization(erased), "C6H12O");
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
