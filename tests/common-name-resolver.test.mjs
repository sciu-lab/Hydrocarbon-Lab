import assert from "node:assert/strict";
import test from "node:test";

import { dynamicUiText } from "../app/i18n.ts";
import { resolveChemicalName } from "../app/name-structure-resolver.ts";
import { inspectSmilesStructure, moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

const fixtures = [
  { cid: 180, names: ["acetona", "acetone"], formula: "C3H6O", smiles: "CC(=O)C", iupac: "propan-2-one" },
  { cid: 3776, names: ["alcohol isopropilico", "isopropyl alcohol"], formula: "C3H8O", smiles: "CC(O)C", iupac: "propan-2-ol" },
  { cid: 176, names: ["acido acetico", "acetic acid"], formula: "C2H4O2", smiles: "CC(=O)O", iupac: "acetic acid" },
  { cid: 712, names: ["formaldehido", "formaldehyde"], formula: "CH2O", smiles: "C=O", iupac: "formaldehyde" },
  { cid: 177, names: ["acetaldehido", "acetaldehyde"], formula: "C2H4O", smiles: "CC=O", iupac: "acetaldehyde" },
  { cid: 753, names: ["glicerina", "glycerin"], formula: "C3H8O3", smiles: "OCC(O)CO", iupac: "propane-1,2,3-triol" },
  { cid: 1140, names: ["tolueno", "toluene"], formula: "C7H8", smiles: "Cc1ccccc1", iupac: "toluene" },
  {
    cid: 6013,
    names: ["testosterona", "testosterone"],
    formula: "C19H28O2",
    smiles: "C[C@]12CC[C@H]3[C@@H]([C@@H]1CC[C@@H]2O)CCC4=CC(=O)CC[C@]34C",
    iupac: "testosterone",
  },
  {
    cid: 5997,
    names: ["colesterol", "cholesterol"],
    formula: "C27H46O",
    smiles: "CC(C)CCC[C@@H](C)[C@H]1CC[C@@H]2[C@@H]3CC=C4C[C@@H](O)CC[C@]4(C)[C@H]3CC[C@]12C",
    iupac: "cholesterol",
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
      const fixture = byName.get(normalizeName(decodeURIComponent(nameMatch[1])));
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
          InChIKey: `FIXTURE-${fixture.cid}`,
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
  const { fetchImpl } = mockedChemicalServices();
  for (const fixture of fixtures.filter(({ iupac }) => !iupac.includes("purine"))) {
    const resolved = [];
    for (const name of fixture.names) {
      const result = await resolveChemicalName(name, { fetchImpl, timeoutMs: 1_000 });
      assert.equal(result.ok, true, name);
      if (result.value.source === "PubChem") {
        assert.equal(result.value.cid, fixture.cid, name);
        assert.equal(result.value.molecularFormula, fixture.formula, name);
      }
      assert.equal(moleculeFromSmiles(result.value.smiles).ok, true, name);
      const inspection = inspectSmilesStructure(result.value.smiles);
      assert.equal(inspection.ok, true, name);
      assert.equal(inspection.formula, fixture.formula, name);
      resolved.push(inspection.canonicalConnectivity);
    }
    assert.equal(resolved[0], resolved[1], fixture.iupac);
  }
});

test("warns when tetrahedral identity cannot be represented exactly", async () => {
  const { fetchImpl } = mockedChemicalServices();
  for (const name of ["testosterona", "testosterone", "colesterol", "cholesterol"]) {
    const result = await resolveChemicalName(name, { fetchImpl });
    assert.equal(result.ok, true, result.ok ? name : `${name}: ${result.error} ${result.detail}`);
    assert.match(result.value.warnings.join(" "), /estereoquímica tetraédrica/i, name);
  }
  const achiral = await resolveChemicalName("toluene", { fetchImpl });
  assert.equal(achiral.ok, true);
  assert.deepEqual(achiral.value.warnings, []);
  assert.match(
    dynamicUiText("en", "La estructura contiene estereoquímica tetraédrica que el canvas no puede representar de forma inequívoca; se conserva la conectividad, pero no se afirma una identidad estereoquímica exacta."),
    /exact stereochemical identity/i,
  );
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
