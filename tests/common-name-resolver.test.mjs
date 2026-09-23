import assert from "node:assert/strict";
import test from "node:test";

import { getSteroidLike6565System } from "../app/fused-ring-nomenclature.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { resolveChemicalName } from "../app/name-structure-resolver.ts";
import { inspectSmilesStructure, moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

const fixtures = [
  { cid: 180, names: ["acetona", "acetone"], formula: "C3H6O", smiles: "CC(=O)C", iupac: "propan-2-one" },
  { cid: 3776, names: ["alcohol isopropílico", "isopropyl alcohol"], formula: "C3H8O", smiles: "CC(O)C", iupac: "propan-2-ol", inchiKey: "KFZMGEQAYNKOFK-UHFFFAOYSA-N" },
  { cid: 176, names: ["acido acetico", "acetic acid"], formula: "C2H4O2", smiles: "CC(=O)O", iupac: "acetic acid" },
  { cid: 712, names: ["formaldehido", "formaldehyde"], formula: "CH2O", smiles: "C=O", iupac: "formaldehyde" },
  { cid: 177, names: ["acetaldehido", "acetaldehyde"], formula: "C2H4O", smiles: "CC=O", iupac: "acetaldehyde" },
  { cid: 753, names: ["glicerina", "glycerin", "glycerol"], formula: "C3H8O3", smiles: "OCC(O)CO", iupac: "propane-1,2,3-triol", inchiKey: "PEDCQBHIVMGVHV-UHFFFAOYSA-N" },
  { cid: 1140, names: ["tolueno", "toluene"], formula: "C7H8", smiles: "Cc1ccccc1", iupac: "toluene" },
  {
    cid: 6013,
    names: ["testosterona", "testosterone", "17-hidroxiandrost-4-en-3-ona", "17-hydroxyandrost-4-en-3-one"],
    formula: "C19H28O2",
    smiles: "C[C@]12CC[C@H]3[C@@H]([C@@H]1CC[C@@H]2O)CCC4=CC(=O)CC[C@]34C",
    iupac: "testosterone",
    inchiKey: "MUMGGOZAMZWBJJ-DYKIIFRCSA-N",
  },
  {
    cid: 5997,
    names: ["colesterol", "cholesterol"],
    formula: "C27H46O",
    smiles: "CC(C)CCC[C@@H](C)[C@H]1CC[C@@H]2[C@@H]3CC=C4C[C@@H](O)CC[C@]4(C)[C@H]3CC[C@]12C",
    iupac: "cholesterol",
    inchiKey: "HVYWMOMLDIMFJA-DPAQBDIFSA-N",
  },
  {
    cid: 2519,
    names: ["cafeina", "caffeine"],
    formula: "C8H10N4O2",
    smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C",
    iupac: "1,3,7-trimethylpurine-2,6-dione",
  },
];

function normalizeName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en");
}

function atomSignature(molecule, atomId) {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  const orders = molecule.bonds.flatMap(([left, right, order = 1]) =>
    left === atomId || right === atomId ? [order] : [],
  ).sort();
  return `${atom?.element ?? "C"}|${orders.join(",")}`;
}

function molecularGraphsAreIsomorphic(left, right) {
  if (left.atoms.length !== right.atoms.length || left.bonds.length !== right.bonds.length) return false;
  const adjacency = (molecule) => new Map(molecule.atoms.map((atom) => [
    atom.id,
    new Map(molecule.bonds.flatMap(([first, second, order = 1]) => {
      if (first === atom.id) return [[second, order]];
      if (second === atom.id) return [[first, order]];
      return [];
    })),
  ]));
  const leftAdjacency = adjacency(left);
  const rightAdjacency = adjacency(right);
  const candidates = new Map(left.atoms.map((atom) => [
    atom.id,
    right.atoms.filter((candidate) =>
      atomSignature(left, atom.id) === atomSignature(right, candidate.id),
    ).map((candidate) => candidate.id),
  ]));
  const order = left.atoms.map(({ id }) => id).sort((first, second) =>
    candidates.get(first).length - candidates.get(second).length,
  );
  const mapping = new Map();
  const used = new Set();
  const visit = (index) => {
    if (index === order.length) return true;
    const leftId = order[index];
    for (const rightId of candidates.get(leftId)) {
      if (used.has(rightId)) continue;
      if (![...mapping].every(([mappedLeft, mappedRight]) =>
        leftAdjacency.get(leftId).get(mappedLeft) === rightAdjacency.get(rightId).get(mappedRight),
      )) continue;
      mapping.set(leftId, rightId);
      used.add(rightId);
      if (visit(index + 1)) return true;
      mapping.delete(leftId);
      used.delete(rightId);
    }
    return false;
  };
  return visit(0);
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockedChemicalServices() {
  const calls = [];
  const byName = new Map(fixtures.flatMap((fixture) => fixture.names.map((name) => [
    normalizeName(name), fixture,
  ])));
  const byCid = new Map(fixtures.map((fixture) => [fixture.cid, fixture]));
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("ebi.ac.uk/opsin")) {
      return json({ status: "FAILURE", message: "uninterpretable common name" }, 404);
    }
    const nameMatch = url.match(/\/name\/([^/]+)\/cids\/JSON/);
    if (nameMatch) {
      const requestedName = normalizeName(decodeURIComponent(nameMatch[1]));
      // Mirrors the real PUG REST behavior observed for the Spanish spelling:
      // /name/colesterol returns 404, while /name/cholesterol returns CID 5997.
      const fixture = requestedName === "colesterol" ? undefined : byName.get(requestedName);
      return fixture
        ? json({ IdentifierList: { CID: [fixture.cid] } })
        : json({}, 404);
    }
    const cidMatch = url.match(/\/cid\/(\d+(?:,\d+)*)\/property\//);
    if (cidMatch) {
      const properties = cidMatch[1].split(",").map(Number).flatMap((cid) => {
        const fixture = byCid.get(cid);
        return fixture ? [{
          CID: fixture.cid,
          IUPACName: fixture.iupac,
          InChIKey: fixture.inchiKey ?? `FIXTURE-${fixture.cid}`,
          IsomericSMILES: fixture.smiles,
          CanonicalSMILES: fixture.smiles,
          MolecularFormula: fixture.formula,
        }] : [];
      });
      return json({ PropertyTable: { Properties: properties } });
    }
    return json({}, 404);
  };
  return { calls, fetchImpl };
}

