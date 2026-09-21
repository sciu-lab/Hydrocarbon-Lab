import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import {
  formatStereochemicalName,
  inspectDoubleBondStereochemistry,
} from "../app/double-bond-stereochemistry.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { resolveChemicalName } from "../app/name-structure-resolver.ts";
import { getSteroidLike6565System } from "../app/fused-ring-nomenclature.ts";
import {
  inspectSmilesStructure,
  moleculeFromSmiles,
  moleculeToSmiles,
} from "../app/openchemlib-adapter.ts";
import {
  layoutSteroidRingLabels,
  steroidLabelIntersectsExtent,
} from "../app/steroid-ring-label-layout.ts";
import {
  clearTetrahedralConfiguration,
  getTetrahedralAssignmentSummary,
  getTetrahedralCandidatesForBond,
  getMainChainTetrahedralDescriptors,
  getTetrahedralStereoBonds,
  getTetrahedralStereoCenters,
  layoutTetrahedralBadgePositions,
  sanitizeTetrahedralStereochemistry,
  setTetrahedralConfiguration,
  TETRAHEDRAL_BADGE_HIT_RADIUS,
  TETRAHEDRAL_BADGE_RADIUS,
  toggleTetrahedralConfiguration,
} from "../app/tetrahedral-stereochemistry.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let steroidStereochemistryStatus;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, steroidStereochemistryStatus } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => { await server?.close(); });

function imported(smiles) {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  return result.molecule;
}

function exported(molecule) {
  const result = moleculeToSmiles(molecule);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  return result.smiles;
}

function displayedMolecule(molecule) {
  const positions = calculateMolecule2DLayout(
    molecule,
    molecule.atoms.map((atom) => atom.id),
  );
  return {
    ...molecule,
    atoms: molecule.atoms.map((atom) => ({ ...atom, ...positions.get(atom.id) })),
  };
}

function constitution(molecule) {
  return {
    atoms: molecule.atoms.map(({ id, element = "C", charge = 0 }) => ({ id, element, charge })),
    bonds: molecule.bonds.map(([left, right, order = 1]) => [left, right, order]),
  };
}

test("R/S badge geometry has a visibly larger face and 36–40 px target after canvas scaling", () => {
  // The normal 720-unit viewBox renders at about 0.62 CSS px per SVG unit in
  // the real canvas; keep the visual face near 30 px and the target near 38 px.
  const observedCanvasScale = 0.62;
  assert.ok(TETRAHEDRAL_BADGE_RADIUS * 2 * observedCanvasScale >= 29);
  assert.ok(TETRAHEDRAL_BADGE_RADIUS * 2 * observedCanvasScale <= 32);
  assert.ok(TETRAHEDRAL_BADGE_HIT_RADIUS * 2 * observedCanvasScale >= 36);
  assert.ok(TETRAHEDRAL_BADGE_HIT_RADIUS * 2 * observedCanvasScale <= 40);
});

test("imports, names and draws (2R)- and (2S)-butan-2-ol as opposite configurations", () => {
  const r = imported("C[C@@H](O)CC");
  const s = imported("C[C@H](O)CC");
  const rCenter = getTetrahedralStereoCenters(r)[0];
  const sCenter = getTetrahedralStereoCenters(s)[0];
  assert.equal(rCenter.configuration, "R");
  assert.equal(sCenter.configuration, "S");
  assert.deepEqual(constitution(r), constitution(s));
  assert.equal(inspectSmilesStructure(exported(r)).formula, inspectSmilesStructure(exported(s)).formula);
  assert.notEqual(exported(r), exported(s));
  assert.equal(formatStereochemicalName(r, [1, 2, 4, 5], "butan-2-ol"), "(2R)-butan-2-ol");
  assert.equal(formatStereochemicalName(s, [1, 2, 4, 5], "butan-2-ol"), "(2S)-butan-2-ol");

  const rBond = getTetrahedralStereoBonds(displayedMolecule(r))[0];
  const sBond = getTetrahedralStereoBonds(displayedMolecule(s))[0];
  assert.equal(rBond.configuration, "R");
  assert.equal(sBond.configuration, "S");
  assert.equal(rBond.neighborAtomId, sBond.neighborAtomId);
  assert.notEqual(rBond.style, sBond.style, "fixed coordinates require opposite wedge/hash parity");
});

