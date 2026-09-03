type CoordinateAtom = {
  x: number;
  y: number;
};

/** Presentation-only molecule fields used by the interactive canvas. */
export type MirrorableMolecule<TAtom extends CoordinateAtom = CoordinateAtom> = {
  atoms: TAtom[];
  isMirrored?: boolean;
};

/**
 * Reflects the visible structure across its vertical centre line.
 *
 * Bonds and Y coordinates are unchanged, so this UI transformation preserves
 * connectivity, E/Z geometry, and every name derived from the molecule.
 */
export function flipCoordinates<T extends MirrorableMolecule>(molecule: T): T {
  if (!molecule.atoms.length) return molecule;

  const xValues = molecule.atoms.map((atom) => atom.x);
  const centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2;
  const { isMirrored: _isMirrored, ...rest } = molecule;

  return {
    ...rest,
    atoms: molecule.atoms.map((atom) => ({
      ...atom,
      x: centerX - (atom.x - centerX),
    })),
    ...(molecule.isMirrored ? {} : { isMirrored: true }),
  } as T;
}