test("resolves the requested Spanish and English common names through validated PubChem records", async () => {
  const { calls, fetchImpl } = mockedChemicalServices();
  for (const fixture of fixtures.filter(({ iupac }) => !iupac.includes("purine"))) {
    const resolved = [];
    for (const name of fixture.names) {
      const result = await resolveChemicalName(name, { fetchImpl, timeoutMs: 1_000 });
      assert.equal(result.ok, true, name);
      if (result.value.source === "PubChem") {
        assert.equal(result.value.cid, fixture.cid, name);
        assert.equal(result.value.molecularFormula, fixture.formula, name);
        assert.equal(result.value.iupacName, fixture.iupac, name);
        if (fixture.inchiKey) assert.equal(result.value.inchiKey, fixture.inchiKey, name);
      }
      assert.equal(moleculeFromSmiles(result.value.smiles).ok, true, name);
      const inspection = inspectSmilesStructure(result.value.smiles);
      assert.equal(inspection.ok, true, name);
      assert.equal(inspection.formula, fixture.formula, name);
      resolved.push(inspection.canonicalConnectivity);
    }
    assert.equal(resolved[0], resolved[1], fixture.iupac);
  }
  assert.ok(calls.some((url) => url.includes("/name/colesterol/cids/JSON")));
  assert.ok(calls.some((url) => url.includes("/name/cholesterol/cids/JSON")));
});

test("does not warn when every PubChem tetrahedral center is preserved", async () => {
  const { fetchImpl } = mockedChemicalServices();
  for (const name of ["testosterona", "testosterone", "colesterol", "cholesterol"]) {
    const result = await resolveChemicalName(name, { fetchImpl });
    assert.equal(result.ok, true, result.ok ? name : `${name}: ${result.error} ${result.detail}`);
    assert.deepEqual(result.value.warnings, [], name);
    const inspection = inspectSmilesStructure(result.value.smiles);
    assert.equal(inspection.ok, true, name);
    assert.equal(inspection.unpreservedTetrahedralStereoCenterCount, 0, name);
    assert.ok(inspection.preservedTetrahedralStereoCenterCount > 0, name);
  }
  const achiral = await resolveChemicalName("toluene", { fetchImpl });
  assert.equal(achiral.ok, true);
  assert.deepEqual(achiral.value.warnings, []);
});

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if ((current.y > point.y) !== (prior.y > point.y)
      && point.x < (prior.x - current.x) * (point.y - current.y) / (prior.y - current.y) + current.x) {
      inside = !inside;
    }
  }
  return inside;
}

function assertAngularMethylBondsOutsideRingPolygons(molecule, positions, label) {
  const steroid = getSteroidLike6565System(molecule);
  assert.ok(steroid?.numbering && steroid.angularMethyls, `${label}: steroid connectivity recognized`);
  for (const [methylLocant, parentLocant] of [["C18", 13], ["C19", 10]]) {
    const methylId = steroid.angularMethyls[methylLocant];
    const parentId = steroid.numbering[parentLocant - 1];
    const start = positions.get(parentId);
    const end = positions.get(methylId);
    for (const ring of molecule.rings) {
      const polygon = ring.atomIds.map((atomId) => positions.get(atomId));
      assert.equal(pointInPolygon(end, polygon), false, `${label}: ${methylLocant} endpoint is outside ring ${ring.id}`);
      for (let step = 1; step <= 20; step += 1) {
        const progress = step / 20;
        assert.equal(pointInPolygon({
          x: start.x + (end.x - start.x) * progress,
          y: start.y + (end.y - start.y) * progress,
        }, polygon), false, `${label}: ${methylLocant} bond does not traverse ring ${ring.id}`);
      }
    }
  }
}

