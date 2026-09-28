import type { ReasoningNameFragment } from "./reasoning-name-fragments.ts";
import type { FunctionalContribution } from "./reasoning-functional-groups.ts";

export type ReasoningNameLinkPart = {
  text: string;
  stepNumber?: string;
  relatedStepNumbers?: string[];
  contributions?: FunctionalContribution[];
  atomIds?: readonly number[];
};

/** Turn 04C's literal fragments into nonoverlapping links without changing the name. */
export function buildReasoningNameLinkParts(
  name: string,
  fragments: Readonly<Record<string, ReasoningNameFragment>>,
  steps: readonly { number: string }[],
): ReasoningNameLinkPart[] {
  const available = new Set(steps.map((step) => step.number));
  const candidates = Object.entries(fragments).flatMap(([stepNumber, evidence]) =>
    [evidence, ...(evidence.additionalFragments ?? [])].flatMap((fragment) => {
      const start = fragment.start ?? name.indexOf(fragment.text);
      const matchesAtStart = start >= 0 && name.slice(start, start + fragment.text.length) === fragment.text;
      return available.has(stepNumber) && fragment.text && matchesAtStart
        && (fragment.start !== undefined || name.lastIndexOf(fragment.text) === start)
        ? [{ stepNumber, start, end: start + fragment.text.length, text: fragment.text, contributions: fragment.contributions, atomIds: fragment.atomIds }]
        : [];
    }));
  // Specific chemical evidence takes precedence over a broad prefix/unsaturation
  // run. Otherwise keep the existing longest-literal and step-number ordering.
  candidates.sort((a, b) => Number(Boolean(b.contributions?.length || b.atomIds?.length)) - Number(Boolean(a.contributions?.length || a.atomIds?.length))
    || b.text.length - a.text.length || a.stepNumber.localeCompare(b.stepNumber));
  const chosen: typeof candidates = [];
  for (const candidate of candidates) {
    let remaining = [candidate];
    for (const item of chosen) {
      remaining = remaining.flatMap((part) => {
        if (part.start >= item.end || part.end <= item.start) return [part];
        return [
          ...(part.start < item.start ? [{ ...part, end: item.start, text: name.slice(part.start, item.start) }] : []),
          ...(part.end > item.end ? [{ ...part, start: item.end, text: name.slice(item.end, part.end) }] : []),
        ];
      });
    }
    chosen.push(...remaining.filter((part) => /[a-záéíóúüñ0-9]/i.test(part.text)));
  }
  chosen.sort((a, b) => a.start - b.start);
  const parts: ReasoningNameLinkPart[] = [];
  let cursor = 0;
  for (const item of chosen) {
    if (item.start > cursor) parts.push({ text: name.slice(cursor, item.start) });
    const relatedStepNumbers = [...new Set(candidates
      .filter((candidate) => candidate.stepNumber !== item.stepNumber && candidate.start >= item.start && candidate.end <= item.end)
      .map((candidate) => candidate.stepNumber))];
    parts.push({ text: item.text, stepNumber: item.stepNumber, relatedStepNumbers,
      ...(item.atomIds ? { atomIds: item.atomIds } : {}),
      ...(item.contributions?.length ? { contributions: item.contributions } : {}) });
    cursor = item.end;
  }
  if (cursor < name.length) parts.push({ text: name.slice(cursor) });
  return parts.length ? parts : [{ text: name }];
}
