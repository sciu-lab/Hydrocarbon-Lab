import type { AppLanguage } from "./i18n.ts";

// Canonical editor SMILES for the exact curated graphs. These labels remain
// available when an external service is down, without relying on a formula,
// user-entered name, or a Wikipedia title.
const LOCAL_COMMON_NAMES: Record<string, Record<AppLanguage, string>> = {
  "Cc(c([N+]([O-])=O)cc([N+]([O-])=O)c1)c1[N+]([O-])=O": {
    es: "TNT · 2,4,6-trinitrotolueno",
    en: "TNT · 2,4,6-trinitrotoluene",
  },
  "OCC(CO)O": { es: "glicerol", en: "glycerol" },
};

export function curatedCommonNameForSmiles(smiles: string | undefined, language: AppLanguage) {
  return smiles ? LOCAL_COMMON_NAMES[smiles]?.[language] ?? null : null;
}
