import type { CompoundContext } from "./compound-context.ts";

export function shouldShowExternalInfo(
  showIupacName: boolean,
  loading: boolean,
  context: CompoundContext | null,
) {
  return showIupacName && Boolean(loading || context?.pubchem || context?.wikipedia);
}

export function preferredExternalInfoSource(context: CompoundContext | null) {
  if (context?.wikipedia) return "wikipedia";
  if (context?.pubchem) return "pubchem";
  return null;
}
