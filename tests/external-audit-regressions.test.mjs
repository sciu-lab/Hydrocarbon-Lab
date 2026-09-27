import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { CanonizerUtil, Molecule as OCLMolecule, SmilesParser } from "openchemlib";

import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const readAudit = (name) => JSON.parse(readFileSync(
  new URL(`../reports/external-molecule-audit/${name}`, import.meta.url), "utf8",
));
const fixtures = new Map(readAudit("fixtures.json").cases.map((item) => [item.id, item]));
const auditResults = new Map(readAudit("results.json").results.map((item) => [item.id, item]));
const reviews = new Map(readAudit("nomenclature-review.json").reviews.map((item) => [item.id, item]));

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

function fixture(id, expectedSmiles, expectedStatus) {
  const item = fixtures.get(id);
  assert.ok(item, `${id}: fixture congelado ausente`);
  assert.equal(item.inputSmiles, expectedSmiles, `${id}: cambió el SMILES congelado`);
  const actualStatus = expectedStatus === "FAIL-NAME-NUMBERING" || expectedStatus === "PASS-STYLE"
    ? reviews.get(id)?.reviewStatus
    : auditResults.get(id)?.status;
  assert.equal(actualStatus, expectedStatus, `${id}: cambió la clasificación auditada`);
  return item;
}

function parse(smiles) {
  const molecule = new SmilesParser().parseMolecule(smiles);
  molecule.ensureHelperArrays(OCLMolecule.cHelperCIP);
  return molecule;
}

function idCode(molecule, mode = CanonizerUtil.NORMAL) {
  return CanonizerUtil.getIDCode(molecule, mode);
}

function alkeneConfigurations(molecule) {
  const configurations = [];
  for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
    if (molecule.getBondOrder(bond) !== 2) continue;
    const parity = molecule.getBondCIPParity(bond);
    configurations.push(parity === OCLMolecule.cBondCIPParityEorP ? "E"
      : parity === OCLMolecule.cBondCIPParityZorM ? "Z" : null);
  }
  return configurations;
}

function roundTrip(smiles) {
  const imported = moleculeFromSmiles(smiles);
  assert.equal(imported.ok, true, imported.ok ? undefined : imported.error);
  const exported = moleculeToSmiles(imported.molecule);
  assert.equal(exported.ok, true, exported.ok ? undefined : exported.error);
  const restored = moleculeFromSmiles(exported.smiles);
  assert.equal(restored.ok, true, restored.ok ? undefined : restored.error);
  return { imported: imported.molecule, exported: exported.smiles, restored: restored.molecule };
}

const unspecifiedCases = [
  ["HC-018", "CC=CC"],
  ["HC-020", "CC=C(C)CC"],
  ["HC-021", "C=CC=CCC"],
  ["HC-030", "C=CC=CCCC"],
  ["HC-031", "C=CC=CC=CCC"],
];

for (const [id, frozenSmiles] of unspecifiedCases) {
  // FAIL-STRUCTURE: export must preserve an unspecified E/Z state and the constitution.
  test(`${id} — FAIL-STRUCTURE — unspecified E/Z remains unspecified on SMILES round-trip`, () => {
    const source = fixture(id, frozenSmiles, "FAIL-STRUCTURE");
    const reference = parse(source.inputSmiles);
    assert.ok(alkeneConfigurations(reference).every((configuration) => configuration === null));

    const { exported } = roundTrip(source.inputSmiles);
    const output = parse(exported);
    assert.equal(
      idCode(output, CanonizerUtil.NOSTEREO),
      idCode(reference, CanonizerUtil.NOSTEREO),
      `${id}: la constitución cambió`,
    );
    assert.deepEqual(
      alkeneConfigurations(output), alkeneConfigurations(reference),
      `${id}: el serializador añadió configuración E/Z; exportó ${exported}`,
    );
    assert.equal(idCode(output), idCode(reference), `${id}: la identidad estereoquímica cambió`);
  });
}

const namedStereoCases = [
  ["HC-117", "C/C=C/C", "E", "but-2-eno", 2],
  ["HC-118", "C/C=C\\C", "Z", "but-2-eno", 2],
  ["HC-119", "CC/C=C/CC", "E", "hex-3-eno", 3],
  ["HC-120", "CC/C=C\\CC", "Z", "hex-3-eno", 3],
];

