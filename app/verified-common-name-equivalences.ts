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
