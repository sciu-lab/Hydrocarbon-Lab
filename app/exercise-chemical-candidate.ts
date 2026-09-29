import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedAtom, GeneratedBondOrder, GeneratedMolecule } from "./name-to-molecule.ts";
import { createSeededRng } from "./seeded-rng.ts";
import { setDoubleBondGeometry } from "./double-bond-stereochemistry.ts";

/** Constructive recipes, never random names or a catalog of SMILES. */
export function buildExerciseChemicalCandidate(category: ExerciseCategory, seed: string): GeneratedMolecule {
  const rng = createSeededRng(seed);
  let molecule: GeneratedMolecule = { atoms: [], bonds: [], rings: [] };
  function atom(x: number, y: number, element: GeneratedAtom["element"] = "C", charge?: number) {
    const id = molecule.atoms.length + 1;
    molecule.atoms.push({ id, x, y, element, ...(charge === undefined ? {} : { charge }) });
    return id;
  }
  function bond(left: number, right: number, order: GeneratedBondOrder = 1) {
    molecule.bonds.push([left, right, order]);
  }
  function chain(length: number, x = 0, y = 0) {
    const ids = Array.from({ length }, (_, index) => atom(x + index * 60, y + (index % 2) * 35));
    for (let index = 1; index < ids.length; index += 1) bond(ids[index - 1], ids[index]);
    return ids;
  }
  function attach(parent: number, element: GeneratedAtom["element"], order: GeneratedBondOrder = 1, charge?: number) {
    const anchor = molecule.atoms.find((candidate) => candidate.id === parent)!;
    const id = atom(anchor.x, anchor.y + 75, element, charge);
    bond(parent, id, order);
    return id;
  }
  function alkyl(parent: number, length: number) {
    const anchor = molecule.atoms.find((candidate) => candidate.id === parent)!;
    let previous = parent;
    for (let index = 0; index < length; index += 1) {
      const id = atom(anchor.x + index * 60, anchor.y - 75 - (index % 2) * 35);
      bond(previous, id);
      previous = id;
    }
  }
  function branches(parent: number[], forbidden: number[] = []) {
    const sites = rng.shuffle(parent.slice(1, -1).filter((id) => !forbidden.includes(id)));
    const count = rng.int(0, Math.min(3, sites.length));
    for (const id of sites.slice(0, count)) alkyl(id, rng.int(1, 2));
  }

  if (category === "aromatic" || category === "simple-carbocycle") {
    const size = category === "aromatic" ? 6 : rng.pick([5, 6]);
    const ids = Array.from({ length: size }, (_, index) => atom(
      100 * Math.cos(index * Math.PI * 2 / size), 100 * Math.sin(index * Math.PI * 2 / size),
    ));
    for (let index = 0; index < size; index += 1) {
      bond(ids[index], ids[(index + 1) % size], category === "aromatic" && index % 2 === 0 ? 2 : 1);
    }
    molecule.rings!.push({ id: 1, kind: category === "aromatic" ? "aromatic" : "cycloalkane", atomIds: ids });
    for (const id of rng.shuffle(ids).slice(0, rng.int(0, 3))) alkyl(id, rng.int(1, 2));
    return molecule;
  }

  if (category === "ether" || category === "ester") {
    const acyl = chain(rng.int(category === "ether" ? 1 : 2, 6));
    const anchor = acyl[0];
    if (category === "ester") attach(anchor, "O", 2);
    const oxygen = attach(anchor, "O");
    const alkylChain = chain(rng.int(1, 4), -240, 180);
    bond(oxygen, alkylChain[0]);
    return molecule;
  }

  const minimum = category === "alkane" ? 1 : category === "ez" ? 4
    : category === "ketone" ? 3 : 2;
  const parent = chain(rng.int(minimum, 10));
  if (category === "alkane") branches(parent);
  else if (category === "alkene" || category === "alkyne" || category === "ez") {
    const position = category === "ez" ? rng.int(1, parent.length - 3) : rng.int(0, parent.length - 2);
    const multiple = molecule.bonds[position];
    multiple[2] = category === "alkyne" ? 3 : 2;
    if (category !== "ez") branches(parent, [parent[position], parent[position + 1]]);
    else {
      const configured = setDoubleBondGeometry(molecule, multiple[0], multiple[1], rng.pick(["E", "Z"]));
      if (!configured.ok) throw new Error(configured.error);
      molecule = configured.molecule;
    }
  } else if (category === "halogenated") {
    branches(parent);
    // Every chosen carbon retains one free valence; the production oracle checks
    // the finished molecule. This is a construction rule, not a valence table.
    const available = () => parent.filter((id) => molecule.bonds.reduce(
      (sum, [left, right, order = 1]) => sum + (left === id || right === id ? order : 0), 0,
    ) < 4);
    for (let index = 0, count = rng.int(1, 3); index < count; index += 1) {
      attach(rng.pick(available()), rng.pick(["F", "Cl", "Br", "I"]));
    }
  } else if (category === "alcohol" || category === "amine") {
    attach(rng.pick(parent), category === "alcohol" ? "O" : "N");
  } else if (category === "aldehyde" || category === "ketone") {
    attach(category === "aldehyde" ? parent[0] : rng.pick(parent.slice(1, -1)), "O", 2);
  } else if (category === "carboxylic-acid" || category === "amide") {
    attach(parent[0], "O", 2);
    attach(parent[0], category === "amide" ? "N" : "O");
  } else if (category === "nitrile") attach(parent[0], "N", 3);
  else if (category === "nitro") {
    const nitrogen = attach(rng.pick(parent), "N", 1, 1);
    attach(nitrogen, "O", 2);
    attach(nitrogen, "O", 1, -1);
  } else throw new RangeError("Unsupported chemical generation category.");
  return molecule;
}
