import assert from "node:assert/strict";
import test from "node:test";

import { HETEROCYCLE_DEFINITIONS } from "../app/heterocycle-registry.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { resolveNameWithOpsin } from "../app/opsin-name-resolver.ts";

function topologySignature(molecule) {
  const byId = new Map(molecule.atoms.map((atom) => [atom.id, atom.element ?? "C"]));
  return {
    atoms: [...byId.values()].sort(),
    bonds: molecule.bonds
      .map(([left, right, order = 1]) => [byId.get(left), byId.get(right)].sort().join("-") + `:${order}`)
      .sort(),
    rings: (molecule.rings ?? [])
      .map((ring) => `${ring.kind}:${ring.atomIds.length}`)
      .sort(),
  };
}

test("the shared registry contains exactly the heterocycles already supported by the editor", () => {
  assert.deepEqual(
    HETEROCYCLE_DEFINITIONS.map((definition) => definition.id),
    [
      "pyrrole", "furan", "thiophene", "pyridine",
      "oxirane", "aziridine", "oxetane", "azetidine",
      "pyrrolidine", "tetrahydrofuran", "dioxolane", "piperidine",
      "tetrahydropyran", "morpholine", "dioxane",
    ],
  );
});

test("name builder and Rings-palette definitions materialize identical heterocycle topology", async () => {
  for (const definition of HETEROCYCLE_DEFINITIONS) {
    const fromPalette = moleculeFromSmiles(definition.smiles);
    assert.equal(fromPalette.ok, true, definition.id);
    const fromName = await resolveNameWithOpsin(definition.name.es, {
      fetchImpl: async () => { throw new Error("the registry must resolve this before network access"); },
    });
    assert.equal(fromName.ok, true, definition.id);
    assert.equal(fromName.value.source, "integrated-fallback", definition.id);
    assert.equal(fromName.value.smiles, definition.smiles, definition.id);

    const nameGraph = moleculeFromSmiles(fromName.value.smiles);
    assert.equal(nameGraph.ok, true, definition.id);
    assert.deepEqual(topologySignature(nameGraph.molecule), topologySignature(fromPalette.molecule), definition.id);
    assert.equal(fromPalette.molecule.rings?.[0].kind, definition.kind, definition.id);
    assert.equal(fromPalette.molecule.rings?.[0].atomIds.length, definition.size, definition.id);
    assert.ok(fromPalette.molecule.atoms.some((atom) => (atom.element ?? "C") !== "C"), definition.id);

    const exported = moleculeToSmiles(fromPalette.molecule);
    assert.equal(exported.ok, true, definition.id);
  }
});
