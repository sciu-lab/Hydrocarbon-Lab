import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let buildIupacReasoningSteps;
let buildEnglishReasoningSteps;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({ analyzeMolecule, buildIupacReasoningSteps, buildEnglishReasoningSteps } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

function makeHex3EneE() {
  return {
    atoms: [
      { id: 1, x: -2.5, y: 1.4 },
      { id: 2, x: -1.3, y: 0.8 },
      { id: 3, x: 0, y: 0 },
      { id: 4, x: 1.4, y: 0 },
      { id: 5, x: 2.7, y: -0.8 },
      { id: 6, x: 3.9, y: -1.4 },
    ],
    bonds: [
      [1, 2, 1],
      [2, 3, 1],
      [3, 4, 2],
      [4, 5, 1],
      [5, 6, 1],
    ],
  };
}

test("an alkane only shows the parent-chain step", () => {
  const result = buildHydrocarbonFromIupacName("butano");
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  const steps = buildIupacReasoningSteps(result.molecule, analysis);
  assert.deepEqual(steps.map((step) => step.number), ["02"]);
  assert.equal(steps[0].title, "Cadena principal");
});

test("functional priority appears before the parent and substituent rules", () => {
  const result = moleculeFromSmiles("CC(C)C(=O)O");
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  const steps = buildIupacReasoningSteps(result.molecule, analysis);
  assert.deepEqual(steps.map((step) => step.number), ["01", "02", "03", "04"]);
  assert.match(steps[0].explanation, /ácido carboxílico/i);
  assert.match(steps[0].explanation, /se fija como C1/i);
});

test("explains ring-attached aldehydes and acids with the functional carbon outside the ring", () => {
  const cases = [
    ["O=CC1CCCCC1", /aldehído.*fuera del padre cíclico/i, /carbono del grupo –CHO queda fuera del anillo/i, /–CHO remains outside the ring/i],
    ["O=C(O)C1CCCCC1", /ácido carboxílico.*fuera del padre cíclico/i, /carbono del grupo –COOH queda fuera del anillo/i, /–COOH remains outside the ring/i],
    ["O=CC1CCCC1", /aldehído.*fuera del padre cíclico/i, /carbono del grupo –CHO queda fuera del anillo/i, /–CHO remains outside the ring/i],
    ["O=C(O)C1CCCC1", /ácido carboxílico.*fuera del padre cíclico/i, /carbono del grupo –COOH queda fuera del anillo/i, /–COOH remains outside the ring/i],
  ];

  for (const [smiles, spanishGroupPattern, spanishParentPattern, englishParentPattern] of cases) {
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
    if (!converted.ok) continue;
    const analysis = analyzeMolecule(converted.molecule);
    const spanish = buildIupacReasoningSteps(converted.molecule, analysis);
    const english = buildEnglishReasoningSteps(spanish, converted.molecule, analysis);
    assert.match(spanish.find((step) => step.number === "01").explanation, spanishGroupPattern, smiles);
    assert.match(spanish.find((step) => step.number === "02").explanation, spanishParentPattern, smiles);
    assert.match(english.find((step) => step.number === "02").explanation, englishParentPattern, smiles);
    assert.doesNotMatch(spanish.find((step) => step.number === "02").explanation, /anillo.*contiene el grupo/i, smiles);
  }
});

test("keeps in-ring ketones and acyclic terminal groups on their existing reasoning paths", () => {
  const cases = [
    ["O=C1CCCCC1", /contiene el grupo cetona/i, /ketone/i],
    ["O=CCCC", /forma parte del esqueleto principal y se fija como C1/i, /carbon.*part of the main skeleton/i],
    ["CC(=O)O", /forma parte del esqueleto principal y se fija como C1/i, /carbon.*part of the main skeleton/i],
  ];
  for (const [smiles, spanishPattern] of cases) {
    const converted = moleculeFromSmiles(smiles);
    assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
    if (!converted.ok) continue;
    const analysis = analyzeMolecule(converted.molecule);
    const spanish = buildIupacReasoningSteps(converted.molecule, analysis);
    assert.match(spanish.find((step) => step.number === (smiles === "O=C1CCCCC1" ? "02" : "01")).explanation, spanishPattern, smiles);
  }
});

test("different substituents add locant and alphabetical-order steps", () => {
  const result = buildHydrocarbonFromIupacName("3-etil-2-metilhexano");
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  const steps = buildIupacReasoningSteps(result.molecule, analysis);
  assert.deepEqual(steps.map((step) => step.number), ["02", "03", "04", "05"]);
  assert.match(steps.find((step) => step.number === "05").explanation, /etil → metil/i);
});

test("repeated substituents on one carbon are explained as a natural group", () => {
  const result = buildHydrocarbonFromIupacName("1,1-dietil-3-metilciclohexano");
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  const steps = buildIupacReasoningSteps(result.molecule, analysis);
  const substituentStep = steps.find((step) => step.number === "04");
  assert.match(
    substituentStep.explanation,
    /se ubican dos grupos etilo en C1 \(dietil\) y un metilo en C3/i,
  );
  assert.doesNotMatch(substituentStep.explanation, /C1 y C1/i);
});

test("repeated substituents across carbons explain their distribution", () => {
  const result = buildHydrocarbonFromIupacName("2,2,4-trimetilpentano");
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  const steps = buildIupacReasoningSteps(result.molecule, analysis);
  const substituentStep = steps.find((step) => step.number === "04");
  assert.match(
    substituentStep.explanation,
    /tres grupos metilo: dos en C2 y uno en C4 \(trimetil\)/i,
  );
});

test("explains how a complex substituent is absorbed and reorganized", () => {
  const sourceName = "5-(1-metiletil)-2-metilheptano";
  const result = buildHydrocarbonFromIupacName(sourceName);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  assert.equal(analysis.name, "3-etil-2,6-dimetilheptano");
  const steps = buildIupacReasoningSteps(
    result.molecule,
    analysis,
    result.enabledAliases,
    sourceName,
  );
  const chainStep = steps.find((step) => step.number === "02");
  assert.match(chainStep.explanation, /sustituyente complejo \(1-metiletil\)/i);
  assert.match(chainStep.explanation, /sus carbonos no desaparecen/i);
  assert.match(chainStep.explanation, /heptano \(7 carbonos\)/i);
  assert.match(chainStep.explanation, /un etilo en C3/i);
  assert.match(chainStep.explanation, /dos grupos metilo en C2 y C6 \(dimetil\)/i);
  assert.match(chainStep.explanation, /localizadores 2,3,6.*más bajo posible/i);
});

test("an E alkene adds multiple-bond and CIP stereochemistry steps", () => {
  const molecule = makeHex3EneE();
  const analysis = analyzeMolecule(molecule);
  const steps = buildIupacReasoningSteps(molecule, analysis);
  assert.deepEqual(steps.map((step) => step.number), ["02", "03", "06"]);
  assert.match(steps.find((step) => step.number === "03").explanation, /C=C en C3/i);
  assert.match(steps.find((step) => step.number === "06").explanation, /3E.*lados opuestos/i);
});

test("explains why an internal ketone is C4 in a hidden nine-carbon chain", () => {
  const result = moleculeFromSmiles("CCCC(=O)CC(C)CCC");
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  const analysis = analyzeMolecule(result.molecule);
  assert.equal(analysis.mainChain.length, 9);
  assert.equal(analysis.primaryFunctionalGroup, "ketone");
  const steps = buildIupacReasoningSteps(result.molecule, analysis);
  const groupStep = steps.find((step) => step.number === "01");
  const chainStep = steps.find((step) => step.number === "02");
  const numberingStep = steps.find((step) => step.number === "03");
  assert.match(groupStep.explanation, /carbonilo es interno/i);
  assert.match(groupStep.explanation, /C4/i);
  assert.match(chainStep.explanation, /octano.*nonano/i);
  assert.match(chainStep.explanation, /modifica todos los localizadores/i);
  assert.match(numberingStep.explanation, /C4.*C6/i);
  assert.match(numberingStep.explanation, /no pueden invertir esta decisión/i);
});

test("explains N-locants and nested substituents without inventing a carbon locant", () => {
  const converted = moleculeFromSmiles("C1(CCCCC1)CCNC(CC(C(CC)C)=O)=O");
  assert.equal(converted.ok, true, converted.ok ? undefined : converted.error);
  const analysis = analyzeMolecule(converted.molecule);
  const steps = buildIupacReasoningSteps(
    converted.molecule,
    analysis,
    [],
    "N-(2-ciclohexiletil)-4-metil-3-oxohexanamida",
  );

  assert.deepEqual(steps.map((step) => step.number), ["01", "02", "04"]);
  assert.match(steps[0].explanation, /amida/i);
  assert.match(steps[2].explanation, /directamente al nitrógeno/i);
  assert.match(steps[2].explanation, /paréntesis/i);
  assert.doesNotMatch(steps[2].explanation, /C\d/);
});
