import { EXERCISE_CATEGORIES } from "./exercise-model.ts";
import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import type { ExerciseChemistryOracles, ExerciseFunctionalGroup, ExerciseReference } from "./exercise-chemistry-oracles.ts";
import { EXERCISE_ALLOWED_ELEMENTS, expectedExerciseGroup, validateExerciseChemistry } from "./exercise-domain.ts";
import { resolveFunctionalHierarchy } from "./legacy-english-nomenclature.ts";
import { validateExerciseDomain } from "./exercise-domain.ts";
import type { ExerciseTopology } from "./exercise-domain.ts";
import { inspectDoubleBondStereochemistry } from "./double-bond-stereochemistry.ts";

type Family = Readonly<{
  id: string; functions: readonly string[]; doubles: readonly number[]; triples: readonly number[];
  halo?: "optional-bromo" | "required-bromo"; alkoxy?: boolean;
  esterAlkyl?: boolean; nitro?: boolean;
  structuralCategory?: ExerciseCategory;
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
  { id: "enyne-ester", functions: ["ester"], doubles: [1], triples: [1], esterAlkyl: true },
  { id: "enyne-amine", functions: ["amine"], doubles: [1], triples: [1] },
  { id: "enyne-amide", functions: ["amide"], doubles: [1], triples: [1] },
  { id: "enyne-nitrile", functions: ["nitrile"], doubles: [1], triples: [1] },
  { id: "enyne-nitro", functions: [], doubles: [1], triples: [1], nitro: true },
  { id: "mixed-trialkyl-alkane", functions: [], doubles: [0], triples: [0], structuralCategory: "alkane" },
  { id: "mixed-trialkyl-carbocycle", functions: [], doubles: [0], triples: [0], structuralCategory: "simple-carbocycle" },
  { id: "mixed-trialkyl-benzene", functions: [], doubles: [3], triples: [0], structuralCategory: "aromatic" },
  { id: "mixed-trialkyl-ez", functions: [], doubles: [1], triples: [0], structuralCategory: "ez" },
]);

export type HardFoundationEvidence = Readonly<{
  family: string; principalGroup: string | undefined;
  principalInstances: readonly ExerciseFunctionalGroup[];
  secondaryGroups: readonly ExerciseFunctionalGroup[];
  repeatedFunctions: readonly { kind: string; count: number }[];
  carbonDoubleBondCount: number; carbonTripleBondCount: number;
  explicitEZ: boolean; branchCount: number; parent: readonly number[];
  structuralComplexity?: Readonly<{
    substituents: readonly { locant: number; carbonCount: number }[];
    distinctCarbonSubstituentCount: number;
    oppositeDirectionLocants: readonly number[];
    ezConfiguration?: "E" | "Z";
  }>;
}>;
export type HardFoundationValidation =
  | { valid: true; topology: ExerciseTopology; evidence: HardFoundationEvidence }
  | { valid: false; reason: string };
const reject = (reason: string): { valid: false; reason: string } => ({ valid: false, reason });
const kindKey = (groups: readonly { kind: string }[]) => groups.map((g) => g.kind).sort().join("|");

/** Three separate methyl/ethyl substitutions, with both identities and a real
 * direction-dependent locant set. The parent is selected by the existing namer;
 * this predicate neither chooses a parent nor duplicates its numbering rules.
 * The published domain supplies the unchanged topology and genuine E/Z guards. */
