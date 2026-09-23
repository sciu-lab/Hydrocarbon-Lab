import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { applyNomenclatureConvention } from "../app/nomenclature-conventions.ts";
import { translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";
import {
  compareLocantSets,
  compareNumberings,
  compareParentCandidates,
  FUNCTIONAL_GROUP_FORMS,
  generateLegacyEnglishName,
  getAlphabetizationKey,
  IUPAC_1979_LEGACY_ENGLISH_PROFILE,
  legacyEnglishVariantIsAvailable,
  nameSubstituents,
  resolveFunctionalHierarchy,
} from "../app/legacy-english-nomenclature.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let buildLegacyEnglishNameModel;
let legacyEnglishProfileIsSupportedForMolecule;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, buildLegacyEnglishNameModel, legacyEnglishProfileIsSupportedForMolecule } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => server?.close());

function fromSmiles(smiles) {
  const converted = moleculeFromSmiles(smiles);
  assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
  return converted.molecule;
}

function legacyName(molecule) {
  const analysis = analyzeMolecule(molecule);
  const model = buildLegacyEnglishNameModel(molecule, analysis);
  return generateLegacyEnglishName(model);
}

function linearAlkane(carbonCount) {
  return {
    atoms: Array.from({ length: carbonCount }, (_, index) => ({ id: index + 1, x: index, y: 0 })),
    bonds: Array.from({ length: carbonCount - 1 }, (_, index) => [index + 1, index + 2, 1]),
  };
}

function carbonRing(size) {
  const atoms = Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    x: Math.cos((index * 2 * Math.PI) / size),
    y: Math.sin((index * 2 * Math.PI) / size),
  }));
  return {
    atoms,
    bonds: atoms.map((atom, index) => [atom.id, atoms[(index + 1) % size].id, 1]),
    rings: [{ id: 1, kind: "cycloalkane", atomIds: atoms.map((atom) => atom.id) }],
  };
}

function attachLinearChain(molecule, length) {
  const firstId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  for (let index = 0; index < length; index += 1) {
    molecule.atoms.push({ id: firstId + index, x: 2 + index, y: 0 });
    molecule.bonds.push(index === 0
      ? [1, firstId, 1]
      : [firstId + index - 1, firstId + index, 1]);
  }
  return firstId;
}

test("declares a distinct 1979 English profile and explicit functional hierarchy", () => {
  assert.equal(IUPAC_1979_LEGACY_ENGLISH_PROFILE, "iupac-1979-legacy-en");
  assert.ok(FUNCTIONAL_GROUP_FORMS.carboxylicAcid.priority > FUNCTIONAL_GROUP_FORMS.nitrile.priority);
  assert.ok(FUNCTIONAL_GROUP_FORMS.nitrile.priority > FUNCTIONAL_GROUP_FORMS.aldehyde.priority);
  assert.ok(FUNCTIONAL_GROUP_FORMS.aldehyde.priority > FUNCTIONAL_GROUP_FORMS.ketone.priority);
  assert.ok(FUNCTIONAL_GROUP_FORMS.ketone.priority > FUNCTIONAL_GROUP_FORMS.alcohol.priority);
  assert.ok(FUNCTIONAL_GROUP_FORMS.alcohol.priority > FUNCTIONAL_GROUP_FORMS.amine.priority);
  assert.equal(FUNCTIONAL_GROUP_FORMS.halogen.suffixEligible, false);
  assert.equal(resolveFunctionalHierarchy([
    { kind: "alcohol", locant: 4, carbonIncludedInParent: true },
    { kind: "ketone", locant: 2, carbonIncludedInParent: true },
  ]).principalKind, "ketone");
});

test("Spanish 1979 variant is derived from the local analysis of the loaded molecular graph", () => {
  const acetone = fromSmiles("CC(=O)C");
  const analysis = analyzeMolecule(acetone);
  assert.equal(analysis.name, "propan-2-ona");
  assert.equal(applyNomenclatureConvention(analysis.name, "current", "es"), "propan-2-ona");
  assert.equal(applyNomenclatureConvention(analysis.name, "iupac-1979-es", "es"), "propanona");
});

test("IUPAC 1979 Legacy English names acetone systematically as propanone", () => {
  assert.equal(legacyName(fromSmiles("CC(=O)C")).name, "propanone");
});

