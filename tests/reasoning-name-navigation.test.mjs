import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildReasoningNameLinkParts,
} from "../app/reasoning-name-links.ts";
import {
  activateReasoningReference,
  cancelReasoningHover,
  scheduleReasoningHover,
  scrollToReasoningStep,
} from "../app/reasoning-name-navigation.ts";

const fragment = (text) => ({ text, label: text, kind: "parent" });
const links = (name, fragments) => buildReasoningNameLinkParts(
  name, Object.fromEntries(Object.entries(fragments).map(([step, text]) => [step, fragment(text)])),
  ["01", "02", "03", "04"].map((number) => ({ number })),
);
const linked = (parts) => parts.filter((part) => part.stepNumber).map(({ text, stepNumber, relatedStepNumbers }) => [text, stepNumber, relatedStepNumbers]);

test("the visible name maps to its existing explanation without changing characters", () => {
  const cases = [
    ["propan-2-ona", { "01": "2-ona", "02": "propan", "03": "2" }, [["propan", "02", []], ["2-ona", "01", ["03"]]]],
    ["propanona", { "01": "ona", "02": "propan" }, [["propan", "02", []], ["ona", "01", []]]],
    ["propan-2-one", { "01": "2-one", "02": "propan", "03": "2" }, [["propan", "02", []], ["2-one", "01", ["03"]]]],
    ["propanone", { "01": "one", "02": "propan" }, [["propan", "02", []], ["one", "01", []]]],
    ["butan-2-ol", { "01": "2-ol", "02": "butan", "03": "2" }, [["butan", "02", []], ["2-ol", "01", ["03"]]]],
    ["2,3-dimetilbutano", { "02": "butano", "03": "2,3", "04": "2,3-dimetil" }, [["2,3-dimetil", "04", ["03"]], ["butano", "02", []]]],
    ["pent-2-ino", { "02": "pent", "03": "2-ino" }, [["pent", "02", []], ["2-ino", "03", []]]],
    ["butanal", { "01": "al", "02": "butan" }, [["butan", "02", []], ["al", "01", []]]],
    ["nitrobenceno", { "02": "benceno", "04": "nitro" }, [["nitro", "04", []], ["benceno", "02", []]]],
    ["2-metil-1,3,5-trinitrobenceno", { "02": "benceno", "04": "2-metil-1,3,5-trinitro" }, [["2-metil-1,3,5-trinitro", "04", []], ["benceno", "02", []]]],
  ];
  for (const [name, fragments, expected] of cases) {
    const parts = links(name, fragments);
    assert.equal(parts.map((part) => part.text).join(""), name);
    assert.deepEqual(linked(parts), expected, name);
  }
});

test("partial, ambiguous and absent fragments remain plain text", () => {
  assert.deepEqual(linked(links("3-metilhexano", { "02": "hexano" })), [["hexano", "02", []]]);
  assert.deepEqual(linked(links("2,2-dimetilbutano", { "03": "2" })), []);
  assert.deepEqual(links("nombre incierto", {}), [{ text: "nombre incierto" }]);
  assert.deepEqual(linked(links("butanal", { "02": "propan", "04": "butan" })), [["butan", "04", []]]);
});

test("hover navigates once after 400 ms; leaving cancels; click or tap can navigate immediately", async () => {
  const timer = { current: null };
  const events = [];
  scheduleReasoningHover(timer, "02", (step) => events.push(`preview:${step}`), (step) => events.push(`navigate:${step}`));
  assert.deepEqual(events, ["preview:02"]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  cancelReasoningHover(timer);
  await new Promise((resolve) => setTimeout(resolve, 240));
  assert.deepEqual(events, ["preview:02"]);
  scheduleReasoningHover(timer, "01", (step) => events.push(`preview:${step}`), (step) => events.push(`navigate:${step}`));
  await new Promise((resolve) => setTimeout(resolve, 430));
  assert.deepEqual(events, ["preview:02", "preview:01", "navigate:01"]);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(events.filter((event) => event === "navigate:01").length, 1);
  scheduleReasoningHover(timer, "04", () => {}, (step) => events.push(`late:${step}`));
  activateReasoningReference(timer, "03", (step) => events.push(`navigate:${step}`));
  assert.equal(events.at(-1), "navigate:03");
  await new Promise((resolve) => setTimeout(resolve, 420));
  assert.ok(!events.includes("late:04"));
});

test("scroll targets the exact step and honors reduced motion", () => {
  const calls = [];
  const target = { scrollIntoView: (options) => calls.push(options) };
  const doc = { getElementById: (id) => id === "iupac-reasoning-step-04" ? target : null };
  assert.equal(scrollToReasoningStep("04", doc, { matchMedia: () => ({ matches: false }) }), true);
  assert.deepEqual(calls.pop(), { behavior: "smooth", block: "center" });
  assert.equal(scrollToReasoningStep("04", doc, { matchMedia: () => ({ matches: true }) }), true);
  assert.deepEqual(calls.pop(), { behavior: "instant", block: "center" });
  assert.equal(scrollToReasoningStep("03", doc, { matchMedia: () => ({ matches: false }) }), false);
});
