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
    ["diclorometano", "diclorometano"],
    ["fluorobenceno", "fluoro-benceno"],
    ["yodopropano", "yodo-propano"],
    ["bromoethane", "bromo-ethane"],
    ["dichloromethane", "dichloromethane"],
    ["fluorobenzene", "fluoro-benzene"],
  ]) {
    assert.equal(normalizeHalogenatedNameForOpsin(entered), normalized, entered);
  }

  assert.equal(
    normalizeHalogenatedNameForOpsin("bromo-etano"),
    "bromo-etano",
    "already hyphenated names remain unchanged",
  );
  assert.equal(normalizeHalogenatedNameForOpsin("2-bromopropano"), "2-bromopropano");
  assert.equal(normalizeHalogenatedNameForOpsin("2-bromo-propano"), "2-bromopropano");
  assert.equal(normalizeHalogenatedNameForOpsin("1,1-di-chloro-methane"), "dichloromethane");
  assert.equal(translateSpanishIupacToOpsin("bromoetano"), "bromo-ethane");
  assert.equal(translateSpanishIupacToOpsin("diclorometano"), "dichloromethane");
  assert.equal(
    translateSpanishIupacToOpsin("1-cloro-2-metilprop-1-en"),
    "1-chloro-2-methylprop-1-ene",
  );
  assert.deepEqual(getOpsinNameCandidates("bromoetano").slice(0, 2), [
    "bromo-ethane",
    "bromo-etano",
  ]);
});

test("uses hyphenated halogen names in IUPAC and school modes only", () => {
  assert.equal(applyNomenclatureConvention("bromoetano", "current", "es"), "bromo-etano");
  assert.equal(applyNomenclatureConvention("bromoetano", "school", "es"), "bromo-etano");
  assert.equal(applyNomenclatureConvention("bromoetano", "traditional", "es"), "bromoetano");
  assert.equal(applyNomenclatureConvention("2-bromopropano", "current", "es"), "2-bromopropano");
  assert.equal(applyNomenclatureConvention("2-bromo-propano", "school", "es"), "2-bromopropano");
  assert.equal(applyNomenclatureConvention("2-bromo-propano", "traditional", "es"), "2-bromopropano");
  assert.equal(applyNomenclatureConvention("2-bromo-propane", "current", "en"), "2-bromopropane");
  assert.equal(applyNomenclatureConvention("diclorometano", "current", "es"), "diclorometano");
  assert.equal(applyNomenclatureConvention("1,1-di-cloro-metano", "school", "es"), "diclorometano");
  assert.equal(applyNomenclatureConvention("fluorobenceno", "school", "es"), "fluoro-benceno");

  assert.equal(applyNomenclatureConvention("bromoethane", "current", "en"), "bromo-ethane");
  assert.equal(applyNomenclatureConvention("bromoethane", "traditional", "en"), "bromoethane");
  assert.equal(applyNomenclatureConvention("dichloromethane", "current", "en"), "dichloromethane");
  assert.equal(applyNomenclatureConvention("1,1-di-chloro-methane", "traditional", "en"), "dichloromethane");
  assert.equal(applyNomenclatureConvention("fluorobenzene", "current", "en"), "fluoro-benzene");
});
