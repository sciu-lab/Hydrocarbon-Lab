import type { AppLanguage } from "./i18n";
import { moleculeFromSmiles, moleculeToSmiles } from "./openchemlib-adapter.ts";
import { findApprovedWikipediaChemistryPage } from "./wikipedia-chemistry.ts";

export type CompoundIdentity = {
  /** A PubChem compound identifier retained when it is already known. */
  cid?: number;
  /** Preferred structural lookup key when available. */
  inchiKey?: string;
  /** Isomeric/canonical SMILES generated from the editable molecular graph. */
  canonicalSmiles?: string;
  /** App-generated names used only for the curated Wikipedia registry. */
  names?: readonly string[];
};

export type PubChemCompoundContext = {
  cid: number;
  url: string;
  /** A short description exactly derived from PubChem data. */
  description?: string;
  /** Only use-oriented sentences from the PubChem description. */
  usage?: string;
  molecularFormula?: string;
  molecularWeight?: number;
  inchiKey?: string;
  names: string[];
};

export type WikipediaCompoundContext = {
  language: "es" | "en";
  title: string;
  summary: string;
  url: string;
};

export type CompoundContext = {
  identityKey: string;
  pubchem?: PubChemCompoundContext;
  wikipedia?: WikipediaCompoundContext;
};

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type CompoundContextResolver = {
  resolve: (
    identity: CompoundIdentity,
    language: AppLanguage,
    signal?: AbortSignal,
  ) => Promise<CompoundContext>;
  clearCache: () => void;
};

type PubChemDescriptionPayload = {
  InformationList?: {
    Information?: Array<{ Title?: string; Description?: string }>;
  };
};

type PubChemCidPayload = {
  IdentifierList?: { CID?: number[] };
};

type PubChemProperties = {
  IUPACName?: string;
  InChIKey?: string;
  IsomericSMILES?: string;
  CanonicalSMILES?: string;
  ConnectivitySMILES?: string;
  SMILES?: string;
  MolecularFormula?: string;
  MolecularWeight?: number;
};

type PubChemPropertiesPayload = {
  PropertyTable?: { Properties?: PubChemProperties[] };
};

type WikipediaPage = {
  title?: string;
  extract?: string;
  fullurl?: string;
  missing?: boolean;
};

type WikipediaQueryPayload = {
  query?: {
    pages?: Record<string, WikipediaPage>;
  };
};

const PUBCHEM_BASE_URL = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";
const MAX_CONTEXT_CHARACTERS = 420;

