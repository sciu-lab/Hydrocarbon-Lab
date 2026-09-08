export type MolecularFormulaElement = "C" | "H" | "N" | "O" | "F" | "Cl" | "Br" | "I";

export type MolecularFormulaAtoms = Partial<Record<MolecularFormulaElement, number>>;

export type FormulaIsomer = {
  id: string;
  nameEs: string;
  nameEn: string;
  smiles: string;
  familyEs: string;
  familyEn: string;
};

export type FormulaIsomerGeneration = {
  ok: true;
  formula: string;
  asciiFormula: string;
  atoms: MolecularFormulaAtoms;
  idh: number;
  isomers: FormulaIsomer[];
  complete: boolean;
  scope: "complete" | "representative" | "unsupported";
} | {
  ok: false;
  error: string;
};

const SUPPORTED_ELEMENTS = new Set<MolecularFormulaElement>([
  "C", "H", "N", "O", "F", "Cl", "Br", "I",
]);

const FORMULA_ORDER: MolecularFormulaElement[] = ["C", "H", "N", "O", "F", "Cl", "Br", "I"];
const SUBSCRIPT_TO_ASCII: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};
const ASCII_TO_SUBSCRIPT: Record<string, string> = Object.fromEntries(
  Object.entries(SUBSCRIPT_TO_ASCII).map(([subscript, digit]) => [digit, subscript]),
);

function iso(
  id: string,
  nameEs: string,
  nameEn: string,
  smiles: string,
  familyEs: string,
  familyEn: string,
): FormulaIsomer {
  return { id, nameEs, nameEn, smiles, familyEs, familyEn };
}

