// Coverage is a union of recorded feature annotations, never a separate list
// of molecules or a second chemical domain. Counts overlap by design.
export const coverageFeatures = Object.freeze({
  branching: ["branching", "acid-branching", "branched-alcohol-component"],
  "multiple-substituents": ["multiple-substituents", "repeated-substituents", "geminal"],
  halogens: ["halogen-F", "halogen-Cl", "halogen-Br", "halogen-I"],
  rings: ["simple-carbocycle", "simple-ring", "aromatic"],
  aromatics: ["aromatic"],
  "multiple-bonds": ["alkene", "alkyne", "multiple-bond"],
  "numbering-ties": ["numbering-tie", "alphabetical-tie", "tie-break", "symmetry"],
  "attachment-sensitive": ["attachment-sensitive", "terminal-attachment", "secondary-attachment", "branched-alcohol-component"],
  "regression-neighbors": ["regression-neighbor", "historical-neighbor", "smaller-neighbor", "larger-neighbor"],
});

export function coverageSummary(records) {
  return Object.fromEntries(Object.entries(coverageFeatures).map(([label, aliases]) => {
    const ids = records.filter((record) => aliases.some((alias) => record.features.includes(alias))).map((record) => record.id);
    return [label, { count: ids.length, ids }];
  }));
}