test("Legacy English preserves registered heterocycle parents and gates unsupported profiles", () => {
  for (const [smiles, expectedName, expectedCarbons] of [
    ["O1CC1", "oxirane", 2],
    ["O1CCNCC1", "morpholine", 4],
    ["N1CCOCC1", "morpholine", 4],
  ]) {
    const molecule = fromSmiles(smiles);
    const analysis = analyzeMolecule(molecule);
    const model = buildLegacyEnglishNameModel(molecule, analysis);
    const generated = generateLegacyEnglishName(model).name;
    assert.equal(model.parent.kind, "heterocycle", smiles);
    assert.equal(model.parent.carbonCount, expectedCarbons, smiles);
    assert.equal(generated, expectedName, smiles);
    assert.equal(legacyEnglishProfileIsSupportedForMolecule(molecule), false, smiles);
    assert.equal(legacyEnglishVariantIsAvailable(expectedName, generated, false), false, smiles);
    assert.doesNotMatch(generated, /cyclopropane|cyclohexane/, smiles);
  }

  const unregistered = fromSmiles("O1CNCCC1");
  const unregisteredAnalysis = analyzeMolecule(unregistered);
  const unregisteredLegacy = legacyName(unregistered).name;
  assert.notEqual(unregisteredAnalysis.name, "morfolina");
  assert.equal(unregisteredLegacy, "Local IUPAC name unavailable for this structure");
  assert.equal(legacyEnglishProfileIsSupportedForMolecule(unregistered), false);

  for (const smiles of [
    "O1C(O)C1",
    "O1C(CO)C1",
    "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O",
  ]) {
    const molecule = fromSmiles(smiles);
    const analysis = analyzeMolecule(molecule);
    assert.equal(legacyEnglishProfileIsSupportedForMolecule(molecule), false, smiles);
    assert.equal(legacyEnglishVariantIsAvailable(
      translateSpanishIupacToOpsin(analysis.name),
      legacyName(molecule).name,
      legacyEnglishProfileIsSupportedForMolecule(molecule),
    ), false, smiles);
  }
});

test("unfused linked cyclohexanes use one ring parent and one cyclohexyl substituent", () => {
  const molecule = fromSmiles("C1CCCCC1C2CCCCC2");
  const analysis = analyzeMolecule(molecule);
  const model = buildLegacyEnglishNameModel(molecule, analysis);
  const generated = generateLegacyEnglishName(model).name;
  const suggestedEnglish = translateSpanishIupacToOpsin(analysis.name);

  assert.equal(analysis.name, "ciclohexilciclohexano");
  assert.equal(model.parent.kind, "ring");
  assert.equal(model.parent.carbonCount, 6);
  assert.equal(model.substituents.length, 1);
  assert.equal(model.substituents[0].systematicName, "ciclohexil");
  assert.equal(generated, "cyclohexylcyclohexane");
  assert.equal(generated, suggestedEnglish);
  assert.equal(legacyEnglishVariantIsAvailable(suggestedEnglish, generated), false);

  const fused = fromSmiles("C1CCC2CCCCC2C1");
  const fusedAnalysis = analyzeMolecule(fused);
  const fusedModel = buildLegacyEnglishNameModel(fused, fusedAnalysis);
  assert.ok(fusedAnalysis.fusedBicyclic);
  assert.equal(fusedModel.parent.kind, "polycyclic");
  assert.equal(fusedModel.parent.carbonCount, 10);
  assert.equal(generateLegacyEnglishName(fusedModel).name, "bicyclo[4.4.0]decane");
});

test("Legacy English remains selectable only for a distinct supported name", () => {
  assert.equal(legacyEnglishVariantIsAvailable("pent-2-ene", "2-pentene"), true);
  assert.equal(legacyEnglishVariantIsAvailable("penta-2,3-diene", "2,3-pentadiene"), true);
  assert.equal(legacyEnglishVariantIsAvailable("propan-2-one", "propanone"), true);
  assert.equal(legacyEnglishVariantIsAvailable("oxirane", "oxirane", false), false);
  assert.equal(legacyEnglishVariantIsAvailable("cyclohexylcyclohexane", "cyclohexylcyclohexane"), false);
});

test("compares locant sets lexicographically instead of by sum", () => {
  assert.ok(compareLocantSets([2, 3, 7], [2, 4, 5]) < 0);
  assert.ok(compareNumberings({
    principalGroupLocants: [1], multipleBondLocants: [3], doubleBondLocants: [3],
    prefixLocants: [5], alphabeticalTieBreak: "methyl:5",
  }, {
    principalGroupLocants: [2], multipleBondLocants: [1], doubleBondLocants: [1],
    prefixLocants: [3], alphabeticalTieBreak: "methyl:3",
  }) < 0);
});

test("parent comparator prefers principal groups, unsaturation and only then length", () => {
  const base = {
    principalGroupCount: 0, multipleBondCount: 0, carbonCount: 6, doubleBondCount: 0,
    principalGroupLocants: [], multipleBondLocants: [], doubleBondLocants: [],
    prefixCount: 0, prefixLocants: [], alphabeticalTieBreak: "",
  };
  assert.ok(compareParentCandidates({ ...base, principalGroupCount: 1, carbonCount: 4 }, base) < 0);
  assert.ok(compareParentCandidates({ ...base, multipleBondCount: 2, carbonCount: 4 }, { ...base, multipleBondCount: 1 }) < 0);
  assert.ok(compareParentCandidates({ ...base, multipleBondCount: 1, doubleBondCount: 1 }, { ...base, multipleBondCount: 1 }) < 0);
});

