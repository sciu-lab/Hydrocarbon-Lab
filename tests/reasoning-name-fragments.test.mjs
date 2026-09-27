import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
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

    const linkedName = buildReasoningNameLinkParts(name, fragments, steps);
    assert.equal(linkedName.map((part) => part.text).join(""), name, `${name} remains unchanged`);
    assert.equal(linkedName.find((part) => part.stepNumber === "02")?.text, "propan", `${name} links its chain fragment`);
    assert.equal(linkedName.find((part) => part.stepNumber === "01")?.text, expectedFunction, `${name} links its functional suffix`);
    if (name.includes("-2-")) {
      assert.deepEqual(linkedName.find((part) => part.stepNumber === "01")?.relatedStepNumbers, ["03"], `${name} links its written locant to its explanation`);
    }
  }
});

test("a single alkyl substituent and an alkene use only written locants", () => {
  const methylhexane = analyzed("CCC(C)CCC");
  assert.equal(methylhexane.analysis.name, "3-metilhexano");
  const methylEs = derive(methylhexane, methylhexane.analysis.name).fragments;
  const methylEn = derive(methylhexane, translateSpanishIupacToOpsin(methylhexane.analysis.name), "en").fragments;
  assert.deepEqual([methylEs["02"]?.text, methylEs["03"]?.text, methylEs["04"]?.text], ["hexano", "3", "3-metil"]);
  assert.deepEqual([methylEn["02"]?.text, methylEn["03"]?.text, methylEn["04"]?.text], ["hexane", "3", "3-methyl"]);
  assert.equal(methylEs["03"]?.label, "Localizador del sustituyente");
  assert.equal(methylEn["03"]?.label, "Substituent locant");

  const pentene = analyzed("CC=CCC");
  assert.equal(pentene.analysis.name, "pent-2-eno");
  const penteneEs = derive(pentene, pentene.analysis.name).fragments;
  const penteneEn = derive(pentene, translateSpanishIupacToOpsin(pentene.analysis.name), "en").fragments;
  assert.deepEqual([penteneEs["02"]?.text, penteneEs["03"]?.text], ["pent", "2-eno"]);
  assert.deepEqual([penteneEn["02"]?.text, penteneEn["03"]?.text], ["pent", "2-ene"]);
});

