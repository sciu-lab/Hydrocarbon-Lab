import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import {
  getOpsinNameCandidates,
  localizeChemicalNameForDisplay,
  normalizeChemicalNameForParser,
} from "../app/iupac-name-normalization.ts";
import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import {
  classifyPolycyclicTopology,
  moleculeFromSmiles,
  moleculeToSmiles,
} from "../app/openchemlib-adapter.ts";
import { resolveNameWithOpsin } from "../app/opsin-name-resolver.ts";
import { getAutoPlacedCarbonPosition } from "../app/manual-layout.ts";
import { fuseRingOnBond, removeFusedRingAtom } from "../app/fused-ring.ts";
import { orientCarbonylTemplateOutsideRing } from "../app/functional-group-layout.ts";
import { generateLegacyEnglishName } from "../app/legacy-english-nomenclature.ts";
import { createFormulaCandidateResolver } from "../app/formula-candidate-resolver.ts";
import { compoundIdentityKey, createCompoundContextResolver } from "../app/compound-context.ts";
import { sanitizeTetrahedralStereochemistry } from "../app/tetrahedral-stereochemistry.ts";
import { verifiedPubChemCommonName } from "../app/verified-common-name-equivalences.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
let server;
let analyzeMolecule;
let getSubstituentAliasSelectionKey;
let localNamerCannotSafelyName;
let externalCandidateNeedsNeutralLocalName;
let externalCandidateLocalDisplayName;
let buildLegacyEnglishNameModel;
let pubChemIdentityForNomenclature;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({
    analyzeMolecule,
    getSubstituentAliasSelectionKey,
    localNamerCannotSafelyName,
    externalCandidateNeedsNeutralLocalName,
    externalCandidateLocalDisplayName,
    buildLegacyEnglishNameModel,
    pubChemIdentityForNomenclature,
  } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function build(name) {
  const result = buildHydrocarbonFromIupacName(name);
  assert.equal(result.ok, true, result.ok ? undefined : `${name}: ${result.error}`);
  return result;
}

test("supported fused bicyclic editing remains analyzable after opening a ring", () => {
  const original = build("ciclohexano").molecule;
  const [a, b] = original.bonds[0];
  const fused = fuseRingOnBond(original, a, b, 6);
  const analysis = analyzeMolecule(fused);
  assert.equal(analysis.formula, "C₁₀H₁₈");
  assert.equal(analysis.family, "polycyclic");
  assert.equal(analysis.name, "biciclo[4.4.0]decano");
  assert.equal(localNamerCannotSafelyName(fused, analysis), false);
  const opened = removeFusedRingAtom(fused, fused.atoms.at(-2).id);
  assert.doesNotThrow(() => analyzeMolecule(opened));
});

test("external polyhydroxylated heterocycles do not expose an incomplete local name", () => {
  // PubChem CID 5793 (D-glucose) record structure. The editor round-trips its
  // stereochemistry, while the current local analysis omits four oxygen atoms.
  const result = moleculeFromSmiles("C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O");
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  assert.equal(analysis.formula, "C₆H₁₂O₆");
  assert.equal(analysis.name, "2-etiltetrahidropirano");
  const legacy = generateLegacyEnglishName(buildLegacyEnglishNameModel(result.molecule, analysis));
  assert.equal(legacy.name, "2-ethylcyclohexane");
  assert.equal(localNamerCannotSafelyName(result.molecule, analysis), false);
  assert.equal(externalCandidateNeedsNeutralLocalName(result.molecule, analysis), true);
  assert.equal(externalCandidateLocalDisplayName(result.molecule, analysis, "es"), "Nombre IUPAC local no disponible para esta estructura");
  assert.equal(externalCandidateLocalDisplayName(result.molecule, analysis, "en"), "Local IUPAC name unavailable for this structure");
  // The graph-based formatter is known to omit oxygen-rich parts here; the
  // UI must gate every locally generated profile when this external structure
  // is active, while keeping the exact PubChem identity as the primary name.
  assert.match(pageSource, /localSuggestedNameUnavailable\s*\?\s*"-"\s*:\s*generateLegacyEnglishName/);
  assert.match(pageSource, /if \(externalNameIsPrimary\)\s*\{\s*return \[\{[\s\S]*?name: pubChemIupacName!/);
  assert.match(pageSource, /sourceNameOverride === null\s*&& externalCandidateNeedsNeutralLocalName\(molecule, calculatedAnalysis\)/,
    "the incomplete local name stays hidden while the external context loads after Undo");

  const supported = moleculeFromSmiles("OCC");
  assert.equal(supported.ok, true, supported.ok ? undefined : supported.error);
  const supportedAnalysis = analyzeMolecule(supported.molecule);
  assert.equal(externalCandidateNeedsNeutralLocalName(supported.molecule, supportedAnalysis), false);
  assert.equal(externalCandidateLocalDisplayName(supported.molecule, supportedAnalysis, "es"), supportedAnalysis.name);
  for (const smiles of ["CC(=O)C", "Cc1ccccc1"]) {
    const ordinary = moleculeFromSmiles(smiles);
    assert.equal(ordinary.ok, true);
    assert.equal(externalCandidateNeedsNeutralLocalName(ordinary.molecule, analyzeMolecule(ordinary.molecule)), false);
  }
});

test("CID 5793 formula selection and verified canvas context use the same safe naming identity", async () => {
  const originalSmiles = "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O";
  const iupacName = "(3R,4S,5S,6R)-6-(hydroxymethyl)oxane-2,3,4,5-tetrol";
  const inchiKey = "WQZGKKKJIJFFOK-GASJEMHNSA-N";
  const json = (body) => new Response(JSON.stringify(body), { status: 200 });
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("/fastformula/") || url.includes("/cids/JSON")) {
      return json({ IdentifierList: { CID: [5793] } });
    }
    if (url.includes("/property/")) return json({ PropertyTable: { Properties: [{
      CID: 5793, MolecularFormula: "C6H12O6", IUPACName: iupacName,
      InChIKey: inchiKey, IsomericSMILES: originalSmiles,
    }] } });
    if (url.includes("/description/")) return json({ InformationList: { Information: [{ Title: "D-Glucose" }] } });
    return json({});
  };

  const search = await createFormulaCandidateResolver({ fetchImpl }).search("C6H12O6");
  assert.equal(search.status, "success");
  const candidate = search.candidates[0];
  assert.equal(candidate.cid, 5793);
  assert.equal(candidate.inchiKey, inchiKey);
  const committed = sanitizeTetrahedralStereochemistry(candidate.molecule);
  const exported = moleculeToSmiles(committed);
  assert.equal(exported.ok, true);
  assert.equal(exported.smiles, candidate.smiles, "the selected record still matches the committed graph");
  const selectedIdentity = {
    cid: candidate.cid, inchiKey: candidate.inchiKey,
    molecularFormula: candidate.molecularFormula, iupacName: candidate.iupacName,
    smiles: candidate.smiles,
  };
  const direct = pubChemIdentityForNomenclature(exported.smiles, selectedIdentity, null);
  assert.equal(direct?.iupacName, iupacName);

  const analysis = analyzeMolecule(committed);
  assert.equal(externalCandidateNeedsNeutralLocalName(committed, analysis), true);
  const identity = { canonicalSmiles: exported.smiles };
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity, "en");
  assert.equal(context.identityKey, compoundIdentityKey(identity));
  assert.equal(context.pubchem?.cid, 5793);
  assert.equal(context.pubchem?.recordTitle, "D-Glucose");
  const fromContext = pubChemIdentityForNomenclature(exported.smiles, null, context);
  assert.equal(fromContext?.iupacName, iupacName, "the verified context protects the dock without constructor state");
  assert.equal(verifiedPubChemCommonName(fromContext, "es"), "D-glucosa");
  assert.equal(verifiedPubChemCommonName(fromContext, "en"), "D-Glucose");
  assert.equal(pubChemIdentityForNomenclature(exported.smiles, selectedIdentity, context)?.iupacName, iupacName);

  const other = moleculeFromSmiles("C([C@@H]1[C@@H]([C@@H]([C@H](C(O1)O)O)O)O)O");
  assert.equal(other.ok, true);
  const otherSmiles = moleculeToSmiles(other.molecule);
  assert.equal(otherSmiles.ok, true);
  assert.notEqual(otherSmiles.smiles, exported.smiles);
  assert.equal(pubChemIdentityForNomenclature(otherSmiles.smiles, selectedIdentity, context), null,
    "an edited graph or another C6H12O6 isomer cannot inherit D-Glucose");
  assert.equal(pubChemIdentityForNomenclature(exported.smiles, selectedIdentity, context)?.cid, 5793,
    "Undo to the original graph restores its identity");
  const methane = moleculeFromSmiles("C");
  assert.equal(methane.ok, true);
  const methaneSmiles = moleculeToSmiles(methane.molecule);
  assert.equal(methaneSmiles.ok, true);
  assert.equal(pubChemIdentityForNomenclature(methaneSmiles.smiles, selectedIdentity, context), null);
});

function graphSignature(molecule) {
  const element = (atom) => atom.element ?? "C";
  const edges = molecule.bonds
    .map(([left, right, order = 1]) => `${Math.min(left, right)}-${Math.max(left, right)}:${order}`)
    .sort();
  return {
    atoms: molecule.atoms.map((atom) => `${atom.id}:${element(atom)}`).sort(),
    edges,
  };
}

test("keeps representative working name-builder cases stable", () => {
  const cases = [
    ["3-etil-2,2,4-trimetilpentano", "3-etil-2,2,4-trimetilpentano"],
    ["ciclohex-1-en-1-ol", "ciclohex-1-en-1-ol"],
    ["benceno-1,2,4-triol", "benceno-1,2,4-triol"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(analyzeMolecule(build(input).molecule).name, expected, input);
  }
  assert.equal(normalizeChemicalNameForParser("hexa-1,3-dien-5-ino", "es"), "hexa-1,3-dien-5-yne");
  const enyne = moleculeFromSmiles("C=CC=CC#C");
  assert.equal(enyne.ok, true, enyne.ok ? undefined : enyne.error);
  assert.equal(analyzeMolecule(enyne.molecule).name, "hexa-1,3-dien-5-ino");
});

test("keeps representative functional and heterocyclic graph analyses stable", () => {
  const cases = [
    ["O=C(O)c1cc(O)c(C)cc1", "ácido 3-hidroxi-4-metilbenzoico"],
    ["O=C(O)C(N)C(O)C", "ácido 2-amino-3-hidroxibutanoico"],
    ["CCCN(C)CC", "N-etil-N-metilpropan-1-amina"],
    ["CN(C)C(=O)c1ccccc1", "N,N-dimetilbenzamida"],
    ["O1CCNCC1", "morfolina"],
  ];
  for (const [smiles, expected] of cases) {
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
    assert.equal(analyzeMolecule(converted.molecule).name, expected, smiles);
  }
});

test("recognizes all supported alkyl aliases as the same substituent graph", () => {
  const pairs = [
    ["1-(propan-2-il)ciclohexano", "1-isopropilciclohexano", "1-metiletil", "isopropil"],
    ["1-(1-metiletil)ciclohexano", "1-isopropilciclohexano", "1-metiletil", "isopropil"],
    ["1-(1,1-dimetiletil)ciclohexano", "1-tert-butilciclohexano", "1,1-dimetiletil", "tert-butil"],
    ["1-(butan-2-il)ciclohexano", "1-sec-butilciclohexano", "1-metilpropil", "sec-butil"],
    ["1-(2-metilpropil)ciclohexano", "1-isobutilciclohexano", "2-metilpropil", "isobutil"],
  ];
  for (const [systematicInput, commonInput, systematic, common] of pairs) {
    const systematicResult = build(systematicInput);
    const commonResult = build(commonInput);
    assert.deepEqual(graphSignature(commonResult.molecule), graphSignature(systematicResult.molecule), systematicInput);
    assert.match(analyzeMolecule(systematicResult.molecule).name, new RegExp(systematic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(analyzeMolecule(systematicResult.molecule, [systematic]).name, new RegExp(common.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("applies each selected alkyl alias to the generated name and restores the systematic form", () => {
  const isopropyl = build("3-(propan-2-il)-2-metilhexano").molecule;
  const isopropylSubstituent = analyzeMolecule(isopropyl).substituents.find(
    (substituent) => substituent.name === "1-metiletil",
  );
  assert.ok(isopropylSubstituent);
  const isopropylKey = getSubstituentAliasSelectionKey(isopropylSubstituent);
  assert.equal(analyzeMolecule(isopropyl, [isopropylKey]).name, "3-isopropil-2-metilhexano");
  assert.equal(analyzeMolecule(isopropyl).name, "2-metil-3-(1-metiletil)hexano");

  const tertButyl = build("4-(1,1-dimetiletil)octano").molecule;
  const tertButylSubstituent = analyzeMolecule(tertButyl).substituents.find(
    (substituent) => substituent.name === "1,1-dimetiletil",
  );
  assert.ok(tertButylSubstituent);
  const tertButylKey = getSubstituentAliasSelectionKey(tertButylSubstituent);
  assert.equal(analyzeMolecule(tertButyl, [tertButylKey]).name, "4-tert-butiloctano");
  assert.equal(analyzeMolecule(tertButyl).name, "4-(1,1-dimetiletil)octano");

});

test("names acyl-substituted benzaldehydes directly from their edited aromatic graphs", () => {
  const cases = [
    ["O=Cc1cccc(C(C)=O)c1", "3-acetilbenzaldehído"],
    ["O=Cc1cccc(C(=O)CC)c1", "3-propionilbenzaldehído"],
    ["O=Cc1c(C)c(C(C)=O)ccc1", "3-acetil-2-metilbenzaldehído"],
    ["O=Cc1cc(C(C)=O)c(C)cc1", "3-acetil-4-metilbenzaldehído"],
    ["O=Cc1c(C)c(C(C)=O)c(C)cc1", "3-acetil-2,4-dimetilbenzaldehído"],
  ];
  for (const [smiles, expected] of cases) {
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
    const analysis = analyzeMolecule(converted.molecule);
    assert.equal(localNamerCannotSafelyName(converted.molecule, analysis), false, smiles);
    assert.equal(analysis.name, expected, smiles);
  }
});

test("retains carbon and nitrogen alkyl substituents on morpholine graphs after manual extension", () => {
  const cases = [
    ["O1CCNCC1", "morfolina"],
    ["O1C(C)CNCC1", "2-metilmorfolina"],
    ["O1C(CC)CNCC1", "2-etilmorfolina"],
    ["O1CCN(C)CC1", "N-metilmorfolina"],
    ["O1CCN(CC)CC1", "N-etilmorfolina"],
  ];
  for (const [smiles, expected] of cases) {
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
    assert.equal(analyzeMolecule(converted.molecule).name, expected, smiles);
  }
});

test("keeps the connecting vowel for combined polyene-polyine parents", () => {
  const converted = moleculeFromSmiles("C=CC=CC#C");
  assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
  assert.equal(analyzeMolecule(converted.molecule).name, "hexa-1,3-dien-5-ino");
});

test("normalizes parser vocabulary and localizes chemical output by locale", () => {
  assert.equal(normalizeChemicalNameForParser("3-acetilbenzaldehído", "es"), "3-acetylbenzaldehyde");
  assert.equal(normalizeChemicalNameForParser("4-propionilbenzaldehído", "es"), "4-propionylbenzaldehyde");
  assert.equal(normalizeChemicalNameForParser("naftalen-2-ol", "es"), "naphthalen-2-ol");
  assert.equal(normalizeChemicalNameForParser("decalina", "es"), "decalin");
  assert.equal(normalizeChemicalNameForParser("espiro[4.5]decano", "es"), "spiro[4.5]decane");
  assert.equal(normalizeChemicalNameForParser("biciclo[2.2.1]heptano", "es"), "bicyclo[2.2.1]heptane");
  assert.equal(normalizeChemicalNameForParser("2-methylpyridine", "en"), "2-methylpyridine");
  assert.equal(localizeChemicalNameForDisplay("2-methylpyridine", "es"), "2-metilpiridina");
  assert.equal(localizeChemicalNameForDisplay("2-metilpiridina", "es"), "2-metilpiridina");
  assert.ok(getOpsinNameCandidates("3-acetilbenzaldehído").includes("3-acetylbenzaldehyde"));
});

test("routes normalized Spanish names through parsing before reporting topology limits", async () => {
  const cases = [
    ["3-acetilbenzaldehído", "3-acetylbenzaldehyde", "O=Cc1cccc(C(C)=O)c1", true],
    ["naftalen-2-ol", "naphthalen-2-ol", "Oc1ccc2ccccc2c1", false],
    ["decalina", "decalin", "C1CCC2CCCCC2C1", true],
    ["espiro[4.5]decano", "spiro[4.5]decane", "C1CCC2(CC1)CCCC2", false],
    ["biciclo[2.2.1]heptano", "bicyclo[2.2.1]heptane", "C1CC2CCC1C2", false],
    ["indol", "indol", "c1ccc2[nH]ccc2c1", false],
  ];

  for (const [input, parserName, smiles, editable] of cases) {
    const requestedUrls = [];
    const resolved = await resolveNameWithOpsin(input, {
      fetchImpl: async (url) => {
        requestedUrls.push(String(url));
        return Response.json({ status: "SUCCESS", smiles, warnings: [] });
      },
    });
    assert.equal(resolved.ok, true, input);
    assert.match(requestedUrls[0], new RegExp(`${encodeURIComponent(parserName)}\\.json$`), input);
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, editable, input);
    if (!editable) {
      assert.match(converted.error, /policíclico complejo/i, input);
      assert.doesNotMatch(converted.error, /no pudo interpretar/i, input);
    }
  }
});

test("accepts both explicit and implicit C1 cyclohexanol input forms as one graph", () => {
  const explicit = build("2-etil-4-metilciclohexan-1-ol");
  const implicit = build("2-etil-4-metilciclohexanol");
  assert.deepEqual(graphSignature(explicit.molecule), graphSignature(implicit.molecule));
  assert.equal(analyzeMolecule(explicit.molecule).name, "2-etil-4-metilciclohexanol");
});

test("uses one graph-analysis pipeline for name-built and manually built hydroxy ketones", () => {
  // This is the graph emitted by the OPSIN/OpenChemLib name path for
  // 4-hidroxi-3-metilbutan-2-ona. The second graph uses independent manual IDs
  // and drawing coordinates, so the assertion exercises connectivity only.
  const fromNameResult = moleculeFromSmiles("CC(=O)C(C)CO");
  assert.equal(fromNameResult.ok, true, fromNameResult.ok ? undefined : fromNameResult.error);
  const fromName = fromNameResult.molecule;
  const manuallyBuilt = {
    atoms: [
      { id: 10, x: 0, y: 0 },
      { id: 20, x: 1, y: 0 },
      { id: 30, x: 1, y: -1, element: "O" },
      { id: 40, x: 2, y: 0 },
      { id: 50, x: 2, y: 1 },
      { id: 60, x: 3, y: -1, element: "O" },
      { id: 70, x: 3, y: 0 },
    ],
    bonds: [[10, 20], [20, 30, 2], [20, 40], [40, 50], [40, 70], [70, 60]],
  };
  const namedAnalysis = analyzeMolecule(fromName);
  const manualAnalysis = analyzeMolecule(manuallyBuilt);
  assert.equal(namedAnalysis.name, "4-hidroxi-3-metilbutan-2-ona");
  assert.equal(manualAnalysis.name, namedAnalysis.name);
  assert.equal(manualAnalysis.formula, namedAnalysis.formula);
  assert.deepEqual(
    manualAnalysis.functionalGroups.map((group) => group.kind).sort(),
    namedAnalysis.functionalGroups.map((group) => group.kind).sort(),
  );
});

test("classifies unsupported polycyclic topology precisely after parsing", () => {
  const bridged = moleculeFromSmiles("C1CC2CCC1C2");
  assert.equal(bridged.ok, false);
  assert.match(bridged.error, /puenteado/i);

  const spiro = moleculeFromSmiles("C1CCC2(CC1)CCCC2");
  assert.equal(spiro.ok, false);
  assert.match(spiro.error, /espiro/i);

  const fused = moleculeFromSmiles("c1ccc2[nH]ccc2c1");
  assert.equal(fused.ok, false);
  assert.match(fused.error, /fusionado/i);

  assert.equal(classifyPolycyclicTopology({ ringCount: 1, cyclomaticNumber: 1, sharedAtomCounts: [] }), "monocyclic");
});

test("places the carbonyl of 3-metilciclohex-2-en-1-ona outside its ring without changing its graph", () => {
  const ring = Array.from({ length: 6 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 6;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const anchor = ring[0];
  const placed = orientCarbonylTemplateOutsideRing(
    [{ x: 0, y: -1, element: "O" }],
    [[0, 1, 2]],
    anchor,
    ring,
  );
  const oxygen = placed[0];
  const outward = { x: anchor.x, y: anchor.y };
  const carbonylVector = { x: oxygen.x - anchor.x, y: oxygen.y - anchor.y };
  assert.ok(carbonylVector.x * outward.x + carbonylVector.y * outward.y > 0);
  for (const neighbor of [ring.at(1), ring.at(-1)]) {
    const ringVector = { x: neighbor.x - anchor.x, y: neighbor.y - anchor.y };
    const cross = carbonylVector.x * ringVector.y - carbonylVector.y * ringVector.x;
    assert.ok(Math.abs(cross) > 1e-6);
  }
});

test("manual open-chain placement makes a stable zig-zag rather than three collinear carbons", () => {
  const molecule = {
    atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }],
    bonds: [[1, 2, 1]],
  };
  const third = getAutoPlacedCarbonPosition(molecule, 2, { x: 1, y: 0 });
  const withThird = {
    atoms: [...molecule.atoms, { id: 3, ...third }],
    bonds: [...molecule.bonds, [2, 3, 1]],
  };
  const fourth = getAutoPlacedCarbonPosition(withThird, 3, { x: 1, y: 0 });
  const twiceArea = Math.abs(
    (molecule.atoms[1].x - molecule.atoms[0].x) * (third.y - molecule.atoms[0].y)
    - (molecule.atoms[1].y - molecule.atoms[0].y) * (third.x - molecule.atoms[0].x),
  );
  const nextTwiceArea = Math.abs(
    (third.x - molecule.atoms[1].x) * (fourth.y - molecule.atoms[1].y)
    - (third.y - molecule.atoms[1].y) * (fourth.x - molecule.atoms[1].x),
  );
  assert.ok(twiceArea > 1e-6);
  assert.ok(nextTwiceArea > 1e-6);
});
