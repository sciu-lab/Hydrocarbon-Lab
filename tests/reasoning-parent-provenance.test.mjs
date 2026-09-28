import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { translateSpanishIupacForDisplay } from "../app/iupac-name-normalization.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
import { activateReasoningReference, scrollToReasoningStep } from "../app/reasoning-name-navigation.ts";
import { retainedFunctionalParentReasoning } from "../app/reasoning-functional-groups.ts";

let server;
let page;
before(async () => {
  server = await createServer({ configFile: false, logLevel: "error", appType: "custom",
    plugins: [react()], server: { middlewareMode: true, hmr: false } });
  page = await server.ssrLoadModule("/app/page.tsx");
});
after(async () => { await server?.close(); });

function analyzed(smiles) {
  const imported = moleculeFromSmiles(smiles);
  assert.equal(imported.ok, true);
  return { molecule: imported.molecule, analysis: page.analyzeMolecule(imported.molecule) };
}

function presented(compound, language, overrides = {}) {
  const spanish = page.buildIupacReasoningSteps(compound.molecule, compound.analysis);
  const steps = language === "en" ? page.buildEnglishReasoningSteps(spanish, compound.molecule, compound.analysis) : spanish;
  const name = language === "en" ? translateSpanishIupacForDisplay(compound.analysis.name) : compound.analysis.name;
  const fragments = deriveReasoningNameFragments({ analysis: compound.analysis, displayedName: name,
    language, steps, canHighlight: true, ...overrides });
  const parts = buildReasoningNameLinkParts(overrides.displayedName ?? name, fragments, overrides.steps ?? steps);
  assert.equal(parts.map((part) => part.text).join(""), overrides.displayedName ?? name);
  let cursor = 0;
  const ranges = [];
  for (const part of parts) {
    if (part.stepNumber) {
      assert.match(part.text, /[a-záéíóúüñ0-9]/i, "punctuation does not become an orphan link");
      const targetSteps = overrides.steps ?? steps;
      assert.ok(targetSteps.some((step) => step.number === part.stepNumber));
      for (const number of [part.stepNumber, ...part.relatedStepNumbers]) {
        const visited = [];
        activateReasoningReference({ current: null }, number, (target) => scrollToReasoningStep(target,
          { getElementById: (id) => targetSteps.some((step) => id === `iupac-reasoning-step-${step.number}`)
            ? { scrollIntoView: () => visited.push(id) } : null }, { matchMedia: () => ({ matches: true }) }));
        assert.deepEqual(visited, [`iupac-reasoning-step-${number}`]);
      }
      ranges.push([cursor, cursor + part.text.length]);
    }
    cursor += part.text.length;
  }
  ranges.slice(1).forEach((range, index) => assert.ok(ranges[index][1] <= range[0], "rendered spans never overlap"));
  return { name, steps, fragments, parts };
}

const linkedRoles = (result) => result.parts.filter((part) => part.stepNumber)
  .map((part) => [part.text, result.steps.find((step) => step.number === part.stepNumber).nameRole]);

