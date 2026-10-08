export type ViewMode = "skeletal" | "semi-developed";

/** The V1 portable and persistence formats predate the internal rename. */
export type LegacyPersistedViewMode = "skeletal" | "condensed";

/** Normalize saved and imported view identifiers before they reach the editor. */
export function normalizeViewMode(value: unknown): ViewMode | null {
  if (value === "skeletal") return "skeletal";
  if (value === "semi-developed" || value === "condensed") return "semi-developed";
  return null;
}

/** Keep the existing V1/local/cloud wire format stable during the internal rename. */
export function serializeLegacyViewMode(value: ViewMode): LegacyPersistedViewMode {
  return value === "semi-developed" ? "condensed" : "skeletal";
}
