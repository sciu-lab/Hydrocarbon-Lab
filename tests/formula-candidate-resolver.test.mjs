import assert from "node:assert/strict";
import test from "node:test";
import { createFormulaCandidateResolver, editorRoundTripPreservesSmiles } from "../app/formula-candidate-resolver.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

const glucose = "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O";
const glucoseEpimer = "C([C@@H]1[C@@H]([C@@H]([C@H](C(O1)O)O)O)O)O";
const glucoseIsomer3 = "C([C@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O";
const glucoseIsomer4 = "C([C@@H]1[C@H]([C@H]([C@H](C(O1)O)O)O)O)O";
const glucoseIsomer5 = "C([C@H]1[C@@H]([C@H]([C@H](C(O1)O)O)O)O)O";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function records(smilesList, { formula = "C6H12O6", duplicateFirst = false } = {}) {
  const rows = smilesList.map((smiles, index) => ({
    CID: index + 1,
    MolecularFormula: formula,
    IsomericSMILES: smiles,
    ...(index === 0 ? { IUPACName: "D-glucose", InChIKey: "WQZGKKKJIJFFOK-GASJEMHNSA-N" } : {}),
  }));
  if (duplicateFirst && rows.length > 1) rows[1] = { ...rows[0], CID: rows[1].CID };
  return rows;
}

function createFetch({ cids = [1, 2, 3, 4, 5], properties, cidResponse, failAt, onCall } = {}) {
  return async (input, init = {}) => {
    const url = String(input);
    onCall?.(url, init);
    if (failAt === "network") throw new TypeError("network unavailable");
    if (url.includes("/fastformula/")) {
      if (failAt === "cid-http") return json({}, 503);
      return cidResponse ?? json({ IdentifierList: { CID: cids } });
    }
    if (failAt === "properties-http") return json({}, 500);
    return json(properties ?? { PropertyTable: { Properties: records([glucose, glucoseEpimer, glucoseIsomer3, glucoseIsomer4, glucoseIsomer5]) } });
  };
}

