import assert from "node:assert/strict";
import { after, before, test } from "node:test";
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
} from "../app/openchemlib-adapter.ts";
import { resolveNameWithOpsin } from "../app/opsin-name-resolver.ts";
import { getAutoPlacedCarbonPosition } from "../app/manual-layout.ts";
import { orientCarbonylTemplateOutsideRing } from "../app/functional-group-layout.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function build(name) {
  const result = buildHydrocarbonFromIupacName(name);
  assert.equal(result.ok, true, result.ok ? undefined : `${name}: ${result.error}`);
  return result;
}

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
  assert.equal(analyzeMolecule(enyne.molecule).name, "hex-1,3-dien-5-ino");
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
    ["decalina", "decalin", "C1CCC2CCCCC2C1", false],
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