test("names straight-chain alkanes from their graphs", () => {
  for (const [count, expected] of [
    [1, "methane"], [2, "ethane"], [3, "propane"],
    [4, "butane"], [5, "pentane"], [6, "hexane"],
  ]) assert.equal(legacyName(linearAlkane(count)).name, expected);
});

test("names simple and repeated carbon branching", () => {
  for (const [smiles, expected] of [
    ["CC(C)C", "2-methylpropane"],
    ["CC(C)CC", "2-methylbutane"],
    ["CCC(C)CC", "3-methylpentane"],
    ["CC(C)(C)C", "2,2-dimethylpropane"],
    ["CC(C)C(C)C", "2,3-dimethylbutane"],
    ["CC(C)CC(C)(C)C", "2,2,4-trimethylpentane"],
  ]) assert.equal(legacyName(fromSmiles(smiles)).name, expected, smiles);

  const ethylAndMethyl = {
    atoms: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, x: index, y: 0 })),
    bonds: [[1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [3, 7], [7, 8]],
  };
  assert.equal(legacyName(ethylAndMethyl).name, "3-ethyl-2-methylpentane");
});

test("uses legacy English alkene and alkyne locant placement", () => {
  for (const [smiles, expected, locants] of [
    ["C=CCC", "1-butene", [1]],
    ["CC=CC", "2-butene", [2]],
    ["CC=CCC", "2-pentene", [2]],
    ["CC=C=CC", "2,3-pentadiene", [2, 3]],
    ["C#CCC", "1-butyne", [1]],
    ["C=CC=C", "1,3-butadiene", [1, 3]],
    ["CC=CC=CC", "2,4-hexadiene", [2, 4]],
    ["C#CC#C", "1,3-butadiyne", [1, 3]],
    ["C=CC(C)CC", "3-methyl-1-pentene", [1]],
  ]) {
    const result = legacyName(fromSmiles(smiles));
    assert.equal(result.name, expected, smiles);
    assert.deepEqual(result.reasoning.numbering.multipleBondLocants, locants, `${smiles} locants`);
  }
});

test("keeps the suggested English diene names distinct from Legacy English", () => {
  for (const [smiles, suggested, legacy] of [
    ["CC=C=CC", "penta-2,3-diene", "2,3-pentadiene"],
    ["C=CC=C", "buta-1,3-diene", "1,3-butadiene"],
    ["CC=CC=CC", "hexa-2,4-diene", "2,4-hexadiene"],
  ]) {
    const molecule = fromSmiles(smiles);
    const analysis = analyzeMolecule(molecule);
    assert.equal(translateSpanishIupacToOpsin(analysis.name), suggested, smiles);
    assert.equal(legacyName(molecule).name, legacy, smiles);
  }
  assert.equal(translateSpanishIupacToOpsin(analyzeMolecule(fromSmiles("CC=CCC")).name), "pent-2-ene");
});

test("applies suffix priority and subordinate functional prefixes", () => {
  for (const [smiles, expected] of [
    ["CCCO", "1-propanol"],
    ["CC(O)C", "2-propanol"],
    ["CCCCO", "1-butanol"],
    ["CC(O)CC", "2-butanol"],
    ["CC(=O)CCO", "4-hydroxy-2-butanone"],
    ["OCCC=O", "3-hydroxypropanal"],
    ["O=C(O)CC(=O)C", "3-oxobutanoic acid"],
    ["O=C(O)CCN", "3-aminopropanoic acid"],
    ["N#CCCO", "3-hydroxypropanenitrile"],
  ]) assert.equal(legacyName(fromSmiles(smiles)).name, expected, smiles);
});

test("handles the currently supported suffix families structurally", () => {
  for (const [smiles, expected] of [
    ["CCCC=O", "butanal"],
    ["CC(=O)CC", "2-butanone"],
    ["CCC(=O)CC", "3-pentanone"],
    ["CCCCN", "1-butanamine"],
    ["CCCC#N", "butanenitrile"],
    ["CCCC(=O)N", "butanamide"],
    ["CC(=O)OC", "methyl ethanoate"],
    ["CC(=O)C(=O)C", "2,3-butanedione"],
  ]) assert.equal(legacyName(fromSmiles(smiles)).name, expected, smiles);
});

