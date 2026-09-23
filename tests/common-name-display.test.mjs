import assert from "node:assert/strict";
import test from "node:test";

import { curatedCommonNameForSmiles } from "../app/curated-common-name-display.ts";
import { getCuratedCommonName } from "../app/nomenclature-conventions.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";

function editorSmiles(input) {
  const parsed = moleculeFromSmiles(input);
  assert.equal(parsed.ok, true);
  const exported = moleculeToSmiles(parsed.molecule);
  assert.equal(exported.ok, true);
  return exported.smiles;
}

test("acetone and toluene retain their curated common names in both locales", () => {
  for (const [systematic, es, en] of [
    ["propan-2-ona", "acetona", "acetone"],
    ["metilbenceno", "tolueno", "toluene"],
  ]) {
    assert.equal(getCuratedCommonName(systematic, "es"), es);
    assert.equal(getCuratedCommonName(systematic, "en"), en);
  }
});

test("TNT and glycerol aliases belong to exact editor graphs, not formulas or labels", () => {
  const tnt = editorSmiles("CC1=C(C=C(C=C1[N+](=O)[O-])[N+](=O)[O-])[N+](=O)[O-]");
  assert.equal(curatedCommonNameForSmiles(tnt, "es"), "TNT · 2,4,6-trinitrotolueno");
  assert.equal(curatedCommonNameForSmiles(tnt, "en"), "TNT · 2,4,6-trinitrotoluene");
  const glycerol = editorSmiles("OCC(O)CO");
  assert.equal(curatedCommonNameForSmiles(glycerol, "es"), "glicerol");
  assert.equal(curatedCommonNameForSmiles(glycerol, "en"), "glycerol");
  assert.equal(curatedCommonNameForSmiles(editorSmiles("OCCCO"), "es"), null);
  assert.equal(curatedCommonNameForSmiles(editorSmiles("CC(=O)C"), "es"), null);
  assert.equal(curatedCommonNameForSmiles(undefined, "en"), null);
  assert.equal(getCuratedCommonName("hexano", "es"), null);
});
