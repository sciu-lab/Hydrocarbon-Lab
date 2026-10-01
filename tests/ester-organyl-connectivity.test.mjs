import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { validateExerciseDomain } from "../app/exercise-domain.ts";
import { translateSpanishIupacForDisplay, translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";
import { applyNomenclatureConvention } from "../app/nomenclature-conventions.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";
import { digest, interpretedStructure, loadSnapshots, structuralIdentity } from "./helpers/reference-corpus.mjs";

let chemistry, interpretations;
const originalFetch = globalThis.fetch;
let networkRequests = 0;
before(async () => {
  globalThis.fetch = async () => { networkRequests += 1; throw new Error("Ester connectivity tests must run offline"); };
  chemistry = await loadExerciseChemistry();
  interpretations = loadSnapshots();
  const evidence = JSON.parse(readFileSync(new URL("./fixtures/ester-organyl-interpretations.json", import.meta.url)));
  assert.equal(evidence.schemaVersion, 1);
  for (const item of evidence.responses) {
    assert.equal(item.sha256, digest(item.body), `${item.name}: intact independent response`);
    assert.equal(item.url, `https://www.ebi.ac.uk/opsin/ws/${encodeURIComponent(item.name)}.json`);
    assert.equal(item.httpStatus, 200);
    assert.ok(Number.isFinite(Date.parse(item.retrievedAt)));
    assert.equal(JSON.parse(item.body).status, "SUCCESS");
    if (interpretations.has(item.name)) {
      // A later corpus phase may admit one of these structural fixtures. Both
      // independent receipts must still describe the same graph; keep the
      // corpus receipt intact rather than replacing it with this fixture.
      assert.equal(interpretedStructure(item.name, interpretations).identity,
        structuralIdentity(JSON.parse(item.body).smiles), `${item.name}: corpus/fixture graph disagreement`);
    } else interpretations.set(item.name, item);
  }
});
after(async () => { try { await chemistry?.close(); } finally { globalThis.fetch = originalFetch; } });

// These are structural fixtures, not preferred-name oracles. Fragment identities
// and attachment degrees are assigned from their graphs. OPSIN responses were
// obtained for independently proposed names BEFORE modifying the namer.
// The last field only pins unchanged simple outputs, not branched spellings.
const fixtures = [
  ["methyl", "COC(=O)C", 1, 0, "etanoato", "methyl ethanoate"],
  ["ethyl", "CCOC(=O)C", 2, 1, "etanoato", "ethyl ethanoate"],
  ["linear C3", "CCCOC(=O)C", 3, 1, "etanoato", "propyl ethanoate"],
  ["REFERENCE-005 / secondary C3", "CC(OC(=O)C)C", 3, 2, "etanoato"],
  ["linear C4", "CCCCOC(=O)C", 4, 1, "etanoato", "butyl ethanoate"],
  ["secondary C4", "CCC(OC(=O)C)C", 4, 2, "etanoato"],
  ["branched C4 with terminal attachment", "CC(C)COC(=O)C", 4, 1, "etanoato"],
  ["tertiary C4", "CC(C)(C)OC(=O)C", 4, 3, "etanoato"],
  ["secondary C3 with longer acid", "CCC(=O)OC(C)C", 3, 2, "propanoato"],
  ["secondary C3 with branched acid", "CC(C)C(=O)OC(C)C", 3, 2, "2-metilpropanoato"],
];

function parse(smiles) {
  const parsed = moleculeFromSmiles(smiles);
  assert.equal(parsed.ok, true, parsed.error);
  return parsed.molecule;
}

// Independent graph inspection: do not derive the attachment truth from the
// namer's functional-group detector, its organyl name, or the corpus expected.
function esterFragments(molecule) {
  const elements = new Map(molecule.atoms.map((atom) => [atom.id, atom.element ?? "C"]));
  const neighbors = (id) => molecule.bonds.flatMap(([a, b, order = 1]) =>
    a === id ? [{ id: b, order }] : b === id ? [{ id: a, order }] : []);
  const acidRoot = molecule.atoms.find((atom) => elements.get(atom.id) === "C"
    && neighbors(atom.id).some((item) => item.order === 2 && elements.get(item.id) === "O"));
  assert.ok(acidRoot);
  const oxygen = neighbors(acidRoot.id).find((item) => item.order === 1 && elements.get(item.id) === "O");
  assert.ok(oxygen);
  const attachment = neighbors(oxygen.id).find((item) => item.id !== acidRoot.id && elements.get(item.id) === "C");
  assert.ok(attachment);
  const component = (start) => {
    const seen = new Set(), pending = [start];
    while (pending.length) {
      const id = pending.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      pending.push(...neighbors(id).filter((item) => elements.get(item.id) === "C").map((item) => item.id));
    }
    return seen;
  };
  return { acidRoot: acidRoot.id, oxygen: oxygen.id, attachment: attachment.id,
    acid: component(acidRoot.id), organyl: component(attachment.id),
    attachmentDegree: neighbors(attachment.id).filter((item) => elements.get(item.id) === "C").length };
}

function names(molecule) {
  const analysis = chemistry.engine.analyzeMolecule(molecule);
  assert.equal(chemistry.engine.localNamerCannotSafelyName(molecule, analysis), false);
  const es = chemistry.engine.suggestedIupacNameWithOmittedLocants(analysis);
  return { analysis, es, current: applyNomenclatureConvention(translateSpanishIupacForDisplay(es), "current", "en"),
    legacy: chemistry.oracles.reference(molecule).names.en };
}

function sameInterpretedGraph(name, inputSmiles) {
  const interpreted = interpretedStructure(name, interpretations);
  assert.equal(interpreted.status, "PASS", `${name}: ${interpreted.reason ?? "missing offline OPSIN evidence"}`);
  assert.equal(interpreted.identity, structuralIdentity(inputSmiles), `${name}: OPSIN must reconstruct the original graph`);
  return interpreted.identity;
}

function remapped(molecule) {
  const ids = new Map(molecule.atoms.map((atom, index) => [atom.id, 903 + index * 37]));
  return { ...structuredClone(molecule),
    atoms: molecule.atoms.map((atom, index) => ({ ...atom, id: ids.get(atom.id), x: -atom.y * 3 + index, y: atom.x * 2 - index })).reverse(),
    bonds: molecule.bonds.map(([a, b, ...rest]) => [ids.get(b), ids.get(a), ...rest]).reverse() };
}

for (const [label, smiles, carbonCount, attachmentDegree, acidName, stableName] of fixtures) {
  test(`${label}: organyl attachment and OPSIN graph, current/ES/legacy and arbitrary IDs`, () => {
    const input = parse(smiles), original = names(input);
    if (stableName) assert.equal(original.current, stableName, "existing simple esters remain unchanged");
    for (const molecule of [input, remapped(input)]) {
      const snapshot = structuredClone(molecule);
      assert.equal(validateExerciseDomain(molecule, "ester", chemistry.oracles).valid, true);
      const graph = esterFragments(molecule), generated = names(molecule);
      assert.equal(graph.organyl.size, carbonCount);
      assert.equal(graph.attachmentDegree, attachmentDegree);
      assert.ok([...graph.organyl].every((id) => !graph.acid.has(id)));
      const ester = generated.analysis.functionalGroups.find((group) => group.kind === "ester");
      assert.equal(ester.alkylCarbonId, graph.attachment, "detector preserves the actual O-linked carbon");
      assert.equal(ester.carbonId, graph.acidRoot);
      assert.ok(generated.analysis.mainChain.every((id) => !graph.organyl.has(id)));
      for (const name of [generated.current, translateSpanishIupacToOpsin(generated.es), generated.legacy]) {
        sameInterpretedGraph(name, smiles);
      }
      const traditional = chemistry.engine.buildTraditionalMoleculeStructure(molecule, generated.analysis);
      const noun = traditional.groups.find((group) => group.type === "ester").alkylNames[0];
      sameInterpretedGraph(translateSpanishIupacToOpsin(`${acidName} de ${noun}`), smiles);
      assert.equal(generated.current, original.current, "atom/bond order, IDs and coordinates cannot change the name");
      assert.equal(generated.legacy, original.legacy);
      assert.deepEqual(molecule, snapshot, "naming cannot mutate the molecular graph");
      const exported = moleculeToSmiles(molecule);
      assert.equal(exported.ok, true);
      assert.equal(structuralIdentity(exported.smiles), structuralIdentity(smiles));
    }
  });
}

for (const [label, indices] of [["C3 attachment isomers", [2, 3]], ["C4 connectivity/attachment isomers", [4, 5, 6, 7]]]) {
  test(`${label}: same carbon count must not collapse into one organyl name or graph`, () => {
    const selected = indices.map((index) => fixtures[index]);
    const generated = selected.map((fixture) => names(parse(fixture[1])).current);
    const reconstructed = generated.map((name, index) => sameInterpretedGraph(name, selected[index][1]));
    assert.equal(new Set(generated).size, selected.length);
    assert.equal(new Set(reconstructed).size, selected.length);
  });
}

test("ESTER-0007 is rooted on the central C of a three-carbon path, not an endpoint", () => {
  const graph = esterFragments(parse("CC(OC(=O)C)C"));
  assert.equal(graph.organyl.size, 3);
  assert.equal(graph.acid.size, 2);
  assert.equal(graph.attachmentDegree, 2);
  assert.notEqual(structuralIdentity("CC(OC(=O)C)C"), structuralIdentity("CCCOC(=O)C"));
});

test("ester organyl structural regression tests made no network requests", () => {
  assert.equal(networkRequests, 0);
});