test("supports the real stereogenic C3 of (3R)- and (3S)-3-methylhexane", () => {
  const r = imported("CC[C@@H](C)CCC");
  const s = imported("CC[C@H](C)CCC");
  assert.deepEqual(getMainChainTetrahedralDescriptors(r, [1, 2, 3, 5, 6, 7]), [
    { atomId: 3, configuration: "R", locant: 3 },
  ]);
  assert.deepEqual(getMainChainTetrahedralDescriptors(s, [1, 2, 3, 5, 6, 7]), [
    { atomId: 3, configuration: "S", locant: 3 },
  ]);
  assert.deepEqual(constitution(r), constitution(s));
  assert.notEqual(exported(r), exported(s));
});

test("preserves two tetrahedral centers and simultaneous R/S plus E/Z", () => {
  const twoCenters = imported("C[C@H](O)[C@@H](F)C");
  assert.equal(getTetrahedralStereoCenters(twoCenters).length, 2);
  assert.equal(getTetrahedralStereoBonds(displayedMolecule(twoCenters)).length, 2);
  assert.equal(getTetrahedralStereoCenters(imported(exported(twoCenters))).length, 2);

  const mixed = imported("F/C=C/[C@H](Cl)Br");
  const alkene = mixed.bonds.find(([, , order = 1]) => order === 2);
  assert.ok(alkene);
  assert.equal(inspectDoubleBondStereochemistry(mixed, alkene[0], alkene[1]).configuration, "E");
  assert.equal(getTetrahedralStereoCenters(mixed)[0].configuration, "R");
  const roundTrip = imported(exported(mixed));
  const roundTripAlkene = roundTrip.bonds.find(([, , order = 1]) => order === 2);
  assert.equal(inspectDoubleBondStereochemistry(roundTrip, roundTripAlkene[0], roundTripAlkene[1]).configuration, "E");
  assert.equal(getTetrahedralStereoCenters(roundTrip)[0].configuration, "R");
});

test("R to S to R interaction and undo/redo snapshots change configuration only", () => {
  const original = imported("C[C@@H](O)CC");
  const atomId = getTetrahedralStereoCenters(original)[0].atomId;
  const undoSnapshot = structuredClone(original);
  const toS = toggleTetrahedralConfiguration(original, atomId);
  assert.equal(toS.ok, true);
  assert.equal(toS.configuration, "S");
  assert.deepEqual(constitution(toS.molecule), constitution(original));
  assert.notEqual(exported(toS.molecule), exported(original));
  const redoSnapshot = structuredClone(toS.molecule);
  const backToR = toggleTetrahedralConfiguration(toS.molecule, atomId);
  assert.equal(backToR.ok, true);
  assert.equal(backToR.configuration, "R");
  assert.equal(exported(backToR.molecule), exported(original));
  assert.equal(getTetrahedralStereoCenters(undoSnapshot)[0].configuration, "R");
  assert.equal(getTetrahedralStereoCenters(redoSnapshot)[0].configuration, "S");
});

test("a selected simple bond carries explicit S/R while configuration remains atom-owned", () => {
  const original = imported("C[C@@H](O)CC");
  const center = getTetrahedralStereoCenters(original)[0];
  const carrier = original.bonds.find(([left, right, order = 1]) =>
    order === 1 && (left === center.atomId || right === center.atomId),
  );
  assert.ok(carrier);
  const neighborId = carrier[0] === center.atomId ? carrier[1] : carrier[0];
  assert.deepEqual(getTetrahedralCandidatesForBond(original, carrier[0], carrier[1]), [center.atomId]);

  const toS = setTetrahedralConfiguration(original, center.atomId, "S", neighborId);
  assert.equal(toS.ok, true);
  assert.equal(sanitizeTetrahedralStereochemistry(toS.molecule), toS.molecule);
  assert.deepEqual(constitution(toS.molecule), constitution(original));
  assert.equal(toS.molecule.atoms.find((atom) => atom.id === center.atomId).tetrahedralBondTo, neighborId);
  assert.equal(getTetrahedralStereoBonds(displayedMolecule(toS.molecule))[0].neighborAtomId, neighborId);
  assert.equal(getTetrahedralStereoBonds(displayedMolecule(toS.molecule))[0].configuration, "S");
  assert.notEqual(exported(toS.molecule), exported(original));

  const undoSnapshot = structuredClone(original);
  const redoSnapshot = structuredClone(toS.molecule);
  assert.equal(getTetrahedralStereoCenters(undoSnapshot)[0].configuration, "R");
  assert.equal(getTetrahedralStereoCenters(redoSnapshot)[0].configuration, "S");

  const backToR = setTetrahedralConfiguration(toS.molecule, center.atomId, "R", neighborId);
  assert.equal(backToR.ok, true);
  assert.equal(exported(backToR.molecule), exported(original));
  const cleared = clearTetrahedralConfiguration(backToR.molecule, center.atomId);
  assert.equal(getTetrahedralStereoCenters(cleared).length, 0);
  assert.deepEqual(constitution(cleared), constitution(original));
});

