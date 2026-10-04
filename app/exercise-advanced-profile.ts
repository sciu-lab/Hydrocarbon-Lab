import { EXERCISE_CATEGORIES } from "./exercise-model.ts";
import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles, ExerciseFunctionalGroup, ExerciseReference } from "./exercise-chemistry-oracles.ts";
import { EXERCISE_ALLOWED_ELEMENTS, expectedExerciseGroup, validateExerciseChemistry } from "./exercise-domain.ts";
import { resolveFunctionalHierarchy } from "./legacy-english-nomenclature.ts";

type Family = Readonly<{
  id: string; functions: readonly string[]; doubles: readonly number[]; triples: readonly number[];
  halo?: "optional-bromo" | "required-bromo"; alkoxy?: boolean;
}>;

/** Admission families, not production recipes or permission to compose their
 * features. Each row is certified independently of the seeded generator. */
export const HARD_FOUNDATION_FAMILIES: readonly Family[] = Object.freeze([
  { id: "diol", functions: ["alcohol", "alcohol"], doubles: [0, 1], triples: [0, 1] },
  { id: "dione", functions: ["ketone", "ketone"], doubles: [0, 1], triples: [0] },
  { id: "amino-alcohol", functions: ["alcohol", "amine"], doubles: [0, 1], triples: [0] },
  { id: "alkoxy-alcohol", functions: ["alcohol", "ether"], doubles: [0, 1], triples: [0], alkoxy: true },
  { id: "hydroxy-aldehyde", functions: ["aldehyde", "alcohol"], doubles: [0, 1], triples: [0] },
  { id: "hydroxy-ketone", functions: ["ketone", "alcohol"], doubles: [0, 1], triples: [0], halo: "optional-bromo" },
  { id: "hydroxy-acid", functions: ["carboxylicAcid", "alcohol"], doubles: [0, 1], triples: [0] },
  { id: "amino-acid", functions: ["carboxylicAcid", "amine"], doubles: [0, 1], triples: [0] },
  { id: "amino-hydroxy-acid", functions: ["carboxylicAcid", "amine", "alcohol"], doubles: [0, 1], triples: [0] },
  { id: "enyne-alcohol", functions: ["alcohol"], doubles: [1], triples: [1] },
  { id: "enyne-acid", functions: ["carboxylicAcid"], doubles: [1], triples: [1] },
  { id: "enyne-hydrocarbon", functions: [], doubles: [1], triples: [1] },
  { id: "amino-alcohol-enyne-bromo", functions: ["alcohol", "amine"], doubles: [1], triples: [1], halo: "required-bromo" },
]);

export type HardFoundationEvidence = Readonly<{
  family: string; principalGroup: string | undefined;
  principalInstances: readonly ExerciseFunctionalGroup[];
  secondaryGroups: readonly ExerciseFunctionalGroup[];
  repeatedFunctions: readonly { kind: string; count: number }[];
  carbonDoubleBondCount: number; carbonTripleBondCount: number;
  explicitEZ: boolean; branchCount: number; parent: readonly number[];
}>;
export type HardFoundationValidation =
  | { valid: true; topology: "acyclic"; evidence: HardFoundationEvidence }
  | { valid: false; reason: string };
const reject = (reason: string): { valid: false; reason: string } => ({ valid: false, reason });
const kindKey = (groups: readonly { kind: string }[]) => groups.map((g) => g.kind).sort().join("|");

/** Explicit opt-in capability. Published generation/domain policies never call
 * this function. Principal selection comes from the namer's shared hierarchy. */
