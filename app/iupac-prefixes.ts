const rootsThroughTwenty = [
  "",
  "met",
  "et",
  "prop",
  "but",
  "pent",
  "hex",
  "hept",
  "oct",
  "non",
  "dec",
  "undec",
  "dodec",
  "tridec",
  "tetradec",
  "pentadec",
  "hexadec",
  "heptadec",
  "octadec",
  "nonadec",
  "icos",
] as const;

const twentySeries = [
  "icos",
  "henicos",
  "docos",
  "tricos",
  "tetracos",
  "pentacos",
  "hexacos",
  "heptacos",
  "octacos",
  "nonacos",
] as const;

const unitCombiningForms = ["", "hen", "do", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona"] as const;
const decadeRoots: Record<number, string> = {
  30: "triacont",
  40: "tetracont",
  50: "pentacont",
  60: "hexacont",
  70: "heptacont",
  80: "octacont",
  90: "nonacont",
};

/** Preferred Spanish IUPAC parent roots from C1 through C100. */
export const IUPAC_ROOTS: readonly string[] = Object.freeze(
  Array.from({ length: 101 }, (_unused, carbonCount) => {
    if (carbonCount < rootsThroughTwenty.length) return rootsThroughTwenty[carbonCount];
    if (carbonCount < 30) return twentySeries[carbonCount - 20];
    if (carbonCount === 100) return "hect";
    const decade = Math.floor(carbonCount / 10) * 10;
    const unit = carbonCount % 10;
    const decadeRoot = decadeRoots[decade];
    return unit === 0 ? decadeRoot : `${unitCombiningForms[unit]}${decadeRoot}`;
  }),
);

/** Historical spellings accepted on input without changing preferred output. */
export const IUPAC_ROOT_ALIASES: Readonly<Record<number, readonly string[]>> = Object.freeze({
  20: ["eicos"],
  21: ["heneicos"],
});

export function iupacRootForCarbonCount(carbonCount: number) {
  return Number.isInteger(carbonCount) && carbonCount >= 1 && carbonCount < IUPAC_ROOTS.length
    ? IUPAC_ROOTS[carbonCount]
    : undefined;
}

export function englishIupacRoot(root: string) {
  if (root === "met") return "meth";
  if (root === "et") return "eth";
  return root;
}

export function iupacAlkylNameForCarbonCount(carbonCount: number) {
  const root = iupacRootForCarbonCount(carbonCount);
  return root ? `${root}il` : undefined;
}