test("names monocyclic parents and omits the redundant single-substituent locant", () => {
  for (const size of [3, 4, 5, 6]) {
    assert.equal(legacyName(carbonRing(size)).name, `cyclo${["", "", "", "prop", "but", "pent", "hex"][size]}ane`);
  }
  const methylcyclohexane = carbonRing(6);
  methylcyclohexane.atoms.push({ id: 7, x: 2, y: 0 });
  methylcyclohexane.bonds.push([1, 7, 1]);
  assert.equal(legacyName(methylcyclohexane).name, "methylcyclohexane");

  const ethylAndMethylRing = carbonRing(6);
  ethylAndMethylRing.atoms.push(
    { id: 7, x: 2, y: 0 }, { id: 8, x: 3, y: 0 }, { id: 9, x: -1, y: 2 },
  );
  ethylAndMethylRing.bonds.push([1, 7, 1], [7, 8, 1], [3, 9, 1]);
  assert.equal(legacyName(ethylAndMethylRing).name, "1-ethyl-3-methylcyclohexane");
});

test("selects ring versus chain deterministically and emits cyclic substituents", () => {
  const equal = carbonRing(4);
  attachLinearChain(equal, 4);
  assert.equal(legacyName(equal).name, "butylcyclobutane");

  for (const ringSize of [3, 4, 5, 6]) {
    const molecule = carbonRing(ringSize);
    attachLinearChain(molecule, ringSize + 1);
    const ringRoot = ["", "", "", "prop", "but", "pent", "hex"][ringSize];
    const chainRoot = ["", "meth", "eth", "prop", "but", "pent", "hex", "hept"][ringSize + 1];
    assert.equal(legacyName(molecule).name, `1-cyclo${ringRoot}yl${chainRoot}ane`);
  }
});

test("lets a principal alcohol chain outrank a larger hydrocarbon ring", () => {
  const molecule = carbonRing(6);
  const first = attachLinearChain(molecule, 3);
  const oxygenId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  molecule.atoms.push({ id: oxygenId, x: 5, y: 1, element: "O" });
  molecule.bonds.push([first + 2, oxygenId, 1]);
  assert.equal(legacyName(molecule).name, "3-cyclohexyl-1-propanol");
});

test("formats ring functional suffixes according to whether the characteristic carbon is in the ring", () => {
  const cyclohexanol = fromSmiles("OC1CCCCC1");
  const cyclohexanone = fromSmiles("O=C1CCCCC1");
  const ringAcid = fromSmiles("O=C(O)C1CCCCC1");
  const ringAldehyde = fromSmiles("O=CC1CCCCC1");
  assert.equal(legacyName(cyclohexanol).name, "cyclohexanol");
  assert.equal(legacyName(cyclohexanone).name, "cyclohexanone");
  assert.equal(legacyName(ringAcid).name, "cyclohexanecarboxylic acid");
  assert.equal(legacyName(ringAldehyde).name, "cyclohexanecarbaldehyde");

  assert.equal(legacyName(fromSmiles("CC1CCC(O)CC1")).name, "4-methylcyclohexanol");
  assert.equal(legacyName(fromSmiles("CC1CCC(=O)CC1")).name, "4-methylcyclohexanone");
});

test("preserves a distinct aromatic parent abstraction", () => {
  for (const [smiles, expected] of [
    ["c1ccccc1", "benzene"],
    ["Cc1ccccc1", "methylbenzene"],
    ["CCc1ccccc1", "ethylbenzene"],
    ["Oc1ccccc1", "phenol"],
  ]) assert.equal(legacyName(fromSmiles(smiles)).name, expected, smiles);

  const metaXylene = fromSmiles("Cc1cccc(C)c1");
  assert.equal(legacyName(metaXylene).name, "1,3-dimethylbenzene");
  assert.equal(legacyName(fromSmiles("Oc1cccc(O)c1")).name, "benzene-1,3-diol");
});

test("keeps complex substituents structural, parenthesized and independently aliasable", () => {
  assert.deepEqual(nameSubstituents([
    { locant: 4, systematicName: "1-metiletil", complex: true },
    { locant: 2, systematicName: "metil", complex: false },
  ]), ["2-methyl", "4-(1-methylethyl)"]);
  assert.deepEqual(nameSubstituents([
    { locant: 4, systematicName: "isopropil", complex: false },
  ]), ["4-isopropyl"]);
  assert.equal(getAlphabetizationKey("dimethyl"), "methyl");
  assert.equal(getAlphabetizationKey("(1-methylethyl)"), "methylethyl");
});

test("exposes deterministic reasoning alongside the final name", () => {
  const result = legacyName(fromSmiles("CC(=O)CCO"));
  assert.equal(result.reasoning.profile, "iupac-1979-legacy-en");
  assert.equal(result.reasoning.principalFunctionalGroup, "ketone");
  assert.deepEqual(result.reasoning.numbering.principalGroupLocants, [2]);
  assert.equal(result.reasoning.finalName, "4-hydroxy-2-butanone");
});
