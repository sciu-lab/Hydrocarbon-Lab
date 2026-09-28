import assert from "node:assert/strict";
import test from "node:test";

import {
  getOpsinNameCandidates,
  normalizeHalogenatedNameForOpsin,
  translateSpanishIupacToOpsin,
  translateSpanishIupacForDisplay,
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

test("keeps halogen prefixes joined to the parent in current and traditional names", () => {
  assert.equal(applyNomenclatureConvention("bromoetano", "current", "es"), "bromoetano");
  assert.equal(applyNomenclatureConvention("bromoetano", "traditional", "es"), "bromoetano");
  assert.equal(applyNomenclatureConvention("2-bromopropano", "current", "es"), "2-bromopropano");
  assert.equal(applyNomenclatureConvention("2-bromo-propano", "traditional", "es"), "2-bromopropano");
  assert.equal(applyNomenclatureConvention("2-bromo-propane", "current", "en"), "2-bromopropane");
  assert.equal(applyNomenclatureConvention("diclorometano", "current", "es"), "diclorometano");

  assert.equal(applyNomenclatureConvention("bromoethane", "current", "en"), "bromoethane");
  assert.equal(applyNomenclatureConvention("bromoethane", "traditional", "en"), "bromoethane");
  assert.equal(applyNomenclatureConvention("dichloromethane", "current", "en"), "dichloromethane");
  assert.equal(applyNomenclatureConvention("1,1-di-chloro-methane", "traditional", "en"), "dichloromethane");
  assert.equal(applyNomenclatureConvention("fluorobenzene", "current", "en"), "fluorobenzene");
  assert.equal(applyNomenclatureConvention("2-iodo-hexane", "current", "en"), "2-iodohexane");
  assert.equal(applyNomenclatureConvention("3-metil-2-yodo-hexano", "current", "es"), "3-metil-2-yodohexano");
});

test("English display names alphabetize halogen and alkyl prefixes by their cited English names", () => {
  assert.equal(
    translateSpanishIupacForDisplay("3-metil-2-yodohexano"),
    "2-iodo-3-methylhexane",
  );
  assert.equal(
    translateSpanishIupacForDisplay("2-bromo-3-metilhexano"),
    "2-bromo-3-methylhexane",
  );
  assert.equal(
    translateSpanishIupacForDisplay("2-cloro-3-etilhexano"),
    "2-chloro-3-ethylhexane",
  );
  assert.equal(
    translateSpanishIupacForDisplay("2-fluoro-3-metilhexano"),
    "2-fluoro-3-methylhexane",
  );
  assert.equal(
    translateSpanishIupacForDisplay("2-bromo-3-cloro-4-fluoro-5-yodohexano"),
    "2-bromo-3-chloro-4-fluoro-5-iodohexane",
  );
  assert.equal(
    translateSpanishIupacForDisplay("2,3-dibromohexano"),
    "2,3-dibromohexane",
  );
});
