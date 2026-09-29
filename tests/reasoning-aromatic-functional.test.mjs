import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { translateSpanishIupacForDisplay } from "../app/iupac-name-normalization.ts";
import { aromaticFunctionalChainReasoning } from "../app/reasoning-aromatic-substituents.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";
import { activateReasoningReference, scrollToReasoningStep } from "../app/reasoning-name-navigation.ts";
import { arylFunctionalCases, excludedArylCases } from "./fixtures/aromatic-functional-derivation.mjs";
import { auditAromaticFunctionalDerivation, inspectDerivation } from "../scripts/audit-aromatic-functional-derivation.mjs";

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

function presented(compound, language) {
  const spanish = page.buildIupacReasoningSteps(compound.molecule, compound.analysis);
  const steps = language === "en" ? page.buildEnglishReasoningSteps(spanish, compound.molecule, compound.analysis) : spanish;
  const name = language === "en" ? translateSpanishIupacForDisplay(compound.analysis.name) : compound.analysis.name;
  const fragments = deriveReasoningNameFragments({ analysis: compound.analysis, displayedName: name, language, steps,
    canHighlight: !page.externalCandidateNeedsNeutralLocalName(compound.molecule, compound.analysis) });
  const parts = buildReasoningNameLinkParts(name, fragments, steps);
  assert.deepEqual(inspectDerivation({ language }, name, steps, fragments, parts, compound.analysis), []);
  const linked = parts.filter((part) => part.stepNumber).map((part) => ({ ...part,
    role: steps.find((step) => step.number === part.stepNumber).nameRole }));
  for (const part of linked) {
    for (const number of [part.stepNumber, ...(part.relatedStepNumbers ?? [])]) {
      const visited = [];
      activateReasoningReference({ current: null }, number, (target) => scrollToReasoningStep(target,
        { getElementById: (id) => steps.some((step) => id === `iupac-reasoning-step-${step.number}`)
          ? { scrollIntoView: () => visited.push(id) } : null }, { matchMedia: () => ({ matches: true }) }));
      assert.deepEqual(visited, [`iupac-reasoning-step-${number}`]);
    }
  }
  return { name, steps, fragments, parts, linked };
}

for (const fixture of arylFunctionalCases) {
  test(`${fixture.label}: chain, aryl and principal function retain provenance across ES → EN → ES`, () => {
    const compound = analyzed(fixture.smiles);
    const snapshot = structuredClone(compound);
    assert.equal(compound.analysis.family, "acyclic");
    assert.equal(compound.analysis.primaryFunctionalGroup, fixture.group);
    const phenyl = compound.analysis.substituents.find((item) => item.name === "fenil");
    assert.equal(phenyl.atomIds.length, 6);
    assert.ok(phenyl.atomIds.every((id) => !compound.analysis.mainChain.includes(id)));
    const first = presented(compound, "es");
    for (const language of ["es", "en", "es"]) {
      const result = presented(compound, language);
      assert.equal(result.name, fixture[language]);
      const parent = result.linked.find((part) => part.role === "parent");
      const aryl = result.linked.find((part) => part.role === "substituent" && /fenil|phenyl/.test(part.text));
      const functional = result.linked.find((part) => part.role === "function"
        && part.text === fixture[language === "en" ? "suffixEn" : "suffixEs"]);
      assert.equal(parent.text, fixture[language === "en" ? "rootEn" : "rootEs"]);
      assert.deepEqual(parent.atomIds, compound.analysis.mainChain);
      assert.deepEqual(aryl.atomIds, phenyl.atomIds);
      assert.ok(functional.contributions.some((origin) => origin.group === fixture.group));
      assert.ok(functional.contributions.every((origin) => origin.atomIds.every((id) =>
        compound.molecule.atoms.some((atom) => atom.id === id))));
      assert.ok(result.linked.every((part) => part.text !== result.name), "no whole-name multi-role fallback");
      const parentStep = result.steps.find((step) => step.number === parent.stepNumber);
      const arylStep = result.steps.find((step) => step.number === aryl.stepNumber);
      assert.match(parentStep.explanation, language === "en" ? /chain containing the principal/ : /cadena.*función principal/);
      assert.ok(parentStep.explanation.includes(language === "en"
        ? `${compound.analysis.mainChain.length}-carbon` : `cadena de ${compound.analysis.mainChain.length}`));
      assert.match(arylStep.explanation, language === "en" ? /hydrogen.*benzene.*aryl.*phenyl/ : /hidrógeno.*bencénico.*arilo.*fenil/);
      if (fixture.externalName) {
        assert.equal(compound.analysis.mainChain.length, 1);
        assert.deepEqual(result.linked.map((part) => [part.text, part.role]), [
          [language === "en" ? "phenyl" : "fenil", "substituent"],
          [language === "en" ? "methan" : "metan", "parent"],
          [fixture[language === "en" ? "suffixEn" : "suffixEs"], "function"],
        ]);
        assert.match(result.steps.find((step) => step.number === functional.stepNumber).explanation,
          fixture.group === "alcohol" ? /–OH/ : /–NH₂/);
        if (language === "en") assert.equal(result.name, fixture.externalName, "valid computed English name is preserved");
      }
    }
    assert.deepEqual(presented(compound, "es"), first);
    assert.deepEqual(compound, snapshot, "locale changes reuse the unchanged molecule and analysis");
  });
}