const ISOMER_CATALOG: Record<string, { complete: boolean; isomers: FormulaIsomer[] }> = {
  CH4: {
    complete: true,
    isomers: [iso("methane", "metano", "methane", "C", "Alcano", "Alkane")],
  },
  C2H6: {
    complete: true,
    isomers: [iso("ethane", "etano", "ethane", "CC", "Alcano", "Alkane")],
  },
  C3H8: {
    complete: true,
    isomers: [iso("propane", "propano", "propane", "CCC", "Alcano", "Alkane")],
  },
  C4H10: {
    complete: true,
    isomers: [
      iso("butane", "butano", "butane", "CCCC", "Alcano", "Alkane"),
      iso("2-methylpropane", "2-metilpropano", "2-methylpropane", "CC(C)C", "Alcano ramificado", "Branched alkane"),
    ],
  },
  C5H12: {
    complete: true,
    isomers: [
      iso("pentane", "pentano", "pentane", "CCCCC", "Alcano", "Alkane"),
      iso("2-methylbutane", "2-metilbutano", "2-methylbutane", "CC(C)CC", "Alcano ramificado", "Branched alkane"),
      iso("2-2-dimethylpropane", "2,2-dimetilpropano", "2,2-dimethylpropane", "CC(C)(C)C", "Alcano ramificado", "Branched alkane"),
    ],
  },
  C6H14: {
    complete: true,
    isomers: [
      iso("hexane", "hexano", "hexane", "CCCCCC", "Alcano", "Alkane"),
      iso("2-methylpentane", "2-metilpentano", "2-methylpentane", "CC(C)CCC", "Alcano ramificado", "Branched alkane"),
      iso("3-methylpentane", "3-metilpentano", "3-methylpentane", "CCC(C)CC", "Alcano ramificado", "Branched alkane"),
      iso("2-2-dimethylbutane", "2,2-dimetilbutano", "2,2-dimethylbutane", "CC(C)(C)CC", "Alcano ramificado", "Branched alkane"),
      iso("2-3-dimethylbutane", "2,3-dimetilbutano", "2,3-dimethylbutane", "CC(C)C(C)C", "Alcano ramificado", "Branched alkane"),
    ],
  },
  CH4O: {
    complete: true,
    isomers: [iso("methanol", "metanol", "methanol", "CO", "Alcohol", "Alcohol")],
  },
  C2H6O: {
    complete: true,
    isomers: [
      iso("ethanol", "etanol", "ethanol", "CCO", "Alcohol", "Alcohol"),
      iso("dimethyl-ether", "metoximetano", "methoxymethane", "COC", "Éter", "Ether"),
    ],
  },
  C3H8O: {
    complete: true,
    isomers: [
      iso("propan-1-ol", "propan-1-ol", "propan-1-ol", "CCCO", "Alcohol", "Alcohol"),
      iso("propan-2-ol", "propan-2-ol", "propan-2-ol", "CC(O)C", "Alcohol", "Alcohol"),
      iso("methoxyethane", "metoxietano", "methoxyethane", "COCC", "Éter", "Ether"),
    ],
  },
  C4H10O: {
    complete: true,
    isomers: [
      iso("butan-1-ol", "butan-1-ol", "butan-1-ol", "CCCCO", "Alcohol", "Alcohol"),
      iso("butan-2-ol", "butan-2-ol", "butan-2-ol", "CCC(O)C", "Alcohol", "Alcohol"),
      iso("2-methylpropan-1-ol", "2-metilpropan-1-ol", "2-methylpropan-1-ol", "CC(C)CO", "Alcohol", "Alcohol"),
      iso("2-methylpropan-2-ol", "2-metilpropan-2-ol", "2-methylpropan-2-ol", "CC(C)(C)O", "Alcohol", "Alcohol"),
      iso("ethoxyethane", "etoxietano", "ethoxyethane", "CCOCC", "Éter", "Ether"),
      iso("1-methoxypropane", "1-metoxipropano", "1-methoxypropane", "COCCC", "Éter", "Ether"),
      iso("2-methoxypropane", "2-metoxipropano", "2-methoxypropane", "COC(C)C", "Éter", "Ether"),
    ],
  },
  C2H7N: {
    complete: true,
    isomers: [
      iso("ethanamine", "etanamina", "ethanamine", "CCN", "Amina primaria", "Primary amine"),
      iso("dimethylamine", "dimetilamina", "dimethylamine", "CNC", "Amina secundaria", "Secondary amine"),
    ],
  },
  C3H9N: {
    complete: true,
    isomers: [
      iso("propan-1-amine", "propan-1-amina", "propan-1-amine", "CCCN", "Amina primaria", "Primary amine"),
      iso("propan-2-amine", "propan-2-amina", "propan-2-amine", "CC(N)C", "Amina primaria", "Primary amine"),
      iso("n-methylethanamine", "N-metiletanamina", "N-methylethanamine", "CCNC", "Amina secundaria", "Secondary amine"),
      iso("trimethylamine", "trimetilamina", "trimethylamine", "CN(C)C", "Amina terciaria", "Tertiary amine"),
    ],
  },
  C3H6O: {
    complete: false,
    isomers: [
      iso("propanal", "propanal", "propanal", "CCC=O", "Aldehído", "Aldehyde"),
      iso("propan-2-one", "propan-2-ona", "propan-2-one", "CC(=O)C", "Cetona", "Ketone"),
    ],
  },
  C5H10: {
    complete: false,
    isomers: [
      iso("pent-1-ene", "pent-1-eno", "pent-1-ene", "C=CCCC", "Alqueno", "Alkene"),
      iso("pent-2-ene", "pent-2-eno", "pent-2-ene", "CC=CCC", "Alqueno", "Alkene"),
      iso("2-methylbut-1-ene", "2-metilbut-1-eno", "2-methylbut-1-ene", "C=C(C)CC", "Alqueno ramificado", "Branched alkene"),
      iso("3-methylbut-1-ene", "3-metilbut-1-eno", "3-methylbut-1-ene", "C=CC(C)C", "Alqueno ramificado", "Branched alkene"),
      iso("cyclopentane", "ciclopentano", "cyclopentane", "C1CCCC1", "Cicloalcano", "Cycloalkane"),
      iso("methylcyclobutane", "metilciclobutano", "methylcyclobutane", "CC1CCC1", "Cicloalcano", "Cycloalkane"),
      iso("ethylcyclopropane", "etilciclopropano", "ethylcyclopropane", "CCC1CC1", "Cicloalcano", "Cycloalkane"),
    ],
  },
  C6H12O: {
    complete: false,
    isomers: [
      iso("hexanal", "hexanal", "hexanal", "CCCCCC=O", "Aldehído", "Aldehyde"),
      iso("2-methylpentanal", "2-metilpentanal", "2-methylpentanal", "O=CC(C)CCC", "Aldehído", "Aldehyde"),
      iso("3-methylpentanal", "3-metilpentanal", "3-methylpentanal", "O=CCC(C)CC", "Aldehído", "Aldehyde"),
      iso("4-methylpentanal", "4-metilpentanal", "4-methylpentanal", "O=CCCC(C)C", "Aldehído", "Aldehyde"),
      iso("2-ethylbutanal", "2-etilbutanal", "2-ethylbutanal", "O=CC(CC)CC", "Aldehído", "Aldehyde"),
      iso("2-2-dimethylbutanal", "2,2-dimetilbutanal", "2,2-dimethylbutanal", "O=CC(C)(C)CC", "Aldehído", "Aldehyde"),
      iso("2-3-dimethylbutanal", "2,3-dimetilbutanal", "2,3-dimethylbutanal", "O=CC(C)C(C)C", "Aldehído", "Aldehyde"),
      iso("3-3-dimethylbutanal", "3,3-dimetilbutanal", "3,3-dimethylbutanal", "O=CCC(C)(C)C", "Aldehído", "Aldehyde"),
      iso("hexan-2-one", "hexan-2-ona", "hexan-2-one", "CC(=O)CCCC", "Cetona", "Ketone"),
      iso("hexan-3-one", "hexan-3-ona", "hexan-3-one", "CCC(=O)CCC", "Cetona", "Ketone"),
      iso("3-methylpentan-2-one", "3-metilpentan-2-ona", "3-methylpentan-2-one", "CC(=O)C(C)CC", "Cetona", "Ketone"),
      iso("4-methylpentan-2-one", "4-metilpentan-2-ona", "4-methylpentan-2-one", "CC(=O)CC(C)C", "Cetona", "Ketone"),
      iso("2-methylpentan-3-one", "2-metilpentan-3-ona", "2-methylpentan-3-one", "CCC(=O)C(C)C", "Cetona", "Ketone"),
      iso("3-3-dimethylbutan-2-one", "3,3-dimetilbutan-2-ona", "3,3-dimethylbutan-2-one", "CC(=O)C(C)(C)C", "Cetona", "Ketone"),
      iso("cyclohexanol", "ciclohexanol", "cyclohexanol", "OC1CCCCC1", "Alcohol cíclico", "Cyclic alcohol"),
    ],
  },
};