test("all supported multiple-unsaturation parents expose every typed locant interactively in EN and ES", () => {
  const cases = [
    { label: "separated diene", smiles: "C=CC=CC", double: 2, triple: 0, name: "penta-1,3-dieno" },
    { label: "cumulative diene", smiles: "CC=C=CC", double: 2, triple: 0, name: "penta-2,3-dieno" },
    { label: "triene", smiles: "C=CC=CC=C", double: 3, triple: 0, name: "hexa-1,3,5-trieno" },
    { label: "diyne", smiles: "C#CC#CCCC", double: 0, triple: 2, name: "hepta-1,3-diino" },
    { label: "triyne", smiles: "C#CC#CC#CC", double: 0, triple: 3, name: "hepta-1,3,5-triino" },
    { label: "enyne", smiles: "C=CC#CCCCC", double: 1, triple: 1, name: "oct-1-en-3-ino" },
    { label: "branched diene", smiles: "CC(C)C=CC=C", double: 2, triple: 0, name: "5-metilhexa-1,3-dieno", branched: true },
  ];

  for (const fixture of cases) {
    const compound = analyzed(fixture.smiles);
    const analysis = compound.analysis;
    const total = analysis.doubleBondLocants.length + analysis.tripleBondLocants.length;
    assert.equal(total, fixture.double + fixture.triple, `${fixture.label} fixture has the intended parent bonds`);
    assert.ok(total >= 2, `${fixture.label} exercises the multi-unsaturation path`);
    if (fixture.name) assert.equal(analysis.name, fixture.name, `${fixture.label} keeps its generated name`);
    if (fixture.branched) assert.ok(analysis.substituents.length > 0, "the branch remains outside the selected parent");

    for (const language of ["es", "en"]) {
      const displayedName = language === "en"
        ? translateSpanishIupacToOpsin(analysis.name)
        : analysis.name;
      const { steps, fragments } = derive(compound, displayedName, language);
      const localizedParent = language === "en"
        ? translateSpanishIupacToOpsin(analysis.chainName)
        : analysis.chainName;
      const root = /^[a-z]+/i.exec(localizedParent)?.[0];
      assert.ok(root, `${fixture.label} has a structured parent root`);
      assert.equal(fragments["02"]?.text, root, `${fixture.label} links its parent root in ${language}`);
      assert.equal(fragments["03"]?.text, localizedParent.slice(root.length + 1), `${fixture.label} links every parent unsaturation in ${language}`);
      assert.equal(fragments["03"]?.label, language === "en"
        ? "Multiple bonds, locants, and multiplicity"
        : "Enlaces múltiples, localizadores y multiplicidad");

      const linked = buildReasoningNameLinkParts(displayedName, fragments, steps);
      assert.equal(linked.map((part) => part.text).join(""), displayedName, "links preserve the displayed name exactly");
      assert.ok(linked.some((part) => part.stepNumber === "02"), `${fixture.label} exposes the parent explanation`);
      assert.ok(linked.some((part) => part.stepNumber === "03"), `${fixture.label} exposes the numbering/unsaturation explanation`);

      const explanation = steps.find((step) => step.number === "03")?.explanation ?? "";
      for (const locant of [...analysis.doubleBondLocants, ...analysis.tripleBondLocants]) {
        assert.match(explanation, new RegExp(`C${locant}(?:=|≡|\\b)`), `${fixture.label} explains locant C${locant} in ${language}`);
      }
      if (fixture.double) assert.match(explanation, language === "en" ? /C\d+=C\d+/ : /C=C/, `${fixture.label} distinguishes double bonds in ${language}`);
      if (fixture.triple) assert.match(explanation, language === "en" ? /C\d+≡C\d+/ : /C≡C/, `${fixture.label} distinguishes triple bonds in ${language}`);
      if (fixture.double > 1) {
        assert.match(explanation, language === "en" ? /di- multiplier means two double bonds|tri- multiplier means three double bonds/ : /multiplicador (?:di|tri)- significa (?:dos|tres) dobles enlaces/);
      }
      if (fixture.triple > 1) {
        assert.match(explanation, language === "en" ? /di- multiplier means two triple bonds|tri- multiplier means three triple bonds/ : /multiplicador (?:di|tri)- significa (?:dos|tres) enlaces triples/);
      }

      const parentStep = steps.find((step) => step.number === "02")?.explanation ?? "";
      assert.match(parentStep, new RegExp(`${analysis.mainChain.length} carbon`), `${fixture.label} explains parent length in ${language}`);
      if (fixture.branched) {
        assert.ok(steps.some((step) => step.number === "04" && /metil|methyl/i.test(step.explanation)),
          "the existing substituent explanation remains present alongside multiple bonds");
        assert.ok(fragments["04"], "the branch remains an interactive name fragment");
      }
    }
  }
});

test("a single-unsaturation name retains its existing parent and locant links", () => {
  const pentene = analyzed("CC=CCC");
  assert.equal(pentene.analysis.name, "pent-2-eno");
  for (const [name, language] of [
    ["pent-2-eno", "es"],
    ["pent-2-ene", "en"],
  ]) {
    const { steps, fragments } = derive(pentene, name, language);
    const links = buildReasoningNameLinkParts(name, fragments, steps);
    assert.deepEqual([fragments["02"]?.text, fragments["03"]?.text], ["pent", language === "en" ? "2-ene" : "2-eno"]);
    assert.equal(links.map((part) => part.text).join(""), name);
  }
});

