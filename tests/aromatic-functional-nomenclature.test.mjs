import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { translateSpanishIupacForDisplay } from "../app/iupac-name-normalization.ts";
import { applyNomenclatureConvention, nomenclatureConventionLabel } from "../app/nomenclature-conventions.ts";
import { deriveReasoningNameFragments } from "../app/reasoning-name-fragments.ts";
import { buildReasoningNameLinkParts } from "../app/reasoning-name-links.ts";

let server;
let page;
before(async () => {
  server = await createServer({ configFile: false, logLevel: "error", appType: "custom",
    plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false } });
  page = await server.ssrLoadModule("/app/page.tsx");
});
after(async () => { await server?.close(); });

function analyzed(smiles) {
  const imported = moleculeFromSmiles(smiles);
  assert.equal(imported.ok, true);
  const analysis = page.analyzeMolecule(imported.molecule);
  assert.equal(page.externalCandidateNeedsNeutralLocalName(imported.molecule, analysis), false);
  return { molecule: imported.molecule, analysis };
}

function display(analysis, language) {
  const suggested = page.suggestedIupacNameWithOmittedLocants(analysis);
  return applyNomenclatureConvention(language === "en" ? translateSpanishIupacForDisplay(suggested) : suggested,
    "current", language);
}

// Checked 2026-09-28 against the corrected Blue Book P-14.3.4.2(b),
// P-64.2.1.2 and P-64.2.1.3, not PubChem's display title or synonyms.
// https://iupac.qmul.ac.uk/BlueBook/P1.html#P-14.3.4
// https://iupac.qmul.ac.uk/BlueBook/P6.html#P-64.2.1.2
// https://iupac.qmul.ac.uk/bibliog/BBerrors.html
// PubChem's actual IUPACName fields for CID 7409 / 7410 are
// 1-phenylethanol / 1-phenylethanone; those are not the current PIN spelling.
const corrected = [
  ["benzylic alcohol", "CC(O)c1ccccc1", "1-feniletan-1-ol", "1-phenylethan-1-ol", "1-ol", "1-ol", "alcohol", 1],
  ["acetophenone", "CC(=O)c1ccccc1", "1-feniletan-1-ona", "1-phenylethan-1-one", "1-ona", "1-one", "ketone", 1],
  ["benzylic ethylamine", "CC(N)c1ccccc1", "1-feniletan-1-amina", "1-phenylethan-1-amine", "1-amina", "1-amine", "amine", 1],
  ["terminal phenylethylamine", "NCCc1ccccc1", "2-feniletan-1-amina", "2-phenylethan-1-amine", "1-amina", "1-amine", "amine", 2],
];

for (const [label, smiles, es, en, suffixEs, suffixEn, group, arylLocant] of corrected) {
  test(`${label}: the nomenclature layer retains distinct aryl and principal-function locants`, () => {
    const { molecule, analysis } = analyzed(smiles);
    const snapshot = structuredClone({ molecule, analysis });
    const aryl = analysis.substituents.find((item) => item.name === "fenil");
    const principal = analysis.functionalGroups.find((item) => item.kind === group);
    assert.equal(aryl.locant, arylLocant);
    assert.equal(analysis.numberedAtoms.get(principal.carbonId), 1);
    for (const language of ["en", "es", "en"]) {
      const name = display(analysis, language);
      assert.equal(name, language === "en" ? en : es);
      const spanish = page.buildIupacReasoningSteps(molecule, analysis);
      const steps = language === "en" ? page.buildEnglishReasoningSteps(spanish, molecule, analysis) : spanish;
      const fragments = deriveReasoningNameFragments({ analysis, displayedName: name, language, steps, canHighlight: true });
      const parts = buildReasoningNameLinkParts(name, fragments, steps);
      assert.equal(parts.map((part) => part.text).join(""), name);
      const linked = parts.filter((part) => part.stepNumber).map((part) => ({ ...part,
        role: steps.find((step) => step.number === part.stepNumber).nameRole }));
      assert.deepEqual(linked.map((part) => [part.text, part.role]), [
        [`${arylLocant}-${language === "en" ? "phenyl" : "fenil"}`, "substituent"],
        [language === "en" ? "ethan" : "etan", "parent"],
        [language === "en" ? suffixEn : suffixEs, "function"],
      ]);
      assert.deepEqual(linked[0].atomIds, aryl.atomIds);
      assert.deepEqual(linked[1].atomIds, analysis.mainChain);
      assert.ok(linked[2].contributions.some((origin) => origin.group === group));
      assert.ok(linked[0].relatedStepNumbers.includes(steps.find((step) => step.nameRole === "numbering").number));
    }
    assert.deepEqual({ molecule, analysis }, snapshot);
  });
}

test("the seven other requested structures preserve the existing systematic-chain convention in EN and ES", () => {
  // PubChem IUPACName fields were inspected directly through PUG REST.
  // Retained-parent alternatives (acetaldehyde, acetic acid, acetamide,
  // acetonitrile) do not invalidate these existing systematic-chain names.
  for (const [smiles, es, en] of [
    ["OCCc1ccccc1", "2-feniletan-1-ol", "2-phenylethan-1-ol"],
    ["O=CCc1ccccc1", "2-feniletanal", "2-phenylethanal"],
    ["O=C(O)Cc1ccccc1", "ácido 2-feniletanoico", "2-phenylethanoic acid"],
    ["NC(=O)Cc1ccccc1", "2-feniletanamida", "2-phenylethanamide"],
    ["N#CCc1ccccc1", "2-feniletanonitrilo", "2-phenylethanenitrile"],
    ["NCc1ccccc1", "fenilmetanamina", "phenylmethanamine"],
    ["OCc1ccccc1", "fenilmetanol", "phenylmethanol"],
  ]) {
    const { analysis } = analyzed(smiles);
    assert.equal(display(analysis, "en"), en);
    assert.equal(display(analysis, "es"), es);
  }
  assert.equal(nomenclatureConventionLabel("current", "en"), "IUPAC Suggested (Blue Book 2013+)");
});

test("the aromatic correction keeps mononuclear omission and existing nonaryl names intact", () => {
  for (const [smiles, en] of [["OCc1ccccc1", "phenylmethanol"], ["NCc1ccccc1", "phenylmethanamine"],
    ["CCO", "ethanol"], ["CCN", "ethanamine"], ["CO", "methanol"], ["CN", "methanamine"]]) {
    assert.equal(display(analyzed(smiles).analysis, "en"), en);
  }
});
