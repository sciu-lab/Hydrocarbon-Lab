import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { getSteroidLike6565System } from "../app/fused-ring-nomenclature.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let localNamerCannotSafelyName;
let localizeSupportedSteroidConstitutionName;
let steroidStereochemistryStatus;
let buildIupacReasoningSteps;
let buildEnglishReasoningSteps;

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
    localNamerCannotSafelyName,
    localizeSupportedSteroidConstitutionName,
    steroidStereochemistryStatus,
    buildIupacReasoningSteps,
    buildEnglishReasoningSteps,
  } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => { await server?.close(); });

function gonaneReference() {
  // This fixture's internal IDs are not steroid locants.
  const ringAtomIds = [
    [1, 17, 16, 4, 3, 2],
    [5, 6, 7, 15, 16, 4],
    [13, 14, 15, 7, 8, 12],
    [9, 8, 12, 11, 10],
  ];
  const bonds = [];
  const edges = new Set();
  for (const atomIds of ringAtomIds) {
    atomIds.forEach((id, i) => {
      const next = atomIds[(i + 1) % atomIds.length];
      const key = [id, next].sort((a, b) => a - b).join("-");
      if (!edges.has(key)) {
        bonds.push([id, next, 1]);
        edges.add(key);
      }
    });
  }
  return {
    atoms: Array.from({ length: 17 }, (_, index) => ({ id: index + 1 })),
    bonds,
    rings: ringAtomIds.map((atomIds, index) => ({
      id: index + 1, kind: "cycloalkane", atomIds,
    })),
  };
}

function constitutionalReference() {
  const molecule = gonaneReference();
  const numbering = getSteroidLike6565System(molecule)?.numbering;
  assert.ok(numbering);
  const bond = molecule.bonds.find(([a, b]) => (
    (a === numbering[3] && b === numbering[4])
    || (a === numbering[4] && b === numbering[3])
  ));
  assert.ok(bond);
  bond[2] = 2; // C4=C5
  molecule.atoms.push({ id: 18, element: "O" }, { id: 19, element: "O" });
  molecule.bonds.push([numbering[2], 18, 2], [numbering[16], 19, 1]);
  molecule.atoms.push({ id: 20 }, { id: 21 });
  molecule.bonds.push([numbering[12], 20, 1], [numbering[9], 21, 1]);
  return { molecule, numbering };
}

test("shows supported steroid constitutional name, full C1-C19 numbering and functional groups", () => {
  const { molecule, numbering } = constitutionalReference();
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "17-hidroxiandrost-4-en-3-ona");
  assert.equal(analysis.family, "polycyclic");
  assert.equal(analysis.formula, "C₁₉H₂₈O₂");
  assert.deepEqual(analysis.mainChain, numbering);
  assert.equal(analysis.numberedAtoms.get(numbering[2]), 3);
  assert.equal(analysis.numberedAtoms.get(numbering[16]), 17);
  assert.equal(analysis.numberedAtoms.get(20), 18);
  assert.equal(analysis.numberedAtoms.get(21), 19);
  assert.deepEqual(analysis.doubleBondLocants, [4]);
  assert.equal(analysis.primaryFunctionalGroup, "ketone");
  assert.equal(analysis.functionalGroups.length, 2);
  assert.ok(analysis.steroidSystem?.constitutionNameEn);
  assert.equal(analysis.ringSystem, "Núcleo de androstano reconocido · 0 de 6 centros estereogénicos tetraédricos conservados");
  assert.equal(
    steroidStereochemistryStatus(molecule, "en"),
    "Androstane nucleus recognized · 0 of 6 tetrahedral stereocenters preserved",
  );
  assert.equal(localNamerCannotSafelyName(molecule, analysis), false);
});

test("shows bilingual steroid reasoning without claiming stereochemical testosterone identity", () => {
  const { molecule } = constitutionalReference();
  const analysis = analyzeMolecule(molecule);
  const spanish = buildIupacReasoningSteps(molecule, analysis);
  const english = buildEnglishReasoningSteps(spanish, molecule, analysis);
  assert.equal(spanish.length, 5);
  assert.equal(english.length, 5);
  assert.ok(spanish.some((step) => step.explanation.includes("C4=C5")));
  assert.ok(spanish.some((step) => step.explanation.includes("C18 y C19")));
  assert.ok(english.some((step) => step.explanation.includes("17-hydroxyandrost-4-en-3-one")));
  assert.ok(english.some((step) => step.explanation.includes("No α/β or R/S")));
  assert.equal(localizeSupportedSteroidConstitutionName(analysis.name, "es"), analysis.name);
  assert.equal(localizeSupportedSteroidConstitutionName(analysis.name, "en"), "17-hydroxyandrost-4-en-3-one");
  assert.equal(localizeSupportedSteroidConstitutionName("biciclo[4.4.0]decano", "en"), null);
});

test("does not name a different steroid constitution as the supported compound", () => {
  const { molecule, numbering } = constitutionalReference();
  const altered = structuredClone(molecule);
  const locate = (a, b) => altered.bonds.find(([left, right]) => (
    (left === a && right === b) || (left === b && right === a)
  ));
  locate(numbering[3], numbering[4])[2] = 1;
  locate(numbering[5], numbering[6])[2] = 2; // C6=C7, not C4=C5
  const analysis = analyzeMolecule(altered);
  assert.equal(analysis.name, "Nombre no disponible para estructuras complejas");
  assert.equal(analysis.steroidSystem?.isGonaneTopology, true);
  assert.equal(analysis.steroidSystem?.constitutionNameEs, undefined);
  assert.equal(localNamerCannotSafelyName(altered, analysis), true);
});