for (const language of ["es", "en"]) {
  test(`pentanoic acid: independent parent and both functional fragments in ${language}`, () => {
    const compound = analyzed("CCCCC(=O)O");
    const snapshot = structuredClone(compound.analysis);
    const result = presented(compound, language);
    assert.equal(result.name, language === "en" ? "pentanoic acid" : "ácido pentanoico");
    assert.deepEqual(linkedRoles(result), language === "en"
      ? [["pentan", "parent"], ["oic", "function"], ["acid", "function"]]
      : [["ácido", "function"], ["pentan", "parent"], ["oico", "function"]]);
    const parent = result.parts.find((part) => part.text === "pentan");
    assert.deepEqual(parent.atomIds, compound.analysis.mainChain);
    assert.equal(result.fragments[parent.stepNumber].text, "pentan");
    const functional = result.parts.filter((part) => part.contributions);
    assert.equal(functional.length, 2);
    assert.ok(functional.every((part) => part.text !== result.name && !part.text.includes("pentan")));
    assert.ok(functional.every((part) => part.contributions[0].group === "carboxylicAcid"));
    assert.deepEqual(compound.analysis, snapshot);
  });

  test(`benzaldehyde: retained reasoning and disjoint benz/aldehyde provenance in ${language}`, () => {
    const compound = analyzed("O=Cc1ccccc1");
    const snapshot = structuredClone(compound.analysis);
    const result = presented(compound, language);
    const aldehyde = language === "en" ? "aldehyde" : "aldehído";
    assert.equal(result.name, `benz${aldehyde}`);
    assert.deepEqual(linkedRoles(result), [["benz", "parent"], [aldehyde, "function"]]);
    const principal = result.steps.find((step) => step.nameRole === "function");
    const parent = result.steps.find((step) => step.nameRole === "parent");
    assert.match(principal.explanation, language === "en" ? /retained name/ : /nombre retenido/);
    assert.ok(principal.explanation.includes(result.name));
    assert.match(principal.explanation, /–CHO/);
    assert.match(principal.explanation, language === "en" ? /directly attached.*benzene ring/ : /unido directamente.*anillo bencénico/);
    assert.match(principal.explanation, language === "en" ? /outside the parent ring/ : /fuera del anillo padre/);
    assert.doesNotMatch(principal.explanation, /C1|alkanal|aporta el sufijo|contributes the suffix/);
    assert.match(parent.explanation, language === "en" ? /six-carbon benzene ring/ : /anillo bencénico de seis carbonos/);
    assert.doesNotMatch(parent.explanation, /aldeh|–CHO|sufijo|suffix/);
    assert.equal(result.fragments[parent.number].text, "benz");
    assert.equal(result.fragments[principal.number].text, aldehyde);
    assert.deepEqual(result.parts[0].atomIds, compound.analysis.mainChain);
    assert.ok(result.parts[1].contributions[0].atomIds.every((id) => !compound.analysis.mainChain.includes(id)));
    assert.deepEqual(compound.analysis, snapshot);
  });
}

for (const [label, smiles, parentEs, parentEn, suffixEs, suffixEn] of [
  ["dioic acid", "O=C(O)CCC(=O)O", "butano", "butane", "dioico", "dioic"],
  ["cyclic carboxylic acid", "O=C(O)C1CCCCC1", "ciclohexano", "cyclohexane", "carboxílico", "carboxylic acid"],
  ["aromatic dicarboxylic acid", "O=C(O)c1ccc(C(=O)O)cc1", "benceno", "benzene", "1,4-dicarboxílico", "1,4-dicarboxylic acid"],
  ["aromatic amide", "NC(=O)c1ccccc1", "benz", "benz", "amida", "amide"],
  ["aromatic nitrile", "N#Cc1ccccc1", "benzo", "benzo", "nitrilo", "nitrile"],
]) {
  test(`${label}: the existing functional morphology preserves a parent in both locales`, () => {
    const compound = analyzed(smiles);
    const names = [compound.analysis.name, translateSpanishIupacForDisplay(compound.analysis.name)];
    for (const language of ["es", "en", "es"]) {
      const result = presented(compound, language);
      const roles = linkedRoles(result);
      assert.ok(roles.some(([text, role]) => text === (language === "en" ? parentEn : parentEs) && role === "parent"));
      assert.ok(roles.some(([text, role]) => text === (language === "en" ? suffixEn : suffixEs) && role === "function"));
    }
    assert.deepEqual([page.analyzeMolecule(compound.molecule).name, translateSpanishIupacForDisplay(compound.analysis.name)], names);
  });
}

test("ester keeps parent, acid-derived suffix and O-alkyl portion independently reachable across locale switches", () => {
  const compound = analyzed("CC(C)C(=O)OCC");
  const spanish = presented(compound, "es");
  const english = presented(compound, "en");
  assert.deepEqual(linkedRoles(spanish), [["2-metil", "substituent"], ["propan", "parent"], ["oato", "function"], ["de etilo", "function"]]);
  assert.deepEqual(linkedRoles(english), [["ethyl", "function"], ["2-methyl", "substituent"], ["propan", "parent"], ["oate", "function"]]);
  assert.deepEqual(presented(compound, "es"), spanish);
  const suffix = english.parts.find((part) => part.text === "oate");
  const alkyl = english.parts.find((part) => part.text === "ethyl");
  assert.ok(suffix.contributions.every((origin) => !origin.atomIds.includes(alkyl.contributions[0].atomIds[0])));
});

