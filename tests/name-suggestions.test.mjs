import assert from "node:assert/strict";
import test from "node:test";

import {
  chemicalLevenshtein,
  damerauLevenshteinDistance,
  findCommonNameSuggestion,
  generateVariants,
  jaroWinklerSimilarity,
  levenshteinDistance,
  normalizeChemicalInput,
  tokenizeIupacName,
} from "../app/name-suggestions.ts";
import {
  canToggleBondStereochemistry,
  getVisibleBondInteractionHintActions,
} from "../app/bond-interaction-hints.ts";

test("suggests close spellings from the common molecule catalog in both languages", () => {
  assert.deepEqual(findCommonNameSuggestion("fenool", "es"), { id: "phenol", name: "fenol" });
  assert.deepEqual(findCommonNameSuggestion("benzeno", "en"), { id: "benzene", name: "benzene" });
  assert.deepEqual(findCommonNameSuggestion("ciclohexno", "es"), { id: "cyclohexane", name: "ciclohexano" });
  assert.deepEqual(findCommonNameSuggestion("ethnol", "en"), { id: "ethanol", name: "ethanol" });
});

test("includes the ten requested common molecule families", () => {
  for (const [input, id] of [
    ["bencenoo", "benzene"],
    ["fenool", "phenol"],
    ["ciclohexno", "cyclohexane"],
    ["etanlo", "ethanol"],
    ["propanlo", "propanol"],
    ["butanlo", "butanol"],
    ["hexnao", "hexane"],
    ["hexenoo", "hexene"],
    ["propenno", "propene"],
    ["butenoo", "butene"],
  ]) {
    assert.equal(findCommonNameSuggestion(input, "es")?.id, id, input);
  }
});

test("does not offer broad suggestions for unrelated or exact input", () => {
  assert.deepEqual(findCommonNameSuggestion("glucosa", "es"), { id: "glucose", name: "glucosa" });
  assert.equal(findCommonNameSuggestion("benceno", "es"), null);
  assert.equal(findCommonNameSuggestion("xy", "es"), null);
});

test("calculates standard edit distance after normalizing accents and punctuation", () => {
  assert.equal(levenshteinDistance("ácido", "acido"), 0);
  assert.equal(levenshteinDistance("hex-1-eno", "hexeno"), 1);
});

test("does not replace valid unlocanted oxygenated parents with alkanes", () => {
  ["hexanol", "hexanal", "hexanona", "ácido hexanoico"].forEach((name) => {
    assert.equal(findCommonNameSuggestion(name, "es"), null, name);
  });
});

test("uses transposition, similarity, and IUPAC tokens for conservative corrections", () => {
  assert.equal(damerauLevenshteinDistance("etanlo", "etanol"), 1);
  assert.ok(jaroWinklerSimilarity("pentano-2,3-diol", "pentan-2,3-diol") > 0.9);
  assert.deepEqual(tokenizeIupacName("4-cloropent-2-eno"), {
    parent: "pent",
    suffix: "eno",
    locants: ["4", "2"],
    substituents: ["cloro"],
  });
  assert.deepEqual(findCommonNameSuggestion("pentano-2,3-diol", "es"), {
    id: "systematic-format",
    name: "pentan-2,3-diol",
  });
  assert.equal(findCommonNameSuggestion("butan-1,4-diol", "es"), null);
});

test("corrects Spanish diol presentations before they reach the chemical parser", () => {
  for (const [input, expected] of [
    ["butano-1,4-diol", "butan-1,4-diol"],
    ["pentano-2,3-diol", "pentan-2,3-diol"],
    ["propano-1,2-diol", "propan-1,2-diol"],
    ["hexano-1,6-diol", "hexan-1,6-diol"],
    ["butano-2,3-diol", "butan-2,3-diol"],
    ["pentano-1,5-diol", "pentan-1,5-diol"],
    ["heptano-2,3-diol", "heptan-2,3-diol"],
    ["octano-1,8-diol", "octan-1,8-diol"],
    ["1,2-propanodiol", "propan-1,2-diol"],
  ]) {
    assert.deepEqual(findCommonNameSuggestion(input, "es"), {
      id: "systematic-format",
      name: expected,
    }, input);
  }
});

