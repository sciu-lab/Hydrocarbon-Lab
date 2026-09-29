import assert from "node:assert/strict";
import test from "node:test";
import { matchesHydrocarbonReferenceName, normalizeReferenceNameTypography } from "../app/practice-reference-answer.ts";

for (const [label, answer, reference, locale] of [
  ["exact", "hexano", "hexano", "es"],
  ["case", "HEXANO", "hexano", "es"],
  ["trim", "  hexano\n", "hexano", "es"],
  ["repeated spaces", "propanoato   de   etilo", "propanoato de etilo", "es"],
  ["Unicode spaces", "ethyl\u00a0propanoate", "ethyl propanoate", "en"],
  ["hyphen spaces", "propan - 2 - ol", "propan-2-ol", "es"],
  ["Unicode hyphen", "propan\u20112\u2011ol", "propan-2-ol", "es"],
  ["dash variants", "propan\u20132\u2212ol", "propan-2-ol", "es"],
  ["commas", "2 , 3 - dimetilhexano", "2,3-dimetilhexano", "es"],
  ["Unicode NFC", "a\u0301cido etanoico", "ácido etanoico", "es"],
  ["stereo typography", "(2e) - but - 2 - eno", "(2E)-but-2-eno", "es"],
]) {
  test(`reference answer tolerates only safe typography: ${label}`, () => {
    assert.equal(matchesHydrocarbonReferenceName(answer, reference, locale), true);
    assert.equal(normalizeReferenceNameTypography(normalizeReferenceNameTypography(answer, locale), locale), normalizeReferenceNameTypography(answer, locale));
  });
}

for (const [label, answer, reference, locale] of [
  ["wrong locant", "propan-1-ol", "propan-2-ol", "es"],
  ["wrong number", "2,4-dimetilhexano", "2,3-dimetilhexano", "es"],
  ["wrong substituent", "2-etilhexano", "2-metilhexano", "es"],
  ["wrong suffix", "hexeno", "hexano", "es"],
  ["wrong E/Z", "(2Z)-but-2-eno", "(2E)-but-2-eno", "es"],
  ["missing stereo", "but-2-eno", "(2E)-but-2-eno", "es"],
  ["prefix order", "2-metil-6-yododecano", "6-yodo-2-metildecano", "es"],
  ["synonym", "isopropanol", "propan-2-ol", "es"],
  ["different nomenclature convention", "2-propanol", "propan-2-ol", "es"],
  ["wrong locale", "ethyl propanoate", "propanoato de etilo", "en"],
  ["missing required space", "ethylpropanoate", "ethyl propanoate", "en"],
  ["different Spanish acid chain length", "ácido butanoico", "ácido propanoico", "es"],
  ["missing chemical word", "propanoico", "ácido propanoico", "es"],
  ["different chemical suffix", "ácido propanoato", "ácido propanoico", "es"],
  ["accent omission stays distinct in English", "acido propanoico", "ácido propanoico", "en"],
  ["ñ stays distinct from n", "ano", "año", "es"],
  ["ü stays distinct from u", "u", "ü", "es"],
  ["numeric compatibility character", "propan-②-ol", "propan-2-ol", "es"],
  ["blank", " \n ", "hexano", "es"],
]) {
  test(`reference answer preserves chemical/language distinctions: ${label}`, () => {
    assert.equal(matchesHydrocarbonReferenceName(answer, reference, locale), false);
  });
}

for (const [label, answer] of [
  ["lowercase", "acido propanoico"],
  ["accented lowercase", "ácido propanoico"],
  ["uppercase accented", "ÁCIDO PROPANOICO"],
  ["uppercase unaccented", "ACIDO PROPANOICO"],
]) {
  test(`Spanish permits accented and unaccented vowels: ${label}`, () => {
    assert.equal(matchesHydrocarbonReferenceName(answer, "ácido propanoico", "es"), true);
  });
}

test("Spanish folds only acute vowels, including uppercase, and a second real reference name", () => {
  assert.equal(normalizeReferenceNameTypography("ÁÉÍÓÚ", "es"), "aeiou");
  assert.equal(normalizeReferenceNameTypography("AEIOU", "es"), "aeiou");
  assert.equal(normalizeReferenceNameTypography("Ñ Ü", "es"), "ñ ü");
  assert.equal(matchesHydrocarbonReferenceName("acido octanoico", "ácido octanoico", "es"), true);
});
