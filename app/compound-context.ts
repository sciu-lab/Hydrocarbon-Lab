import type { AppLanguage } from "./i18n";
import { moleculeFromSmiles, moleculeToSmiles } from "./openchemlib-adapter.ts";
import { findApprovedWikipediaChemistryPage } from "./wikipedia-chemistry.ts";
import { createWikidataArticleResolver } from "./wikidata-article-resolver.ts";

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
  /** Preferred title returned by PubChem's structured property endpoint. */
  title: string;
  /** PubChem's structured IUPACName property; kept separate from its record title. */
  iupacName?: string;
  /** Title from the existing CID description response; not classified as a common name. */
  recordTitle?: string;
  /** A short description exactly derived from PubChem data. */
  description?: string;
  /** Only use-oriented sentences from the PubChem description. */
  usage?: string;
  molecularFormula?: string;
  molecularWeight?: number;
  smiles?: string;
  inchiKey?: string;
  xlogp?: number;
  hBondDonorCount?: number;
  hBondAcceptorCount?: number;
  rotatableBondCount?: number;
  names: string[];
};

export type WikipediaCompoundContext = {
  language: "es" | "en";
  title: string;
  summary: string;
  url: string;
  source: "registry" | "wikidata";
  qid?: string;
};

export type CompoundContext = {
  identityKey: string;
  language?: AppLanguage;
  pubchem?: PubChemCompoundContext;
  pubchemStatus?: "retrieval-error";
  wikipedia?: WikipediaCompoundContext;
  wikipediaStatus?: "registry" | "wikidata" | "no-article" | "retrieval-error" | "identity-mismatch" | "unverified";
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
    onProgress?: (context: CompoundContext) => void,
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
  XLogP?: number;
  HBondDonorCount?: number;
  HBondAcceptorCount?: number;
  RotatableBondCount?: number;
};

type PubChemPropertiesPayload = {
  PropertyTable?: { Properties?: PubChemProperties[] };
};

type WikipediaPage = {
  title?: string;
  extract?: string;
  fullurl?: string;
  missing?: boolean;
  pageprops?: { wikibase_item?: string };
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

function cleanWikipediaLayoutReferences(value: string | undefined) {
  const text = cleanText(value);
  // Only remove a self-contained aside that explicitly points to an image,
  // figure, table, or diagram in Wikipedia's layout. Direction words alone
  // may be part of the chemistry and must remain untouched.
  const layoutAside = /^(?:(?:(?:cuya|en la|la)\s+)?(?:imagen|figura|tabla|diagrama)\s+(?:(?:se\s+)?(?:muestra|ve|presenta)\s+)?(?:(?:a|en)\s+la\s+(?:parte\s+)?)?(?:derecha|izquierda|superior|inferior)|(?:shown|pictured|depicted|illustrated)\s+(?:(?:on|to)\s+the\s+)?(?:right|left|above|below)|(?:in\s+the\s+)?(?:image|figure|table|diagram)\s+(?:(?:on|to)\s+the\s+)?(?:right|left|above|below))$/i;
  return text
    .replace(/,\s*([^,.;!?()]{1,100}),/g, (match, aside: string) => layoutAside.test(aside.trim()) ? "" : match)
    .replace(/\s*\(([^().;!?]{1,100})\)/g, (match, aside: string) => layoutAside.test(aside.trim()) ? "" : match)
    .replace(/\s{2,}/g, " ");
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
}

async function fetchJson<T>(fetchImpl: FetchLike, url: string, signal?: AbortSignal) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        signal,
        headers: { accept: "application/json" },
      });
      if (response.status === 404) return undefined;
      if (response.ok) return response.json() as Promise<T>;
      lastError = new Error(`HTTP ${response.status}`);
      if (response.status !== 429 && response.status !== 503) throw lastError;
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
    }

    if (attempt < 2) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 500 * (2 ** attempt));
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The request was cancelled.", "AbortError"));
        }, { once: true });
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No se pudo consultar la fuente externa.");
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
  expectedQid?: string,
) {
  const payload = await fetchJson<WikipediaQueryPayload>(
    fetchImpl,
    wikipediaApiUrl(language, {
      prop: expectedQid ? "extracts|info|pageprops" : "extracts|info",
      inprop: "url",
      ...(expectedQid ? { ppprop: "wikibase_item" } : {}),
      exintro: "1",
      explaintext: "1",
      titles: title,
    }),
    signal,
  );
  throwIfAborted(signal);
  const page = payload ? readWikipediaPage(payload) : undefined;
  // MediaWiki resolves redirects before returning pages. The destination's
  // wikibase_item, rather than the requested title, establishes identity.
  if (expectedQid && page && page.pageprops?.wikibase_item !== expectedQid) {
    return { status: "identity-mismatch" as const };
  }
  const summary = shortSentences(cleanWikipediaLayoutReferences(page?.extract), 2);
  const url = cleanText(page?.fullurl);
  const resolvedTitle = cleanText(page?.title);
  if (!summary || !url || !resolvedTitle) return { status: "no-article" as const };
  return {
    status: "article" as const,
    article: { language, title: resolvedTitle, summary, url,
      source: expectedQid ? "wikidata" as const : "registry" as const,
      ...(expectedQid ? { qid: expectedQid } : {}) },
  };
}

