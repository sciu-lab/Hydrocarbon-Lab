import assert from "node:assert/strict";
import test from "node:test";
import { matchesHydrocarbonReferenceName, normalizeReferenceNameTypography } from "../app/practice-reference-answer.ts";

for (const [label, answer, reference] of [
  ["exact", "hexano", "hexano"],
  ["case", "HEXANO", "hexano"],
  ["trim", "  hexano\n", "hexano"],
  ["repeated spaces", "propanoato   de   etilo", "propanoato de etilo"],
  ["Unicode spaces", "ethyl\u00a0propanoate", "ethyl propanoate"],
  ["hyphen spaces", "propan - 2 - ol", "propan-2-ol"],
  ["Unicode hyphen", "propan\u20112\u2011ol", "propan-2-ol"],
  ["dash variants", "propan\u20132\u2212ol", "propan-2-ol"],
  ["commas", "2 , 3 - dimetilhexano", "2,3-dimetilhexano"],
  ["Unicode NFC", "a\u0301cido etanoico", "ácido etanoico"],
  ["stereo typography", "(2e) - but - 2 - eno", "(2E)-but-2-eno"],
]) {
  test(`reference answer tolerates only safe typography: ${label}`, () => {
    assert.equal(matchesHydrocarbonReferenceName(answer, reference), true);
    assert.equal(normalizeReferenceNameTypography(normalizeReferenceNameTypography(answer)), normalizeReferenceNameTypography(answer));
  });
}

for (const [label, answer, reference] of [
  ["wrong locant", "propan-1-ol", "propan-2-ol"],
  ["wrong number", "2,4-dimetilhexano", "2,3-dimetilhexano"],
  ["wrong substituent", "2-etilhexano", "2-metilhexano"],
  ["wrong suffix", "hexeno", "hexano"],
  ["wrong E/Z", "(2Z)-but-2-eno", "(2E)-but-2-eno"],
  ["missing stereo", "but-2-eno", "(2E)-but-2-eno"],
  ["prefix order", "2-metil-6-yododecano", "6-yodo-2-metildecano"],
  ["synonym", "isopropanol", "propan-2-ol"],
  ["different nomenclature convention", "2-propanol", "propan-2-ol"],
  ["wrong locale", "ethyl propanoate", "propanoato de etilo"],
  ["missing required space", "ethylpropanoate", "ethyl propanoate"],
  ["accent removal", "acido etanoico", "ácido etanoico"],
  ["numeric compatibility character", "propan-②-ol", "propan-2-ol"],
  ["blank", " \n ", "hexano"],
]) {
  test(`reference answer preserves chemical/language distinctions: ${label}`, () => {
    assert.equal(matchesHydrocarbonReferenceName(answer, reference), false);
  });
}
