import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles } from "./exercise-chemistry-oracles.ts";
import { validateExerciseDomain } from "./exercise-domain.ts";
import { exerciseStructuralIdentity } from "./exercise-chemical-generator.ts";
import type { DistractorEngineInput, DistractorNamingEngine } from "./practice-distractor-engine.ts";
import type { DistractorDiagnosticCode, DistractorTransformation, MultipleChoiceDistractorOption } from "./practice-multiple-choice.ts";
import { matchesHydrocarbonReferenceName } from "./practice-reference-answer.ts";
import { deriveSeed } from "./seeded-rng.ts";
import { generateLegacyEnglishName } from "./legacy-english-nomenclature.ts";

export const MAX_GRAPH_DISTRACTOR_VARIANTS_PER_RECIPE = 3;

/** All names come from alternative valid graphs. Comparison of naming models
 * rejects side effects such as a new parent, renumbering or a competing suffix. */
export function generateGraphDistractors(input: DistractorEngineInput, engine: DistractorNamingEngine,
  oracles: ExerciseChemistryOracles): MultipleChoiceDistractorOption[] {
  const source = input.generatedMolecule;
  const graph = source.molecule;
  const analysis = engine.analyzeMolecule(graph);
  const model = engine.buildLegacyEnglishNameModel(graph, analysis);
  const result: MultipleChoiceDistractorOption[] = [];
  const full = (code: DistractorDiagnosticCode) => result.filter((option) => option.origin.diagnosticCode === code).length >= MAX_GRAPH_DISTRACTOR_VARIANTS_PER_RECIPE;
  const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const normalizedModel = (value: typeof model) => ({ ...value,
    parent: { kind: value.parent.kind, carbonCount: value.parent.carbonCount },
    substituents: [...value.substituents].sort((a, b) => a.locant - b.locant || compareText(a.systematicName, b.systematicName)),
    functionalGroups: [...value.functionalGroups].sort((a, b) => a.locant - b.locant || compareText(a.kind, b.kind)),
  });
  const same = (a: typeof model, b: typeof model) => JSON.stringify(normalizedModel(a)) === JSON.stringify(normalizedModel(b));
  const accept = (alternative: GeneratedMolecule, code: DistractorDiagnosticCode,
    transform: (next: typeof model, analysis: ReturnType<DistractorNamingEngine["analyzeMolecule"]>) => DistractorTransformation | null) => {
    if (full(code)) return;
    try {
      if (!validateExerciseDomain(alternative, source.category, oracles).valid) return;
      const nextAnalysis = engine.analyzeMolecule(alternative);
      const next = engine.buildLegacyEnglishNameModel(alternative, nextAnalysis);
      if (code !== "WRONG_PARENT_LENGTH" && JSON.stringify([...model.parent.atomIds].sort((a, b) => a - b))
        !== JSON.stringify([...next.parent.atomIds].sort((a, b) => a - b))) return;
      const transformation = transform(next, nextAnalysis);
      if (!transformation) return;
      const reference = oracles.reference(alternative);
      const identity = exerciseStructuralIdentity(alternative);
      if (!reference.namingSupported || identity === source.reference.structuralIdentity
        || reference.names.es !== nextAnalysis.name
        || reference.names.en !== generateLegacyEnglishName(next).name
        || (["es", "en"] as const).some((locale) => matchesHydrocarbonReferenceName(reference.names[locale], source.reference.names[locale], locale))) return;
      result.push({ id: deriveSeed(input.questionSeed, `mcq:distractor:${code}:${JSON.stringify(transformation)}`),
        kind: "distractor", correct: false, name: reference.names,
        origin: { kind: "recipe", recipeId: code.toLowerCase().replaceAll("_", "-"), diagnosticCode: code, transformation,
          verification: { kind: "validated-alternative-graph", referenceStructuralIdentity: source.reference.structuralIdentity,
            alternativeStructuralIdentity: identity } } });
    } catch { /* An unavailable oracle rejects this candidate, never invents a name. */ }
  };

  // Extend only terminal carbon atoms. Unchanged structured fields certify that
  // extension changed only parent length (including ester/ether attached alkyl).
  if (model.parent.kind === "chain") {
    for (const end of [analysis.mainChain[0], analysis.mainChain.at(-1)!]) {
      for (const amount of [1, 2, 3]) {
        if (full("WRONG_PARENT_LENGTH")) break;
        const alternative = structuredClone(graph);
        let anchor = alternative.atoms.find((atom) => atom.id === end)!;
        let id = Math.max(...alternative.atoms.map((atom) => atom.id));
        for (let step = 0; step < amount; step++) {
          const atom = { id: ++id, x: anchor.x + 40, y: anchor.y + (step % 2 ? -30 : 30), element: "C" as const };
          alternative.atoms.push(atom); alternative.bonds.push([anchor.id, atom.id, 1]); anchor = atom;
        }
        accept(alternative, "WRONG_PARENT_LENGTH", (next) => {
          const expected = structuredClone(model); expected.parent.carbonCount += amount;
          return same(expected, next) ? { kind: "replace-parent-length", from: model.parent.carbonCount, to: next.parent.carbonCount } : null;
        });
      }
    }
  }
  if (model.parent.kind === "ring" && graph.rings?.length === 1) {
    for (const amount of [1, 2, 3]) {
      const alternative = structuredClone(graph), ring = alternative.rings![0];
      const first = ring.atomIds[0], last = ring.atomIds.at(-1)!;
      alternative.bonds = alternative.bonds.filter(([a, b]) => !((a === first && b === last) || (b === first && a === last)));
      let id = Math.max(...alternative.atoms.map((atom) => atom.id)), anchor = last;
      for (let n = 0; n < amount; n++) {
        alternative.atoms.push({ id: ++id, x: n * 30, y: 50, element: "C" });
        alternative.bonds.push([anchor, id, 1]); ring.atomIds.push(id); anchor = id;
      }
      alternative.bonds.push([anchor, first, 1]);
      accept(alternative, "WRONG_PARENT_LENGTH", (next) => {
        const expected = structuredClone(model); expected.parent.carbonCount += amount;
        return same(expected, next) ? { kind: "replace-parent-length", from: model.parent.carbonCount, to: next.parent.carbonCount } : null;
      });
    }
  }

  // A simple carbon branch with one attachment. No complex prefix parsing.
  const parent = new Set(analysis.mainChain);
  for (const branch of analysis.substituents.filter((item) => !item.complex)) {
    const ids = new Set(branch.atomIds.filter((id) => !parent.has(id)));
    if (!ids.size || graph.atoms.some((atom) => ids.has(atom.id) && (atom.element ?? "C") !== "C")) continue;
    const boundary = graph.bonds.filter(([a, b]) => ids.has(a) !== ids.has(b));
    if (boundary.length !== 1 || (boundary[0][2] ?? 1) !== 1) continue;
    const edge = boundary[0], root = ids.has(edge[0]) ? edge[0] : edge[1], anchor = ids.has(edge[0]) ? edge[1] : edge[0];
    const index = model.substituents.findIndex((item) => item.locant === branch.locant
      && item.systematicName === branch.name && !item.complex);
    if (index < 0) continue;
    for (const target of analysis.mainChain.filter((id) => id !== anchor)) {
      if (full("WRONG_SUBSTITUENT_LOCANT")) break;
      const alternative = structuredClone(graph);
      alternative.bonds = alternative.bonds.filter(([a, b]) => !((a === root && b === anchor) || (b === root && a === anchor)));
      alternative.bonds.push([root, target, 1]);
      accept(alternative, "WRONG_SUBSTITUENT_LOCANT", (next, nextAnalysis) => {
        const to = nextAnalysis.numberedAtoms.get(target);
        if (!to || to === branch.locant) return null;
        const expected = structuredClone(model); expected.substituents[index].locant = to;
        return same(expected, next) ? { kind: "replace-locant", component: "substituent", name: branch.name, from: branch.locant, to } : null;
      });
    }
    const alternative = structuredClone(graph);
    alternative.atoms = alternative.atoms.filter((atom) => !ids.has(atom.id));
    alternative.bonds = alternative.bonds.filter(([a, b]) => !ids.has(a) && !ids.has(b));
    accept(alternative, "MISSING_SUBSTITUENT", (next) => {
      const expected = structuredClone(model); expected.substituents.splice(index, 1);
      return same(expected, next) ? { kind: "omit-substituent", name: branch.name, locant: branch.locant } : null;
    });
  }

  if (["alcohol", "amine", "ketone"].includes(source.category) && model.functionalGroups.length === 1) {
    const group = analysis.functionalGroups[0];
    const bond = graph.bonds.find(([a, b]) => (a === group.carbonId && b === group.heteroAtomId) || (b === group.carbonId && a === group.heteroAtomId));
    if (bond) for (const target of analysis.mainChain.filter((id) => id !== group.carbonId)) {
      if (full("WRONG_FUNCTIONAL_GROUP_LOCANT")) break;
      const alternative = structuredClone(graph);
      alternative.bonds = alternative.bonds.filter(([a, b]) => !((a === bond[0] && b === bond[1]) || (a === bond[1] && b === bond[0])));
      alternative.bonds.push([target, group.heteroAtomId, bond[2]]);
      accept(alternative, "WRONG_FUNCTIONAL_GROUP_LOCANT", (next) => {
        if (next.functionalGroups.length !== 1) return null;
        const from = model.functionalGroups[0].locant, to = next.functionalGroups[0].locant;
        const expected = structuredClone(model); expected.functionalGroups[0].locant = to;
        return to !== from && same(expected, next) ? { kind: "replace-locant", component: "function", from, to } : null;
      });
    }
  }
  if (source.category === "alkene" || source.category === "alkyne") {
    const original = graph.bonds.find(([a, b, order]) => parent.has(a) && parent.has(b) && (order ?? 1) > 1);
    if (original) for (const target of graph.bonds.filter(([a, b, order]) => parent.has(a) && parent.has(b) && (order ?? 1) === 1)) {
      if (full("WRONG_UNSATURATION_LOCANT")) break;
      const alternative = structuredClone(graph);
      for (const bond of alternative.bonds) {
        if (bond[0] === original[0] && bond[1] === original[1]) bond[2] = 1;
        if (bond[0] === target[0] && bond[1] === target[1]) bond[2] = original[2];
      }
      accept(alternative, "WRONG_UNSATURATION_LOCANT", (next) => {
        const key = source.category === "alkene" ? "doubleBondLocants" : "tripleBondLocants";
        const from = model[key][0], to = next[key][0];
        const expected = structuredClone(model); expected[key] = [to];
        return to !== from && same(expected, next) ? { kind: "replace-locant", component: "unsaturation", from, to } : null;
      });
    }
  }
  return result;
}