test("halogen plus alkyl keeps separate parent and prefixes despite ES/EN alphabetical order", () => {
  for (const [element, esPrefix, enPrefix] of [["F", "fluoro", "fluoro"], ["Cl", "cloro", "chloro"], ["Br", "bromo", "bromo"], ["I", "yodo", "iodo"]]) {
    const compound = analyzed(`CC(${element})C(C)CCC`);
    const es = presented(compound, "es");
    const en = presented(compound, "en");
    assert.equal(es.name, element === "I" ? "3-metil-2-yodohexano" : `2-${esPrefix}-3-metilhexano`);
    assert.equal(en.name, `2-${enPrefix}-3-methylhexane`);
    assert.deepEqual(linkedRoles(es), element === "I"
      ? [["3-metil", "substituent"], ["2-yodo", "substituent"], ["hexano", "parent"]]
      : [[`2-${esPrefix}`, "substituent"], ["3-metil", "substituent"], ["hexano", "parent"]]);
    assert.deepEqual(linkedRoles(en), [[`2-${enPrefix}`, "substituent"], ["3-methyl", "substituent"], ["hexane", "parent"]]);
    assert.deepEqual(presented(compound, "es"), es);
    for (const result of [es, en]) {
      assert.ok(result.parts.filter((part) => result.steps.find((step) => step.number === part.stepNumber)?.nameRole === "substituent")
        .every((part) => part.relatedStepNumbers.includes(result.steps.find((step) => step.nameRole === "numbering").number)));
    }
  }
});

test("mixed nitro/alkyl and multiple halogens keep all analyzed prefixes alongside the parent", () => {
  for (const [smiles, prefixCount] of [["CC(C)C[N+](=O)[O-]", 2], ["CC(Br)C(Cl)C(F)C(I)C", 4]]) {
    const compound = analyzed(smiles);
    for (const language of ["es", "en", "es"]) {
      const result = presented(compound, language);
      assert.equal(linkedRoles(result).filter(([, role]) => role === "substituent").length, prefixCount);
      assert.equal(linkedRoles(result).filter(([, role]) => role === "parent").length, 1);
      assert.ok(!linkedRoles(result).some(([text]) => text === result.name));
    }
  }
});

test("substituted benzaldehyde shares retained-parent metadata without consuming the alkyl prefix", () => {
  const compound = analyzed("O=Cc1ccc(C)cc1");
  for (const language of ["es", "en"]) {
    const result = presented(compound, language);
    assert.deepEqual(linkedRoles(result), [[language === "en" ? "4-methyl" : "4-metil", "substituent"],
      ["benz", "parent"], [language === "en" ? "aldehyde" : "aldehído", "function"]]);
    assert.match(result.steps.find((step) => step.nameRole === "function").explanation, language === "en" ? /retained name/ : /nombre retenido/);
  }
});

test("semantic role targets and analyzed retained identity guard parent evidence", () => {
  const compound = analyzed("CCCCC(=O)O");
  const ordinary = presented(compound, "en");
  const remapped = ordinary.steps.map((step) => ({ ...step, number: `target-${step.nameRole}` }));
  const result = presented(compound, "en", { steps: remapped });
  assert.equal(result.parts.find((part) => part.text === "pentan").stepNumber, "target-parent");
  assert.deepEqual(presented(compound, "en", { steps: [] }).fragments, {});
  assert.deepEqual(presented(compound, "en", { canHighlight: false }).fragments, {});
  assert.deepEqual(presented(compound, "en", { displayedName: "hexanoic acid" }).fragments, {});
  assert.equal(retainedFunctionalParentReasoning(analyzed("CCCCC=O").analysis, "en"), undefined,
    "an ordinary aldehyde keeps its existing alkanal reasoning");
  const retained = analyzed("O=Cc1ccccc1").analysis;
  assert.equal(retainedFunctionalParentReasoning({ ...retained, family: "acyclic" }, "en"), undefined);
  assert.equal(retainedFunctionalParentReasoning({ ...retained, mainChain: [retained.functionalGroups[0].carbonId, ...retained.mainChain.slice(1)] }, "es"), undefined);
});
