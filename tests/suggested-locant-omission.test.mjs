import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import { applyNomenclatureConvention } from "../app/nomenclature-conventions.ts";
import { translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";
import { generateLegacyEnglishName } from "../app/legacy-english-nomenclature.ts";
import { legacyProfileDisplayName } from "../app/legacy-profile-display.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";

let server;
let analyzeMolecule;
let suggestedIupacNameWithOmittedLocants;
let buildIupacReasoningSteps;
let buildEnglishReasoningSteps;
let buildLegacyEnglishNameModel;
let legacySpanishFormatterInput;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, suggestedIupacNameWithOmittedLocants,
    buildIupacReasoningSteps, buildEnglishReasoningSteps,
    buildLegacyEnglishNameModel, legacySpanishFormatterInput } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => server?.close());

function namesFor(smiles) {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const molecule = result.molecule;
  const analysis = analyzeMolecule(molecule);
  const suggestedEs = suggestedIupacNameWithOmittedLocants(analysis);
  const legacyEs = applyNomenclatureConvention(
    legacySpanishFormatterInput(analysis, suggestedEs), "iupac-1979-es", "es",
  );
  const legacyEn = generateLegacyEnglishName(
    buildLegacyEnglishNameModel(molecule, analysis, suggestedEs),
  ).name;
  const legacyDisplayEs = legacyProfileDisplayName({
    language: "es", suggestedName: suggestedEs, spanish1979Name: legacyEs, english1979Name: legacyEn,
  });
  const legacyDisplayEn = legacyProfileDisplayName({
    language: "en", suggestedName: translateSpanishIupacToOpsin(suggestedEs),
    spanish1979Name: legacyEs, english1979Name: legacyEn,
  });
  return {
    molecule, analysis,
    suggestedEs,
    suggestedEn: translateSpanishIupacToOpsin(suggestedEs),
    legacyEs, legacyEn, legacyDisplayEs, legacyDisplayEn,
  };
}

test("unsubstituted C3 alkene and alkyne and C2 alcohol omit only Suggested locant 1", () => {
  for (const [smiles, formula, base, suggestedEs, suggestedEn, legacyEs, legacyEn] of [
    ["C=CC", "C₃H₆", "prop-1-eno", "propeno", "propene", "1-propeno", "1-propene"],
    ["C#CC", "C₃H₄", "prop-1-ino", "propino", "propyne", "1-propino", "1-propyne"],
    ["CCO", "C₂H₆O", "etan-1-ol", "etanol", "ethanol", "etanol", "ethanol"],
  ]) {
    const actual = namesFor(smiles);
    assert.equal(actual.analysis.formula, formula);
    assert.equal(actual.analysis.name, base);
    assert.deepEqual([actual.suggestedEs, actual.suggestedEn, actual.legacyEs, actual.legacyEn],
      [suggestedEs, suggestedEn, legacyEs, legacyEn]);
  }
});

test("locants remain in larger chains and positional isomers in both languages", () => {
  for (const [smiles, spanish, english, legacyEs, legacyEn] of [
    ["C=CCC", "but-1-eno", "but-1-ene", "1-buteno", "1-butene"],
    ["CC=CC", "but-2-eno", "but-2-ene", "2-buteno", "2-butene"],
    ["CC=CCC", "pent-2-eno", "pent-2-ene", "2-penteno", "2-pentene"],
    ["CC#CCC", "pent-2-ino", "pent-2-yne", "2-pentino", "2-pentyne"],
    ["CCCO", "propan-1-ol", "propan-1-ol", "propanol", "1-propanol"],
    ["CC(O)C", "propan-2-ol", "propan-2-ol", "2-propanol", "2-propanol"],
    ["CCC(O)C", "butan-2-ol", "butan-2-ol", "2-butanol", "2-butanol"],
    ["CC(=O)C", "propan-2-ona", "propan-2-one", "propanona", "propanone"],
  ]) {
    const actual = namesFor(smiles);
    assert.equal(actual.suggestedEs, spanish, smiles);
    assert.equal(actual.suggestedEn, english, smiles);
    assert.deepEqual([actual.legacyEs, actual.legacyEn], [legacyEs, legacyEn], `${smiles} Legacy engines`);
    assert.deepEqual([actual.legacyDisplayEs, actual.legacyDisplayEn], [
      { name: legacyEs, available: true }, { name: legacyEn, available: true },
    ], `${smiles} Legacy display`);
  }
  for (const smiles of ["C=C(C)C", "ClCCO"]) {
    const { analysis, suggestedEs } = namesFor(smiles);
    assert.equal(suggestedEs, analysis.name, `${smiles} is outside the omission rule`);
  }
});

test("numbering explanations and literal fragments link to the correct steps", () => {
  for (const [smiles, expectedEs, expectedEn, stemEs, stemEn, suffixEs, suffixEn, location] of [
    ["C=CC", "propeno", "propene", "prop", "prop", "eno", "ene", /C1.*C2/],
    ["C#CC", "propino", "propyne", "prop", "prop", "ino", "yne", /C1.*C2/],
    ["CCO", "etanol", "ethanol", "etan", "ethan", "ol", "ol", /C1/],
  ]) {
    const { molecule, analysis, suggestedEs, suggestedEn } = namesFor(smiles);
    assert.deepEqual([suggestedEs, suggestedEn], [expectedEs, expectedEn]);
    const spanishSteps = buildIupacReasoningSteps(molecule, analysis);
    for (const [language, name, stem, suffix] of [
      ["es", suggestedEs, stemEs, suffixEs],
      ["en", suggestedEn, stemEn, suffixEn],
    ]) {
      const steps = language === "es" ? spanishSteps : buildEnglishReasoningSteps(spanishSteps, molecule, analysis);
      const numbering = steps.find((step) => step.number === "03");
      assert.match(numbering.explanation, location);
      assert.match(numbering.explanation, language === "es" ? /se omite/ : /is omitted/);
      const fragments = deriveReasoningNameFragments({ analysis, displayedName: name, language, steps, canHighlight: true });
      const suffixStep = smiles === "CCO" ? "01" : "03";
      assert.equal(fragments["02"]?.text, stem);
      assert.equal(fragments[suffixStep]?.text, suffix);
      assert.ok(!Object.values(fragments).some((fragment) => fragment.text.includes("1")));
      const parts = buildReasoningNameLinkParts(name, fragments, steps);
      assert.equal(parts.map((part) => part.text).join(""), name);
      assert.equal(parts.find((part) => part.text === stem)?.stepNumber, "02");
      assert.equal(parts.find((part) => part.text === suffix)?.stepNumber, suffixStep);
    }
  }
});

test("Suggested names are recomputed from each structure and remain source independent", () => {
  const propene = namesFor("C=CC");
  const butene = namesFor("C=CCC");
  assert.equal(propene.suggestedEs, "propeno");
  assert.equal(butene.suggestedEs, "but-1-eno");
  assert.equal(namesFor("C=CC").suggestedEs, propene.suggestedEs);
  assert.equal(suggestedIupacNameWithOmittedLocants(propene.analysis), "propeno");
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /sourceNameOverride === null\s*\? stripStereochemicalDescriptors\(suggestedIupacNameWithOmittedLocants\(analysis\)\)/);
  assert.match(page, /copyVisibleName\(displayedIupacName\)/);
  assert.match(page, /const displayedIupacName = nomenclatureVariants\.find/);
});
