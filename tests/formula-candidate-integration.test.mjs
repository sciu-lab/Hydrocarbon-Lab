import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("PubChem search is offered only for a valid formula with no local candidates", () => {
  assert.match(page, /formulaResult\?\.ok && formulaResult\.isomers\.length === 0/);
  assert.match(page, /language === "en" \? "Search PubChem" : "Buscar en PubChem"/);
  assert.match(page, /formulaCandidateResult\.status === "success"/);
  assert.match(page, /formulaResult\?\.ok && formulaResult\.isomers\.length > 0/);
});

test("typing and submitting only run the local catalog; PubChem is called from its explicit action", () => {
  const localSubmit = page.match(/const generateIsomersFromFormula = \(event: FormEvent<HTMLFormElement>\) => \{([\s\S]*?)\n  \};\n\n  const searchPubChemFormulaCandidates/);
  assert.ok(localSubmit);
  assert.match(localSubmit[1], /generateFormulaIsomers\(formulaInput\)/);
  assert.doesNotMatch(localSubmit[1], /searchPubChemFormulaCandidates|formulaCandidateResolverRef.*\.search/);
  assert.match(page, /onClick=\{\(\) => \{ void searchPubChemFormulaCandidates\(\); \}\}/);
  assert.match(page, /formulaCandidateResolverRef\.current!\.search\(localResult\.asciiFormula, controller\.signal\)/);
});

test("obsolete requests are aborted and ignored when the input, panel or request changes", () => {
  assert.match(page, /formulaSearchControllerRef\.current\?\.abort\(\)/);
  assert.match(page, /formulaSearchGenerationRef\.current \+= 1/);
  assert.match(page, /generation !== formulaSearchGenerationRef\.current/);
  assert.match(page, /!formulaPanelOpenRef\.current/);
  assert.match(page, /latestFormula\.asciiFormula !== localResult\.asciiFormula/);
  assert.match(page, /formulaInputRef\.current = nextFormula;\s*cancelFormulaCandidateSearch\(\)/);
  assert.match(page, /const closeFormulaPanel = \(\) => \{\s*formulaPanelOpenRef\.current = false;\s*cancelFormulaCandidateSearch\(\)/);
});

test("selection commits the verified candidate graph and only reports success after canvas acceptance", () => {
  assert.match(page, /formulaCandidateResult\.formula !== candidate\.molecularFormula/);
  assert.match(page, /const committed = commit\(\s*candidate\.molecule,/);
  assert.match(page, /if \(!committed\) \{[\s\S]*?the current molecule was kept[\s\S]*?return;/);
  assert.match(page, /PubChem identity: \$\{candidate\.iupacName \?\? `PubChem compound \$\{candidate\.cid\}`\} · CID \$\{candidate\.cid\} · \$\{candidate\.molecularFormula\}/);
  assert.match(page, /Identidad PubChem: \$\{candidate\.iupacName \?\? `Compuesto PubChem \$\{candidate\.cid\}`\} · CID \$\{candidate\.cid\} · \$\{candidate\.molecularFormula\}/);
});

test("external name safeguards follow the exact loaded graph and suppress unsupported local variants", () => {
  assert.match(page, /currentSmiles\.ok && currentSmiles\.smiles === loadedPubChemFormulaCandidate\.smiles/);
  assert.match(page, /Boolean\(activeLoadedPubChemFormulaCandidate\s*&& externalCandidateNeedsNeutralLocalName\(molecule, calculatedAnalysis\)\)/);
  assert.match(page, /const traditionalAvailable = Boolean\(!externalCandidateNameUnavailable/);
  assert.match(page, /language === "en" && !externalCandidateNameUnavailable && legacyEnglishResult\.name/);
  assert.match(page, /setMolecule\(cloneMolecule\(previous\)\)/);
  assert.match(page, /setMolecule\(cloneMolecule\(next\)\)/);
});

test("candidate cards retain PubChem attribution and use a neutral label if the record has no name", () => {
  assert.match(page, /PubChem · CID \{candidate\.cid\}/);
  assert.match(page, /candidate\.iupacName \?\? \(language === "en" \? `PubChem compound \$\{candidate\.cid\}` : `Compuesto PubChem \$\{candidate\.cid\}`\)/);
  assert.match(page, /candidate\.molecularFormula/);
  assert.match(page, /molecule=\{candidate\.molecule\}/);
});
