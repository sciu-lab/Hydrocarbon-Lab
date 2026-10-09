export type ViewMode = "skeletal" | "semi-developed";

/** V1 persisted "condensed" as the Semi-developed representation. */
export type PersistedViewModeV1 = "skeletal" | "condensed";

/** Existing unversioned API clients also sent the internal Semi-developed ID. */
export type VersionlessApiViewModeV1Input = PersistedViewModeV1 | "semi-developed";

/** V2 reserves "condensed" for the future, distinct renderer. */
export type PersistedViewModeV2 = "skeletal" | "semi-developed" | "condensed";

export type ViewModeV2DecodeResult =
  | { ok: true; viewMode: ViewMode }
  | { ok: false; reason: "unsupported-view-mode"; value: "condensed" }
  | { ok: false; reason: "invalid-view-mode"; value: unknown };

/** Decode the strict V1 wire vocabulary into the current two-mode editor. */
export function decodeViewModeV1(value: unknown): ViewMode | null {
  if (value === "skeletal") return "skeletal";
  if (value === "condensed") return "semi-developed";
  return null;
}

/** Compatibility adapter for the versionless history/saved API request shape. */
export function decodeViewModeV1ApiInput(value: unknown): ViewMode | null {
  if (value === "semi-developed") return "semi-developed";
  return decodeViewModeV1(value);
}

/** Encode the current editor mode using the unchanged V1 wire format. */
export function encodeViewModeV1(viewMode: ViewMode): PersistedViewModeV1 {
  return viewMode === "semi-developed" ? "condensed" : "skeletal";
}

/**
 * Decode V2 vocabulary without assigning V2's "condensed" meaning to the
 * current editor. The value is recognized, then rejected as unsupported.
 */
export function decodeViewModeV2(value: unknown): ViewModeV2DecodeResult {
  if (value === "skeletal" || value === "semi-developed") {
    return { ok: true, viewMode: value };
  }
  if (value === "condensed") {
    return { ok: false, reason: "unsupported-view-mode", value };
  }
  return { ok: false, reason: "invalid-view-mode", value };
}