test("R/S bond availability depends on CIP, not on having zero through four rings", () => {
  const fixtures = [
    [0, "CC(O)CC"],
    [1, "CC1CCCCC1O"],
    [2, "CC1CCC2CCCCC2C1O"],
    [3, "CC1CCC2C1CCC1CCCCC12O"],
    [4, "CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C"],
  ];
  for (const [expectedRingCount, smiles] of fixtures) {
    const molecule = imported(smiles);
    assert.equal(molecule.rings?.length ?? 0, expectedRingCount);
    const candidateBond = molecule.bonds.find(([left, right, order = 1]) =>
      order === 1 && getTetrahedralCandidatesForBond(molecule, left, right).length > 0,
    );
    assert.ok(candidateBond, `${expectedRingCount} rings: a valid simple carrier is available`);
    const candidates = getTetrahedralCandidatesForBond(molecule, candidateBond[0], candidateBond[1]);
    assert.ok(candidates.length > 0, `${expectedRingCount} rings: Shift+click candidates`);
    const assigned = setTetrahedralConfiguration(
      molecule,
      candidates[0],
      "R",
      candidateBond[0] === candidates[0] ? candidateBond[1] : candidateBond[0],
    );
    assert.equal(assigned.ok, true, `${expectedRingCount} rings: R assignment`);
  }
});

test("bond context omits false tetrahedral centers and double bonds without disturbing E/Z", () => {
  const achiral = imported("CCC(C)CC");
  for (const [left, right] of achiral.bonds) {
    assert.deepEqual(getTetrahedralCandidatesForBond(achiral, left, right), []);
  }

  const mixed = imported("F/C=C/[C@H](Cl)Br");
  const alkene = mixed.bonds.find(([, , order = 1]) => order === 2);
  assert.ok(alkene);
  assert.deepEqual(getTetrahedralCandidatesForBond(mixed, alkene[0], alkene[1]), []);
  const before = inspectDoubleBondStereochemistry(mixed, alkene[0], alkene[1]).configuration;
  const center = getTetrahedralStereoCenters(mixed)[0];
  const changed = toggleTetrahedralConfiguration(mixed, center.atomId);
  assert.equal(changed.ok, true);
  assert.equal(inspectDoubleBondStereochemistry(changed.molecule, alkene[0], alkene[1]).configuration, before);
});

test("a bond joining two stereocenters offers both endpoints without assigning parity to the bond", () => {
  const molecule = imported("C[C@H](O)[C@@H](F)C");
  const centers = getTetrahedralStereoCenters(molecule).map(({ atomId }) => atomId).sort((a, b) => a - b);
  const shared = molecule.bonds.find(([left, right]) => centers.includes(left) && centers.includes(right));
  assert.ok(shared);
  assert.deepEqual(
    getTetrahedralCandidatesForBond(molecule, shared[0], shared[1]).sort((a, b) => a - b),
    centers,
  );
  const first = setTetrahedralConfiguration(molecule, shared[0], "R", shared[1]);
  assert.equal(first.ok, true);
  const second = setTetrahedralConfiguration(first.molecule, shared[1], "S", shared[0]);
  assert.equal(second.ok, true);
  assert.equal(second.molecule.atoms.find((atom) => atom.id === shared[0]).tetrahedralParity, "R");
  assert.equal(second.molecule.atoms.find((atom) => atom.id === shared[0]).tetrahedralBondTo, undefined);
  assert.equal(second.molecule.atoms.find((atom) => atom.id === shared[1]).tetrahedralBondTo, shared[0]);
});

