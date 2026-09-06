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

test("formats alcohols and polyols in preferred and traditional systems", () => {
  assert.equal(applyNomenclatureConvention("pentan-2,3-diol", "current", "es"), "pentan-2,3-diol");
  assert.equal(applyNomenclatureConvention("pentan-2,3-diol", "traditional", "es"), "2,3-pentanodiol");
  assert.equal(applyNomenclatureConvention("etan-1,2-diol", "traditional", "es"), "1,2-etanodiol");
  assert.equal(applyNomenclatureConvention("propan-1,2-diol", "traditional", "es"), "1,2-propanodiol");
  assert.equal(applyNomenclatureConvention("propan-1,2,3-triol", "traditional", "es"), "1,2,3-propanotriol");
});

test("follows the requested Spanish traditional nomenclature table", () => {
  for (const [iupac, traditional] of [
    ["metanol", "metanol"],
    ["etan-1-ol", "etanol"], ["propan-1-ol", "propanol"], ["propan-2-ol", "2-propanol"],
    ["butan-1-ol", "butanol"], ["butan-2-ol", "2-butanol"],
    ["pentan-1-ol", "pentanol"], ["pentan-2-ol", "2-pentanol"], ["pentan-3-ol", "3-pentanol"],
    ["hexan-1-ol", "hexanol"], ["hexan-2-ol", "2-hexanol"], ["hexan-3-ol", "3-hexanol"],
    ["propan-1,2-diol", "1,2-propanodiol"], ["propan-1,3-diol", "1,3-propanodiol"],
    ["butan-1,4-diol", "1,4-butanodiol"], ["butan-2,3-diol", "2,3-butanodiol"],
    ["pentan-2,3-diol", "2,3-pentanodiol"],
    ["propan-2-ona", "propanona"], ["butan-2-ona", "2-butanona"],
    ["pentan-2-ona", "2-pentanona"], ["pentan-3-ona", "3-pentanona"],
    ["hexan-2-ona", "2-hexanona"], ["hexan-3-ona", "3-hexanona"],
    ["metanal", "metanal"], ["etanal", "etanal"], ["propanal", "propanal"],
    ["butanal", "butanal"], ["pentanal", "pentanal"], ["hexanal", "hexanal"],
    ["ácido metanoico", "ácido metanoico"], ["ácido etanoico", "ácido etanoico"],
    ["ácido propanoico", "ácido propanoico"], ["ácido butanoico", "ácido butanoico"],
    ["ácido pentanoico", "ácido pentanoico"], ["ácido hexanoico", "ácido hexanoico"],
  ]) {
    assert.equal(applyNomenclatureConvention(iupac, "traditional", "es"), traditional, iupac);
  }
});

test("moves locants without breaking substituents or leaving dangling hyphens", () => {
  for (const [iupac, traditional] of [
    ["2-metilpropan-1-ol", "2-metilpropanol"],
    ["3-cloropentan-2-ol", "3-cloro-2-pentanol"],
    ["but-2-eno", "2-buteno"], ["pent-2-eno", "2-penteno"],
    ["hex-3-eno", "3-hexeno"], ["pent-2-ino", "2-pentino"],
    ["4-cloropent-2-eno", "4-cloro-2-penteno"],
    ["2-bromo-3-clorobutano", "2-bromo-3-clorobutano"],
  ]) {
    const result = applyNomenclatureConvention(iupac, "traditional", "es");
    assert.equal(result, traditional, iupac);
    assert.equal(result.endsWith("-"), false, iupac);
  }
});

test("keeps preferred aldehyde locants and formats unsaturated ketones traditionally", () => {
  for (const [preferred, traditional] of [
    ["butan-1-al", "butanal"], ["pentan-1-al", "pentanal"], ["hexan-1-al", "hexanal"],
    ["pent-3-en-2-ona", "3-penten-2-ona"], ["hex-3-en-2-ona", "3-hexen-2-ona"],
    ["hex-4-en-2-ona", "4-hexen-2-ona"], ["but-3-en-2-ona", "3-buten-2-ona"],
    ["pent-4-en-2-ona", "4-penten-2-ona"],
  ]) {
    assert.equal(applyNomenclatureConvention(preferred, "current", "es"), preferred, preferred);
    assert.equal(applyNomenclatureConvention(preferred, "traditional", "es"), traditional, preferred);
  }
});

test("uses traditional systematic forms before optional retained common names", () => {
  assert.equal(applyNomenclatureConvention("propan-2-ol", "traditional", "en"), "2-propanol");
  assert.equal(applyNomenclatureConvention("hexan-3-one", "traditional", "en"), "3-hexanone");
  assert.equal(applyNomenclatureConvention("butan-2-amine", "traditional", "en"), "-");
  assert.equal(applyNomenclatureConvention("2-methylpropanoic acid", "traditional", "en"), "2-methylpropanoic acid");
  assert.equal(applyNomenclatureConvention("tetracontano", "traditional", "es"), "tetracontano");
  assert.equal(applyNomenclatureConvention("pentacontane", "traditional", "en"), "pentacontane");
});

test("keeps preferred IUPAC untouched while applying traditional formatting", () => {
  for (const [iupac, traditional] of [
    ["ethyne", "acetylene"],
    ["methylbenzene", "toluene"],
    ["propan-2-one", "propanone"],
    ["methanal", "methanal"],
    ["propan-2-ol", "2-propanol"],
  ]) {
    assert.equal(applyNomenclatureConvention(iupac, "current", "en"), iupac);
    assert.equal(applyNomenclatureConvention(iupac, "traditional", "en"), traditional);
  }

  assert.equal(applyNomenclatureConvention("etino", "traditional", "es"), "acetileno");
  assert.equal(applyNomenclatureConvention("metilbenceno", "traditional", "es"), "tolueno");
  assert.equal(applyNomenclatureConvention("propan-2-ona", "traditional", "es"), "propanona");
  assert.equal(applyNomenclatureConvention("metanal", "traditional", "es"), "metanal");
});

test("covers the extended common-name catalog by functional family", () => {
  for (const [iupac, traditional] of [
    ["methane", "methane"], ["ethane", "ethane"], ["propane", "propane"],
    ["ethene", "ethylene"], ["prop-1-yne", "1-propyne"],
    ["methanol", "methanol"], ["propan-1-ol", "propanol"],
    ["methoxymethane", "dimethyl ether"], ["methoxyethane", "ethyl methyl ether"], ["ethoxyethane", "diethyl ether"],
    ["ethanal", "ethanal"], ["propanal", "propanal"], ["butan-2-one", "2-butanone"],
    ["benzene", "benzene"], ["phenol", "phenol"], ["aniline", "aniline"], ["benzoic acid", "benzoic acid"],
    ["ethenylbenzene", "styrene"], ["naphthalene", "naphthalene"],
    ["methanoic acid", "methanoic acid"], ["ethanoic acid", "ethanoic acid"], ["propanoic acid", "propanoic acid"],
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
  assert.equal(applyNomenclatureConvention("(2E)-pent-2-ene", "traditional", "en"), "(2E)-2-pentene");
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
