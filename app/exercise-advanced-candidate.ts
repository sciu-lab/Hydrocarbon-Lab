import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedAtom, GeneratedMolecule, GeneratedBondOrder } from "./name-to-molecule.ts";
import { createSeededRng, deriveSeed } from "./seeded-rng.ts";
import { setDoubleBondGeometry } from "./double-bond-stereochemistry.ts";

/** Stable v4 producer order. These are constructive recipes for the existing
 * foundation families, never permission to compose arbitrary functional groups. */
export const ADVANCED_RECIPE_FAMILIES = Object.freeze({
  alkane: ["mixed-trialkyl-alkane"], alkene: ["enyne-hydrocarbon"], alkyne: ["enyne-hydrocarbon"],
  halogenated: ["hydroxy-ketone", "amino-alcohol-enyne-bromo"],
  alcohol: ["diol", "amino-alcohol", "alkoxy-alcohol", "enyne-alcohol", "amino-alcohol-enyne-bromo"],
  aldehyde: ["hydroxy-aldehyde"], ketone: ["dione", "hydroxy-ketone"],
  "carboxylic-acid": ["hydroxy-acid", "amino-acid", "amino-hydroxy-acid", "enyne-acid"],
  ether: ["alkoxy-alcohol"], ester: ["enyne-ester"], amine: ["enyne-amine"], amide: ["enyne-amide"],
  "simple-carbocycle": ["mixed-trialkyl-carbocycle"], aromatic: ["mixed-trialkyl-benzene"],
  ez: ["mixed-trialkyl-ez"], nitrile: ["enyne-nitrile"], nitro: ["enyne-nitro"],
} satisfies Record<ExerciseCategory, readonly string[]>);

/** All variation is drawn from legal slots before adding atoms. Names, parent
 * selection and final admission belong to the real chemistry oracles. */