async function resolveWikipedia(
  fetchImpl: FetchLike,
  wikidataResolver: ReturnType<typeof createWikidataArticleResolver>,
  language: AppLanguage,
  input: { identity: CompoundIdentity; pubchem?: PubChemCompoundContext },
  signal?: AbortSignal,
) : Promise<{ status: NonNullable<CompoundContext["wikipediaStatus"]>; article?: WikipediaCompoundContext }> {
  const { identity, pubchem } = input;
  let fallbackStatus: "no-article" | "retrieval-error" = "no-article";
  if (pubchem?.cid && pubchem.inchiKey) {
    const result = await wikidataResolver.resolve({ cid: pubchem.cid, inchiKey: pubchem.inchiKey }, language, signal);
    if (result.status === "cancelled") throw new DOMException("The request was cancelled.", "AbortError");
    throwIfAborted(signal);
    if (result.status === "article") {
      let mismatch = false;
      for (const wikiLanguage of getWikipediaLanguages(language)) {
        const link = result.identity.links[wikiLanguage];
        if (!link) continue;
        const page = await fetchWikipediaPage(fetchImpl, wikiLanguage, link.title, signal, result.identity.qid);
        if (page.status === "article") return { status: "wikidata", article: page.article };
        if (page.status === "identity-mismatch") mismatch = true;
      }
      return { status: mismatch ? "identity-mismatch" : "no-article" };
    }
    // A verified item without a sitelink is not a licence to show an article
    // for a broader substance. Conflicting identifiers are equally unsafe.
    if (result.status === "no-article") return { status: "no-article" };
    if (result.status === "ambiguous" || result.status === "discordant-identifiers") {
      return { status: "unverified" };
    }
    if (result.status === "service-error" || result.status === "invalid-response") {
      fallbackStatus = "retrieval-error";
    }
    // The curated registry remains available if Wikidata cannot be reached or
    // provides no verifiable item. It is keyed by the verified PubChem CID.
  }

  // A claimed CID or InChIKey that PubChem did not verify must never gain an
  // article through either a CID lookup or a coincidental naming alias.
  if (!pubchem && (identity.cid || identity.inchiKey)) return { status: "unverified" };
  const approved = findApprovedWikipediaChemistryPage(pubchem?.cid
    ? { cid: pubchem.cid }
    : { names: identity.names });
  if (!approved) return { status: fallbackStatus };
  for (const wikiLanguage of getWikipediaLanguages(language)) {
    const exact = await fetchWikipediaPage(
      fetchImpl,
      wikiLanguage,
      approved.wikipedia[wikiLanguage],
      signal,
    );
    if (exact.status === "article") return { status: "registry", article: exact.article };
  }
  return { status: fallbackStatus };
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
      `${PUBCHEM_BASE_URL}/cid/${cid}/property/IUPACName,InChIKey,IsomericSMILES,CanonicalSMILES,MolecularFormula,MolecularWeight,XLogP,HBondDonorCount,HBondAcceptorCount,RotatableBondCount/JSON`,
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
    const iupacName = cleanText(properties?.IUPACName);
    const recordTitle = cleanText(descriptionInformation?.Title);
    return {
      cid,
      url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      title: iupacName || recordTitle || identity.names?.[0] || `CID ${cid}`,
      ...(iupacName ? { iupacName } : {}),
      ...(recordTitle ? { recordTitle } : {}),
      ...(description ? { description, usage: usageSummary(description) } : {}),
      ...(cleanText(properties?.MolecularFormula) ? { molecularFormula: cleanText(properties?.MolecularFormula) } : {}),
      ...(Number.isFinite(properties?.MolecularWeight) ? { molecularWeight: properties?.MolecularWeight } : {}),
      ...(cleanText(propertySmiles(properties)) ? { smiles: cleanText(propertySmiles(properties)) } : {}),
      ...(cleanText(properties?.InChIKey) ? { inchiKey: cleanText(properties?.InChIKey) } : {}),
      ...(Number.isFinite(properties?.XLogP) ? { xlogp: properties?.XLogP } : {}),
      ...(Number.isFinite(properties?.HBondDonorCount) ? { hBondDonorCount: properties?.HBondDonorCount } : {}),
      ...(Number.isFinite(properties?.HBondAcceptorCount) ? { hBondAcceptorCount: properties?.HBondAcceptorCount } : {}),
      ...(Number.isFinite(properties?.RotatableBondCount) ? { rotatableBondCount: properties?.RotatableBondCount } : {}),
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
  const wikidataResolver = createWikidataArticleResolver({ fetchImpl });
  const pubchemCache = new Map<string, PubChemCompoundContext | null>();
  const wikipediaCache = new Map<string, WikipediaCompoundContext>();

  return {
    async resolve(identity, language, signal, onProgress) {
      const identityKey = compoundIdentityKey(identity);
      if (!identityKey) return { identityKey: "" };

      let pubchem = pubchemCache.get(identityKey);
      let pubchemStatus: CompoundContext["pubchemStatus"];
      if (pubchem === undefined) {
        try {
          pubchem = (await resolvePubChem(fetchImpl, identity, signal)) ?? null;
          throwIfAborted(signal);
          pubchemCache.set(identityKey, pubchem);
        } catch (error) {
          if (isAbortError(error)) throw error;
          pubchem = null;
          pubchemStatus = "retrieval-error";
        }
      }

      // Publish structurally verified PubChem data before the optional
      // Wikidata/Wikipedia lookup. A slow or cancelled article request must
      // never delay or discard the independent PubChem result.
      throwIfAborted(signal);
      if (pubchem) onProgress?.({ identityKey, language, pubchem });

      const wikipediaKey = `${identityKey}:wikipedia:${language}`;
      let wikipedia = wikipediaCache.get(wikipediaKey);
      let wikipediaStatus: NonNullable<CompoundContext["wikipediaStatus"]> = wikipedia?.source ?? "no-article";
      if (wikipedia === undefined) {
        try {
          const result = await resolveWikipedia(
            fetchImpl,
            wikidataResolver,
            language,
            { identity: { ...identity, names: uniqueNames([...(identity.names ?? []), ...(pubchem?.names ?? [])]) },
              pubchem: pubchem ?? undefined },
            signal,
          );
          throwIfAborted(signal);
          wikipedia = result.article;
          wikipediaStatus = result.status;
          if (wikipedia) wikipediaCache.set(wikipediaKey, wikipedia);
        } catch (error) {
          if (isAbortError(error)) throw error;
          wikipediaStatus = "retrieval-error";
        }
      }

      return {
        identityKey,
        language,
        ...(pubchemStatus ? { pubchemStatus } : {}),
        wikipediaStatus,
        ...(pubchem ? { pubchem } : {}),
        ...(wikipedia ? { wikipedia } : {}),
      };
    },
    clearCache() {
      pubchemCache.clear();
      wikipediaCache.clear();
      wikidataResolver.clearCache();
    },
  };
}
