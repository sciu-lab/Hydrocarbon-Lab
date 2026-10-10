export type ViewMode = "skeletal" | "semi-developed" | "condensed";
export type CurrentV1ViewMode = Exclude<ViewMode, "condensed">;

/** V1 persisted "condensed" as the Semi-developed representation. */
export type PersistedViewModeV1 = "skeletal" | "condensed";

/** Existing unversioned API clients also sent the internal Semi-developed ID. */
export type VersionlessApiViewModeV1Input = PersistedViewModeV1 | "semi-developed";

/** V2 stores all three editor modes without overloading the legacy V1 value. */
export type PersistedViewModeV2 = "skeletal" | "semi-developed" | "condensed";

export type ViewModeV2DecodeResult =
  | { ok: true; viewMode: ViewMode }
  | { ok: false; reason: "invalid-view-mode"; value: unknown };

/** Decode the strict V1 wire vocabulary into the current two-mode editor. */
export function decodeViewModeV1(value: unknown): CurrentV1ViewMode | null {
  if (value === "skeletal") return "skeletal";
  if (value === "condensed") return "semi-developed";
  return null;
}

/** Compatibility adapter for the versionless history/saved API request shape. */
export function decodeViewModeV1ApiInput(value: unknown): CurrentV1ViewMode | null {
  if (value === "semi-developed") return "semi-developed";
  return decodeViewModeV1(value);
}

/** Encode the current editor mode using the unchanged V1 wire format. */
export function encodeViewModeV1(viewMode: CurrentV1ViewMode): PersistedViewModeV1 {
  return viewMode === "semi-developed" ? "condensed" : "skeletal";
}

export function encodeViewModeV2(viewMode: ViewMode): PersistedViewModeV2 {
  return viewMode;
}

/** Decode a V2 mode only when the record explicitly carries version 2. */
export function decodeViewModeV2(value: unknown): ViewModeV2DecodeResult {
  if (value === "skeletal" || value === "semi-developed" || value === "condensed") {
    return { ok: true, viewMode: value };
  }
  return { ok: false, reason: "invalid-view-mode", value };
}

/** Encode the semantic display identity used by existing history fingerprints. */
export function viewModeFingerprintKey(viewMode: ViewMode) {
  if (viewMode === "semi-developed") return "condensed";
  if (viewMode === "condensed") return "view-v2:condensed";
  return "skeletal";
}

/** Decode a versioned record; never infer the meaning from its string alone. */
export function decodeVersionedViewMode(
  value: unknown,
  version: 1 | 2,
): ViewMode | null {
  if (version === 1) return decodeViewModeV1(value);
  const result = decodeViewModeV2(value);
  return result.ok ? result.viewMode : null;
}

/** Unversioned API writes retain V1 meaning; explicit V2 uses V2 vocabulary. */
export function decodeApiViewMode(value: unknown, version: unknown): ViewMode | null {
  if (version === undefined) return value === undefined ? "semi-developed" : decodeViewModeV1ApiInput(value);
  if (version === 1) return value === undefined ? "semi-developed" : decodeViewModeV1(value);
  if (version === 2) {
    const result = decodeViewModeV2(value);
    return result.ok ? result.viewMode : null;
  }
  return null;
}