test("absolute configuration survives atom-ID remapping and coordinate changes", () => {
  const source = imported("CC[C@@H](C)CCC");
  const remap = new Map(source.atoms.map((atom, index) => [atom.id, 101 + index * 17]));
  const transformed = {
    ...source,
    atoms: source.atoms.toReversed().map((atom, index) => ({
      ...atom,
      id: remap.get(atom.id),
      x: atom.y * 3.7 + index,
      y: -atom.x * 2.1 - index * 0.4,
    })),
    bonds: source.bonds.toReversed().map(([left, right, order]) => [
      remap.get(right),
      remap.get(left),
      order,
    ]),
    rings: source.rings?.map((ring) => ({
      ...ring,
      atomIds: ring.atomIds.map((atomId) => remap.get(atomId)),
    })),
  };
  const roundTrip = imported(exported(transformed));
  assert.equal(getTetrahedralStereoCenters(roundTrip)[0].configuration, "R");
  assert.equal(inspectSmilesStructure(exported(transformed)).formula, "C7H16");
  assert.equal(getTetrahedralStereoBonds(transformed)[0].configuration, "R");
});

test("removes a stored descriptor when equivalent substituents make the atom achiral", () => {
  const achiral = imported("CCC(C)CC");
  const candidate = achiral.atoms.find((atom) =>
    achiral.bonds.filter(([left, right]) => left === atom.id || right === atom.id).length === 3,
  );
  const invalid = {
    ...achiral,
    atoms: achiral.atoms.map((atom) => atom.id === candidate.id
      ? { ...atom, tetrahedralParity: "R" }
      : atom),
  };
  assert.equal(getTetrahedralStereoCenters(invalid).length, 0);
  assert.equal(
    sanitizeTetrahedralStereochemistry(invalid).atoms.some((atom) => atom.tetrahedralParity),
    false,
  );
});

test("name resolution flows through OPSIN, import, final layout and R/S analysis", async () => {
  const smilesByDescriptor = new Map([
    ["2R", "C[C@@H](O)CC"],
    ["2S", "C[C@H](O)CC"],
    ["3R", "CC[C@@H](C)CCC"],
    ["3S", "CC[C@H](C)CCC"],
  ]);
  const fetchImpl = async (input) => {
    const decoded = decodeURIComponent(String(input));
    const descriptor = [...smilesByDescriptor.keys()].find((key) => decoded.includes(`(${key})`));
    return descriptor
      ? new Response(JSON.stringify({ status: "SUCCESS", smiles: smilesByDescriptor.get(descriptor) }), { status: 200 })
      : new Response(JSON.stringify({ status: "FAILURE" }), { status: 404 });
  };
  for (const [name, expected, mainChain] of [
    ["(2R)-butan-2-ol", "R", [1, 2, 4, 5]],
    ["(2S)-butan-2-ol", "S", [1, 2, 4, 5]],
    ["(3R)-3-metilhexano", "R", [1, 2, 3, 5, 6, 7]],
    ["(3S)-3-metilhexano", "S", [1, 2, 3, 5, 6, 7]],
  ]) {
    const resolution = await resolveChemicalName(name, { fetchImpl, timeoutMs: 1_000 });
    assert.equal(resolution.ok, true, name);
    const molecule = displayedMolecule(imported(resolution.value.smiles));
    const analysis = analyzeMolecule(molecule);
    assert.deepEqual(analysis.mainChain, mainChain, `${name}: final analysis numbering`);
    assert.equal(getMainChainTetrahedralDescriptors(molecule, analysis.mainChain)[0].configuration, expected, name);
    assert.match(formatStereochemicalName(molecule, analysis.mainChain, analysis.name), new RegExp(`\\(${expected === "R" || expected === "S" ? mainChain.indexOf(getTetrahedralStereoCenters(molecule)[0].atomId) + 1 : ""}${expected}\\)-`), name);
    assert.equal(getTetrahedralStereoBonds(molecule)[0].configuration, expected, name);
  }
});