test("alcohol and aldehyde fragments follow the visible functional suffix in both languages", () => {
  const alcohol = analyzed("CCC(O)C");
  assert.equal(alcohol.analysis.name, "butan-2-ol");
  for (const language of ["es", "en"]) {
    const { fragments } = derive(alcohol, "butan-2-ol", language);
    assert.deepEqual([fragments["01"]?.text, fragments["02"]?.text, fragments["03"]?.text], ["2-ol", "butan", "2"]);
  }
  const legacyAlcohol = applyNomenclatureConvention(alcohol.analysis.name, "iupac-1979-es", "es");
  assert.equal(legacyAlcohol, "2-butanol");
  const legacyFragments = derive(alcohol, legacyAlcohol).fragments;
  assert.deepEqual([legacyFragments["01"]?.text, legacyFragments["02"]?.text, legacyFragments["03"]?.text], ["ol", "butan", "2"]);
  assert.ok(!Object.values(legacyFragments).some((fragment) => fragment.text === "2-ol"));
  const legacyEnglishAlcohol = generateLegacyEnglishName(buildLegacyEnglishNameModel(alcohol.molecule, alcohol.analysis)).name;
  assert.equal(legacyEnglishAlcohol, "2-butanol");
  assert.deepEqual([derive(alcohol, legacyEnglishAlcohol, "en").fragments["01"]?.text,
    derive(alcohol, legacyEnglishAlcohol, "en").fragments["03"]?.text], ["ol", "2"]);

  const terminalAlcohol = analyzed("CCCCO");
  const terminalLegacy = applyNomenclatureConvention(terminalAlcohol.analysis.name, "iupac-1979-es", "es");
  assert.equal(terminalLegacy, "butanol");
  const terminalFragments = derive(terminalAlcohol, terminalLegacy).fragments;
  assert.deepEqual([terminalFragments["01"]?.text, terminalFragments["02"]?.text, terminalFragments["03"]],
    ["ol", "butan", undefined], "an implicit locant is not highlighted");

  const aldehyde = analyzed("CCCC=O");
  assert.equal(aldehyde.analysis.name, "butanal");
  for (const language of ["es", "en"]) {
    const { steps, fragments } = derive(aldehyde, "butanal", language);
    assert.deepEqual([fragments["01"]?.text, fragments["02"]?.text, fragments["03"]], ["al", "butan", undefined]);
    if (language === "es") assert.match(steps.find((step) => step.number === "01").explanation, /C1/);
  }
});

test("the same suffix rules cover a second ketone without inventing Legacy locants", () => {
  const ketone = analyzed("CCC(=O)C");
  assert.equal(ketone.analysis.name, "butan-2-ona");
  const names = [
    [ketone.analysis.name, "es", "2-ona"],
    [translateSpanishIupacToOpsin(ketone.analysis.name), "en", "2-one"],
    [applyNomenclatureConvention(ketone.analysis.name, "iupac-1979-es", "es"), "es", "ona"],
    [generateLegacyEnglishName(buildLegacyEnglishNameModel(ketone.molecule, ketone.analysis)).name, "en", "one"],
  ];
  for (const [name, language, functionFragment] of names) {
    const { fragments } = derive(ketone, name, language);
    assert.equal(fragments["01"]?.text, functionFragment, name);
    assert.equal(fragments["02"]?.text, "butan", name);
    assert.equal(fragments["03"]?.text, "2", name);
  }
});

test("a triple bond uses its own suffix without borrowing the alkene label", () => {
  const alkyne = analyzed("CCC#CC");
  assert.equal(alkyne.analysis.name, "pent-2-ino");
  const spanish = derive(alkyne, alkyne.analysis.name).fragments;
  const englishName = translateSpanishIupacToOpsin(alkyne.analysis.name);
  assert.equal(englishName, "pent-2-yne");
  const english = derive(alkyne, englishName, "en").fragments;
  assert.deepEqual([spanish["02"]?.text, spanish["03"]?.text], ["pent", "2-ino"]);
  assert.deepEqual([english["02"]?.text, english["03"]?.text], ["pent", "2-yne"]);
  assert.match(spanish["03"].label, /triple/);
  assert.match(english["03"].label, /Triple/);
  assert.doesNotMatch(spanish["03"].label, /doble/);
});

