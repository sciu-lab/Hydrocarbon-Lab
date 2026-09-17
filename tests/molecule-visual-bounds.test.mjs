import assert from "node:assert/strict";
import test from "node:test";

import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import {
  getMoleculeExportDimensions,
  getMoleculeVisualBounds,
  moleculeVisualBoundsViewBox,
} from "../app/molecule-visual-bounds.ts";

function build(name) {
  const result = buildHydrocarbonFromIupacName(name);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  return result.molecule;
}

test("one visual frame contains every regression structure used by canvas, export and preview", () => {
  const cases = [
    ["metano", build("metano")],
    ["hexano", build("hexano")],
    ["ciclohexano", build("ciclohexano")],
    ["ciclooctano", build("ciclooctano")],
    ["1-etil-3-metilbenceno", build("1-etil-3-metilbenceno")],
    ["vinilciclohexano", build("vinilciclohexano")],
    ["C20", build("icosano")],
    ["grupo funcional", build("4-(2-hidroxietil)hexano")],
  ];

  for (const [name, molecule] of cases) {
    const positions = calculateMolecule2DLayout(molecule, molecule.atoms.map((atom) => atom.id));
    const bounds = getMoleculeVisualBounds(positions.values());
    assert.ok([bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite), name);
    assert.ok(bounds.width > 0 && bounds.height > 0, name);
    assert.ok(bounds.padding > 0, name);
    for (const point of positions.values()) {
      assert.ok(point.x >= bounds.x && point.x <= bounds.x + bounds.width, `${name}: x`);
      assert.ok(point.y >= bounds.y && point.y <= bounds.y + bounds.height, `${name}: y`);
    }

    const viewBox = moleculeVisualBoundsViewBox(bounds).split(" ").map(Number);
    assert.equal(viewBox.length, 4, `${name}: SVG viewBox has all four coordinates`);
    assert.ok(viewBox.every(Number.isFinite), `${name}: SVG viewBox is finite`);
    const png = getMoleculeExportDimensions(bounds, 1600);
    assert.ok(png.width > 0 && png.height > 0, `${name}: PNG dimensions use the same frame`);
    assert.ok(Math.abs(png.width / png.height - bounds.width / bounds.height) < 0.01, `${name}: PNG preserves frame aspect`);
  }
});

test("the ethyl and methyl branches of 1-etil-3-metilbenceno remain inside its export frame", () => {
  const molecule = build("1-etil-3-metilbenceno");
  const positions = calculateMolecule2DLayout(molecule, molecule.atoms.map((atom) => atom.id));
  const bounds = getMoleculeVisualBounds(positions.values());
  assert.equal(molecule.atoms.length, 9, "six ring carbons plus ethyl and methyl");
  for (const atom of molecule.atoms) {
    const point = positions.get(atom.id);
    assert.ok(point, `atom ${atom.id} has export geometry`);
    assert.ok(point.x >= bounds.x && point.x <= bounds.x + bounds.width, `atom ${atom.id} x is included`);
    assert.ok(point.y >= bounds.y && point.y <= bounds.y + bounds.height, `atom ${atom.id} y is included`);
  }
});