test("fetches at most five PubChem candidates and accepts verified C6H12O6 structures including glucose", async () => {
  const calls = [];
  const resolver = createFormulaCandidateResolver({
    fetchImpl: createFetch({ cids: [1, 2, 3, 4, 5, 6, 7], onCall: (url) => calls.push(url) }),
  });
  const result = await resolver.search("C6H12O6");
  assert.equal(result.status, "success");
  assert.equal(result.acceptedCount, 5);
  assert.equal(result.candidates[0].iupacName, "D-glucose");
  assert.equal(result.candidates[0].cid, 1);
  assert.match(calls[0], /MaxRecords=5/);
  assert.match(calls[1], /\/cid\/1,2,3,4,5\/property\//);
  assert.equal(result.candidates.every((candidate) => candidate.molecularFormula === "C6H12O6"), true);
  assert.equal(result.candidates.every((candidate) => candidate.molecule.atoms.some((atom) => atom.element === "O")), true);
});

test("rejects records whose reported formula matches but structure formula does not", async () => {
  const resolver = createFormulaCandidateResolver({ fetchImpl: createFetch({ cids: [1], properties: { PropertyTable: { Properties: records(["CCO"])} } }) });
  const result = await resolver.search("C6H12O6");
  assert.equal(result.status, "no-compatible-candidates");
  assert.equal(result.rejectedCount, 1);
});

test("rejects invalid and disconnected structures and detects loss of specified stereo", async () => {
  for (const smiles of ["C1(", "C1CCCCC1.O.O.O.O.O"]) {
    const resolver = createFormulaCandidateResolver({ fetchImpl: createFetch({ cids: [1], properties: { PropertyTable: { Properties: records([smiles]) } } }) });
    assert.equal((await resolver.search("C6H12O6")).status, "no-compatible-candidates");
  }
  const glucoseGraph = moleculeFromSmiles(glucose);
  assert.equal(glucoseGraph.ok, true);
  if (glucoseGraph.ok) {
    assert.equal(editorRoundTripPreservesSmiles(glucose, glucoseGraph.molecule), true);
    const lostCenterIndex = glucoseGraph.molecule.atoms.findIndex((atom) => atom.tetrahedralParity);
    const stereoDropped = {
      ...glucoseGraph.molecule,
      atoms: glucoseGraph.molecule.atoms.map((atom, index) => index === lostCenterIndex
        ? { ...atom, tetrahedralParity: undefined, tetrahedralBondTo: undefined }
        : atom),
    };
    assert.equal(editorRoundTripPreservesSmiles(glucose, stereoDropped), false);
  }
  // The adapter currently preserves this explicit alkene stereo through its own round trip.
  const alkene = "C/C=C/C";
  const resolver = createFormulaCandidateResolver({
    fetchImpl: createFetch({ cids: [1], properties: { PropertyTable: { Properties: [{ CID: 1, MolecularFormula: "C4H8", IsomericSMILES: alkene }] } } }),
  });
  const result = await resolver.search("C4H8");
  assert.equal(result.status, "success");
  assert.equal(result.candidates[0].structureKey, "C/C=C/C");
});

test("deduplicates identical structures without collapsing stereoisomers", async () => {
  const resolver = createFormulaCandidateResolver({
    fetchImpl: createFetch({ cids: [1, 2, 3], properties: { PropertyTable: { Properties: records([glucose, glucose, glucoseEpimer], { duplicateFirst: true }).slice(0, 3) } } }),
  });
  const result = await resolver.search("C6H12O6");
  assert.equal(result.status, "success");
  assert.equal(result.candidates.length, 2);
  assert.notEqual(result.candidates[0].structureKey, result.candidates[1].structureKey);
  assert.equal(result.rejectedCount, 1);
});

test("distinguishes no records from records with no acceptable candidate", async () => {
  const noRecords = createFormulaCandidateResolver({ fetchImpl: createFetch({ cids: [] }) });
  assert.equal((await noRecords.search("C6H12O6")).status, "no-records");
  const incompatible = createFormulaCandidateResolver({ fetchImpl: createFetch({ cids: [1], properties: { PropertyTable: { Properties: [] } } }) });
  assert.equal((await incompatible.search("C6H12O6")).status, "no-compatible-candidates");
});

test("returns separate service, cancellation and malformed-response states", async () => {
  for (const failAt of ["network", "cid-http", "properties-http"]) {
    const resolver = createFormulaCandidateResolver({ fetchImpl: createFetch({ failAt }) });
    assert.equal((await resolver.search("C6H12O6")).status, "service-error");
  }
  const malformed = createFormulaCandidateResolver({ fetchImpl: createFetch({ cidResponse: json({ broken: true }) }) });
  assert.equal((await malformed.search("C6H12O6")).status, "invalid-response");
  const malformedCids = createFormulaCandidateResolver({ fetchImpl: createFetch({ cidResponse: json({ IdentifierList: { CID: ["not-a-cid"] } }) }) });
  assert.equal((await malformedCids.search("C6H12O6")).status, "invalid-response");
  const controller = new AbortController();
  controller.abort();
  const cancelled = createFormulaCandidateResolver({ fetchImpl: createFetch({}) });
  assert.equal((await cancelled.search("C6H12O6", controller.signal)).status, "cancelled");
  assert.equal((await cancelled.search("hello")).status, "invalid-formula");
});

test("treats missing properties as rejected records and caches successful searches by normalized formula", async () => {
  let requests = 0;
  const resolver = createFormulaCandidateResolver({
    fetchImpl: createFetch({ cids: [1], properties: { PropertyTable: { Properties: [{ CID: 1 }] } }, onCall: () => requests++ }),
  });
  const first = await resolver.search("c6h12o6");
  assert.equal(first.status, "no-compatible-candidates");
  assert.equal(first.rejectedCount, 1);
  await resolver.search("C6H12O6");
  assert.equal(requests, 2);
  resolver.clearCache();
  await resolver.search("C6H12O6");
  assert.equal(requests, 4);
});
