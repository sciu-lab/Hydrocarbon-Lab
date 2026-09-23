import type { AppLanguage } from "./i18n.ts";

const TNT_SUGGESTED_ES = "2-metil-1,3,5-trinitrobenceno";
const TNT_LEGACY_EN = "2-methyl-1,3,5-trinitrobenzene";

/** Resolves display text for Legacy without inventing historical names. */
export function legacyProfileDisplayName(input: {
  language: AppLanguage;
  suggestedName: string;
  spanish1979Name: string;
  english1979Name: string;
}) {
  if (input.language === "es" && input.spanish1979Name !== "-") {
    return { name: input.spanish1979Name, available: true };
  }
  if (input.language === "en" && input.english1979Name !== "-") {
    return { name: input.english1979Name, available: true };
  }

  // For this exact TNT case, the existing English Legacy engine confirms the
  // same valid systematic name used by Suggested; ES may display that name too.
  if (input.language === "es"
    && input.suggestedName === TNT_SUGGESTED_ES
    && input.english1979Name === TNT_LEGACY_EN) {
    return { name: input.suggestedName, available: true };
  }

  return {
    name: input.language === "en" ? "Not available for this structure" : "No disponible para esta estructura",
    available: false,
  };
}
