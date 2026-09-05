import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

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

function makeRing(kind = "aromatic", bondOrders = [2, 1, 2, 1, 2, 1]) {
  const atoms = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    x: Math.cos((index * Math.PI) / 3),
    y: Math.sin((index * Math.PI) / 3),
  }));
  return {
    atoms,
    bonds: atoms.map((atom, index) => [
      atom.id,
      atoms[(index + 1) % atoms.length].id,
      kind === "aromatic" ? bondOrders[index] : (bondOrders[index] ?? 1),
    ]),
    rings: [{ id: 1, kind, atomIds: atoms.map((atom) => atom.id) }],
  };
}

function addAttachment(molecule, ringIndex, kind) {
  const ringCarbonId = ringIndex + 1;
  let nextId = Math.max(...molecule.atoms.map((atom) => atom.id)) + 1;
  const addAtom = (element = "C") => {
    const id = nextId++;
    molecule.atoms.push({ id, x: id, y: ringIndex + 2, ...(element === "C" ? {} : { element }) });
    return id;
  };

  if (kind === "alcohol" || kind === "amine" || kind === "methyl" || kind === "Cl") {
    const element = kind === "alcohol" ? "O" : kind === "amine" ? "N" : kind === "Cl" ? "Cl" : "C";
    const atomId = addAtom(element);
    molecule.bonds.push([ringCarbonId, atomId, 1]);
    return;
  }

  if (kind === "ketone") {
    const oxygenId = addAtom("O");
    molecule.bonds.push([ringCarbonId, oxygenId, 2]);
    return;
  }

  const carbonylCarbonId = addAtom();
  const oxygenId = addAtom("O");
  molecule.bonds.push([ringCarbonId, carbonylCarbonId, 1], [carbonylCarbonId, oxygenId, 2]);
  if (kind === "aldehyde") return;

  const heteroAtomId = addAtom(kind === "amide" ? "N" : "O");
  molecule.bonds.push([carbonylCarbonId, heteroAtomId, 1]);
  if (kind === "ester") {
    const methylId = addAtom();
    molecule.bonds.push([heteroAtomId, methylId, 1]);
  }
}

function makeFunctionalRing(attachments, kind = "aromatic", bondOrders) {
  const molecule = makeRing(kind, bondOrders);
  attachments.forEach(({ at, group }) => addAttachment(molecule, at, group));
  return molecule;
}

function makeTerminalPair(kind, length = 4) {
  const atoms = Array.from({ length }, (_, index) => ({ id: index + 1, x: index, y: 0 }));
  const bonds = Array.from({ length: length - 1 }, (_, index) => [index + 1, index + 2, 1]);
  let nextId = length + 1;
  [1, length].forEach((carbonId, side) => {
    const oxygenId = nextId++;
    atoms.push({ id: oxygenId, x: carbonId, y: side ? 1 : -1, element: "O" });
    bonds.push([carbonId, oxygenId, 2]);
    if (kind === "aldehyde") return;
    const heteroAtomId = nextId++;
    const element = kind === "amide" ? "N" : "O";
    atoms.push({ id: heteroAtomId, x: carbonId, y: side ? 2 : -2, element });
    bonds.push([carbonId, heteroAtomId, 1]);
    if (kind === "ester") {
      const methylId = nextId++;
      atoms.push({ id: methylId, x: carbonId, y: side ? 3 : -3 });
      bonds.push([heteroAtomId, methylId, 1]);
    }
  });
  return { atoms, bonds };
}

test("mantiene fenol para un único OH unido al benceno", () => {
  const molecule = makeFunctionalRing([{ at: 0, group: "alcohol" }]);
  assert.equal(analyzeMolecule(molecule).name, "fenol");
});

test("nombra tres OH aromáticos como benceno-1,3,5-triol", () => {
  const molecule = makeFunctionalRing([
    { at: 0, group: "alcohol" },
    { at: 2, group: "alcohol" },
    { at: 4, group: "alcohol" },
  ]);
  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.name, "benceno-1,3,5-triol");
  assert.equal(analysis.commonName, "floroglucinol");
});

