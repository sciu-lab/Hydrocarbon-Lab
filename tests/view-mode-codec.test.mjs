import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeViewModeV1,
  decodeViewModeV1ApiInput,
  decodeViewModeV2,
  encodeViewModeV1,
  encodeViewModeV2,
  decodeVersionedViewMode,
  decodeApiViewMode,
  viewModeFingerprintKey,
} from "../app/view-mode.ts";

test("V1 codec preserves the legacy meaning and round-trips both current modes", () => {
  assert.equal(decodeViewModeV1("skeletal"), "skeletal");
  assert.equal(decodeViewModeV1("condensed"), "semi-developed");
  assert.equal(encodeViewModeV1("skeletal"), "skeletal");
  assert.equal(encodeViewModeV1("semi-developed"), "condensed");

  for (const mode of ["skeletal", "semi-developed"]) {
    assert.equal(decodeViewModeV1(encodeViewModeV1(mode)), mode);
  }
});

test("V1 codec rejects V2-only and malformed values", () => {
  for (const value of ["semi-developed", "future", "", null, undefined, 1]) {
    assert.equal(decodeViewModeV1(value), null, String(value));
  }
});

test("versionless history/saved API keeps accepting its existing internal Semi-developed input", () => {
  assert.equal(decodeViewModeV1("semi-developed"), null);
  assert.equal(decodeViewModeV1ApiInput("semi-developed"), "semi-developed");
  assert.equal(decodeViewModeV1ApiInput("condensed"), "semi-developed");
  assert.equal(decodeViewModeV1ApiInput("invalid"), null);
});

test("V2 activates three distinct editor modes while V1 condensed remains legacy Semi-developed", () => {
  assert.deepEqual(decodeViewModeV2("skeletal"), { ok: true, viewMode: "skeletal" });
  assert.deepEqual(decodeViewModeV2("semi-developed"), { ok: true, viewMode: "semi-developed" });
  assert.deepEqual(decodeViewModeV2("condensed"), { ok: true, viewMode: "condensed" });
  assert.equal(encodeViewModeV2("condensed"), "condensed");
  assert.equal(decodeVersionedViewMode("condensed", 1), "semi-developed");
  assert.equal(decodeVersionedViewMode("condensed", 2), "condensed");
  assert.deepEqual(decodeViewModeV2("future"), {
    ok: false,
    reason: "invalid-view-mode",
    value: "future",
  });
});

test("API versioning and presentation fingerprints preserve semantic compatibility", () => {
  assert.equal(decodeApiViewMode("condensed", undefined), "semi-developed");
  assert.equal(decodeApiViewMode("condensed", 1), "semi-developed");
  assert.equal(decodeApiViewMode("condensed", 2), "condensed");
  assert.equal(decodeApiViewMode("semi-developed", 2), "semi-developed");
  assert.equal(decodeApiViewMode("condensed", 3), null);
  assert.equal(viewModeFingerprintKey("semi-developed"), "condensed");
  assert.equal(viewModeFingerprintKey("condensed"), "view-v2:condensed");
  assert.notEqual(viewModeFingerprintKey("semi-developed"), viewModeFingerprintKey("condensed"));
});
