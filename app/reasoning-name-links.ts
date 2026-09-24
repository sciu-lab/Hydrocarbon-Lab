import type { ReasoningNameFragment } from "./reasoning-name-fragments.ts";

export type ReasoningNameLinkPart = {
  text: string;
  stepNumber?: string;
  relatedStepNumbers?: string[];
};

/** Turn 04C's literal fragments into nonoverlapping links without changing the name. */
export function buildReasoningNameLinkParts(
  name: string,
  fragments: Readonly<Record<string, ReasoningNameFragment>>,
  steps: readonly { number: string }[],
): ReasoningNameLinkPart[] {
  const available = new Set(steps.map((step) => step.number));
  const candidates = Object.entries(fragments).flatMap(([stepNumber, fragment]) => {
    const start = name.indexOf(fragment.text);
    return available.has(stepNumber) && fragment.text && start >= 0
      && name.lastIndexOf(fragment.text) === start
      ? [{ stepNumber, start, end: start + fragment.text.length, text: fragment.text }]
      : [];
  });
  // The longer literal wins; step number settles an exact tie.
  candidates.sort((a, b) => b.text.length - a.text.length || a.stepNumber.localeCompare(b.stepNumber));
  const chosen: typeof candidates = [];
  for (const candidate of candidates) {
    if (chosen.some((item) => candidate.start < item.end && candidate.end > item.start)) continue;
    chosen.push(candidate);
  }
  chosen.sort((a, b) => a.start - b.start);
  const parts: ReasoningNameLinkPart[] = [];
  let cursor = 0;
  for (const item of chosen) {
    if (item.start > cursor) parts.push({ text: name.slice(cursor, item.start) });
    const relatedStepNumbers = candidates
      .filter((candidate) => candidate !== item && candidate.start >= item.start && candidate.end <= item.end)
      .map((candidate) => candidate.stepNumber);
    parts.push({ text: item.text, stepNumber: item.stepNumber, relatedStepNumbers });
    cursor = item.end;
  }
  if (cursor < name.length) parts.push({ text: name.slice(cursor) });
  return parts.length ? parts : [{ text: name }];
}
