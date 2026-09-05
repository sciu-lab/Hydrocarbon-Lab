import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNomenclatureConvention,
  nextNomenclatureConvention,
  stripStereochemicalDescriptors,
} from "../app/nomenclature-conventions.ts";
import {
  formatStereochemicalName,
  getMainChainStereoDescriptors,
} from "../app/double-bond-stereochemistry.ts";
import { translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";

function makeAromaticRing() {
  return {
    atoms: [1, 2, 3, 4, 5, 6].map((id) => ({ id, x: id, y: id % 2 })),
    bonds: [[1, 2, 2], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 6, 2], [6, 1, 1]],
    rings: [{ id: 1, kind: "aromatic", atomIds: [1, 2, 3, 4, 5, 6] }],
  };
}

function makeHex3Ene() {
  return {
    atoms: [
      { id: 1, x: -2.5, y: 1.4 },
      { id: 2, x: -1.3, y: 0.8 },
      { id: 3, x: 0, y: 0 },
      { id: 4, x: 1.4, y: 0 },
      { id: 5, x: 2.7, y: -0.8 },
      { id: 6, x: 3.9, y: -1.4 },
    ],
    bonds: [[1, 2, 1], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 6, 1]],
  };
}

function makeCyclohex1Ene() {
  return {
    atoms: [
      { id: 1, x: 0, y: -1 },
      { id: 2, x: 0.9, y: -0.5 },
      { id: 3, x: 0.9, y: 0.5 },
      { id: 4, x: 0, y: 1 },
      { id: 5, x: -0.9, y: 0.5 },
      { id: 6, x: -0.9, y: -0.5 },
    ],
    bonds: [[1, 2, 2], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 1, 1]],
    rings: [{ id: 1, kind: "cycloalkane", atomIds: [1, 2, 3, 4, 5, 6] }],
  };
}

test("formats polyfunctional alcohols in preferred and common systems", () => {
  assert.equal(applyNomenclatureConvention("pentan-2,3-diol", "current", "es"), "pentan-2,3-diol");
  assert.equal(applyNomenclatureConvention("pentan-2,3-diol", "traditional", "es"), "-");
  assert.equal(applyNomenclatureConvention("etan-1,2-diol", "traditional", "es"), "etilenglicol");
  assert.equal(applyNomenclatureConvention("propan-1,2-diol", "traditional", "es"), "propilenglicol");
  assert.equal(applyNomenclatureConvention("propan-1,2,3-triol", "traditional", "es"), "glicerina");
});

test("uses a dash when no retained traditional name exists", () => {
  assert.equal(applyNomenclatureConvention("propan-2-ol", "traditional", "en"), "isopropyl alcohol");
  assert.equal(applyNomenclatureConvention("hexan-3-one", "traditional", "en"), "-");
  assert.equal(applyNomenclatureConvention("butan-2-amine", "traditional", "en"), "-");
  assert.equal(applyNomenclatureConvention("2-methylpropanoic acid", "traditional", "en"), "-");
  assert.equal(applyNomenclatureConvention("tetracontano", "traditional", "es"), "tetracontano");
  assert.equal(applyNomenclatureConvention("pentacontane", "traditional", "en"), "pentacontane");
});

test("uses common traditional names while preserving the IUPAC current mode", () => {
  for (const [iupac, traditional] of [
    ["ethyne", "acetylene"],
    ["methylbenzene", "toluene"],
    ["propan-2-one", "acetone"],
    ["methanal", "formaldehyde"],
    ["propan-2-ol", "isopropyl alcohol"],
  ]) {
    assert.equal(applyNomenclatureConvention(iupac, "current", "en"), iupac);
    assert.equal(applyNomenclatureConvention(iupac, "traditional", "en"), traditional);
  }

  assert.equal(applyNomenclatureConvention("etino", "traditional", "es"), "acetileno");
  assert.equal(applyNomenclatureConvention("metilbenceno", "traditional", "es"), "tolueno");
  assert.equal(applyNomenclatureConvention("propan-2-ona", "traditional", "es"), "acetona");
  assert.equal(applyNomenclatureConvention("metanal", "traditional", "es"), "formaldehído");
});

