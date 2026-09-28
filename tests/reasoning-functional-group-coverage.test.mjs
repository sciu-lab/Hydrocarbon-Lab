import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { translateSpanishIupacForDisplay } from "../app/iupac-name-normalization.ts";
import { applyNomenclatureConvention } from "../app/nomenclature-conventions.ts";
import { generateLegacyEnglishName } from "../app/legacy-english-nomenclature.ts";
import { legacyProfileDisplayName } from "../app/legacy-profile-display.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
import { activateReasoningReference, scrollToReasoningStep } from "../app/reasoning-name-navigation.ts";

let server;
let page;
before(async () => {
  server = await createServer({ configFile: false, logLevel: "error", appType: "custom",
    plugins: [react()], server: { middlewareMode: true, hmr: false } });
  page = await server.ssrLoadModule("/app/page.tsx");
});
after(async () => { await server?.close(); });

// Full names recorded from clean main fc1df64, before modifying the reasoning layer.
const fixtures = [
  ["alcohol", "CCC(O)C", "butan-2-ol", "butan-2-ol", [["alcohol", "2-ol", "2-ol", "function", "–OH"]]],
  ["ether", "CCOCC", "etoxietano", "ethoxyethane", [["ether", "etoxi", "ethoxy", "substituent", "–O–R"]]],
  ["aldehyde", "CCCC=O", "butanal", "butanal", [["aldehyde", "al", "al", "function", "–CHO"]]],
  ["ketone", "CC(=O)C", "propan-2-ona", "propan-2-one", [["ketone", "2-ona", "2-one", "function", ">C=O"]]],
  ["carboxylic acid", "CCC(=O)O", "ácido propanoico", "propanoic acid", [["carboxylicAcid", "oico", "oic", "function", "–COOH"], ["carboxylicAcid", "ácido", "acid", "function", "–COOH"]]],
  ["ester", "CCC(=O)OC", "propanoato de metilo", "methyl propanoate", [["ester", "oato", "oate", "function", "–COOR"], ["ester", "de metilo", "methyl", "function", "–COOR"]]],
  ["amine", "CCN", "etanamina", "ethanamine", [["amine", "amina", "amine", "function", "amino"]]],
  ["amide", "CCC(=O)N", "propanamida", "propanamide", [["amide", "amida", "amide", "function", "–C(=O)N"]]],
  ["nitrile", "CCC#N", "propanonitrilo", "propanenitrile", [["nitrile", "nitrilo", "nitrile", "function", "–C≡N"]]],
  ["nitro", "CC[N+](=O)[O-]", "nitroetano", "nitroetane", [["nitro", "nitro", "nitro", "substituent", "–NO₂"]]],
  ["fluoro", "CCF", "fluoroetano", "fluoroethane", [["halogen", "fluoro", "fluoro", "substituent", "hal"]]],
  ["chloro", "CCCl", "cloroetano", "chloroethane", [["halogen", "cloro", "chloro", "substituent", "hal"]]],
  ["bromo", "CCBr", "bromoetano", "bromoethane", [["halogen", "bromo", "bromo", "substituent", "hal"]]],
  ["iodo", "CCI", "yodoetano", "iodoethane", [["halogen", "yodo", "iodo", "substituent", "hal"]]],
  ["alcohol + methyl", "CC(C)C(O)CC", "2-metilpentan-3-ol", "2-methylpentan-3-ol", [["alcohol", "3-ol", "3-ol", "function", "–OH"]]],
  ["ketone + halogen", "CC(=O)C(Br)CC", "3-bromopentan-2-ona", "3-bromopentan-2-one", [["ketone", "2-ona", "2-one", "function", ">C=O"], ["halogen", "3-bromo", "3-bromo", "substituent", "hal"]]],
  ["amine + alkyl", "CC(C)CCN", "3-metilbutan-1-amina", "3-methylbutan-1-amine", [["amine", "1-amina", "1-amine", "function", "amino"]]],
  ["nitro + alkyl", "CC(C)C[N+](=O)[O-]", "2-metil-1-nitropropano", "2-methyl-1-nitropropane", [["nitro", "1-nitro", "1-nitro", "substituent", "–NO₂"]]],
  ["different halogens", "CC(Br)C(Cl)C(F)C(I)C", "2-bromo-3-cloro-4-fluoro-5-yodohexano", "2-bromo-3-chloro-4-fluoro-5-iodohexane", [
    ["halogen", "2-bromo", "2-bromo", "substituent", "hal"], ["halogen", "3-cloro", "3-chloro", "substituent", "hal"],
    ["halogen", "4-fluoro", "4-fluoro", "substituent", "hal"], ["halogen", "5-yodo", "5-iodo", "substituent", "hal"]]],
  ["ester + branch", "CC(C)C(=O)OCC", "2-metilpropanoato de etilo", "ethyl 2-methylpropanoate", [["ester", "oato", "oate", "function", "–COOR"], ["ester", "de etilo", "ethyl", "function", "–COOR"]]],
  ["polyol", "OCC(O)CO", "propan-1,2,3-triol", "propan-1,2,3-triol", [["alcohol", "1,2,3-triol", "1,2,3-triol", "function", "–OH"]]],
  ["diketone", "CC(=O)CC(=O)C", "pentan-2,4-diona", "pentan-2,4-dione", [["ketone", "2,4-diona", "2,4-dione", "function", ">C=O"]]],
  ["dialdehyde", "O=CCCC=O", "butanodial", "butanedial", [["aldehyde", "dial", "dial", "function", "–CHO"]]],
  ["diacid", "O=C(O)CCC(=O)O", "ácido butanodioico", "butanedioic acid", [["carboxylicAcid", "dioico", "dioic", "function", "–COOH"]]],
  ["subordinate alcohol", "CC(=O)C(O)CC", "3-hidroxipentan-2-ona", "3-hydroxypentan-2-one", [["alcohol", "3-hidroxi", "3-hydroxy", "substituent", "–OH"], ["ketone", "2-ona", "2-one", "function", ">C=O"]]],
  ["amine prefix", "CC(N)C(=O)O", "ácido 2-aminopropanoico", "2-aminopropanoic acid", [["amine", "2-amino", "2-amino", "substituent", "amino"], ["carboxylicAcid", "oico", "oic", "function", "–COOH"]]],
  ["cyclic amide", "C1CCCCC1C(=O)N", "ciclohexanocarboxamida", "cyclohexanecarboxamide", [["amide", "carboxamida", "carboxamide", "function", "–C(=O)N"]]],
  ["cyclic nitrile", "C1CCCCC1C#N", "ciclohexanocarbonitrilo", "cyclohexanecarbonitrile", [["nitrile", "carbonitrilo", "carbonitrile", "function", "–C≡N"]]],
  ["unsaturated alcohol", "OCC=CC=C", "penta-2,4-dien-1-ol", "penta-2,4-dien-1-ol", [["alcohol", "1-ol", "1-ol", "function", "–OH"]]],
];

