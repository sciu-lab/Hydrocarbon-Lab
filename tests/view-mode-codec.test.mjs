import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeViewModeV1,
  decodeViewModeV1ApiInput,
  decodeViewModeV2,
  encodeViewModeV1,
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

test("V2 recognizes its vocabulary but keeps future Condensed unsupported by this editor", () => {
  assert.deepEqual(decodeViewModeV2("skeletal"), { ok: true, viewMode: "skeletal" });
  assert.deepEqual(decodeViewModeV2("semi-developed"), { ok: true, viewMode: "semi-developed" });
  assert.deepEqual(decodeViewModeV2("condensed"), {
    ok: false,
    reason: "unsupported-view-mode",
    value: "condensed",
  });
  assert.deepEqual(decodeViewModeV2("future"), {
    ok: false,
    reason: "invalid-view-mode",
    value: "future",
  });

  assert.notEqual(decodeViewModeV1("condensed"), decodeViewModeV2("condensed").viewMode);
});