test("covers the extended common-name catalog by functional family", () => {
  for (const [iupac, traditional] of [
    ["methane", "methane"], ["ethane", "ethane"], ["propane", "propane"],
    ["ethene", "ethylene"], ["prop-1-yne", "methylacetylene"],
    ["methanol", "methanol"], ["propan-1-ol", "propanol"],
    ["methoxymethane", "dimethyl ether"], ["methoxyethane", "ethyl methyl ether"], ["ethoxyethane", "diethyl ether"],
    ["ethanal", "acetaldehyde"], ["propanal", "propionaldehyde"], ["butan-2-one", "ethyl methyl ketone"],
    ["benzene", "benzene"], ["phenol", "phenol"], ["aniline", "aniline"], ["benzoic acid", "benzoic acid"],
    ["ethenylbenzene", "styrene"], ["naphthalene", "naphthalene"],
    ["methanoic acid", "formic acid"], ["ethanoic acid", "acetic acid"], ["propanoic acid", "propionic acid"],
  ]) {
    assert.equal(applyNomenclatureConvention(iupac, "traditional", "en"), traditional, iupac);
  }
});

test("normalizes the extended Spanish common-name catalog before OPSIN", () => {
  assert.equal(translateSpanishIupacToOpsin("acetileno"), "ethyne");
  assert.equal(translateSpanishIupacToOpsin("metilacetileno"), "propyne");
  assert.equal(translateSpanishIupacToOpsin("dimetil éter"), "methoxymethane");
  assert.equal(translateSpanishIupacToOpsin("formaldehído"), "methanal");
  assert.equal(translateSpanishIupacToOpsin("etil metil cetona"), "butan-2-one");
});

test("preserves E/Z independently from the preferred convention", () => {
  assert.equal(applyNomenclatureConvention("(2E)-pent-2-eno", "current", "es"), "(2E)-pent-2-eno");
  assert.equal(applyNomenclatureConvention("(2E)-pent-2-ene", "traditional", "en"), "-");
  assert.equal(stripStereochemicalDescriptors("(2Z)-pent-2-ene"), "pent-2-ene");
  assert.equal(stripStereochemicalDescriptors("ácido (2E)-hex-2-enoico"), "ácido hex-2-enoico");
});

test("uses the language-specific convention cycle", () => {
  assert.equal(nextNomenclatureConvention("current", "es"), "traditional");
  assert.equal(nextNomenclatureConvention("current", "en"), "traditional");
  assert.equal(nextNomenclatureConvention("traditional", "en"), "current");
});

test("never displays E/Z for benzene-derived aromatic rings", () => {
  for (const name of [
    "benceno",
    "fenol",
    "benceno-1,3,5-triol",
    "ácido 3-hidroxibenzoico",
  ]) {
    const molecule = makeAromaticRing();
    assert.deepEqual(getMainChainStereoDescriptors(molecule, [1, 2, 3, 4, 5, 6]), [], name);
    assert.equal(
      formatStereochemicalName(molecule, [1, 2, 3, 4, 5, 6], name),
      name,
      name,
    );
  }
});

test("never displays E/Z for cycloalkenes", () => {
  const molecule = makeCyclohex1Ene();
  assert.deepEqual(getMainChainStereoDescriptors(molecule, [1, 2, 3, 4, 5, 6]), []);
  assert.equal(
    formatStereochemicalName(molecule, [1, 2, 3, 4, 5, 6], "ciclohex-1-eno"),
    "ciclohex-1-eno",
  );
});

test("keeps E/Z available for a valid acyclic alkene", () => {
  const molecule = makeHex3Ene();
  assert.deepEqual(getMainChainStereoDescriptors(molecule, [1, 2, 3, 4, 5, 6]), [
    { atomIds: [3, 4], configuration: "E", locant: 3 },
  ]);
  assert.equal(
    formatStereochemicalName(molecule, [1, 2, 3, 4, 5, 6], "hex-3-eno"),
    "(3E)-hex-3-eno",
  );
});