function analyzed(smiles) {
  const converted = moleculeFromSmiles(smiles);
  assert.equal(converted.ok, true);
  return { molecule: converted.molecule, analysis: page.analyzeMolecule(converted.molecule) };
}
function presented(compound, language, displayedName, generatedNames = []) {
  const spanish = page.buildIupacReasoningSteps(compound.molecule, compound.analysis);
  const steps = language === "en" ? page.buildEnglishReasoningSteps(spanish, compound.molecule, compound.analysis) : spanish;
  const name = displayedName ?? (language === "en" ? translateSpanishIupacForDisplay(compound.analysis.name) : compound.analysis.name);
  const fragments = deriveReasoningNameFragments({ analysis: compound.analysis, displayedName: name, generatedNames, language, steps, canHighlight: true });
  const parts = buildReasoningNameLinkParts(name, fragments, steps);
  assert.equal(parts.map((part) => part.text).join(""), name, "segmentation preserves every name character");
  for (const part of parts.filter((part) => part.stepNumber)) {
    assert.ok(steps.some((step) => step.number === part.stepNumber), "no dangling interaction");
    const calls = [];
    const document = { getElementById: (id) => id === `iupac-reasoning-step-${part.stepNumber}`
      ? { scrollIntoView: () => calls.push(id) } : null };
    activateReasoningReference({ current: null }, part.stepNumber, (number) =>
      scrollToReasoningStep(number, document, { matchMedia: () => ({ matches: false }) }));
    assert.deepEqual(calls, [`iupac-reasoning-step-${part.stepNumber}`], "activation reaches the same reasoning target as the fragment");
  }
  return { name, steps, fragments, parts };
}

