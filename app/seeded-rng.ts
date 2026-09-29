export type SeededRng = {
  next(): number;
  /** Inclusive bounds; safe integers with a span of at most 2^32. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates on a copy; the input is never mutated. */
  shuffle<T>(items: readonly T[]): T[];
};

const UINT32_RANGE = 0x100000000;

function requireSeed(seed: string) {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new TypeError("A seed must be a nonempty string.");
  }
}

/** FNV-1a over exact UTF-16 code units, yielding an unsigned 32-bit seed. */
export function seedToUint32(seed: string): number {
  requireSeed(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

/** Fixed tuple framing prevents ambiguity between parent and context strings. */
export function deriveSeed(parentSeed: string, context: string): string {
  requireSeed(parentSeed);
  if (typeof context !== "string") {
    throw new TypeError("A seed context must be a string.");
  }
  return JSON.stringify(["hydrocarbon-lab-seed", parentSeed, context]);
}

/** Mulberry32: one unsigned 32-bit state; next() returns a value in [0, 1). */
export function createSeededRng(seed: string): SeededRng {
  let state = seedToUint32(seed);

  function nextUint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  function next() {
    return nextUint32() / UINT32_RANGE;
  }

  function int(min: number, max: number) {
    const span = max - min + 1;
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max
      || !Number.isSafeInteger(span) || span > UINT32_RANGE) {
      throw new RangeError("Integer bounds must be safe integers with an inclusive span of 1 to 2^32.");
    }
    // A singleton needs no entropy; rejected operations also leave state untouched.
    if (span === 1) return min;

    // Rejection sampling avoids modulo bias for non-power-of-two spans.
    const limit = UINT32_RANGE - (UINT32_RANGE % span);
    let value;
    do {
      value = nextUint32();
    } while (value >= limit);
    return min + (value % span);
  }

  function pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new RangeError("Cannot pick from an empty collection.");
    }
    return items[int(0, items.length - 1)];
  }

  function shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const selected = int(0, index);
      [copy[index], copy[selected]] = [copy[selected], copy[index]];
    }
    return copy;
  }

  return { next, int, pick, shuffle };
}
