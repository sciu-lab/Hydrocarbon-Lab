import { calculateMolecule2DLayout } from "./molecule-2d-layout.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";

/**
 * Practice accepts generator coordinates, not editor-unit polygons. Normalize
 * explicit ring edges to editor units before the shared layout attaches branches
 * at its fixed display bond length. Only a temporary coordinate copy changes.
 */
export function calculatePracticeMolecule2DLayout(molecule: GeneratedMolecule, mainChain: readonly number[]) {
  const atoms = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const edgeKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const ringEdges = new Set((molecule.rings ?? []).flatMap((ring) =>
    ring.atomIds.map((id, index) => edgeKey(id, ring.atomIds[(index + 1) % ring.atomIds.length]))));
  const lengths = molecule.bonds.flatMap(([a, b]) => {
    if (!ringEdges.has(edgeKey(a, b))) return [];
    const start = atoms.get(a), end = atoms.get(b);
    if (!start || !end) return [];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    return Number.isFinite(length) && length > 0 ? [length] : [];
  }).sort((a, b) => a - b);
  if (!lengths.length) return calculateMolecule2DLayout(molecule, mainChain);
  const middle = Math.floor(lengths.length / 2);
  const unit = lengths.length % 2 ? lengths[middle] : (lengths[middle - 1] + lengths[middle]) / 2;
  const displayMolecule = { ...molecule, atoms: molecule.atoms.map((atom) => ({
    ...atom, x: atom.x / unit, y: atom.y / unit,
  })) };
  return calculateMolecule2DLayout(displayMolecule, mainChain);
}
