import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { applyNomenclatureConvention } from "../app/nomenclature-conventions.ts";
import { translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";
import { generateLegacyEnglishName } from "../app/legacy-english-nomenclature.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { curatedCommonNameForSmiles } from "../app/curated-common-name-display.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let buildIupacReasoningSteps;
let buildEnglishReasoningSteps;
let buildLegacyEnglishNameModel;
let ReasoningNameFragmentView;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({
    analyzeMolecule,
    buildIupacReasoningSteps,
    buildEnglishReasoningSteps,
    buildLegacyEnglishNameModel,
    ReasoningNameFragmentView,
  } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function analyzed(smiles) {
  const converted = moleculeFromSmiles(smiles);
  assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
  return { molecule: converted.molecule, analysis: analyzeMolecule(converted.molecule) };
}

function derive({ molecule, analysis }, displayedName, language = "es", canHighlight = true) {
  const spanishSteps = buildIupacReasoningSteps(molecule, analysis);
  const steps = language === "en"
    ? buildEnglishReasoningSteps(spanishSteps, molecule, analysis)
    : spanishSteps;
  const explanationBefore = steps.map((step) => step.explanation);
  const fragments = deriveReasoningNameFragments({ analysis, displayedName, language, steps, canHighlight });
  assert.deepEqual(steps.map((step) => step.explanation), explanationBefore, "the presentation layer leaves every explanation intact");
  for (const fragment of Object.values(fragments)) {
    assert.ok(displayedName.includes(fragment.text), `${fragment.text} must be literal text in ${displayedName}`);
  }
  return { steps, fragments };
}

test("acetone fragments follow the actual Suggested and Legacy names in both languages", () => {
  const acetone = analyzed("CC(=O)C");
  assert.equal(acetone.analysis.name, "propan-2-ona");
  const names = {
    suggestedEs: acetone.analysis.name,
    legacyEs: applyNomenclatureConvention(acetone.analysis.name, "iupac-1979-es", "es"),
    suggestedEn: translateSpanishIupacToOpsin(acetone.analysis.name),
    legacyEn: generateLegacyEnglishName(buildLegacyEnglishNameModel(acetone.molecule, acetone.analysis)).name,
  };
  assert.deepEqual(names, {
    suggestedEs: "propan-2-ona", legacyEs: "propanona",
    suggestedEn: "propan-2-one", legacyEn: "propanone",
  });

  for (const [name, language, expectedFunction] of [
    [names.suggestedEs, "es", "2-ona"],
    [names.legacyEs, "es", "ona"],
    [names.suggestedEn, "en", "2-one"],
    [names.legacyEn, "en", "one"],
  ]) {
    const { steps, fragments } = derive(acetone, name, language);
    assert.equal(fragments["01"].text, expectedFunction, name);
    assert.equal(fragments["02"].text, "propan", name);
    assert.ok(steps.find((step) => step.number === "01").explanation.length > 80, name);
    if (name.includes("-2-")) assert.equal(fragments["03"].text, "2", name);
    else assert.equal(fragments["03"], undefined, `${name} omits the locant`);
  }
});

test("a single alkyl substituent and an alkene use only written locants", () => {
  const methylhexane = analyzed("CCC(C)CCC");
  assert.equal(methylhexane.analysis.name, "3-metilhexano");
  const methylEs = derive(methylhexane, methylhexane.analysis.name).fragments;
  const methylEn = derive(methylhexane, translateSpanishIupacToOpsin(methylhexane.analysis.name), "en").fragments;
  assert.deepEqual([methylEs["02"]?.text, methylEs["03"]?.text, methylEs["04"]?.text], ["hexano", "3", "3-metil"]);
  assert.deepEqual([methylEn["02"]?.text, methylEn["03"]?.text, methylEn["04"]?.text], ["hexane", "3", "3-methyl"]);

  const pentene = analyzed("CC=CCC");
  assert.equal(pentene.analysis.name, "pent-2-eno");
  const penteneEs = derive(pentene, pentene.analysis.name).fragments;
  const penteneEn = derive(pentene, translateSpanishIupacToOpsin(pentene.analysis.name), "en").fragments;
  assert.deepEqual([penteneEs["02"]?.text, penteneEs["03"]?.text], ["pent", "2-eno"]);
  assert.deepEqual([penteneEn["02"]?.text, penteneEn["03"]?.text], ["pent", "2-ene"]);
});

test("aromatic fragments retain benzene, visible prefixes, and TNT pedagogy", () => {
  const methylbenzene = analyzed("Cc1ccccc1");
  const methylEs = derive(methylbenzene, methylbenzene.analysis.name).fragments;
  const methylEn = derive(methylbenzene, translateSpanishIupacToOpsin(methylbenzene.analysis.name), "en").fragments;
  assert.deepEqual([methylEs["02"]?.text, methylEs["04"]?.text, methylEs["03"]], ["benceno", "metil", undefined]);
  assert.deepEqual([methylEn["02"]?.text, methylEn["04"]?.text, methylEn["03"]], ["benzene", "methyl", undefined]);

  const tnt = analyzed("CC1=C(C=C(C=C1[N+](=O)[O-])[N+](=O)[O-])[N+](=O)[O-]");
  assert.equal(tnt.analysis.name, "2-metil-1,3,5-trinitrobenceno");
  assert.equal(tnt.analysis.primaryFunctionalGroup, undefined);
  const tntEs = derive(tnt, tnt.analysis.name);
  const tntEn = derive(tnt, translateSpanishIupacToOpsin(tnt.analysis.name), "en");
  assert.equal(tntEs.fragments["02"]?.text, "benceno");
  assert.equal(tntEs.fragments["04"]?.text, "2-metil-1,3,5-trinitro");
  assert.equal(tntEn.fragments["02"]?.text, "benzene");
  assert.equal(tntEn.fragments["04"]?.text, "2-methyl-1,3,5-trinitro");
  assert.equal(tntEs.fragments["01"], undefined, "nitro must not be presented as a suffix");
  assert.match(tntEs.steps.find((step) => step.number === "01").explanation, /prefijo nitro-/i);
  assert.match(tntEs.steps.find((step) => step.number === "03").explanation, /nitro en C1, 3 y 5/i);
  assert.match(tntEs.steps.find((step) => step.number === "05").explanation, /metil → nitro/i);
  const exported = moleculeToSmiles(tnt.molecule);
  assert.equal(exported.ok, true);
  assert.equal(curatedCommonNameForSmiles(exported.smiles, "es"), "TNT · 2,4,6-trinitrotolueno");
});

test("unavailable names and unsupported patterns keep the explanation without borrowed fragments", () => {
  const acetone = analyzed("CC(=O)C");
  assert.deepEqual(derive(acetone, "No disponible para esta estructura", "es", false).fragments, {});
  assert.deepEqual(derive(acetone, acetone.analysis.name, "es", false).fragments, {}, "a hidden name does not leak through the explanation");
  const morpholine = analyzed("O1CCNCC1");
  const result = derive(morpholine, morpholine.analysis.name);
  assert.ok(result.steps.length > 0);
  assert.deepEqual(result.fragments, {});
  const acid = analyzed("O=C(O)c1ccccc1");
  assert.deepEqual(derive(acid, acid.analysis.name).fragments, {});
});

test("fragments are static text rather than interactive controls", () => {
  const html = renderToStaticMarkup(React.createElement(ReasoningNameFragmentView, {
    fragment: { text: "2-ona", label: "Posición y sufijo de la cetona", kind: "function" },
  }));
  assert.match(html, /reasoning-name-fragment-text">2-ona<\/span>/);
  assert.match(html, /Posición y sufijo de la cetona/);
  assert.doesNotMatch(html, /<(?:button|input|a)\b|tabindex=|role=/i);
});