for (const [id, frozenSmiles, geometry, baseName, locant] of namedStereoCases) {
  // FAIL-NAME-STEREO: source geometry survives structurally and must appear correctly in the name.
  test(`${id} — FAIL-NAME-STEREO — generated name includes ${geometry}`, () => {
    const source = fixture(id, frozenSmiles, "FAIL-NAME");
    const reference = parse(source.isomericSmiles);
    assert.equal(source.inputSmiles, source.isomericSmiles);
    assert.deepEqual(alkeneConfigurations(reference), [geometry]);

    const { imported, exported } = roundTrip(source.isomericSmiles);
    assert.equal(idCode(parse(exported)), idCode(reference), `${id}: E/Z no se conservó`);
    const expected = [`(${geometry})-${baseName}`, `(${locant}${geometry})-${baseName}`];
    const actual = analyzeMolecule(imported).name;
    assert.ok(expected.includes(actual), `${id}: esperado ${expected.join(" o ")}; obtenido ${actual}`);
  });
}

for (const [eId, zId, base] of [
  ["HC-117", "HC-118", "but-2-eno"],
  ["HC-119", "HC-120", "hex-3-eno"],
]) {
  // Metamorphic check: E/Z graphs and the names needed to identify them must differ.
  test(`${eId}/${zId} — FAIL-NAME-STEREO — E and Z have distinct structures and names`, () => {
    const e = fixtures.get(eId);
    const z = fixtures.get(zId);
    assert.notEqual(idCode(parse(e.isomericSmiles)), idCode(parse(z.isomericSmiles)));
    assert.equal(
      idCode(parse(e.isomericSmiles), CanonizerUtil.NOSTEREO),
      idCode(parse(z.isomericSmiles), CanonizerUtil.NOSTEREO),
    );
    const eName = analyzeMolecule(roundTrip(e.isomericSmiles).imported).name;
    const zName = analyzeMolecule(roundTrip(z.isomericSmiles).imported).name;
    assert.notEqual(eName, zName, `${base}: los nombres E y Z colapsaron`);
  });
}

for (const [id, frozenSmiles, locant, parent] of [
  ["HC-044", "CC1=CCCC1", 1, "ciclopent"],
  ["HC-045", "C1=CC(C)CCC1", 3, "ciclohex"],
]) {
  // FAIL-NAME-NUMBERING: the methyl locant is necessary to identify this ring isomer.
  test(`${id} — FAIL-NAME-NUMBERING — methyl locant ${locant} is retained`, () => {
    const source = fixture(id, frozenSmiles, "FAIL-NAME-NUMBERING");
    const { imported, exported } = roundTrip(source.inputSmiles);
    assert.equal(idCode(parse(exported)), idCode(parse(source.inputSmiles)), `${id}: estructura alterada`);
    const expected = [`${locant}-metil${parent}-1-eno`, `${locant}-metil${parent}eno`];
    const actual = analyzeMolecule(imported).name;
    assert.ok(expected.includes(actual), `${id}: esperado ${expected.join(" o ")}; obtenido ${actual}`);
  });
}

// Positive control HC-017 (PASS-STYLE): terminal alkene cannot acquire E/Z.
test("HC-017 — CONTROL — terminal alkene stays constitutionally and stereochemically unchanged", () => {
  const source = fixture("HC-017", "C=CCC", "PASS-STYLE");
  const { exported } = roundTrip(source.inputSmiles);
  assert.equal(idCode(parse(exported)), idCode(parse(source.inputSmiles)));
  assert.deepEqual(alkeneConfigurations(parse(exported)), [null]);
});

// Positive control HC-117/118: specified geometry survives the round-trip, despite the name bug.
test("HC-117/HC-118 — CONTROL — defined E and Z geometry remains distinct on round-trip", () => {
  for (const [id, expected] of [["HC-117", "E"], ["HC-118", "Z"]]) {
    const source = fixtures.get(id);
    const { exported } = roundTrip(source.isomericSmiles);
    assert.deepEqual(alkeneConfigurations(parse(exported)), [expected]);
    assert.equal(idCode(parse(exported)), idCode(parse(source.isomericSmiles)));
  }
});

// Positive control HC-043 (PASS-STYLE): ring double-bond locants are currently correct.
test("HC-043 — CONTROL — cyclohexa-1,3-diene retains its necessary alkene locants", () => {
  const source = fixture("HC-043", "C1=CC=CCC1", "PASS-STYLE");
  const { imported, exported } = roundTrip(source.inputSmiles);
  assert.equal(idCode(parse(exported)), idCode(parse(source.inputSmiles)));
  assert.equal(analyzeMolecule(imported).name, "ciclohexa-1,3-dieno");
});

// No validated fixture has a correct generated name for an E/Z-defined alkene,
// or a substituted cycloalkene with a correct methyl locant; do not invent one.
