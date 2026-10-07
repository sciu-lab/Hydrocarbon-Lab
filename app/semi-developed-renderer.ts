import type { SemiDevelopedGraph, SemiDevelopedPoint } from "./semi-developed-layout.ts";

export type SemiDevelopedAtomGlyph = {
  atomId: number;
  element: string;
  hydrogens: number;
  charge: number;
  carbonGroup: "CH4" | "CH3" | "CH2" | "CH" | "C" | null;
};

export type SemiDevelopedBondGlyph = {
  bondId: string;
  atomIds: readonly [number, number];
  order: 1 | 2 | 3;
};

export type SemiDevelopedRenderModel = {
  atoms: readonly SemiDevelopedAtomGlyph[];
  bonds: readonly SemiDevelopedBondGlyph[];
  positions: ReadonlyMap<number, SemiDevelopedPoint>;
};

/**
 * Adapts existing graph and chemistry results into presentation glyphs.
 * Hydrogen counts are supplied by the chemistry layer so this renderer never
 * reimplements valence or functional-group rules.
 */
export function buildSemiDevelopedRenderModel(
  graph: SemiDevelopedGraph,
  positions: ReadonlyMap<number, SemiDevelopedPoint>,
  implicitHydrogens: (atomId: number) => number,
): SemiDevelopedRenderModel {
  return {
    atoms: graph.atoms.map((atom) => {
      const element = (atom as { element?: string }).element ?? "C";
      const hydrogens = Math.max(0, implicitHydrogens(atom.id));
      const carbonGroup = element !== "C" ? null
        : hydrogens >= 4 ? "CH4"
          : hydrogens === 3 ? "CH3"
          : hydrogens === 2 ? "CH2"
            : hydrogens === 1 ? "CH" : "C";
      return {
        atomId: atom.id,
        element,
        hydrogens,
        charge: (atom as { charge?: number }).charge ?? 0,
        carbonGroup,
      };
    }),
    bonds: graph.bonds.map((bond) => {
      const [left, right, rawOrder = 1] = bond;
      const order = rawOrder === 2 || rawOrder === 3 ? rawOrder : 1;
      return { bondId: `${Math.min(left, right)}:${Math.max(left, right)}`, atomIds: [left, right] as const, order };
    }),
    positions,
  };
}