const MONOHALOALKANE_CATALOGS = [
  { element: "F", prefixEs: "fluoro", prefixEn: "fluoro" },
  { element: "Cl", prefixEs: "cloro", prefixEn: "chloro" },
  { element: "Br", prefixEs: "bromo", prefixEn: "bromo" },
  { element: "I", prefixEs: "yodo", prefixEn: "iodo" },
] as const;

for (const halogen of MONOHALOALKANE_CATALOGS) {
  ISOMER_CATALOG[`CH3${halogen.element}`] = {
    complete: true,
    isomers: [
      iso(
        `${halogen.element}-methane`,
        `${halogen.prefixEs}metano`,
        `${halogen.prefixEn}methane`,
        `C${halogen.element}`,
        "Halogenuro de alquilo",
        "Haloalkane",
      ),
    ],
  };
  ISOMER_CATALOG[`C2H5${halogen.element}`] = {
    complete: true,
    isomers: [
      iso(
        `${halogen.element}-ethane`,
        `${halogen.prefixEs}etano`,
        `${halogen.prefixEn}ethane`,
        `CC${halogen.element}`,
        "Halogenuro de alquilo",
        "Haloalkane",
      ),
    ],
  };
  ISOMER_CATALOG[`C3H7${halogen.element}`] = {
    complete: true,
    isomers: [
      iso(
        `1-${halogen.element}-propane`,
        `1-${halogen.prefixEs}propano`,
        `1-${halogen.prefixEn}propane`,
        `CCC${halogen.element}`,
        "Halogenuro de alquilo",
        "Haloalkane",
      ),
      iso(
        `2-${halogen.element}-propane`,
        `2-${halogen.prefixEs}propano`,
        `2-${halogen.prefixEn}propane`,
        `CC(${halogen.element})C`,
        "Halogenuro de alquilo",
        "Haloalkane",
      ),
    ],
  };
  ISOMER_CATALOG[`C4H9${halogen.element}`] = {
    complete: true,
    isomers: [
      iso(`1-${halogen.element}-butane`, `1-${halogen.prefixEs}butano`, `1-${halogen.prefixEn}butane`, `CCCC${halogen.element}`, "Halogenuro de alquilo", "Haloalkane"),
      iso(`2-${halogen.element}-butane`, `2-${halogen.prefixEs}butano`, `2-${halogen.prefixEn}butane`, `CCC(${halogen.element})C`, "Halogenuro de alquilo", "Haloalkane"),
      iso(`1-${halogen.element}-2-methylpropane`, `1-${halogen.prefixEs}-2-metilpropano`, `1-${halogen.prefixEn}-2-methylpropane`, `CC(C)C${halogen.element}`, "Halogenuro de alquilo", "Haloalkane"),
      iso(`2-${halogen.element}-2-methylpropane`, `2-${halogen.prefixEs}-2-metilpropano`, `2-${halogen.prefixEn}-2-methylpropane`, `CC(C)(C)${halogen.element}`, "Halogenuro de alquilo", "Haloalkane"),
    ],
  };
}