test("PubChem steroid imports preserve constitutional graphs and place angular fusion substituents outside", async () => {
  const { fetchImpl } = mockedChemicalServices();
  for (const name of ["testosterona", "testosterone", "colesterol", "cholesterol"]) {
    const result = await resolveChemicalName(name, { fetchImpl });
    assert.equal(result.ok, true, name);
    const imported = moleculeFromSmiles(result.value.smiles);
    assert.equal(imported.ok, true, name);
    const snapshot = structuredClone(imported.molecule);
    const importedPositions = new Map(imported.molecule.atoms.map((atom) => [atom.id, atom]));
    assertAngularMethylBondsOutsideRingPolygons(imported.molecule, importedPositions, `${name} importer`);
    assertAngularMethylBondsOutsideRingPolygons(
      imported.molecule,
      calculateMolecule2DLayout(imported.molecule, []),
      `${name} final canvas layout`,
    );
    assert.deepEqual(imported.molecule, snapshot, "layout is display-only");
    if (name.includes("testoster")) {
      assert.equal(
        getSteroidLike6565System(imported.molecule)?.constitutionNameEs,
        "17-hidroxiandrost-4-en-3-ona",
        "the imported testosterone constitution matches the locally recognized steroid constitution",
      );
    }
  }
});

test("testosterone common and systematic names have equivalent connectivity and exterior final geometry", async () => {
  const { fetchImpl } = mockedChemicalServices();
  const results = [];
  for (const name of ["testosterona", "17-hidroxiandrost-4-en-3-ona"]) {
    const resolution = await resolveChemicalName(name, { fetchImpl });
    assert.equal(resolution.ok, true, name);
    const inspection = inspectSmilesStructure(resolution.value.smiles);
    const imported = moleculeFromSmiles(resolution.value.smiles);
    assert.equal(inspection.ok, true, name);
    assert.equal(imported.ok, true, name);
    assertAngularMethylBondsOutsideRingPolygons(
      imported.molecule,
      calculateMolecule2DLayout(imported.molecule, []),
      name,
    );
    results.push(imported.molecule);
  }
  assert.equal(molecularGraphsAreIsomorphic(results[0], results[1]), true);
});

test("a verified Spanish equivalence is rejected if PubChem returns the wrong identity", async () => {
  const result = await resolveChemicalName("colesterol", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("ebi.ac.uk/opsin")) return json({ status: "FAILURE" }, 404);
      if (url.includes("/name/colesterol/")) return json({}, 404);
      if (url.includes("/name/cholesterol/")) return json({ IdentifierList: { CID: [5997] } });
      return json({ PropertyTable: { Properties: [{
        CID: 5997,
        IUPACName: "wrong identity",
        InChIKey: "AAAAAAAAAAAAAA-BBBBBBBBBB-C",
        IsomericSMILES: fixtures.find(({ cid }) => cid === 5997).smiles,
        MolecularFormula: "C27H46O",
      }] } });
    },
  });
  assert.equal(result.ok, false);
});

test("rejects caffeine safely because its fused heterocycle is outside current canvas coverage", async () => {
  const { fetchImpl } = mockedChemicalServices();
  for (const name of ["cafeína", "caffeine"]) {
    const result = await resolveChemicalName(name, { fetchImpl });
    assert.equal(result.ok, false, name);
    assert.match(result.error, /no pudieron resolver/i, name);
  }
});

test("keeps OPSIN first and does not query PubChem after an existing successful resolution", async () => {
  const calls = [];
  const result = await resolveChemicalName("propan-2-one", {
    fetchImpl: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("ebi.ac.uk/opsin")) {
        return json({ status: "SUCCESS", smiles: "CC(=O)C" });
      }
      throw new Error("PubChem must not be called");
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.source, "OPSIN");
  assert.equal(calls.some((url) => url.includes("pubchem")), false);
});

test("rejects ambiguous PubChem synonym results with different identities", async () => {
  const result = await resolveChemicalName("nombre ambiguo", {
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("ebi.ac.uk/opsin")) return json({ status: "FAILURE" }, 404);
      if (url.includes("/name/")) return json({ IdentifierList: { CID: [10, 11] } });
      return json({ PropertyTable: { Properties: [
        { CID: 10, InChIKey: "FIRST", IsomericSMILES: "CCO", MolecularFormula: "C2H6O" },
        { CID: 11, InChIKey: "SECOND", IsomericSMILES: "COC", MolecularFormula: "C2H6O" },
      ] } });
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /varias estructuras/i);
});

test("rejects PubChem records with incompatible structures or mismatched formulae", async () => {
  for (const property of [
    { CID: 12, InChIKey: "PHOSPHORUS", IsomericSMILES: "CP", MolecularFormula: "CH5P" },
    { CID: 13, InChIKey: "BAD-FORMULA", IsomericSMILES: "CCO", MolecularFormula: "C3H8O" },
  ]) {
    const result = await resolveChemicalName("registro incompatible", {
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("ebi.ac.uk/opsin")) return json({ status: "FAILURE" }, 404);
        if (url.includes("/name/")) return json({ IdentifierList: { CID: [property.CID] } });
        return json({ PropertyTable: { Properties: [property] } });
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.error, /no pudieron resolver/i);
  }
});
