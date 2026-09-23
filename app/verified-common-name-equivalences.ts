type VerifiedCommonNameEquivalence = {
  aliases: readonly string[];
  pubChemQuery: string;
  inchiKey: string;
};

// These are exact bilingual synonym sets pinned to a PubChem identity. They
// are deliberately not fuzzy translations: a fallback query is accepted only
// when PubChem returns the registered InChIKey.
const VERIFIED_COMMON_NAME_EQUIVALENCES: readonly VerifiedCommonNameEquivalence[] = [
  {
    aliases: ["alcohol isopropílico", "alcohol isopropilico", "isopropyl alcohol"],
    pubChemQuery: "isopropyl alcohol",
    inchiKey: "KFZMGEQAYNKOFK-UHFFFAOYSA-N",
  },
  {
    aliases: ["glicerina", "glicerol", "glycerin", "glycerol"],
    pubChemQuery: "glycerol",
    inchiKey: "PEDCQBHIVMGVHV-UHFFFAOYSA-N",
  },
  {
    aliases: ["testosterona", "testosterone"],
    pubChemQuery: "testosterone",
    inchiKey: "MUMGGOZAMZWBJJ-DYKIIFRCSA-N",
  },
  {
    aliases: ["colesterol", "cholesterol"],
    pubChemQuery: "cholesterol",
    inchiKey: "HVYWMOMLDIMFJA-DPAQBDIFSA-N",
  },
];

const VERIFIED_PUBCHEM_COMMON_NAMES = [
  {
    cid: 5793,
    inchiKey: "WQZGKKKJIJFFOK-GASJEMHNSA-N",
    names: { es: "D-glucosa", en: "D-Glucose" },
  },
] as const;

const VERIFIED_PUBCHEM_RECORD_EQUIVALENCES = [
  {
    cid: 5793,
    inchiKey: "WQZGKKKJIJFFOK-GASJEMHNSA-N",
    names: ["D-glucosa", "D-Glucose"],
  },
  {
    cid: 1140,
    inchiKey: "YXFVVABEGXRONW-UHFFFAOYSA-N",
    names: ["tolueno", "Toluene"],
  },
] as const;

function normalizeExactAlias(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

export function verifiedCommonNameQuery(value: string) {
  const normalized = normalizeExactAlias(value);
  const equivalence = VERIFIED_COMMON_NAME_EQUIVALENCES.find(({ aliases }) =>
    aliases.some((alias) => normalizeExactAlias(alias) === normalized),
  );
  return equivalence
    ? { query: equivalence.pubChemQuery, expectedInchiKey: equivalence.inchiKey }
    : null;
}

/** Exact biochemical display names; both CID and stereochemical InChIKey must match. */
export function verifiedPubChemCommonName(
  identity: { cid?: number; inchiKey?: string },
  language: "es" | "en",
) {
  const inchiKey = identity.inchiKey?.trim().toLocaleUpperCase("en");
  const match = VERIFIED_PUBCHEM_COMMON_NAMES.find((entry) =>
    identity.cid === entry.cid && inchiKey === entry.inchiKey,
  );
  return match?.names[language] ?? null;
}

/** Identifies bilingual aliases only for the exact known PubChem structure. */
export function verifiedPubChemRecordTitleEquivalent(
  identity: { cid?: number; inchiKey?: string },
  recordTitle: string | undefined,
  displayedName: string | null | undefined,
) {
  if (!recordTitle || !displayedName) return false;
  const inchiKey = identity.inchiKey?.trim().toLocaleUpperCase("en");
  if (!inchiKey) return false;
  return VERIFIED_PUBCHEM_RECORD_EQUIVALENCES.some((entry) =>
    identity.cid === entry.cid
    && inchiKey === entry.inchiKey
    && entry.names.some((name) => normalizeExactAlias(name) === normalizeExactAlias(recordTitle))
    && entry.names.some((name) => normalizeExactAlias(name) === normalizeExactAlias(displayedName)),
  );
}
