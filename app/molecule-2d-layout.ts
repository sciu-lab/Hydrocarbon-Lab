import {
  buildOpenChainSkeletalPositions,
  type SkeletalPoint,
} from "./skeletal-layout.ts";

type LayoutAtom = {
  id: number;
  x: number;
  y: number;
};

type LayoutBond = readonly [number, number, ...unknown[]];

type LayoutMolecule = {
  atoms: readonly LayoutAtom[];
  bonds: readonly LayoutBond[];
  rings?: readonly unknown[];
  isMirrored?: boolean;
};

/**
 * The one display-coordinate source for every molecular representation.
 *
 * Open molecules deliberately reuse the established skeletal layout. Rings
 * retain their editor/imported polygon coordinates, which are already the
 * coordinates used by their skeletal renderer. This is display-only: no
 * chemical or editor coordinates are mutated here.
 */
export function calculateMolecule2DLayout(
  molecule: LayoutMolecule,
  mainChain: readonly number[],
): Map<number, SkeletalPoint> {
  if (!molecule.rings?.length) {
    return buildOpenChainSkeletalPositions(molecule, mainChain);
  }

  return new Map(
    molecule.atoms.map((atom) => [atom.id, {
      x: atom.x * 130,
      y: atom.y * 106,
    }]),
  );
}