test("repeated alkyl prefixes retain every locant and their di, tri or tetra multiplier", () => {
  const cases = [
    ["CC(C)C(C)C", "2,3-dimetilbutano", "2,3-dimethylbutane", "2,3-dimetil", "2,3-dimethyl", "butano", "butane"],
    ["CC(C)(C)C(C)C", "2,2,3-trimetilbutano", "2,2,3-trimethylbutane", "2,2,3-trimetil", "2,2,3-trimethyl", "butano", "butane"],
    ["CC(C)(C)C(C)(C)C", "2,2,3,3-tetrametilbutano", "2,2,3,3-tetramethylbutane", "2,2,3,3-tetrametil", "2,2,3,3-tetramethyl", "butano", "butane"],
    ["CCC(CC)C(CC)CC", "3,4-dietilhexano", "3,4-diethylhexane", "3,4-dietil", "3,4-diethyl", "hexano", "hexane"],
  ];
  for (const [smiles, nameEs, nameEn, prefixEs, prefixEn, parentEs, parentEn] of cases) {
    const compound = analyzed(smiles);
    assert.equal(compound.analysis.name, nameEs);
    assert.equal(translateSpanishIupacToOpsin(nameEs), nameEn);
    for (const [name, language, prefix, parent] of [
      [nameEs, "es", prefixEs, parentEs],
      [nameEn, "en", prefixEn, parentEn],
    ]) {
      const { fragments } = derive(compound, name, language);
      assert.deepEqual([fragments["02"]?.text, fragments["03"]?.text, fragments["04"]?.text],
        [parent, prefix.slice(0, prefix.indexOf("-")), prefix], name);
      assert.equal(Object.values(fragments).filter((fragment) => fragment.kind === "substituent").length, 1);
      assert.equal(fragments["03"]?.label, language === "en" ? "Substituent locants" : "Localizadores de los sustituyentes");
    }
  }
});

test("equal locant sets do not claim to determine the numbering direction", () => {
  const dimethylbutane = analyzed("CC(C)C(C)C");
  const spanish = derive(dimethylbutane, dimethylbutane.analysis.name).steps;
  const english = derive(dimethylbutane, "2,3-dimethylbutane", "en").steps;
  assert.match(spanish.find((step) => step.number === "03").explanation, /mismo conjunto de localizadores desde ambos extremos/);
  assert.match(spanish.find((step) => step.number === "04").explanation, /Ambos sentidos de numeración son equivalentes/);
  assert.doesNotMatch(spanish.find((step) => step.number === "04").explanation, /define el sentido de numeración/);
  assert.match(english.find((step) => step.number === "03").explanation, /Both numbering directions give the same substituent locants/);
  assert.match(english.find((step) => step.number === "04").explanation, /Both directions are equivalent/);
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

  const nitrobenzene = analyzed("O=[N+]([O-])c1ccccc1");
  const nitroFragments = derive(nitrobenzene, nitrobenzene.analysis.name).fragments;
  assert.deepEqual([nitroFragments["02"]?.text, nitroFragments["04"]?.text, nitroFragments["01"]],
    ["benceno", "nitro", undefined]);
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
  const butanal = analyzed("CCCC=O");
  assert.deepEqual(derive(acetone, butanal.analysis.name).fragments, {}, "a name from another molecule supplies no fragments");
  assert.deepEqual(derive(butanal, "butan-2-ol").fragments, {}, "a displayed suffix must agree with the analyzed function");
});

test("fragments are static text rather than interactive controls", () => {
  const html = renderToStaticMarkup(React.createElement(ReasoningNameFragmentView, {
    fragment: { text: "2-ona", label: "Posición y sufijo de la cetona", kind: "function" },
  }));
  assert.match(html, /reasoning-name-fragment-text">2-ona<\/span>/);
  assert.match(html, /Posición y sufijo de la cetona/);
  assert.doesNotMatch(html, /<(?:button|input|a)\b|tabindex=|role=/i);
});