test("conserva los sustituyentes y su orden alfabético en un fenol", () => {
  const molecule = makeFunctionalRing([
    { at: 0, group: "alcohol" },
    { at: 1, group: "methyl" },
    { at: 2, group: "amine" },
    { at: 4, group: "Cl" },
  ]);
  assert.equal(analyzeMolecule(molecule).name, "3-amino-5-cloro-2-metilfenol");
});

test("nombra dioles y conserva la insaturación en ciclos", () => {
  const diol = makeFunctionalRing([
    { at: 0, group: "alcohol" },
    { at: 2, group: "alcohol" },
  ], "cycloalkane", [1, 1, 1, 1, 1, 1]);
  assert.equal(analyzeMolecule(diol).name, "ciclohexano-1,3-diol");

  const enol = makeFunctionalRing(
    [{ at: 0, group: "alcohol" }],
    "cycloalkane",
    [1, 2, 1, 1, 1, 1],
  );
  assert.equal(analyzeMolecule(enol).name, "ciclohex-2-en-1-ol");
});

test("aplica multiplicadores a aminas, cetonas, amidas y ésteres", () => {
  const diamine = makeFunctionalRing([
    { at: 0, group: "amine" },
    { at: 2, group: "amine" },
  ]);
  const dione = makeFunctionalRing([
    { at: 0, group: "ketone" },
    { at: 2, group: "ketone" },
  ], "cycloalkane", [1, 1, 1, 1, 1, 1]);
  const diamide = makeFunctionalRing([
    { at: 0, group: "amide" },
    { at: 2, group: "amide" },
  ]);
  const diester = makeFunctionalRing([
    { at: 0, group: "ester" },
    { at: 2, group: "ester" },
  ]);

  assert.equal(analyzeMolecule(diamine).name, "benceno-1,3-diamina");
  assert.equal(analyzeMolecule(dione).name, "ciclohexano-1,3-diona");
  assert.equal(analyzeMolecule(diamide).name, "benceno-1,3-dicarboxamida");
  assert.equal(analyzeMolecule(diester).name, "benceno-1,3-dicarboxilato de dimetilo");
});

test("nombra correctamente funciones principales repetidas en cadenas", () => {
  assert.equal(analyzeMolecule(makeTerminalPair("aldehyde")).name, "butanodial");
  assert.equal(analyzeMolecule(makeTerminalPair("carboxylicAcid")).name, "ácido butanodioico");
  assert.equal(analyzeMolecule(makeTerminalPair("amide")).name, "butanodiamida");
  assert.equal(analyzeMolecule(makeTerminalPair("ester")).name, "butanodioato de dimetilo");
});