function validateStructuralFamily(molecule: GeneratedMolecule, category: ExerciseCategory,
  oracles: ExerciseChemistryOracles, reference?: ExerciseReference): HardFoundationValidation {
  const family = HARD_FOUNDATION_FAMILIES.find((f) => f.structuralCategory === category)!;
  const domain = validateExerciseDomain(molecule, category, oracles, "intermediate");
  if (!domain.valid) return domain;
  const r = reference ?? oracles.reference(molecule);
  const cyclic = category === "aromatic" || category === "simple-carbocycle";
  if (!r.namingSupported || !r.names.es.trim() || !r.names.en.trim()
    || r.family !== (category === "aromatic" ? "aromatic" : cyclic ? "cycloalkane" : "acyclic")) return reject("hard-naming-unavailable");
  if (!r.parent || !r.functionalGroups || r.functionalGroups.length || r.principalFunctionalGroup !== undefined
    || oracles.detectFunctionalGroups(molecule).length || molecule.atoms.some((a) => (a.element ?? "C") !== "C" || (a.charge ?? 0) !== 0)) return reject("hard-structural-hydrocarbon-required");
  const parent = r.parent.atomIds, inside = new Set(parent);
  const carbons = new Set(molecule.atoms.map((a) => a.id));
  if (inside.size !== r.parent.carbonCount || parent.some((id) => !carbons.has(id))
    || (cyclic ? ![5, 6].includes(parent.length) : parent.length < 6 || parent.length > 9)) return reject("hard-parent-not-certified");
  const neighbors = (id: number) => molecule.bonds.flatMap(([a, b]) => a === id ? [b] : b === id ? [a] : []);
  if (parent.slice(1).some((id, i) => !neighbors(id).includes(parent[i]))
    || cyclic && (!neighbors(parent[0]).includes(parent.at(-1)!)
      || molecule.rings![0].atomIds.some((id) => !inside.has(id)))) return reject("hard-parent-path-mismatch");
  if (molecule.atoms.some((a) => neighbors(a.id).length > 3)) return reject("hard-complex-branch");
  const multiples = molecule.bonds.filter((b) => (b[2] ?? 1) > 1);
  if (multiples.some(([a, b]) => !inside.has(a) || !inside.has(b))) return reject("hard-unsaturation-outside-parent");
  const outside = new Set([...carbons].filter((id) => !inside.has(id)));
  const substituents: { locant: number; carbonCount: number }[] = [];
  while (outside.size) {
    const component = new Set<number>(), pending = [outside.values().next().value!];
    while (pending.length) {
      const id = pending.pop()!;
      if (!outside.delete(id)) continue;
      component.add(id); pending.push(...neighbors(id).filter((other) => outside.has(other)));
    }
    const edges = molecule.bonds.filter(([a, b]) => component.has(a) || component.has(b));
    const boundary = edges.filter(([a, b]) => component.has(a) !== component.has(b));
    if (component.size > 2 || boundary.length !== 1 || edges.some((b) => (b[2] ?? 1) !== 1)) return reject("hard-complex-branch");
    const [a, b] = boundary[0], anchor = component.has(a) ? b : a;
    const locant = parent.indexOf(anchor) + 1;
    if (!locant || !cyclic && (locant === 1 || locant === parent.length
      || multiples.some(([left, right]) => left === anchor || right === anchor))) return reject("hard-branch-site-not-certified");
    substituents.push({ locant, carbonCount: component.size });
  }
  substituents.sort((a, b) => a.locant - b.locant);
  const distinct = new Set(substituents.map((s) => s.carbonCount)).size;
  if (substituents.length !== 3 || distinct !== 2 || new Set(substituents.map((s) => s.locant)).size !== 3) return reject("hard-mixed-trialkyl-required");
  const opposite = substituents.map((s) => cyclic ? (s.locant === 1 ? 1 : parent.length + 2 - s.locant)
    : parent.length + 1 - s.locant).sort((a, b) => a - b);
  if (opposite.every((locant, i) => locant === substituents[i].locant)) return reject("hard-locant-competition-required");
  const configured = molecule.bonds.find((b) => b[3]);
  const stereo = configured ? inspectDoubleBondStereochemistry(molecule, configured[0], configured[1]) : undefined;
  // Domain already requires exactly one marked, genuinely stereogenic center.
  if (category === "ez" && (!stereo?.stereogenic || !stereo.configuration)) return reject("invalid-ez-configuration");
  return { valid: true, topology: domain.topology, evidence: {
    family: family.id, principalGroup: undefined, principalInstances: [], secondaryGroups: [], repeatedFunctions: [],
    carbonDoubleBondCount: multiples.filter((b) => b[2] === 2).length,
    carbonTripleBondCount: 0, explicitEZ: category === "ez", branchCount: substituents.length, parent: [...parent],
    structuralComplexity: { substituents, distinctCarbonSubstituentCount: distinct, oppositeDirectionLocants: opposite,
      ...(stereo?.configuration ? { ezConfiguration: stereo.configuration } : {}) },
  } };
}

/** Explicit opt-in capability. Published generation/domain policies never call
 * this function. Principal selection comes from the namer's shared hierarchy. */
