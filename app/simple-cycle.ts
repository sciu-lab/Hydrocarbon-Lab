/**
 * Finds the one non-fused cycle in a graph and returns its vertices in bond
 * order.  A molecule may have acyclic substituents; they are peeled away
 * before checking the remaining 2-regular core.
 *
 * This intentionally returns `null` for fused, bridged, spiro, or otherwise
 * polycyclic graphs. Those structures need their explicit ring metadata.
 */
export function findOrderedSimpleMonocycle(
  molecule: {
    atoms: readonly { id: number }[];
    bonds: readonly (readonly [number, number, ...unknown[]])[];
  },
): number[] | null {
  if (molecule.atoms.length < 3 || molecule.bonds.length < 3) return null;

  const atomIds = new Set(molecule.atoms.map((atom) => atom.id));
  const adjacency = new Map(molecule.atoms.map((atom) => [atom.id, [] as number[]]));
  let edgeCount = 0;
  for (const [left, right] of molecule.bonds) {
    if (!atomIds.has(left) || !atomIds.has(right) || left === right) continue;
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
    edgeCount += 1;
  }
  adjacency.forEach((neighbors) => neighbors.sort((left, right) => left - right));

  let componentCount = 0;
  const seen = new Set<number>();
  for (const atomId of atomIds) {
    if (seen.has(atomId)) continue;
    componentCount += 1;
    const pending = [atomId];
    while (pending.length) {
      const current = pending.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!seen.has(neighbor)) pending.push(neighbor);
      }
    }
  }

  // The cyclomatic number must be exactly one across the whole graph.
  if (edgeCount - atomIds.size + componentCount !== 1) return null;

  const degrees = new Map(
    [...atomIds].map((atomId) => [atomId, adjacency.get(atomId)?.length ?? 0]),
  );
  const core = new Set(atomIds);
  const pending = [...degrees]
    .filter(([, degree]) => degree <= 1)
    .map(([atomId]) => atomId);

  while (pending.length) {
    const atomId = pending.pop()!;
    if (!core.delete(atomId)) continue;
    for (const neighbor of adjacency.get(atomId) ?? []) {
      if (!core.has(neighbor)) continue;
      const nextDegree = (degrees.get(neighbor) ?? 0) - 1;
      degrees.set(neighbor, nextDegree);
      if (nextDegree === 1) pending.push(neighbor);
    }
  }

  if (core.size < 3 || [...core].some((atomId) =>
    (adjacency.get(atomId) ?? []).filter((neighbor) => core.has(neighbor)).length !== 2,
  )) return null;

  const first = Math.min(...core);
  const ordered = [first];
  let previous: number | undefined;
  while (ordered.length < core.size) {
    const current = ordered[ordered.length - 1];
    const next = (adjacency.get(current) ?? []).find((neighbor) =>
      core.has(neighbor) && neighbor !== previous,
    );
    if (next === undefined || ordered.includes(next)) return null;
    previous = current;
    ordered.push(next);
  }

  return (adjacency.get(ordered[ordered.length - 1]) ?? []).includes(first)
    ? ordered
    : null;
}
