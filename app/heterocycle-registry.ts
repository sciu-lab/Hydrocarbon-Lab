/**
 * The supported monocyclic heterocycles have one structural source of truth.
 *
 * Both the name resolver and the Rings palette consume these definitions. The
 * SMILES are deliberately kept here (rather than duplicated as drawing
 * coordinates) because `moleculeFromSmiles()` is the common bridge into the
 * editable molecular graph used throughout the application.
 */
export type HeterocycleDefinition = {
  id: string;
  /** Localized UI names are explicit so parser vocabulary never reaches UI. */
  name: { es: string; en: string };
  formula: string;
  detail: { es: string; en: string };
  size: number;
  kind: "cycloalkane" | "aromatic";
  smiles: string;
  /** Accepted normalized names for the integrated name-resolver fallback. */
  nameAliases: readonly string[];
};

export const HETEROCYCLE_DEFINITIONS: readonly HeterocycleDefinition[] = [
  {
    id: "pyrrole",
    name: { es: "Pirrol", en: "Pyrrole" },
    formula: "C₄H₅N",
    detail: { es: "anillo aromático de 5 miembros", en: "five-membered aromatic ring" },
    size: 5,
    kind: "aromatic",
    smiles: "c1cc[nH]c1",
    nameAliases: ["pyrrole", "pirrol"],
  },
  {
    id: "furan",
    name: { es: "Furano", en: "Furan" },
    formula: "C₄H₄O",
    detail: { es: "anillo aromático de 5 miembros", en: "five-membered aromatic ring" },
    size: 5,
    kind: "aromatic",
    smiles: "o1cccc1",
    nameAliases: ["furan", "furano"],
  },
  {
    id: "thiophene",
    name: { es: "Tiofeno", en: "Thiophene" },
    formula: "C₄H₄S",
    detail: { es: "anillo aromático de 5 miembros", en: "five-membered aromatic ring" },
    size: 5,
    kind: "aromatic",
    smiles: "s1cccc1",
    nameAliases: ["thiophene", "tiofeno"],
  },
  {
    id: "pyridine",
    name: { es: "Piridina", en: "Pyridine" },
    formula: "C₅H₅N",
    detail: { es: "anillo aromático de 6 miembros", en: "six-membered aromatic ring" },
    size: 6,
    kind: "aromatic",
    smiles: "n1ccccc1",
    nameAliases: ["pyridine", "piridina"],
  },
  {
    id: "oxirane",
    name: { es: "Oxirano", en: "Oxirane" },
    formula: "C₂H₄O",
    detail: { es: "anillo saturado de 3 miembros", en: "three-membered saturated ring" },
    size: 3,
    kind: "cycloalkane",
    smiles: "O1CC1",
    nameAliases: ["oxirane", "oxirano"],
  },
  {
    id: "aziridine",
    name: { es: "Aziridina", en: "Aziridine" },
    formula: "C₂H₅N",
    detail: { es: "anillo saturado de 3 miembros", en: "three-membered saturated ring" },
    size: 3,
    kind: "cycloalkane",
    smiles: "N1CC1",
    nameAliases: ["aziridine", "aziridina"],
  },
  {
    id: "oxetane",
    name: { es: "Oxetano", en: "Oxetane" },
    formula: "C₃H₆O",
    detail: { es: "anillo saturado de 4 miembros", en: "four-membered saturated ring" },
    size: 4,
    kind: "cycloalkane",
    smiles: "O1CCC1",
    nameAliases: ["oxetane", "oxetano"],
  },
  {
    id: "azetidine",
    name: { es: "Azetidina", en: "Azetidine" },
    formula: "C₃H₇N",
    detail: { es: "anillo saturado de 4 miembros", en: "four-membered saturated ring" },
    size: 4,
    kind: "cycloalkane",
    smiles: "N1CCC1",
    nameAliases: ["azetidine", "azetidina"],
  },
  {
    id: "pyrrolidine",
    name: { es: "Pirrolidina", en: "Pyrrolidine" },
    formula: "C₄H₉N",
    detail: { es: "anillo saturado de 5 miembros", en: "five-membered saturated ring" },
    size: 5,
    kind: "cycloalkane",
    smiles: "N1CCCC1",
    nameAliases: ["pyrrolidine", "pirrolidina"],
  },
  {
    id: "tetrahydrofuran",
    name: { es: "Tetrahidrofurano", en: "Tetrahydrofuran" },
    formula: "C₄H₈O",
    detail: { es: "anillo saturado de 5 miembros", en: "five-membered saturated ring" },
    size: 5,
    kind: "cycloalkane",
    smiles: "O1CCCC1",
    nameAliases: ["tetrahydrofuran", "tetrahidrofurano"],
  },
  {
    id: "dioxolane",
    name: { es: "1,3-Dioxolano", en: "1,3-Dioxolane" },
    formula: "C₃H₆O₂",
    detail: { es: "anillo saturado con dos oxígenos", en: "saturated ring with two oxygens" },
    size: 5,
    kind: "cycloalkane",
    smiles: "O1COCC1",
    nameAliases: ["1,3-dioxolane", "1,3-dioxolano"],
  },
  {
    id: "piperidine",
    name: { es: "Piperidina", en: "Piperidine" },
    formula: "C₅H₁₁N",
    detail: { es: "anillo saturado de 6 miembros", en: "six-membered saturated ring" },
    size: 6,
    kind: "cycloalkane",
    smiles: "N1CCCCC1",
    nameAliases: ["piperidine", "piperidina"],
  },
  {
    id: "tetrahydropyran",
    name: { es: "Tetrahidropirano", en: "Tetrahydropyran" },
    formula: "C₅H₁₀O",
    detail: { es: "anillo saturado de 6 miembros", en: "six-membered saturated ring" },
    size: 6,
    kind: "cycloalkane",
    smiles: "O1CCCCC1",
    nameAliases: ["tetrahydropyran", "tetrahidropirano", "tetrahidropiran"],
  },
  {
    id: "morpholine",
    name: { es: "Morfolina", en: "Morpholine" },
    formula: "C₄H₉NO",
    detail: { es: "anillo saturado con oxígeno y nitrógeno", en: "saturated ring with oxygen and nitrogen" },
    size: 6,
    kind: "cycloalkane",
    smiles: "O1CCNCC1",
    nameAliases: ["morpholine", "morfolina"],
  },
  {
    id: "dioxane",
    name: { es: "1,4-Dioxano", en: "1,4-Dioxane" },
    formula: "C₄H₈O₂",
    detail: { es: "anillo saturado con dos oxígenos", en: "saturated ring with two oxygens" },
    size: 6,
    kind: "cycloalkane",
    smiles: "O1CCOCC1",
    nameAliases: ["1,4-dioxane", "1,4-dioxano"],
  },
];

const byName = new Map(
  HETEROCYCLE_DEFINITIONS.flatMap((definition) =>
    definition.nameAliases.map((name) => [name.toLocaleLowerCase("en"), definition] as const),
  ),
);

/** Returns a curated integrated fallback only for a supported base heterocycle. */
export function getHeterocycleDefinitionForName(name: string) {
  return byName.get(name.trim().toLocaleLowerCase("en"));
}
