import type { AppLanguage } from "./i18n";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const MAX_RESULTS_PER_IDENTIFIER = 5;
const DEFAULT_CACHE_SIZE = 20;
const QID_PATTERN = /^Q[1-9]\d*$/;
const INCHIKEY_PATTERN = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type JsonObject = Record<string, unknown>;

export type WikidataArticleLink = {
  language: "es" | "en";
  title: string;
  url: string;
};

export type VerifiedWikidataIdentity = {
  qid: string;
  cid: number;
  inchiKey: string;
  links: Partial<Record<"es" | "en", WikidataArticleLink>>;
  evidence: { cid: "P662"; inchiKey: "P235" };
};

export type WikidataArticleResult =
  | { status: "article"; identity: VerifiedWikidataIdentity; article: WikidataArticleLink }
  | { status: "no-article"; identity: VerifiedWikidataIdentity }
  | { status: "insufficient-identity" | "not-found" | "unverified" | "discordant-identifiers" | "ambiguous" | "invalid-response" | "service-error" | "cancelled" };

export type WikidataArticleResolver = {
  resolve(identity: { cid?: number; inchiKey?: string }, language: AppLanguage, signal?: AbortSignal): Promise<WikidataArticleResult>;
  clearCache(): void;
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function apiUrl(parameters: Record<string, string>) {
  return WIKIDATA_API + "?" + new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    ...parameters,
  });
}

class InvalidResponseError extends Error {}
class ServiceError extends Error {}

async function fetchJson(fetchImpl: FetchLike, url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(url, {
    signal,
    headers: {
      accept: "application/json",
      "Api-User-Agent": "HydrocarbonLab/0.1 (https://github.com/sciu-lab/Hydrocarbon-Lab)",
    },
  });
  if (!response.ok) throw new ServiceError("Wikidata request failed");
  try {
    return await response.json() as unknown;
  } catch {
    throw new InvalidResponseError("Wikidata returned invalid JSON");
  }
}

function readSearchResults(payload: unknown): string[] {
  if (!isObject(payload) || !isObject(payload.query) || !Array.isArray(payload.query.search)) {
    throw new InvalidResponseError("Wikidata search response is malformed");
  }
  const titles = payload.query.search.slice(0, MAX_RESULTS_PER_IDENTIFIER).map((item: unknown) => {
    if (!isObject(item) || typeof item.title !== "string" || !QID_PATTERN.test(item.title)) {
      throw new InvalidResponseError("Wikidata search returned an invalid item");
    }
    return item.title;
  });
  return [...new Set(titles)];
}

async function searchByStatement(
  fetchImpl: FetchLike,
  property: "P662" | "P235",
  value: string,
  signal?: AbortSignal,
) {
  const payload = await fetchJson(fetchImpl, apiUrl({
    list: "search",
    srsearch: "haswbstatement:" + property + "=" + value,
    srnamespace: "0",
    srlimit: String(MAX_RESULTS_PER_IDENTIFIER),
  }), signal);
  return readSearchResults(payload);
}

function statementValues(claims: JsonObject, property: "P662" | "P235"): string[] | null {
  const statements = claims[property];
  if (statements === undefined) return [];
  if (!Array.isArray(statements)) return null;
  const values: string[] = [];
  for (const statement of statements) {
    if (!isObject(statement)) return null;
    if (statement.rank === "deprecated") continue;
    if (!isObject(statement.mainsnak) || !isObject(statement.mainsnak.datavalue)
      || typeof statement.mainsnak.datavalue.value !== "string") return null;
    values.push(statement.mainsnak.datavalue.value.trim());
  }
  return [...new Set(values)];
}

function readLinks(entity: JsonObject) {
  const sitelinks = entity.sitelinks;
  if (sitelinks === undefined) return {};
  if (!isObject(sitelinks)) throw new InvalidResponseError("Wikidata sitelinks are malformed");
  const links: VerifiedWikidataIdentity["links"] = {};
  for (const language of ["es", "en"] as const) {
    const link = sitelinks[language + "wiki"];
    if (link === undefined) continue;
    if (!isObject(link) || (link.site !== undefined && link.site !== language + "wiki")
      || typeof link.title !== "string" || !link.title.trim()) {
      throw new InvalidResponseError("Wikidata returned an invalid sitelink");
    }
    const title = link.title.trim();
    links[language] = {
      language,
      title,
      url: "https://" + language + ".wikipedia.org/wiki/" + encodeURIComponent(title.replaceAll(" ", "_")),
    };
  }
  return links;
}