function cleanText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function uniqueNames(values: readonly (string | undefined)[]) {
  const seen = new Set<string>();
  return values
    .map(cleanText)
    .filter((value) => {
      if (!value || value.length > 180) return false;
      const key = value.toLocaleLowerCase("en");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function shortSentences(value: string | undefined, maximumSentences: number) {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = (sentences.length ? sentences.slice(0, maximumSentences) : [cleaned]).join(" ");
  if (summary.length <= MAX_CONTEXT_CHARACTERS) return summary;
  return `${summary.slice(0, MAX_CONTEXT_CHARACTERS - 1).trimEnd()}…`;
}

/**
 * Keeps the UI's "Uso" label truthful: a description is shown there only
 * when PubChem itself explicitly contains a use/application statement.
 */
function usageSummary(description: string | undefined) {
  const cleaned = cleanText(description);
  if (!cleaned) return undefined;
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  const useStatement = sentences.filter((sentence) =>
    /\b(?:used(?:\s+(?:as|to|for|in))?|use(?:s|d)?|utili[sz](?:e|ed|ation)|employ(?:ed|ment)?|application(?:s)?|solvent|fuel|medic(?:ine|inal))\b|\b(?:se utiliza|utilizado|utilizada|se emplea|empleado|empleada|disolvente|combustible)\b/i.test(sentence),
  );
  return shortSentences(useStatement.join(" "), 2);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchJson<T>(fetchImpl: FetchLike, url: string, signal?: AbortSignal) {
  const response = await fetchImpl(url, { signal });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function compoundIdentityKey(identity: CompoundIdentity) {
  if (Number.isInteger(identity.cid) && (identity.cid ?? 0) > 0) return `cid:${identity.cid}`;
  const inchiKey = cleanText(identity.inchiKey);
  if (inchiKey) return `inchikey:${inchiKey.toLocaleUpperCase("en")}`;
  const smiles = cleanText(identity.canonicalSmiles);
  if (smiles) return `smiles:${smiles}`;
  return "";
}

function getWikipediaLanguages(language: AppLanguage): Array<"es" | "en"> {
  return language === "es" ? ["es", "en"] : ["en"];
}

function wikipediaApiUrl(language: "es" | "en", parameters: Record<string, string>) {
  const search = new URLSearchParams({
    origin: "*",
    action: "query",
    format: "json",
    redirects: "1",
    ...parameters,
  });
  return `https://${language}.wikipedia.org/w/api.php?${search.toString()}`;
}

function readWikipediaPage(payload: WikipediaQueryPayload) {
  return Object.values(payload.query?.pages ?? {}).find((page) =>
    !page.missing && Boolean(cleanText(page.extract)) && Boolean(cleanText(page.fullurl)),
  );
}

async function fetchWikipediaPage(
  fetchImpl: FetchLike,
  language: "es" | "en",
  title: string,
  signal?: AbortSignal,
) {
  const payload = await fetchJson<WikipediaQueryPayload>(
    fetchImpl,
    wikipediaApiUrl(language, {
      prop: "extracts|info",
      inprop: "url",
      exintro: "1",
      explaintext: "1",
      titles: title,
    }),
    signal,
  );
  const page = payload ? readWikipediaPage(payload) : undefined;
  const summary = shortSentences(page?.extract, 2);
  const url = cleanText(page?.fullurl);
  const resolvedTitle = cleanText(page?.title);
  if (!summary || !url || !resolvedTitle) return undefined;
  return { language, title: resolvedTitle, summary, url } satisfies WikipediaCompoundContext;
}

async function resolveWikipedia(
  fetchImpl: FetchLike,
  language: AppLanguage,
  input: { cid?: number; names?: readonly string[] },
  signal?: AbortSignal,
) {
  const approved = findApprovedWikipediaChemistryPage(input);
  if (!approved) return undefined;
  for (const wikiLanguage of getWikipediaLanguages(language)) {
    const exact = await fetchWikipediaPage(
      fetchImpl,
      wikiLanguage,
      approved.wikipedia[wikiLanguage],
      signal,
    );
    if (exact) return exact;
  }
  return undefined;
}

async function resolvePubChemCids(
  fetchImpl: FetchLike,
  identity: CompoundIdentity,
  signal?: AbortSignal,
) {
  if (Number.isInteger(identity.cid) && (identity.cid ?? 0) > 0) return [identity.cid!];
  const inchiKey = cleanText(identity.inchiKey);
  const smiles = cleanText(identity.canonicalSmiles);
  const path = inchiKey
    ? `inchikey/${encodeURIComponent(inchiKey)}/cids/JSON`
    : smiles
      ? `smiles/${encodeURIComponent(smiles)}/cids/JSON`
      : undefined;
  if (!path) return [];
  const payload = await fetchJson<PubChemCidPayload>(fetchImpl, `${PUBCHEM_BASE_URL}/${path}`, signal);
  return (payload?.IdentifierList?.CID ?? []).filter((cid) => Number.isInteger(cid) && cid > 0);
}

function canonicalSmiles(value: string | undefined) {
  const source = cleanText(value);
  if (!source) return undefined;
  const parsed = moleculeFromSmiles(source);
  if (!parsed.ok) return undefined;
  const exported = moleculeToSmiles(parsed.molecule);
  return exported.ok ? exported.smiles : undefined;
}

function propertySmiles(properties: PubChemProperties | undefined) {
  return properties?.IsomericSMILES
    ?? properties?.SMILES
    ?? properties?.CanonicalSMILES
    ?? properties?.ConnectivitySMILES;
}

/**
 * A CID obtained from PUG's structural endpoint is still checked against the
 * returned InChIKey/SMILES before it is presented. This prevents a text-like
 * match from ever becoming a visible compound association.
 */
function pubChemPropertiesMatchIdentity(
  identity: CompoundIdentity,
  properties: PubChemProperties | undefined,
) {
  const expectedInchiKey = cleanText(identity.inchiKey).toLocaleUpperCase("en");
  const actualInchiKey = cleanText(properties?.InChIKey).toLocaleUpperCase("en");
  if (expectedInchiKey && actualInchiKey) return expectedInchiKey === actualInchiKey;

  const expectedSmiles = canonicalSmiles(identity.canonicalSmiles);
  const actualSmiles = canonicalSmiles(propertySmiles(properties));
  if (expectedSmiles && actualSmiles) return expectedSmiles === actualSmiles;

  // A caller that supplies a CID without a second identifier explicitly
  // retains a known external identifier; otherwise do not guess.
  return Boolean(identity.cid && !identity.canonicalSmiles && !identity.inchiKey);
}

async function resolvePubChem(
  fetchImpl: FetchLike,
  identity: CompoundIdentity,
  signal?: AbortSignal,
) {
  const cids = await resolvePubChemCids(fetchImpl, identity, signal);
  for (const cid of cids) {
    const propertiesPayload = await fetchJson<PubChemPropertiesPayload>(
      fetchImpl,
      `${PUBCHEM_BASE_URL}/cid/${cid}/property/IUPACName,InChIKey,IsomericSMILES,CanonicalSMILES,MolecularFormula,MolecularWeight/JSON`,
      signal,
    );
    const properties = propertiesPayload?.PropertyTable?.Properties?.[0];
    if (!pubChemPropertiesMatchIdentity(identity, properties)) continue;

    const descriptionPayload = await fetchJson<PubChemDescriptionPayload>(
      fetchImpl,
      `${PUBCHEM_BASE_URL}/cid/${cid}/description/JSON`,
      signal,
    );
    const descriptionInformation = descriptionPayload?.InformationList?.Information?.[0];
    const description = shortSentences(descriptionInformation?.Description, 2);
    return {
      cid,
      url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      ...(description ? { description, usage: usageSummary(description) } : {}),
      ...(cleanText(properties?.MolecularFormula) ? { molecularFormula: cleanText(properties?.MolecularFormula) } : {}),
      ...(Number.isFinite(properties?.MolecularWeight) ? { molecularWeight: properties?.MolecularWeight } : {}),
      ...(cleanText(properties?.InChIKey) ? { inchiKey: cleanText(properties?.InChIKey) } : {}),
      names: uniqueNames([descriptionInformation?.Title, properties?.IUPACName, ...(identity.names ?? [])]),
    } satisfies PubChemCompoundContext;
  }
  return undefined;
}

/**
 * Creates a client-side, in-memory resolver. PubChem results are cached only
 * by structural identity, while the Wikipedia cache adds the requested UI
 * language because Spanish may legitimately fall back to a different article.
 */
export function createCompoundContextResolver(options: { fetchImpl?: FetchLike } = {}): CompoundContextResolver {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const pubchemCache = new Map<string, PubChemCompoundContext | null>();
  const wikipediaCache = new Map<string, WikipediaCompoundContext | null>();

  return {
    async resolve(identity, language, signal) {
      const identityKey = compoundIdentityKey(identity);
      if (!identityKey) return { identityKey: "" };

      let pubchem = pubchemCache.get(identityKey);
      if (pubchem === undefined) {
        try {
          pubchem = (await resolvePubChem(fetchImpl, identity, signal)) ?? null;
          pubchemCache.set(identityKey, pubchem);
        } catch (error) {
          if (isAbortError(error)) throw error;
          pubchem = null;
        }
      }

      const wikipediaKey = `${identityKey}:wikipedia:${language}`;
      let wikipedia = wikipediaCache.get(wikipediaKey);
      if (wikipedia === undefined) {
        try {
          wikipedia = (await resolveWikipedia(
            fetchImpl,
            language,
            {
              ...(pubchem?.cid ? { cid: pubchem.cid } : {}),
              names: uniqueNames([...(identity.names ?? []), ...(pubchem?.names ?? [])]),
            },
            signal,
          )) ?? null;
          wikipediaCache.set(wikipediaKey, wikipedia);
        } catch (error) {
          if (isAbortError(error)) throw error;
          wikipedia = null;
        }
      }

      return {
        identityKey,
        ...(pubchem ? { pubchem } : {}),
        ...(wikipedia ? { wikipedia } : {}),
      };
    },
    clearCache() {
      pubchemCache.clear();
      wikipediaCache.clear();
    },
  };
}
