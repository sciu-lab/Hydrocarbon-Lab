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
  assert.match(page, /currentMoleculeSmiles\.smiles === loadedPubChemIdentity\.smiles/);
  assert.match(page, /const activePubChemIdentity = !isPristineInitialMolecule/);
  assert.match(page, /Boolean\(activePubChemIdentity\s*&& externalCandidateNeedsNeutralLocalName\(molecule, calculatedAnalysis\)\)/);
  assert.match(page, /const traditionalAvailable = Boolean\(!localSuggestedNameUnavailable/);
  assert.match(page, /language === "en" && !externalCandidateNameUnavailable && legacyEnglishResult\.name/);
  assert.match(page, /Systematic name · PubChem/);
  assert.match(page, /Nombre sistemático · PubChem/);
  assert.match(page, /Local IUPAC name unavailable for this structure/);
  assert.match(page, /Nombre IUPAC local no disponible para esta estructura/);
  assert.match(page, /setLoadedPubChemIdentity\(\{[\s\S]*?candidate\.inchiKey[\s\S]*?candidate\.smiles/);
  assert.match(page, /resolvedPubChemIdentity = \{[\s\S]*?data\.inchiKey[\s\S]*?data\.iupacName[\s\S]*?editorSmiles\.smiles/);
  assert.match(page, /verifiedLocalCommonName/);
  assert.match(page, /PubChem record title/);
  assert.match(page, /Título del registro PubChem/);
  assert.match(page, /!displayedNameCopyable/);
  assert.match(page, /setMolecule\(cloneMolecule\(previous\)\)/);
  assert.match(page, /setMolecule\(cloneMolecule\(next\)\)/);
});

test("external identity is keyed to the exact isomeric editor graph, not its formula", () => {
  assert.match(page, /moleculeToSmiles\(molecule\)/);
  assert.match(page, /currentMoleculeSmiles\.smiles === loadedPubChemIdentity\.smiles/);
  assert.doesNotMatch(page, /loadedPubChemIdentity\.molecularFormula\s*===\s*current/);
  assert.match(page, /setLoadedPubChemIdentity\(\{[\s\S]*?smiles: candidate\.smiles/);
});

test("local traditional names remain available only when the local nomenclator supports them", () => {
  assert.match(page, /getCuratedCommonName\(calculatedAnalysis\.name, language\)/);
  assert.match(page, /traditionalAvailable = Boolean\(!localSuggestedNameUnavailable/);
  assert.match(page, /!externalCandidateNameUnavailable && legacyEnglishResult\.name/);
  assert.match(page, /disabled=\{!showIupacName \|\| isPristineInitialMolecule \|\| !displayedNameCopyable\}/);
});

test("dock selects the locale's historical profile, copies the visible variant and deduplicates labels", () => {
  assert.match(page, /language === "es" \? "iupac-1979-es" : "traditional"/);
  assert.match(page, /nomenclatureConvention === "traditional" \|\| nomenclatureConvention === "iupac-1979-es"/);
  assert.match(page, /onChange=\{\(event\) => setNomenclatureConvention\(event\.target\.value as NomenclatureConvention\)\}/);
  assert.match(page, /navigator\.clipboard\?\.writeText\(displayedIupacName\)/);
  assert.match(page, /const visibleCommonName = verifiedLocalCommonName\s*&&\s*!nomenclatureVariants\.some/);
  assert.match(page, /const showPubChemRecordTitle = Boolean\(pubChemRecordTitle && !\[/);
  assert.match(page, /activePubChemIdentity\?\.iupacName \?\? ""/);
  assert.match(page, /!localSuggestedNameUnavailable[\s\S]*historicalCandidate/);
});

test("candidate cards retain PubChem attribution and use a neutral label if the record has no name", () => {
  assert.match(page, /PubChem · CID \{candidate\.cid\}/);
  assert.match(page, /candidate\.iupacName \?\? \(language === "en" \? `PubChem compound \$\{candidate\.cid\}` : `Compuesto PubChem \$\{candidate\.cid\}`\)/);
  assert.match(page, /candidate\.molecularFormula/);
  assert.match(page, /molecule=\{candidate\.molecule\}/);
});