test("benzaldehyde stays a retained benz/aldehyde parent rather than a phenyl chain", () => {
  const compound = analyzed("O=Cc1ccccc1");
  for (const language of ["en", "es", "en"]) {
    assert.equal(aromaticFunctionalChainReasoning(compound.molecule, compound.analysis, language), undefined);
    const result = presented(compound, language);
    assert.deepEqual(result.linked.map((part) => [part.text, part.role]),
      [["benz", "parent"], [language === "en" ? "aldehyde" : "aldehído", "function"]]);
    assert.match(result.steps.find((step) => step.nameRole === "function").explanation,
      language === "en" ? /retained name/ : /nombre retenido/);
  }
});

test("aromatic-chain explanation requires actual aromatic atoms and their single attachment bond", () => {
  const { molecule, analysis } = analyzed("NCc1ccccc1");
  const phenyl = analysis.substituents.find((item) => item.name === "fenil");
  const parent = analysis.mainChain[phenyl.locant - 1];
  const detached = { ...molecule, bonds: molecule.bonds.filter(([a, b]) =>
    !(a === parent && phenyl.atomIds.includes(b) || b === parent && phenyl.atomIds.includes(a))) };
  assert.equal(aromaticFunctionalChainReasoning(detached, analysis, "en"), undefined);
  assert.equal(aromaticFunctionalChainReasoning({ ...molecule, rings: [] }, analysis, "es"), undefined);
  assert.equal(aromaticFunctionalChainReasoning(molecule, { ...analysis, family: "aromatic" }, "en"), undefined);
  const nitrogen = analysis.functionalGroups.find((group) => group.kind === "amine").atomIds
    .find((id) => id !== parent);
  const secondary = { ...molecule, bonds: [...molecule.bonds, [nitrogen, phenyl.atomIds[0], 1]] };
  assert.equal(aromaticFunctionalChainReasoning(secondary, analysis, "en").function, "",
    "additional N attachment must not acquire an NH2 description");
});

test("unsupported substituted-aryl and benzyl-ether probes retain the local-name safety gate", () => {
  for (const fixture of excludedArylCases) {
    const compound = analyzed(fixture.smiles);
    assert.equal(page.externalCandidateNeedsNeutralLocalName(compound.molecule, compound.analysis), true, fixture.label);
  }
});

test("representative span audit: 47 supported structures have parent/function coverage and no orphan links", async () => {
  await server.close();
  server = undefined;
  const rows = await auditAromaticFunctionalDerivation();
  assert.equal(rows.length, 100);
  const supported = rows.filter((row) => !row.excluded);
  assert.equal(supported.length, 94);
  assert.ok(supported.every((row) => row.supported));
  for (const row of supported) {
    assert.deepEqual(row.anomalies, row.acceptedException === "indivisible-retained-parent"
      ? ["full-name-multiple-roles"] : [], `${row.label} ${row.language}`);
  }
  assert.ok(rows.filter((row) => row.excluded).every((row) => !row.supported));
  for (const language of ["en", "es"]) {
    const ether = rows.find((row) => row.label === "methoxybenzene" && row.language === language);
    assert.ok(ether.spans.some((span) => span.role === "parent"));
    assert.ok(ether.spans.some((span) => span.role === "substituent" && /methoxy|metoxi/.test(span.text)));
  }
});
