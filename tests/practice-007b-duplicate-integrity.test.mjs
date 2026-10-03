import assert from "node:assert/strict";
import { test } from "node:test";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { exerciseStructuralIdentity } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
import { createPracticeConfig } from "../app/practice-session.ts";
import { getExerciseTargetIdentity, getExerciseUniquenessKey, selectSessionQuestion } from "../app/session-question-selection.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

function graph(smiles) {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result.molecule;
}

test("PRACTICE-007B / butan-2-ol: two Naming representations cannot both be accepted", async () => {
  const chemistry = await loadExerciseChemistry();
  try {
    const left = graph("CC(O)CC");
    const renumbered = graph("CCC(O)C");
    const leftReference = chemistry.oracles.reference(left);
    const rightReference = chemistry.oracles.reference(renumbered);
    assert.equal(leftReference.names.en, "2-butanol");
    assert.equal(rightReference.names.en, "2-butanol");

    const generated = createPracticeQuestionGenerator(() => ({
      question: { id: "butan-2-ol", seed: "BUTAN-2-OL", generatorVersion: "v1" },
      category: "alcohol", molecule: left,
      reference: { name: leftReference.names.en, names: leftReference.names,
        profiles: { es: "local-systematic-es", en: "iupac-1979-legacy-en" },
        formula: leftReference.formula, smiles: "CC(O)CC", structuralIdentity: exerciseStructuralIdentity(left) },
      generation: { domainVersion: 1, candidateSeed: "butan-2-ol", attempt: 0, topology: "acyclic", rejections: [] },
    }), createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
    const first = generated(createPracticeConfig(["alcohol"], 5, "en", "PRACTICE-007B-BUTAN-2-OL"), 0,
      { questionType: "naming", displayIndex: 0 });
    const second = { ...first, molecule: renumbered,
      question: { ...first.question, id: "butan-2-ol-renumbered", seed: "BUTAN-2-OL-REN" },
      reference: { ...first.reference, name: rightReference.names.en, names: rightReference.names,
        smiles: "CCC(O)C", structuralIdentity: `${first.reference.structuralIdentity}:stale-representation-cache` } };

    assert.equal(getExerciseTargetIdentity(first), getExerciseTargetIdentity(second));
    assert.equal(getExerciseUniquenessKey(first), getExerciseUniquenessKey(second));
    const key = getExerciseUniquenessKey(first);
    const calls = [];
    const selected = selectSessionQuestion({
      config: createPracticeConfig(["alcohol"], 5, "en", "PRACTICE-007B-BUTAN-2-OL"),
      index: 1, generationIndex: 1, recentIdentities: [first.reference.structuralIdentity], usedExerciseKeys: [key],
    }, (_config, index) => { calls.push(index); return second; });
    assert.equal(selected.ok, false);
    assert.equal(selected.reason, "insufficient-unique-questions");
    assert.deepEqual(calls, [1, 2, 3, 4]);
  } finally { await chemistry.close(); }
});

test("target identity ignores atom IDs/order/layout but preserves graph, charge and explicit E/Z", () => {
  const base = graph("CC(O)CC");
  const remappedIds = new Map(base.atoms.map((atom, index) => [atom.id, index + 101]));
  const remapped = { ...base,
    atoms: [...base.atoms].reverse().map((atom, index) => ({ ...atom, id: remappedIds.get(atom.id), x: atom.x + 300 + index, y: atom.y - 200 })),
    bonds: [...base.bonds].reverse().map(([a, b, order, stereo]) => [remappedIds.get(b), remappedIds.get(a), order, stereo]),
  };
  assert.equal(exerciseStructuralIdentity(base), exerciseStructuralIdentity(remapped));
  assert.notEqual(exerciseStructuralIdentity(base), exerciseStructuralIdentity(graph("CCCCO")), "butan-1-ol is a positional isomer");
  assert.notEqual(exerciseStructuralIdentity(graph("CCO")), exerciseStructuralIdentity(graph("C=CO")), "bond order is part of identity");
  assert.notEqual(exerciseStructuralIdentity(graph("C/C=C/C")), exerciseStructuralIdentity(graph("C/C=C\\C")), "E/Z is part of identity");
  assert.equal(exerciseStructuralIdentity(graph("C[N+]([O-])=O")), exerciseStructuralIdentity(graph("C[N+](=O)[O-]")),
    "equivalent nitro serializations share one identity");
});

test("finite selection rejects same-type Naming, MCQ and Build targets while allowing cross-type reuse", async () => {
  const chemistry = await loadExerciseChemistry();
  try {
    const molecule = graph("CC(O)CC");
    const ref = chemistry.oracles.reference(molecule);
    const base = {
      question: { id: "butan-2-ol", seed: "BUTAN-2-OL", generatorVersion: "v1" },
      category: "alcohol", molecule,
      reference: { name: ref.names.en, names: ref.names,
        profiles: { es: "local-systematic-es", en: "iupac-1979-legacy-en" }, formula: ref.formula,
        smiles: "CC(O)CC", structuralIdentity: exerciseStructuralIdentity(molecule) },
      generation: { domainVersion: 1, candidateSeed: "butan-2-ol", attempt: 0, topology: "acyclic", rejections: [] },
    };
    const naming = createPracticeQuestionGenerator(() => base,
      createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
    const mcqGenerator = createPracticeQuestionGenerator(() => base,
      createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
    const questions = {
      naming: naming(createPracticeConfig(["alcohol"], 2, "en", "TYPE-NAMING", ["naming"]), 0,
        { questionType: "naming", displayIndex: 0 }),
      "multiple-choice": mcqGenerator(createPracticeConfig(["alcohol"], 2, "en", "TYPE-MCQ", ["multiple-choice"]), 0,
        { questionType: "multiple-choice", displayIndex: 0 }),
      build: { ...base, type: "build" },
    };
    for (const type of ["naming", "multiple-choice", "build"]) {
      const config = createPracticeConfig(["alcohol"], 2, "en", `TYPE-${type}`, [type]);
      const first = selectSessionQuestion({ config, index: 0, generationIndex: 0, recentIdentities: [], usedExerciseKeys: [] },
        () => questions[type]);
      assert.equal(first.ok, true, `${type} first target accepted`);
      const second = selectSessionQuestion({ config, index: 1, generationIndex: 1, recentIdentities: first.recentIdentities,
        usedExerciseKeys: first.usedExerciseKeys }, (_config, _index, context) => ({ ...questions[context.questionType],
        question: { ...questions[context.questionType].question, id: `second-${type}`, seed: `SECOND-${type}` } }));
      assert.equal(second.ok, false, `${type} repeated target rejected`);
      assert.equal(second.reason, "insufficient-unique-questions");
    }
    assert.notEqual(getExerciseUniquenessKey({ ...questions.naming, type: "naming" }),
      getExerciseUniquenessKey({ ...questions.naming, type: "build" }));
  } finally { await chemistry.close(); }
});
