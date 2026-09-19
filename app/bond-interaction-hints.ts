import {
  isDoubleBondEZToggleAvailable,
  type StereoMolecule,
} from "./double-bond-stereochemistry.ts";

export type BondInteractionHintAction = "change-order" | "switch-ez";

function isCarbonAtom(molecule: StereoMolecule, atomId: number) {
  return (molecule.atoms.find((atom) => atom.id === atomId)?.element ?? "C") === "C";
}

function isBondInAnyRing(molecule: StereoMolecule, leftAtomId: number, rightAtomId: number) {
  return Boolean(molecule.rings?.some(
    (ring) => ring.atomIds.includes(leftAtomId) && ring.atomIds.includes(rightAtomId),
  ));
}

function canChangeBondOrder(
  molecule: StereoMolecule,
  leftAtomId: number,
  rightAtomId: number,
) {
  return isCarbonAtom(molecule, leftAtomId)
    && isCarbonAtom(molecule, rightAtomId)
    && !(molecule.rings?.length && !isBondInAnyRing(molecule, leftAtomId, rightAtomId));
}

/**
 * Lists only the bond actions currently available to the canvas. Aromatic
 * Kekulé bonds can be edited (which explicitly de-aromatizes their ring), but
 * they are never advertised as E/Z switches.
 */
export function getBondInteractionHintActions(
  molecule: StereoMolecule,
): BondInteractionHintAction[] {
  const changeOrderAvailable = molecule.bonds.some(([leftAtomId, rightAtomId]) =>
    canChangeBondOrder(molecule, leftAtomId, rightAtomId),
  );
  const ezToggleAvailable = molecule.bonds.some(([leftAtomId, rightAtomId, order = 1]) =>
    order === 2 && isDoubleBondEZToggleAvailable(molecule, leftAtomId, rightAtomId),
  );

  return [
    ...(changeOrderAvailable ? ["change-order" as const] : []),
    ...(ezToggleAvailable ? ["switch-ez" as const] : []),
  ];
}

/** E/Z guidance is a presentation affordance, controlled by the independent UI switch. */
export function getVisibleBondInteractionHintActions(
  actions: readonly BondInteractionHintAction[],
  showStereochemistry: boolean,
) {
  return actions.filter((action) => action !== "switch-ez" || showStereochemistry);
}

/** Keeps canvas geometry immutable until the user has explicitly enabled E/Z. */
export function canToggleBondStereochemistry(
  showStereochemistry: boolean,
  bondSupportsEZ: boolean,
) {
  return showStereochemistry && bondSupportsEZ;
}