function readEntities(payload: unknown): JsonObject {
  if (!isObject(payload) || !isObject(payload.entities)) {
    throw new InvalidResponseError("Wikidata entity response is malformed");
  }
  return payload.entities;
}

function selectArticle(identity: VerifiedWikidataIdentity, language: AppLanguage): WikidataArticleResult {
  const article = identity.links[language] ?? identity.links[language === "es" ? "en" : "es"];
  return article ? { status: "article", identity, article } : { status: "no-article", identity };
}

/**
 * Accepts only a CID and InChIKey already verified against the editor graph.
 * Wikidata must corroborate both on one item; a shared name or formula is never evidence.
 */
export function createWikidataArticleResolver(options: { fetchImpl?: FetchLike; cacheSize?: number } = {}): WikidataArticleResolver {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const cacheSize = Math.max(0, Math.min(100, Math.floor(options.cacheSize ?? DEFAULT_CACHE_SIZE)));
  const cache = new Map<string, VerifiedWikidataIdentity>();

  return {
    async resolve(identity, language, signal) {
      if (signal?.aborted) return { status: "cancelled" };
      const cid = identity.cid;
      const inchiKey = identity.inchiKey?.trim().toUpperCase();
      if (!Number.isInteger(cid) || !cid || cid <= 0 || cid > 999999999
        || !inchiKey || !INCHIKEY_PATTERN.test(inchiKey)) return { status: "insufficient-identity" };

      const cacheKey = String(cid) + ":" + inchiKey;
      const cached = cache.get(cacheKey);
      if (cached) return selectArticle(cached, language);

      try {
        const byCid = await searchByStatement(fetchImpl, "P662", String(cid), signal);
        if (signal?.aborted) return { status: "cancelled" };
        const byInchiKey = await searchByStatement(fetchImpl, "P235", inchiKey, signal);
        if (signal?.aborted) return { status: "cancelled" };
        const qids = [...new Set([...byCid, ...byInchiKey])];
        if (!qids.length) return { status: "not-found" };

        const entities = readEntities(await fetchJson(fetchImpl, apiUrl({
          action: "wbgetentities",
          ids: qids.join("|"),
          props: "claims|sitelinks",
          sitefilter: "eswiki|enwiki",
        }), signal));
        if (signal?.aborted) return { status: "cancelled" };

        const verified: VerifiedWikidataIdentity[] = [];
        let discordant = false;
        for (const qid of qids) {
          const entity = entities[qid];
          if (!isObject(entity) || entity.missing !== undefined || !isObject(entity.claims)) {
            throw new InvalidResponseError("Wikidata omitted a requested item or its claims");
          }
          const cids = statementValues(entity.claims, "P662");
          const keys = statementValues(entity.claims, "P235");
          if (!cids || !keys) throw new InvalidResponseError("Wikidata claims are malformed");
          const cidMatches = cids.length === 1 && cids[0] === String(cid);
          const keyMatches = keys.length === 1 && keys[0].toUpperCase() === inchiKey;
          if (!cidMatches || !keyMatches) {
            if (cids.some((value) => value !== String(cid))
              || keys.some((value) => value.toUpperCase() !== inchiKey)) discordant = true;
            continue;
          }
          verified.push({
            qid,
            cid,
            inchiKey,
            links: readLinks(entity),
            evidence: { cid: "P662", inchiKey: "P235" },
          });
        }

        if (verified.length > 1) return { status: "ambiguous" };
        if (!verified.length) return { status: discordant ? "discordant-identifiers" : "unverified" };
        const match = verified[0];
        // A verified item with no article can acquire a sitelink later; do not
        // retain that negative coverage result for the resolver's lifetime.
        if (cacheSize > 0 && (match.links.es || match.links.en)) {
          if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
          cache.set(cacheKey, match);
        }
        return selectArticle(match, language);
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return { status: "cancelled" };
        }
        return { status: error instanceof InvalidResponseError ? "invalid-response" : "service-error" };
      }
    },
    clearCache() {
      cache.clear();
    },
  };
}