for (const [label, smiles, es, en, expectations] of fixtures) {
  test(`${label}: structural provenance and interactive derivation in ES and EN preserve the baseline names`, () => {
    const compound = analyzed(smiles);
    const snapshot = structuredClone(compound.analysis);
    assert.equal(compound.analysis.name, es);
    assert.equal(translateSpanishIupacForDisplay(compound.analysis.name), en);
    for (const language of ["es", "en", "es"]) {
      const result = presented(compound, language);
      assert.equal(result.name, language === "en" ? en : es);
      const parent = result.parts.find((part) => result.steps.find((step) => step.number === part.stepNumber)?.nameRole === "parent");
      assert.ok(parent, `${result.name}: the functional contribution preserves a separate parent target`);
      assert.deepEqual(parent.atomIds, compound.analysis.mainChain, "the parent span belongs to the selected skeleton");
      for (const [group, fragmentEs, fragmentEn, role, motif] of expectations) {
        const text = language === "en" ? fragmentEn : fragmentEs;
        const part = result.parts.find((item) => item.text === text && item.contributions?.some((item) => item.group === group));
        assert.ok(part, `${result.name}: ${group} must own interactive ${text}`);
        const target = result.steps.find((step) => step.number === part.stepNumber);
        assert.equal(target.nameRole, role, `${text} links to its functional role`);
        assert.ok(target.explanation.includes(motif), `${target.explanation} explains ${motif}`);
        for (const origin of part.contributions) {
          assert.ok(origin.atomIds.length > 0, "provenance includes structural atoms");
          assert.ok(origin.atomIds.every((id) => compound.analysis.functionalGroups.some((detected) => detected.kind === origin.group && detected.atomIds.includes(id))));
        }
        const evidence = Object.values(result.fragments).flatMap((fragment) => [fragment, ...(fragment.additionalFragments ?? [])]);
        assert.ok(evidence.some((fragment) => fragment.text === text), "reasoning shows the linked name evidence");
      }
    }
    assert.deepEqual(compound.analysis, snapshot, "presentation never mutates chemical analysis");
    assert.equal(page.analyzeMolecule(compound.molecule).name, es, "name remains identical after deriving both languages");
  });
}

test("ester portions are disjoint, share the functional target and distinguish their atom provenance", () => {
  const compound = analyzed("CCC(=O)OC");
  for (const language of ["es", "en"]) {
    const { fragments, parts, steps } = presented(compound, language);
    const functional = parts.filter((part) => part.contributions?.some((item) => item.group === "ester"));
    assert.equal(functional.length, 2);
    assert.equal(new Set(functional.map((part) => part.stepNumber)).size, 1);
    assert.deepEqual(new Set(functional.map((part) => part.contributions[0].role)), new Set(["suffix", "ester-alkyl"]));
    const alkyl = functional.find((part) => part.contributions[0].role === "ester-alkyl");
    assert.deepEqual(alkyl.contributions[0].atomIds, [compound.analysis.functionalGroups[0].alkylCarbonId]);
    assert.ok(!functional.find((part) => part.contributions[0].role === "suffix").contributions[0].atomIds.includes(alkyl.contributions[0].atomIds[0]));
    assert.match(steps.find((step) => step.nameRole === "function").explanation, language === "en" ? /separate from the acid-derived portion/ : /distinta de la porción derivada del ácido/);
    const html = renderToStaticMarkup(React.createElement(page.ReasoningNameFragmentView, { fragment: fragments[functional[0].stepNumber] }));
    assert.equal((html.match(/class="reasoning-name-fragment-text"/g) ?? []).length, 2);
    assert.doesNotMatch(html, /<(?:a|button)\b/, "reasoning evidence uses the established static style");
  }
});

test("halogen ordering and live locale rebuilding preserve all four recent name regressions", () => {
  for (const [element, prefixEs, prefixEn] of [["F", "fluoro", "fluoro"], ["Cl", "cloro", "chloro"], ["Br", "bromo", "bromo"], ["I", "yodo", "iodo"]]) {
    const compound = analyzed(`CC(${element})C(C)CCC`);
    const es = presented(compound, "es");
    const en = presented(compound, "en");
    assert.equal(es.name, element === "I" ? "3-metil-2-yodohexano" : `2-${prefixEs}-3-metilhexano`);
    assert.equal(en.name, `2-${prefixEn}-3-methylhexane`);
    assert.equal(es.parts.find((part) => part.contributions?.[0].group === "halogen").text, `2-${prefixEs}`);
    assert.equal(en.parts.find((part) => part.contributions?.[0].group === "halogen").text, `2-${prefixEn}`);
    assert.deepEqual(presented(compound, "es"), es, "switching back uses fresh Spanish spans and targets");
  }
});

