import assert from "node:assert/strict";
import test from "node:test";

import { legacyProfileDisplayName } from "../app/legacy-profile-display.ts";

test("TNT Legacy ES can equal the valid Suggested name confirmed by the English Legacy engine", () => {
  const resolved = legacyProfileDisplayName({
    language: "es",
    suggestedName: "2-metil-1,3,5-trinitrobenceno",
    spanish1979Name: "-",
    english1979Name: "2-methyl-1,3,5-trinitrobenzene",
  });
  assert.deepEqual(resolved, { name: "2-metil-1,3,5-trinitrobenceno", available: true });
});

test("supported locale-specific Legacy outputs are preserved", () => {
  assert.deepEqual(legacyProfileDisplayName({
    language: "es",
    suggestedName: "propan-2-ona",
    spanish1979Name: "propanona",
    english1979Name: "propanone",
  }), { name: "propanona", available: true });
  assert.deepEqual(legacyProfileDisplayName({
    language: "en",
    suggestedName: "propan-2-one",
    spanish1979Name: "propanona",
    english1979Name: "propanone",
  }), { name: "propanone", available: true });
});

test("unsupported Legacy profiles show a localized explanation instead of a dash", () => {
  assert.deepEqual(legacyProfileDisplayName({
    language: "es",
    suggestedName: "unknown",
    spanish1979Name: "-",
    english1979Name: "-",
  }), { name: "No disponible para esta estructura", available: false });
  assert.deepEqual(legacyProfileDisplayName({
    language: "en",
    suggestedName: "unknown",
    spanish1979Name: "-",
    english1979Name: "-",
  }), { name: "Not available for this structure", available: false });
});