test("repairs inserted, omitted, transposed, and substituted chemical letters", () => {
  for (const [input, expected] of [
    ["butano-1,4-diolo", "butan-1,4-diol"],
    ["butan-1,4-dol", "butan-1,4-diol"],
    ["pentano-2,3-dil", "pentan-2,3-diol"],
    ["etan-1,2-dil", "etan-1,2-diol"],
    ["buntao-1,4-diol", "butan-1,4-diol"],
    ["pentna-2,3-diol", "pentan-2,3-diol"],
    ["propna-1,2-diol", "propan-1,2-diol"],
    ["hexna-1,6-diol", "hexan-1,6-diol"],
    ["butano-1,4-diel", "butan-1,4-diol"],
    ["pentano-2,3-dial", "pentan-2,3-diol"],
    ["propan-1,2-dial", "propan-1,2-diol"],
    ["propanol-2", "propan-2-ol"],
    ["pentol-2", "pentan-2-ol"],
  ]) {
    assert.deepEqual(findCommonNameSuggestion(input, "es"), {
      id: "systematic-format",
      name: expected,
    }, input);
  }
  assert.deepEqual(findCommonNameSuggestion("etanolol", "es"), { id: "ethanol", name: "etanol" });
  assert.equal(findCommonNameSuggestion("propan-2-ol", "es"), null);
});

test("normalizes common-name aliases and weights connecting vowels lightly", () => {
  assert.equal(normalizeChemicalInput("  propano – 1, 2 - diol  "), "propano-1,2-diol");
  assert.ok(chemicalLevenshtein("pentano-2,3-diol", "pentan-2,3-diol")
    < chemicalLevenshtein("pentano-2,3-diol", "butan-2,3-diol"));
  assert.ok(generateVariants("pentano-2,3-diol", "es").includes("pentan-2,3-diol"));
  assert.deepEqual(findCommonNameSuggestion("etilenglicol", "es"), { id: "ethanediol", name: "etan-1,2-diol" });
  assert.deepEqual(findCommonNameSuggestion("propilenglicol", "es"), { id: "propanediol", name: "propan-1,2-diol" });
  assert.deepEqual(findCommonNameSuggestion("glicerina", "es"), { id: "glycerol", name: "propan-1,2,3-triol" });
  assert.deepEqual(findCommonNameSuggestion("alcohol etilico", "es"), { id: "ethanol-systematic", name: "etan-1-ol" });
  assert.deepEqual(findCommonNameSuggestion("alcohol isopropilico", "es"), { id: "isopropanol", name: "propan-2-ol" });
});

test("keeps long preferred diols and modernizes their school-style spelling", () => {
  assert.equal(findCommonNameSuggestion("tetracontan-2,3-diol", "es"), null);
  assert.deepEqual(findCommonNameSuggestion("tetracontano-2,3-diol", "es"), {
    id: "systematic-format",
    name: "tetracontan-2,3-diol",
  });
  const schoolLocants = Array.from({ length: 19 }, (_unused, index) => index + 2).join(",");
  assert.deepEqual(findCommonNameSuggestion(`${schoolLocants}-icosanodiol`, "es"), {
    id: "systematic-format",
    name: `icosan-${schoolLocants}-diol`,
  });
});

test("hides only the E/Z canvas hint while stereochemistry is off", () => {
  const actions = ["change-order", "switch-ez"];
  assert.deepEqual(getVisibleBondInteractionHintActions(actions, false), ["change-order"]);
  assert.deepEqual(getVisibleBondInteractionHintActions(actions, true), actions);
  assert.equal(canToggleBondStereochemistry(false, true), false);
  assert.equal(canToggleBondStereochemistry(true, true), true);
});