export function validateHardFoundationExercise(molecule: GeneratedMolecule, category: ExerciseCategory,
  oracles: ExerciseChemistryOracles, reference?: ExerciseReference): HardFoundationValidation {
  if (!EXERCISE_CATEGORIES.includes(category)) return reject("unsupported-category");
  const chemical = validateExerciseChemistry(molecule, oracles);
  if (!chemical.valid) return chemical;
  if (molecule.atoms.some((a) => !EXERCISE_ALLOWED_ELEMENTS.includes((a.element ?? "C") as typeof EXERCISE_ALLOWED_ELEMENTS[number]))) return reject("excluded-element");
  if (molecule.atoms.some((a) => a.tetrahedralParity !== undefined || a.tetrahedralBondTo !== undefined)) return reject("rs-outside-domain");
  if (HARD_FOUNDATION_FAMILIES.some((f) => f.structuralCategory === category)) {
    try { return validateStructuralFamily(molecule, category, oracles, reference); }
    catch { return reject("hard-analysis-oracle-failed"); }
  }
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
    const nitros = groups.filter((g) => g.kind === "nitro");
    const family = HARD_FOUNDATION_FAMILIES.find((f) => !f.structuralCategory && kindKey(functions) === f.functions.slice().sort().join("|")
      && f.doubles.includes(doubles) && f.triples.includes(triples)
      && (f.id === "diol" ? multiples.length <= 1 : true)
      && nitros.length === (f.nitro ? 1 : 0)
      && (f.halo === "required-bromo" ? halos.length === 1 : f.halo === "optional-bromo" ? halos.length <= 1 : halos.length === 0));
    if (!family) return reject("hard-family-not-certified");
    if (halos.some((g) => !g.atomIds.some((id) => atomMap.get(id)?.element === "Br"))) return reject("hard-halo-variant-not-certified");
    const required = expectedExerciseGroup[category];
    const anchorMatches = required ? (required === "halogen" || required === "nitro" || required === "ether"
      ? groups.some((g) => g.kind === required) : hierarchy.principalKind === required)
      : groups.length === 0 && ((category === "alkene" && doubles > 0) || (category === "alkyne" && triples > 0));
    if (!anchorMatches) return reject("hard-category-anchor-mismatch");
    const covered = new Set(groups.flatMap((g) => g.atomIds));
    if (molecule.atoms.some((a) => !carbon(a.id) && !covered.has(a.id))) return reject("unrecognized-heteroatom");
    // Only this independently certified family permits the canonical nitro
    // charge pair. Net neutrality alone never admits salts or arbitrary ions.
    const nitroAtoms = new Set<number>();
    if (family.nitro) {
      const nitrogen = molecule.atoms.filter((a) => a.element === "N");
      if (nitrogen.length !== 1 || nitrogen[0].charge !== 1) return reject("hard-nitro-pattern-not-certified");
      const n = nitrogen[0], ns = neighbors(n.id);
      const doubleO = ns.find((b) => atomMap.get(b.id)?.element === "O" && b.order === 2);
      const singleO = ns.find((b) => atomMap.get(b.id)?.element === "O" && b.order === 1);
      const carbonNeighbor = ns.filter((b) => carbon(b.id) && b.order === 1);
      if (ns.length !== 3 || !doubleO || !singleO || carbonNeighbor.length !== 1
        || (atomMap.get(doubleO.id)?.charge ?? 0) !== 0 || atomMap.get(singleO.id)?.charge !== -1
        || neighbors(doubleO.id).length !== 1 || neighbors(singleO.id).length !== 1
        || kindKey(nitros) !== "nitro"
        || nitros[0].atomIds.length !== 4
        || [n.id, doubleO.id, singleO.id, carbonNeighbor[0].id].some((id) => !nitros[0].atomIds.includes(id))) return reject("hard-nitro-pattern-not-certified");
      nitroAtoms.add(n.id); nitroAtoms.add(singleO.id);
    }
    if (molecule.atoms.some((a) => !nitroAtoms.has(a.id) && (a.charge ?? 0) !== 0)) return reject("hard-charge-not-certified");
    const parent = new Set(r.parent.atomIds);
    if (parent.size !== r.parent.carbonCount || parent.size < 6 || parent.size > 9 || [...parent].some((id) => !carbons.has(id))) return reject("hard-parent-not-certified");
    if (r.functionalGroups.some((g) => g.kind !== "ether" && !g.carbonIncludedInParent)) return reject("hard-function-outside-parent");
    if (multiples.some(([a, b]) => !parent.has(a) || !parent.has(b))) return reject("hard-unsaturation-outside-parent");
    // The oracle's parent must be a simple carbon path, not merely a set.
    if (r.parent.atomIds.slice(1).some((id, i) => !neighbors(id).some((n) => n.id === r.parent!.atomIds[i]))) return reject("hard-parent-path-mismatch");
    for (const n of molecule.atoms.filter((a) => a.element === "N")) {
      if (family.nitro && nitros[0].atomIds.includes(n.id)) continue;
      const ns = neighbors(n.id);
      if (family.id === "enyne-nitrile") {
        const nitrile = groups.find((g) => g.kind === "nitrile" && g.atomIds.includes(n.id));
        const c = ns[0];
        if (!nitrile || ns.length !== 1 || c.order !== 3 || !carbon(c.id) || !parent.has(c.id)
          || !nitrile.atomIds.includes(c.id) || neighbors(c.id).length !== 2
          || neighbors(c.id).filter((b) => carbon(b.id) && b.order === 1 && parent.has(b.id)).length !== 1) return reject("hard-nitrile-pattern-not-certified");
      } else if (ns.length !== 1 || ns[0].order !== 1
        || !groups.some((g) => ["amine", "amide"].includes(g.kind) && g.atomIds.includes(n.id))) return reject("unsupported-n-substitution");
    }
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
      else if ((family.alkoxy || family.esterAlkyl) && component.size <= 2 && atomMap.get(anchor)?.element === "O"
        && neighbors(anchor).length === 2 && neighbors(anchor).some((n) => parent.has(n.id))
        && (!family.esterAlkyl || groups.some((g) => g.kind === "ester" && g.atomIds.includes(anchor)
          && neighbors(anchor).some((n) => parent.has(n.id) && g.atomIds.includes(n.id))))) alkoxy++;
      else return reject("hard-complex-branch");
    }
    if (branches > 1 || alkoxy !== (family.alkoxy || family.esterAlkyl ? 1 : 0)
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
