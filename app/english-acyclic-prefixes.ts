import { englishIupacRoot, IUPAC_ROOTS } from "./iupac-prefixes.ts";
import { compareLocantSets } from "./legacy-english-nomenclature.ts";

type PrefixGroup = { name: string; sortName: string; locants: number[] };

const roots = IUPAC_ROOTS.filter(Boolean).map(englishIupacRoot);
const alkaneParent = new RegExp(`(${[...roots].sort((a, b) => b.length - a.length).join("|")})ane$`);
const simpleNames = ["fluoro", "chloro", "bromo", "iodo",
  ...roots.flatMap((root) => [`${root}yl`, `${root}oxy`])];
const multipliers = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca"];
const simplePrefix = new RegExp(`^(\\d+(?:,\\d+)*)-((?:${multipliers.filter(Boolean).join("|")})?(?:${simpleNames.join("|")}))`);

function alphabeticalGroups(groups: readonly PrefixGroup[]) {
  return [...groups].sort((left, right) => left.sortName.localeCompare(right.sortName, "en"));
}

function numericLocants(groups: readonly PrefixGroup[]) {
  return groups.flatMap((group) => group.locants).sort((a, b) => a - b);
}

function alphabeticalLocants(groups: readonly PrefixGroup[]) {
  return alphabeticalGroups(groups).flatMap((group) => [...group.locants].sort((a, b) => a - b));
}

/** Choose orientation before rendering; alphabetical precedence only breaks a numeric tie. */
function numberPrefixes(groups: readonly PrefixGroup[], carbonCount: number) {
  const reversed = groups.map((group) => ({ ...group,
    locants: group.locants.map((locant) => carbonCount + 1 - locant) }));
  const comparison = compareLocantSets(numericLocants(groups), numericLocants(reversed))
    || compareLocantSets(alphabeticalLocants(groups), alphabeticalLocants(reversed));
  return comparison <= 0 ? groups : reversed;
}

/**
 * Current EN names cannot inherit a Spanish alphabetical numbering tie-break.
 * Reconsider the two orientations of the SAME saturated acyclic parent, using
 * its translated simple-prefix descriptors. Fully parse the supported grammar
 * before changing anything: suffix groups, unsaturation, rings, stereochemical
 * descriptors and complex substituents keep their existing naming paths.
 */
export function canonicalizeEnglishAcyclicPrefixes(value: string) {
  const parent = value.match(alkaneParent);
  if (!parent || parent.index === 0) return value;
  const carbonCount = roots.indexOf(parent[1]) + 1;
  let remaining = value.slice(0, parent.index);
  const groups: PrefixGroup[] = [];
  while (remaining) {
    const prefix = remaining.match(simplePrefix);
    if (!prefix) return value;
    const locants = prefix[1].split(",").map(Number);
    const name = prefix[2];
    const multiplier = multipliers[locants.length];
    if (locants.some((locant) => locant < 1 || locant > carbonCount)
      || multiplier === undefined || !simpleNames.includes(name.slice(multiplier.length))) return value;
    // The locant count identifies the multiplier; do not strip lexical root
    // fragments such as the "tri" in a single tridecyl substituent.
    groups.push({ name, sortName: name.slice(multiplier.length), locants });
    remaining = remaining.slice(prefix[0].length);
    if (remaining) {
      if (!remaining.startsWith("-")) return value;
      remaining = remaining.slice(1);
      if (!remaining) return value;
    }
  }
  const numbered = numberPrefixes(groups, carbonCount);
  return `${alphabeticalGroups(numbered).map(({ name, locants }) =>
    `${[...locants].sort((a, b) => a - b).join(",")}-${name}`).join("-")}${parent[0]}`;
}
