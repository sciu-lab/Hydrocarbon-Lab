import assert from "node:assert/strict";
import test from "node:test";

import {
  getOpsinNameCandidates,
  normalizeHalogenatedNameForOpsin,
  translateSpanishIupacToOpsin,
} from "../app/iupac-name-normalization.ts";
import { applyNomenclatureConvention } from "../app/nomenclature-conventions.ts";

test("normalizes glued Spanish and English halogen names before OPSIN", () => {
  for (const [entered, normalized] of [
    ["bromoetano", "bromo-etano"],
    ["diclorometano", "di-cloro-metano"],
    ["fluorobenceno", "fluoro-benceno"],
    ["yodopropano", "yodo-propano"],
    ["bromoethane", "bromo-ethane"],
    ["dichloromethane", "di-chloro-methane"],
    ["fluorobenzene", "fluoro-benzene"],
  ]) {
    assert.equal(normalizeHalogenatedNameForOpsin(entered), normalized, entered);
  }

  assert.equal(
    normalizeHalogenatedNameForOpsin("bromo-etano"),
    "bromo-etano",
    "already hyphenated names remain unchanged",
  );
  assert.equal(translateSpanishIupacToOpsin("bromoetano"), "bromo-ethane");
  assert.deepEqual(getOpsinNameCandidates("bromoetano").slice(0, 2), [
    "bromo-ethane",
    "bromo-etano",
  ]);
});

test("uses hyphenated halogen names in IUPAC and school modes only", () => {
  assert.equal(applyNomenclatureConvention("bromoetano", "current", "es"), "bromo-etano");
  assert.equal(applyNomenclatureConvention("bromoetano", "school", "es"), "bromo-etano");
  assert.equal(applyNomenclatureConvention("bromoetano", "traditional", "es"), "bromoetano");
  assert.equal(applyNomenclatureConvention("diclorometano", "current", "es"), "di-cloro-metano");
  assert.equal(applyNomenclatureConvention("fluorobenceno", "school", "es"), "fluoro-benceno");

  assert.equal(applyNomenclatureConvention("bromoethane", "current", "en"), "bromo-ethane");
  assert.equal(applyNomenclatureConvention("bromoethane", "traditional", "en"), "bromoethane");
  assert.equal(applyNomenclatureConvention("dichloromethane", "current", "en"), "di-chloro-methane");
  assert.equal(applyNomenclatureConvention("fluorobenzene", "current", "en"), "fluoro-benzene");
});