export function buildAdvancedChemicalCandidate(category: ExerciseCategory, seed: string,
  sequence?: { seed: string; index: number }): GeneratedMolecule {
  const rng = createSeededRng(seed);
  const family = rng.pick(ADVANCED_RECIPE_FAMILIES[category]);
  let molecule: GeneratedMolecule = { atoms: [], bonds: [], rings: [] };
  const atom = (element: GeneratedAtom["element"] = "C", charge?: number) => {
    const id = molecule.atoms.length + 1;
    molecule.atoms.push({ id, element, x: id * 55, y: id % 2 * 35,
      ...(charge === undefined ? {} : { charge }) });
    return id;
  };
  const bond = (a: number, b: number, order: GeneratedBondOrder = 1) => molecule.bonds.push([a, b, order]);
  const attach = (id: number, element: GeneratedAtom["element"], order: GeneratedBondOrder = 1, charge?: number) => {
    const added = atom(element, charge); bond(id, added, order); return added;
  };
  const alkyl = (id: number, count: number) => { for (let i = 0; i < count; i++) id = attach(id, "C"); };
  if (category === "aromatic" || category === "simple-carbocycle") {
    // Asymmetric tri-substitution patterns; the alternating benzene pattern
    // has no direction-dependent locants and is deliberately not constructed.
    const plans: { size: number; sites: number[]; lengths: number[] }[] = [];
    const seen = new Set<string>();
    for (const n of category === "aromatic" ? [6] : [5, 6]) for (const sites of [[0, 1, 2], [0, 1, 3]]) {
      for (const single of [1, 2]) for (let i = 0; i < 3; i++) {
        const lengths = Array.from({ length: 3 }, (_, j) => j === i ? single : 3 - single);
        const ring = Array.from({ length: n }, (_, j) => sites.includes(j) ? lengths[sites.indexOf(j)] : 0);
        // Deduplicate legal parameter tuples under ring rotations/reflections.
        // This is not a molecular identity or a replacement for session dedupe.
        const encodings = ring.flatMap((_, offset) => [1, -1].map(direction =>
          Array.from({ length: n }, (_, j) => ring[(offset + direction * j + n) % n]).join("")));
        const key = `${n}:${encodings.sort()[0]}`;
        if (!seen.has(key)) { seen.add(key); plans.push({ size: n, sites, lengths }); }
      }
    }
    const schedule = sequence ? createSeededRng(deriveSeed(sequence.seed, `v4:${category}:ring-parameters`)).shuffle(plans) : plans;
    const plan = sequence ? schedule[sequence.index % schedule.length] : rng.pick(schedule);
    const { sites, lengths, size } = plan;
    const parent = Array.from({ length: size }, (_, i) => {
      const id = atom(); Object.assign(molecule.atoms.at(-1)!, {
        x: 100 * Math.cos(i * 2 * Math.PI / size), y: 100 * Math.sin(i * 2 * Math.PI / size),
      }); return id;
    });
    parent.forEach((id, i) => bond(id, parent[(i + 1) % size], category === "aromatic" && i % 2 === 0 ? 2 : 1));
    molecule.rings!.push({ id: 1, kind: category === "aromatic" ? "aromatic" : "cycloalkane", atomIds: parent });
    sites.forEach((site, i) => alkyl(parent[site], lengths[i]));
    return molecule;
  }

  const length = category === "ez" ? rng.int(8, 9) : rng.int(7, 9);
  const parent = Array.from({ length }, () => atom());
  parent.slice(1).forEach((id, i) => bond(parent[i], id));
  if (category === "alkane" || category === "ez") {
    const multiple = category === "ez" ? rng.pick([2, 3, 4]) : -1;
    if (multiple >= 0) molecule.bonds[multiple][2] = 2;
    const slots = parent.map((_, i) => i).filter(i => i > 0 && i < length - 1 && i !== multiple && i !== multiple + 1);
    // Ethyl strictly inside the chain prevents a longer competing parent.
    const ethylSlots = slots.filter(i => i >= 2 && i <= length - 3);
    // Symmetric branch locants fail the certified mechanism, so exclude that
    // parameter tuple before construction rather than repairing its graph.
    const triples = slots.flatMap((a, i) => slots.slice(i + 1).flatMap((b, j) => slots.slice(i + j + 2).map(c => [a, b, c])))
      .filter(sites => sites.some((v, i) => v !== length - 1 - sites[2 - i]));
    const plans = triples.flatMap(sites => {
      const ethylChoices = sites.filter(i => ethylSlots.includes(i));
      return ethylChoices.flatMap(ethyl => [
        { sites, ethyl: [ethyl] },
        ...ethylChoices.filter(second => second > ethyl).map(second => ({ sites, ethyl: [ethyl, second] })),
      ]);
    });
    const plan = rng.pick(plans);
    plan.sites.forEach(i => alkyl(parent[i], plan.ethyl.includes(i) ? 2 : 1));
    if (category === "ez") {
      const result = setDoubleBondGeometry(molecule, parent[multiple], parent[multiple + 1], rng.pick(["E", "Z"]));
      if (!result.ok) throw new Error(result.error);
      molecule = result.molecule;
    }
    return molecule;
  }

  const enyne = family.startsWith("enyne-") || family === "amino-alcohol-enyne-bromo";
  const multiples: [number, GeneratedBondOrder][] = [];
  if (enyne) {
    // Reserve a saturated terminal carbon for acid/ester/amide/CN;
    // disjoint axes leave legal saturated OH/NH2/nitro/secondary slots.
    const pairs = Array.from({ length: length - 2 }, (_, i) => i + 1)
      .flatMap(a => Array.from({ length: length - 1 }, (_, b) => [a, b]))
      .filter(([a, b]) => b >= a + 2 && b <= length - 2
        && (family === "amino-alcohol-enyne-bromo" ? a === 1 && b === length - 2 : true));
    const [a, b] = rng.pick(pairs);
    const orders = rng.pick([[2, 3], [3, 2]] as const);
    multiples.push([a, orders[0]], [b, orders[1]]);
  } else if (rng.int(0, 1)) {
    // C2 is reserved for ketone; carbonyl carbon never touches a C–C axis.
    const start = family === "dione" || family === "hydroxy-ketone" ? 2 : 1;
    const end = family === "dione" ? length - 4 : length - 3;
    multiples.push([rng.int(start, end), family === "diol" ? rng.pick([2, 3] as const) : 2]);
  }
  const axisSites = new Set(multiples.flatMap(([i]) => [i, i + 1]));
  multiples.forEach(([i, order]) => { molecule.bonds[i][2] = order; });
  const free = parent.map((_, i) => i).filter(i => !axisSites.has(i));
  const used = new Set<number>();
  const take = (internal = false) => {
    const site = rng.pick(free.filter(i => !used.has(i) && (!internal || i > 0 && i < length - 1)));
    used.add(site); return parent[site];
  };
  const terminal = parent[0];
  const acid = () => { used.add(0); attach(terminal, "O", 2); attach(terminal, "O"); };
  const carbonyl = (site: number) => attach(site, "O", 2);
  switch (family) {
    case "diol": attach(take(), "O"); attach(take(), "O"); break;
    case "dione": used.add(1); used.add(length - 2); carbonyl(parent[1]); carbonyl(parent[length - 2]); break;
    case "amino-alcohol": attach(take(), "O"); attach(take(), "N"); break;
    case "alkoxy-alcohol": {
      attach(take(), "O"); const oxygen = attach(take(), "O"); alkyl(oxygen, rng.int(1, 2)); break;
    }
    case "hydroxy-aldehyde": used.add(0); carbonyl(terminal); attach(take(), "O"); break;
    case "hydroxy-ketone": {
      used.add(1); carbonyl(parent[1]); attach(take(), "O");
      if (category === "halogenated" || rng.int(0, 1)) attach(take(), "Br"); break;
    }
    case "hydroxy-acid": acid(); attach(take(), "O"); break;
    case "amino-acid": acid(); attach(take(), "N"); break;
    case "amino-hydroxy-acid": acid(); attach(take(), "O"); attach(take(), "N"); break;
    case "enyne-alcohol": attach(take(), "O"); break;
    case "enyne-acid": acid(); break;
    case "enyne-hydrocarbon": break;
    case "amino-alcohol-enyne-bromo": {
      used.add(0); attach(terminal, "O"); attach(take(), "N"); attach(take(), "Br"); break;
    }
    case "enyne-ester": {
      used.add(0); carbonyl(terminal); const oxygen = attach(terminal, "O"); alkyl(oxygen, rng.int(1, 2)); break;
    }
    case "enyne-amine": attach(take(), "N"); break;
    case "enyne-amide": used.add(0); carbonyl(terminal); attach(terminal, "N"); break;
    case "enyne-nitrile": used.add(0); attach(terminal, "N", 3); break;
    case "enyne-nitro": {
      const nitrogen = attach(take(), "N", 1, 1); attach(nitrogen, "O", 2); attach(nitrogen, "O", 1, -1); break;
    }
    default: throw new RangeError("Unsupported Hard recipe.");
  }
  // One methyl on a saturated interior carbon with one available valence.
  // OH/NH2/Br sites can carry it; carbonyl and C≡N sites cannot.
  const branches = free.filter(i => i > 0 && i < length - 1
    && molecule.bonds.reduce((sum, [a, b, order = 1]) => sum + (a === parent[i] || b === parent[i] ? order : 0), 0) < 4);
  if (branches.length) alkyl(parent[rng.pick(branches)], 1);
  return molecule;
}