export function validateHardFoundationExercise(molecule: GeneratedMolecule, category: ExerciseCategory,
  oracles: ExerciseChemistryOracles, reference?: ExerciseReference): HardFoundationValidation {
  if (!EXERCISE_CATEGORIES.includes(category)) return reject("unsupported-category");
  const chemical = validateExerciseChemistry(molecule, oracles);
  if (!chemical.valid) return chemical;
  if (molecule.atoms.some((a) => !EXERCISE_ALLOWED_ELEMENTS.includes((a.element ?? "C") as typeof EXERCISE_ALLOWED_ELEMENTS[number]))) return reject("excluded-element");
  if (molecule.atoms.some((a) => a.tetrahedralParity !== undefined || a.tetrahedralBondTo !== undefined)) return reject("rs-outside-domain");
  if (molecule.atoms.some((a) => (a.charge ?? 0) !== 0)) return reject("hard-charge-not-certified");
  if (molecule.bonds.length - molecule.atoms.length + 1 !== 0) return reject("hard-cycles-not-certified");
  if (molecule.rings !== undefined && (!Array.isArray(molecule.rings) || molecule.rings.length)) return reject("invalid-ring-metadata");
  if (molecule.bonds.some((b) => b[3])) return reject("hard-explicit-ez-not-certified");
  try {
    const groups = oracles.detectFunctionalGroups(molecule);
    const r = reference ?? oracles.reference(molecule);
    if (!r.namingSupported || r.family !== "acyclic" || !r.names.es.trim() || !r.names.en.trim()) return reject("hard-naming-unavailable");
    if (!r.parent || !r.functionalGroups || kindKey(r.functionalGroups) !== kindKey(groups)) return reject("hard-analysis-evidence-missing");
    const hierarchy = resolveFunctionalHierarchy(r.functionalGroups);
    if (hierarchy.principalKind !== r.principalFunctionalGroup) return reject("hard-principal-evidence-mismatch");
    const atomMap = new Map(molecule.atoms.map((a) => [a.id, a]));
    const carbon = (id: number) => (atomMap.get(id)?.element ?? "C") === "C";
    const neighbors = (id: number) => molecule.bonds.flatMap(([a, b, order = 1]) =>
      a === id ? [{ id: b, order }] : b === id ? [{ id: a, order }] : []);
    const carbons = new Set(molecule.atoms.filter((a) => carbon(a.id)).map((a) => a.id));
    const multiples = molecule.bonds.filter(([a, b, o = 1]) => carbon(a) && carbon(b) && o > 1);
    const doubles = multiples.filter((b) => b[2] === 2).length, triples = multiples.filter((b) => b[2] === 3).length;
    if (multiples.length > 2 || multiples.some(([a, b], index) => multiples.some(([c, d], j) => index !== j && [c, d].some((id) => id === a || id === b)))) return reject("hard-unsaturation-not-certified");
    const functions = groups.filter((g) => !["halogen", "nitro"].includes(g.kind));
    const halos = groups.filter((g) => g.kind === "halogen");
    if (groups.some((g) => g.kind === "nitro")) return reject("hard-nitro-variant-not-certified");
    const family = HARD_FOUNDATION_FAMILIES.find((f) => kindKey(functions) === f.functions.slice().sort().join("|")
      && f.doubles.includes(doubles) && f.triples.includes(triples)
      && (f.id === "diol" ? multiples.length <= 1 : true)
      && (f.halo === "required-bromo" ? halos.length === 1 : f.halo === "optional-bromo" ? halos.length <= 1 : halos.length === 0));
    if (!family) return reject("hard-family-not-certified");
    if (halos.some((g) => !g.atomIds.some((id) => atomMap.get(id)?.element === "Br"))) return reject("hard-halo-variant-not-certified");
    const required = expectedExerciseGroup[category];
    const anchorMatches = required ? (required === "halogen" || required === "nitro" || required === "ether"
      ? groups.some((g) => g.kind === required) : hierarchy.principalKind === required)
      : functions.length === 0 && ((category === "alkene" && doubles > 0) || (category === "alkyne" && triples > 0));
    if (!anchorMatches) return reject("hard-category-anchor-mismatch");
    const covered = new Set(groups.flatMap((g) => g.atomIds));
    if (molecule.atoms.some((a) => !carbon(a.id) && !covered.has(a.id))) return reject("unrecognized-heteroatom");
    if (molecule.atoms.some((a) => a.element === "N" && (neighbors(a.id).length !== 1 || neighbors(a.id)[0].order !== 1))) return reject("unsupported-n-substitution");
    const parent = new Set(r.parent.atomIds);
    if (parent.size !== r.parent.carbonCount || parent.size < 6 || parent.size > 9 || [...parent].some((id) => !carbons.has(id))) return reject("hard-parent-not-certified");
    if (r.functionalGroups.some((g) => g.kind !== "ether" && !g.carbonIncludedInParent)) return reject("hard-function-outside-parent");
    if (multiples.some(([a, b]) => !parent.has(a) || !parent.has(b))) return reject("hard-unsaturation-outside-parent");
    // The oracle's parent must be a simple carbon path, not merely a set.
    if (r.parent.atomIds.slice(1).some((id, i) => !neighbors(id).some((n) => n.id === r.parent!.atomIds[i]))) return reject("hard-parent-path-mismatch");
    for (const kind of ["alcohol", "ketone"]) {
      const sites = groups.filter((g) => g.kind === kind).map((g) => g.atomIds.filter(carbon));
      if (sites.some((s) => s.length !== 1 || !parent.has(s[0])) || new Set(sites.flat()).size !== sites.length) return reject("hard-functional-sites-not-certified");
    }
    const outside = new Set([...carbons].filter((id) => !parent.has(id)));
    let branches = 0, alkoxy = 0;
    while (outside.size) {
      const component = new Set<number>(), pending = [outside.values().next().value!];
      while (pending.length) {
        const id = pending.pop()!;
        if (!outside.delete(id)) continue;
        component.add(id); pending.push(...neighbors(id).filter((n) => outside.has(n.id)).map((n) => n.id));
      }
      const edges = molecule.bonds.filter(([a, b]) => component.has(a) || component.has(b));
      const boundary = edges.filter(([a, b]) => component.has(a) !== component.has(b));
      if (boundary.length !== 1 || edges.some((b) => (b[2] ?? 1) !== 1)) return reject("hard-complex-branch");
      const [a, b] = boundary[0], anchor = component.has(a) ? b : a;
      if (parent.has(anchor) && component.size === 1) branches++;
      else if (family.alkoxy && component.size <= 2 && atomMap.get(anchor)?.element === "O"
        && neighbors(anchor).length === 2 && neighbors(anchor).some((n) => parent.has(n.id))) alkoxy++;
      else return reject("hard-complex-branch");
    }
    if (branches > 1 || alkoxy !== (family.alkoxy ? 1 : 0)
      || [...carbons].some((id) => neighbors(id).filter((n) => carbon(n.id)).length > 3)) return reject("hard-branch-budget");
    const principalInstances = groups.filter((g) => g.kind === hierarchy.principalKind);
    return { valid: true, topology: "acyclic", evidence: {
      family: family.id, principalGroup: hierarchy.principalKind, principalInstances,
      secondaryGroups: groups.filter((g) => g.kind !== hierarchy.principalKind),
      repeatedFunctions: [...new Set(functions.map((g) => g.kind))].map((kind) => ({ kind, count: functions.filter((g) => g.kind === kind).length })).filter((g) => g.count > 1),
      carbonDoubleBondCount: doubles, carbonTripleBondCount: triples, explicitEZ: false,
      branchCount: branches, parent: [...r.parent.atomIds],
    } };
  } catch { return reject("hard-analysis-oracle-failed"); }
}

/** Neutral Hard comparison membership. Analyze once, retain the existing
 * category predicates, and never impose this target's difficulty on a student. */
export function validateHardFoundationComparison(molecule: GeneratedMolecule,
  oracles: ExerciseChemistryOracles): HardFoundationValidation {
  const chemical = validateExerciseChemistry(molecule, oracles);
  if (!chemical.valid) return chemical;
  try {
    const reference = oracles.reference(molecule);
    for (const category of EXERCISE_CATEGORIES) {
      const result = validateHardFoundationExercise(molecule, category, oracles, reference);
      if (result.valid) return result;
    }
    return reject("hard-comparison-not-certified");
  } catch { return reject("hard-analysis-oracle-failed"); }
}