test("elimina la vocal del alcano antes de diol y triol acíclicos", () => {
  const pentanediol = {
    atoms: [1, 2, 3, 4, 5].map((id) => ({ id, x: id, y: 0 })).concat([
      { id: 6, x: 2, y: 1, element: "O" },
      { id: 7, x: 3, y: 1, element: "O" },
    ]),
    bonds: [[1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [2, 6, 1], [3, 7, 1]],
  };
  const propanetriol = {
    atoms: [1, 2, 3].map((id) => ({ id, x: id, y: 0 })).concat([
      { id: 4, x: 1, y: 1, element: "O" },
      { id: 5, x: 2, y: 1, element: "O" },
      { id: 6, x: 3, y: 1, element: "O" },
    ]),
    bonds: [[1, 2, 1], [2, 3, 1], [1, 4, 1], [2, 5, 1], [3, 6, 1]],
  };
  assert.equal(analyzeMolecule(pentanediol).name, "pentan-2,3-diol");
  assert.equal(analyzeMolecule(propanetriol).name, "propan-1,2,3-triol");
});

test("usa carboxi-sufijos múltiples en derivados aromáticos", () => {
  const diacid = makeFunctionalRing([
    { at: 0, group: "carboxylicAcid" },
    { at: 2, group: "carboxylicAcid" },
  ]);
  const dialdehyde = makeFunctionalRing([
    { at: 0, group: "aldehyde" },
    { at: 3, group: "aldehyde" },
  ]);
  assert.equal(analyzeMolecule(diacid).name, "ácido benceno-1,3-dicarboxílico");
  assert.equal(analyzeMolecule(dialdehyde).name, "benceno-1,4-dicarbaldehído");
});

test("expresa como prefijo una función de menor prioridad", () => {
  const acidAndAmide = makeTerminalPair("amide");
  const terminalNitrogenId = acidAndAmide.atoms.find(
    (atom) => atom.element === "N" && atom.x === 1,
  ).id;
  acidAndAmide.atoms = acidAndAmide.atoms.filter((atom) => atom.id !== terminalNitrogenId);
  acidAndAmide.bonds = acidAndAmide.bonds.filter(
    ([a, b]) => a !== terminalNitrogenId && b !== terminalNitrogenId,
  );
  const acidOxygenId = Math.max(...acidAndAmide.atoms.map((atom) => atom.id)) + 1;
  acidAndAmide.atoms.push({ id: acidOxygenId, x: 1, y: -2, element: "O" });
  acidAndAmide.bonds.push([1, acidOxygenId, 1]);

  assert.equal(analyzeMolecule(acidAndAmide).name, "ácido 4-amino-4-oxobutanoico");

  const aromatic = makeFunctionalRing([
    { at: 0, group: "carboxylicAcid" },
    { at: 2, group: "amide" },
  ]);
  assert.equal(analyzeMolecule(aromatic).name, "ácido 3-carbamoilbenzoico");
});

test("nombra haloalquenos y halometanos sin locantes redundantes", () => {
  const haloalkene = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0 },
      { id: 4, x: 1, y: 1 },
      { id: 5, x: 0, y: -1, element: "Cl" },
    ],
    bonds: [[1, 2, 2], [2, 3, 1], [2, 4, 1], [1, 5, 1]],
  };
  const dichloromethane = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: -1, y: 0, element: "Cl" },
      { id: 3, x: 1, y: 0, element: "Cl" },
    ],
    bonds: [[1, 2, 1], [1, 3, 1]],
  };

  assert.equal(analyzeMolecule(haloalkene).name, "1-cloro-2-metilprop-1-eno");
  assert.equal(analyzeMolecule(dichloromethane).name, "diclorometano");
});

test("detects every functional group in a ring with a nested oxo substituent", async () => {
  const module = await server.ssrLoadModule("/app/page.tsx");
  const { localNamerCannotSafelyName } = module;
  const molecule = {
    atoms: [
      { id: 1, x: 1, y: 0 },
      { id: 2, x: 0.5, y: 0.86 },
      { id: 3, x: -0.5, y: 0.86 },
      { id: 4, x: -1, y: 0 },
      { id: 5, x: -0.5, y: -0.86 },
      { id: 6, x: 0.5, y: -0.86 },
      { id: 7, x: 1.7, y: 0, element: "O" },
      { id: 8, x: -0.5, y: 1.7, element: "F" },
      { id: 9, x: -1.3, y: 1.3 },
      { id: 10, x: -2.2, y: 1.3 },
      { id: 11, x: -3.1, y: 1.3 },
      { id: 12, x: -2.2, y: 2.1, element: "O" },
    ],
    bonds: [
      [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 1, 1],
      [1, 7, 2],
      [3, 8, 1],
      [3, 9, 1], [9, 10, 1], [10, 11, 1], [10, 12, 2],
    ],
    rings: [{ id: 1, kind: "cycloalkane", atomIds: [1, 2, 3, 4, 5, 6] }],
  };

  const analysis = analyzeMolecule(molecule);
  assert.equal(analysis.functionalGroups.filter((group) => group.kind === "ketone").length, 2);
  assert.equal(analysis.functionalGroups.filter((group) => group.kind === "halogen").length, 1);
  assert.equal(localNamerCannotSafelyName(molecule, analysis), true);
});

test("local nomenclature handles N-methyl and N,N-dimethyl ethanamine graphs", () => {
  const secondary = {
    atoms: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0, element: "N" },
      { id: 4, x: 2, y: 1 },
    ],
    bonds: [[1, 2, 1], [2, 3, 1], [3, 4, 1]],
  };
  const tertiary = {
    atoms: [...secondary.atoms, { id: 5, x: 2, y: -1 }],
    bonds: [...secondary.bonds, [3, 5, 1]],
  };

  assert.equal(analyzeMolecule(secondary).name, "N-metiletanamina");
  assert.equal(analyzeMolecule(tertiary).name, "N,N-dimetiletanamina");
});
