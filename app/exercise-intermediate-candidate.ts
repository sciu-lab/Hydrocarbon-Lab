import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedAtom, GeneratedMolecule, GeneratedBondOrder } from "./name-to-molecule.ts";
import { createSeededRng } from "./seeded-rng.ts";
import { setDoubleBondGeometry } from "./double-bond-stereochemistry.ts";

/** V3 families: legal slots are selected before construction. No generic
 * functional assembler, rejection sampling or name-based chemistry. */
export function buildIntermediateChemicalCandidate(category: ExerciseCategory, seed: string): GeneratedMolecule {
  const rng = createSeededRng(seed);
  let molecule: GeneratedMolecule = { atoms: [], bonds: [], rings: [] };
  const atom = (element: GeneratedAtom["element"] = "C", charge?: number) => {
    const id = molecule.atoms.length + 1;
    molecule.atoms.push({ id, x: id * 55, y: id % 2 * 35, element,
      ...(charge === undefined ? {} : { charge }) });
    return id;
  };
  const bond = (a: number, b: number, order: GeneratedBondOrder = 1) => molecule.bonds.push([a, b, order]);
  const attach = (id: number, e: GeneratedAtom["element"], order: GeneratedBondOrder = 1, charge?: number) => {
    const added = atom(e, charge); bond(id, added, order); return added;
  };
  const chain = (length: number) => {
    const ids = Array.from({ length }, () => atom());
    ids.slice(1).forEach((id, i) => bond(ids[i], id)); return ids;
  };
  if (category === "aromatic" || category === "simple-carbocycle") {
    const size = category === "aromatic" ? 6 : rng.pick([5, 6]);
    const parent = Array.from({ length: size }, (_, i) => {
      const id = atom(); Object.assign(molecule.atoms.at(-1)!, {
        x: 100 * Math.cos(i * 2 * Math.PI / size), y: 100 * Math.sin(i * 2 * Math.PI / size),
      }); return id;
    });
    parent.forEach((id, i) => bond(id, parent[(i + 1) % size], category === "aromatic" && i % 2 === 0 ? 2 : 1));
    molecule.rings!.push({ id: 1, kind: category === "aromatic" ? "aromatic" : "cycloalkane", atomIds: parent });
    for (const id of rng.shuffle(parent).slice(0, 2)) {
      const methyl = attach(id, "C");
      if (rng.int(1, 2) === 2) attach(methyl, "C");
    }
    return molecule;
  }
  const parent = chain(rng.int(6, 9));
  const hydrocarbon = ["alkane", "alkene", "alkyne", "ez"].includes(category);
  let multipleIndex = -1;
  if (category !== "alkane") {
    // C3–C4 or C4–C5; neither terminal carbonyl/nitrile nor C2 OH/NH2 overlaps.
    multipleIndex = rng.pick([2, 3]);
    const order: GeneratedBondOrder = category === "alkyne" ? 3 : category === "alkene" || category === "ez" ? 2 : rng.pick([2, 3] as const);
    molecule.bonds[multipleIndex][2] = order;
  }
  if (hydrocarbon) {
    if (category !== "ez") {
      const slots = parent.slice(1, -1).filter((id) => id !== parent[multipleIndex] && id !== parent[multipleIndex + 1]);
      for (const id of rng.shuffle(slots).slice(0, 2)) attach(id, "C");
    } else {
      const multiple = molecule.bonds[multipleIndex];
      const result = setDoubleBondGeometry(molecule, multiple[0], multiple[1], rng.pick(["E", "Z"]));
      if (!result.ok) throw new Error(result.error);
      molecule = result.molecule;
    }
    return molecule;
  }
  const anchor = category === "alcohol" || category === "amine" || category === "ketone" || category === "nitro"
    || category === "halogenated" ? parent[1] : parent[0];
  if (category === "alcohol" || category === "amine") attach(anchor, category === "alcohol" ? "O" : "N");
  else if (category === "aldehyde" || category === "ketone") attach(anchor, "O", 2);
  else if (category === "carboxylic-acid" || category === "amide") {
    attach(anchor, "O", 2); attach(anchor, category === "amide" ? "N" : "O");
  } else if (category === "nitrile") attach(anchor, "N", 3);
  else if (category === "nitro") {
    const nitrogen = attach(anchor, "N", 1, 1); attach(nitrogen, "O", 2); attach(nitrogen, "O", 1, -1);
  } else if (category === "halogenated") attach(anchor, rng.pick(["F", "Cl", "Br", "I"]));
  else if (category === "ether" || category === "ester") {
    if (category === "ester") attach(anchor, "O", 2);
    const oxygen = attach(anchor, "O");
    const alkyl = chain(rng.int(1, 2)); bond(oxygen, alkyl[0]);
  } else throw new RangeError("Unsupported Intermediate family.");
  // Tail slots cannot touch carbonyls, nitrile carbon or multiple endpoints.
  const slots = parent.slice(2, -1).filter((id) => id !== parent[multipleIndex] && id !== parent[multipleIndex + 1]);
  if (slots.length && rng.int(0, 1)) attach(rng.pick(slots), "C");
  if ((category === "alcohol" || category === "ketone") && rng.int(0, 1)) {
    // Exactly one optional halo on a saturated tail carbon, after the branch.
    attach(rng.pick(slots), rng.pick(["Cl", "Br"]));
  }
  return molecule;
}