function normalizeFormulaSource(input: string): string {
  return input
    .trim()
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (digit) => SUBSCRIPT_TO_ASCII[digit])
    .replace(/\s+/g, "")
    .replace(/cl/gi, "Cl")
    .replace(/br/gi, "Br")
    .replace(/[chonfi]/gi, (element) => element.toUpperCase());
}

function formatFormula(atoms: MolecularFormulaAtoms, unicode: boolean): string {
  return FORMULA_ORDER
    .filter((element) => (atoms[element] ?? 0) > 0)
    .map((element) => {
      const count = atoms[element] ?? 0;
      if (count === 1) return element;
      const countText = String(count);
      return `${element}${unicode
        ? [...countText].map((digit) => ASCII_TO_SUBSCRIPT[digit]).join("")
        : countText}`;
    })
    .join("");
}

export function parseMolecularFormula(input: string): {
  ok: true;
  atoms: MolecularFormulaAtoms;
  asciiFormula: string;
  formula: string;
} | {
  ok: false;
  error: string;
} {
  const source = normalizeFormulaSource(input);
  if (!source) return { ok: false, error: "Escribe una fórmula molecular. Ejemplo: C6H12O." };

  const atoms: MolecularFormulaAtoms = {};
  const matches = [...source.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (!matches.length || matches.map((match) => match[0]).join("") !== source) {
    return { ok: false, error: "La fórmula no tiene un formato válido. Usa, por ejemplo, C6H12O." };
  }

  for (const match of matches) {
    const element = match[1] as MolecularFormulaElement;
    if (!SUPPORTED_ELEMENTS.has(element)) {
      return { ok: false, error: `El elemento ${match[1]} todavía no está disponible en este constructor.` };
    }
    if (Object.hasOwn(atoms, element)) {
      return { ok: false, error: `El elemento ${element} aparece más de una vez en la fórmula.` };
    }
    const count = match[2] ? Number(match[2]) : 1;
    if (!Number.isSafeInteger(count) || count < 1) {
      return { ok: false, error: `La cantidad de ${element} debe ser un entero positivo.` };
    }
    atoms[element] = count;
  }

  if (!atoms.C) {
    return { ok: false, error: "Este constructor orgánico requiere al menos un átomo de carbono." };
  }

  return {
    ok: true,
    atoms,
    asciiFormula: formatFormula(atoms, false),
    formula: formatFormula(atoms, true),
  };
}

export function calculateDegreeOfUnsaturation(atoms: MolecularFormulaAtoms): number {
  const carbon = atoms.C ?? 0;
  const hydrogen = atoms.H ?? 0;
  const nitrogen = atoms.N ?? 0;
  const halogens = (atoms.F ?? 0) + (atoms.Cl ?? 0) + (atoms.Br ?? 0) + (atoms.I ?? 0);
  return (2 * carbon + 2 + nitrogen - hydrogen - halogens) / 2;
}

export function generateFormulaIsomers(input: string): FormulaIsomerGeneration {
  const parsed = parseMolecularFormula(input);
  if (!parsed.ok) return parsed;

  const idh = calculateDegreeOfUnsaturation(parsed.atoms);
  if (!Number.isFinite(idh) || idh < 0 || !Number.isInteger(idh)) {
    return {
      ok: false,
      error: "La fórmula produce un IDH imposible para una molécula orgánica neutra y cerrada.",
    };
  }

  const catalog = ISOMER_CATALOG[parsed.asciiFormula];
  if (!catalog) {
    return {
      ok: true,
      formula: parsed.formula,
      asciiFormula: parsed.asciiFormula,
      atoms: parsed.atoms,
      idh,
      isomers: [],
      complete: false,
      scope: "unsupported",
    };
  }

  return {
    ok: true,
    formula: parsed.formula,
    asciiFormula: parsed.asciiFormula,
    atoms: parsed.atoms,
    idh,
    isomers: catalog.isomers,
    complete: catalog.complete,
    scope: catalog.complete ? "complete" : "representative",
  };
}
