import type { CompoundContext } from "./compound-context.ts";

export function externalInfoUnavailableReason(context: CompoundContext | null) {
  if (!context?.identityKey || context.pubchem || context.wikipedia) return null;
  if (context.pubchemStatus === "retrieval-error" || context.wikipediaStatus === "retrieval-error") {
    return "temporary" as const;
  }
  if (context.pubchemStatus || context.wikipediaStatus) return "unverified" as const;
  return null;
}

export function shouldShowExternalInfo(
  showIupacName: boolean,
  loading: boolean,
  context: CompoundContext | null,
) {
  return showIupacName && Boolean(loading || context?.pubchem || context?.wikipedia
    || externalInfoUnavailableReason(context));
}

export function preferredExternalInfoSource(context: CompoundContext | null) {
  if (context?.wikipedia) return "wikipedia";
  if (context?.pubchem) return "pubchem";
  return null;
}