test("testosterone and cholesterol preserve every imported tetrahedral center after final layout", () => {
  const steroids = new Map([
    ["testosterone", "C[C@]12CC[C@H]3[C@@H]([C@@H]1CC[C@@H]2O)CCC4=CC(=O)CC[C@]34C"],
    ["cholesterol", "CC(C)CCC[C@@H](C)[C@H]1CC[C@@H]2[C@@H]3CC=C4C[C@@H](O)CC[C@]4(C)[C@H]3CC[C@]12C"],
  ]);
  const expectedCenters = new Map([["testosterone", 6], ["cholesterol", 8]]);
  for (const [name, smiles] of steroids) {
    const inspection = inspectSmilesStructure(smiles);
    assert.equal(inspection.ok, true, name);
    assert.equal(inspection.unpreservedTetrahedralStereoCenterCount, 0, name);
    const molecule = displayedMolecule(imported(smiles));
    const centers = getTetrahedralStereoCenters(molecule);
    assert.deepEqual(getTetrahedralAssignmentSummary(molecule), {
      detected: expectedCenters.get(name),
      assigned: expectedCenters.get(name),
      complete: true,
    }, name);
    assert.match(
      steroidStereochemistryStatus(molecule, "en"),
      new RegExp(`Androstane nucleus recognized · ${expectedCenters.get(name)} tetrahedral stereocenters assigned`),
      name,
    );
    assert.match(analyzeMolecule(molecule).ringSystem, /centros estereogénicos tetraédricos asignados/, name);
    assert.equal(centers.length, inspection.tetrahedralStereoCenterCount, name);
    assert.equal(getTetrahedralStereoBonds(molecule).length, centers.length, name);
    const roundTrip = inspectSmilesStructure(exported(molecule));
    assert.equal(roundTrip.preservedTetrahedralStereoCenterCount, centers.length, name);
    assert.equal(roundTrip.formula, inspection.formula, name);

    const system = getSteroidLike6565System(molecule);
    assert.equal(system?.isGonaneTopology, true, `${name}: recognized steroid topology`);
    const positions = new Map(molecule.atoms.map((atom) => [atom.id, { x: atom.x, y: atom.y }]));
    const badgeScale = name === "testosterone" ? 1.35 : 1;
    const badgePositions = layoutTetrahedralBadgePositions(
      getTetrahedralStereoBonds(molecule),
      positions,
      badgeScale,
    );
    const stereoObstacles = [...badgePositions.values()].map((point) => {
      return {
        x: point.x - TETRAHEDRAL_BADGE_RADIUS * badgeScale,
        y: point.y - TETRAHEDRAL_BADGE_RADIUS * badgeScale,
        width: TETRAHEDRAL_BADGE_RADIUS * 2 * badgeScale,
        height: TETRAHEDRAL_BADGE_RADIUS * 2 * badgeScale,
      };
    });
    for (let index = 0; index < stereoObstacles.length; index += 1) {
      for (let other = index + 1; other < stereoObstacles.length; other += 1) {
        const left = stereoObstacles[index];
        const right = stereoObstacles[other];
        assert.equal(
          left.x < right.x + right.width && left.x + left.width > right.x
            && left.y < right.y + right.height && left.y + left.height > right.y,
          false,
          `${name}: R/S badges do not overlap`,
        );
      }
    }
    const heteroObstacles = molecule.atoms
      .filter((atom) => (atom.element ?? "C") !== "C")
      .map((atom) => ({ x: atom.x - 15, y: atom.y - 15, width: 30, height: 30 }));
    const labels = layoutSteroidRingLabels(system.ringsByLabel, positions, [
      ...stereoObstacles,
      ...heteroObstacles,
    ]);
    assert.deepEqual(labels.map(({ label }) => label), ["A", "B", "C", "D"], name);
    for (const label of labels) {
      for (const obstacle of [...stereoObstacles, ...heteroObstacles]) {
        assert.equal(steroidLabelIntersectsExtent(label, obstacle), false, `${name}: ${label.label} collision`);
      }
    }

    const transformedPositions = new Map([...positions].map(([atomId, point]) => [atomId, {
      x: -point.y * 1.3 + 41,
      y: -point.x * 1.3 - 23,
    }]));
    assert.deepEqual(
      layoutSteroidRingLabels(system.ringsByLabel, transformedPositions).map(({ label }) => label),
      ["A", "B", "C", "D"],
      `${name}: labels survive rotation/reflection`,
    );
  }
});