test("available Legacy profile outputs retain functional links when locants move or reappear", () => {
  for (const [smiles, group, suffixEs, suffixEn] of [
    ["CC(C)CCN", "amine", "amina", "amine"],
    ["CC(C)C(O)CC", "alcohol", "ol", "ol"],
    ["CC(=O)C(Br)CC", "ketone", "ona", "one"],
    ["CCOCC", "ether", "etoxi", "ethoxy"],
    ["OCC(O)CO", "alcohol", "triol", "triol"],
  ]) {
    const compound = analyzed(smiles);
    const esName = applyNomenclatureConvention(page.legacySpanishFormatterInput(compound.analysis, compound.analysis.name), "iupac-1979-es", "es");
    const enName = generateLegacyEnglishName(page.buildLegacyEnglishNameModel(compound.molecule, compound.analysis)).name;
    for (const [language, token] of [["es", suffixEs], ["en", suffixEn]]) {
      const profile = legacyProfileDisplayName({ language,
        suggestedName: language === "en" ? translateSpanishIupacForDisplay(compound.analysis.name) : compound.analysis.name,
        spanish1979Name: esName, english1979Name: enName });
      const name = profile.name;
      if (!profile.available) {
        assert.equal(language, "es", "every English fixture has an available Legacy output");
        assert.equal(esName, "-", "the selector preserves the existing unavailable Spanish profile");
        assert.deepEqual(deriveReasoningNameFragments({ analysis: compound.analysis, displayedName: name,
          generatedNames: [], language, steps: page.buildIupacReasoningSteps(compound.molecule, compound.analysis), canHighlight: false }), {});
        continue;
      }
      const { parts, steps } = presented(compound, language, name, [name]);
      const part = parts.find((part) => part.text.endsWith(token) && part.contributions?.some((origin) => origin.group === group));
      assert.ok(part?.stepNumber, `${name} has ${group} evidence from its actual profile output`);
      assert.equal(steps.find((step) => step.number === part.stepNumber).nameRole, group === "ether" ? "substituent" : "function");
    }
    assert.equal(compound.analysis.name, page.analyzeMolecule(compound.molecule).name);
    assert.equal(enName, generateLegacyEnglishName(page.buildLegacyEnglishNameModel(compound.molecule, compound.analysis)).name);
  }
});

test("repeated groups retain multiplicity and every contributing atom", () => {
  for (const [smiles, group, count, text] of [["OCC(O)CO", "alcohol", 3, "1,2,3-triol"], ["CC(Cl)C(Cl)CC", "halogen", 2, "2,3-dicloro"]]) {
    const compound = analyzed(smiles);
    const { parts } = presented(compound, "es");
    const evidence = parts.find((part) => part.text === text);
    assert.ok(evidence);
    assert.equal(evidence.contributions.filter((item) => item.group === group).length, count);
  }
});

test("implicit methane locants retain halogen multiplicity and explicit ether locants remain visible", () => {
  for (const [smiles, es, en, prefixEs, prefixEn, count] of [
    ["ClCCl", "diclorometano", "dichloromethane", "dicloro", "dichloro", 2],
    ["ClC(Cl)Cl", "triclorometano", "trichloromethane", "tricloro", "trichloro", 3],
    ["FC(F)(F)F", "tetrafluorometano", "tetrafluoromethane", "tetrafluoro", "tetrafluoro", 4],
    ["COCCOC", "1,2-dimetoxietano", "1,2-dimethoxyethane", "1,2-dimetoxi", "1,2-dimethoxy", 2],
  ]) {
    const compound = analyzed(smiles);
    assert.equal(compound.analysis.name, es);
    assert.equal(translateSpanishIupacForDisplay(es), en);
    for (const language of ["es", "en"]) {
      const { parts } = presented(compound, language);
      const part = parts.find((part) => part.text === (language === "en" ? prefixEn : prefixEs));
      assert.ok(part?.stepNumber);
      assert.equal(part.contributions.length, count);
    }
  }
});

test("semantic roles prevent borrowing a target, atom provenance prevents word-only guesses", () => {
  const compound = analyzed("CCC(=O)N");
  const steps = page.buildIupacReasoningSteps(compound.molecule, compound.analysis);
  const remapped = steps.map((step) => ({ ...step, number: `semantic-${step.nameRole}` }));
  const fragments = deriveReasoningNameFragments({ analysis: compound.analysis, displayedName: compound.analysis.name, language: "es", steps: remapped, canHighlight: true });
  assert.equal(fragments["semantic-function"].text, "amida");
  assert.deepEqual(deriveReasoningNameFragments({ analysis: compound.analysis, displayedName: compound.analysis.name, language: "es", steps: [], canHighlight: true }), {});
  assert.deepEqual(presented(compound, "es", "propanonitrilo").fragments, {}, "a wrong displayed group remains unlinked");
  const nitro = analyzed("CC[N+](=O)[O-]");
  const forged = { ...nitro.analysis, functionalGroups: [] };
  const noOrigins = deriveReasoningNameFragments({ analysis: forged, displayedName: forged.name, language: "es",
    steps: page.buildIupacReasoningSteps(nitro.molecule, forged), canHighlight: true });
  assert.equal(Object.values(noOrigins).flatMap((part) => part.contributions ?? []).length, 0,
    "a substring cannot manufacture functional provenance");
});
