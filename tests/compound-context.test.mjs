import assert from "node:assert/strict";
import test from "node:test";

import {
  compoundIdentityKey,
  createCompoundContextResolver,
} from "../app/compound-context.ts";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function notFound() {
  return new Response(null, { status: 404 });
}

function missingWikipediaPage() {
  return json({ query: { pages: { "-1": { missing: true } } } });
}

function emptyWikipediaSearch() {
  return json({ query: { search: [] } });
}

function knownPubChemResponse(url) {
  if (url.includes("/cids/JSON")) return json({ IdentifierList: { CID: [702] } });
  if (url.includes("/description/JSON")) {
    return json({
      InformationList: {
        Information: [{
          Title: "Ethanol",
          Description: "Ethanol is used as a solvent and fuel. It is also used in chemical synthesis.",
        }],
      },
    });
  }
  if (url.includes("/property/IUPACName/JSON")) {
    return json({ PropertyTable: { Properties: [{ IUPACName: "ethanol" }] } });
  }
  return undefined;
}

function createKnownFetch({ wikipedia = "es" } = {}) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    const pubchem = knownPubChemResponse(url);
    if (pubchem) return pubchem;

    const request = new URL(url);
    if (request.hostname.endsWith("wikipedia.org")) {
      if (request.searchParams.get("action") === "query" && request.searchParams.has("titles")) {
        if (wikipedia === "none") return missingWikipediaPage();
        const language = request.hostname.split(".")[0];
        if (language === wikipedia) {
          return json({
            query: {
              pages: {
                1: {
                  title: language === "es" ? "Etanol" : "Ethanol",
                  extract: language === "es"
                    ? "El etanol es un alcohol de dos carbonos. Se usa como disolvente y combustible."
                    : "Ethanol is a two-carbon alcohol. It is commonly used as a solvent and fuel.",
                  fullurl: `https://${language}.wikipedia.org/wiki/${language === "es" ? "Etanol" : "Ethanol"}`,
                },
              },
            },
          });
        }
        return missingWikipediaPage();
      }
      return emptyWikipediaSearch();
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { calls, fetchImpl };
}

const ethanolIdentity = {
  canonicalSmiles: "CCO",
  names: ["etanol"],
};

test("returns compact PubChem and Spanish Wikipedia context from mocked APIs", async () => {
  const { fetchImpl } = createKnownFetch();
  const resolver = createCompoundContextResolver({ fetchImpl });

  const context = await resolver.resolve(ethanolIdentity, "es");

  assert.equal(context.pubchem?.cid, 702);
  assert.match(context.pubchem?.usage ?? "", /used as a solvent/i);
  assert.equal(context.pubchem?.url, "https://pubchem.ncbi.nlm.nih.gov/compound/702");
  assert.equal(context.wikipedia?.language, "es");
  assert.match(context.wikipedia?.summary ?? "", /alcohol de dos carbonos/i);
});

test("keeps a PubChem CID link when Wikipedia has no matching article", async () => {
  const { fetchImpl } = createKnownFetch({ wikipedia: "none" });
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(ethanolIdentity, "en");

  assert.equal(context.pubchem?.cid, 702);
  assert.equal(context.wikipedia, undefined);
});

test("falls back to Wikipedia when PubChem cannot resolve a structure", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.includes("pubchem.ncbi.nlm.nih.gov")) return notFound();
    if (url.includes("wikipedia.org") && url.includes("titles=")) {
      return json({
        query: {
          pages: {
            1: {
              title: "Acetona",
              extract: "La acetona es un compuesto orgánico. Se emplea como disolvente.",
              fullurl: "https://es.wikipedia.org/wiki/Acetona",
            },
          },
        },
      });
    }
    return emptyWikipediaSearch();
  };

  const context = await createCompoundContextResolver({ fetchImpl }).resolve({
    canonicalSmiles: "CC(C)=O",
    names: ["acetona"],
  }, "es");

  assert.equal(context.pubchem, undefined);
  assert.equal(context.wikipedia?.title, "Acetona");
});

test("returns no source when neither API has context or responds with HTTP errors", async () => {
  const unavailable = createCompoundContextResolver({
    fetchImpl: async () => new Response(null, { status: 500 }),
  });
  const missing = createCompoundContextResolver({
    fetchImpl: async (input) => String(input).includes("pubchem") ? notFound() : (
      String(input).includes("titles=") ? missingWikipediaPage() : emptyWikipediaSearch()
    ),
  });

  assert.deepEqual(await unavailable.resolve(ethanolIdentity, "en"), {
    identityKey: "smiles:CCO",
  });
  assert.deepEqual(await missing.resolve(ethanolIdentity, "en"), {
    identityKey: "smiles:CCO",
  });
});

test("uses English Wikipedia as the Spanish-interface fallback and labels its language", async () => {
  const { fetchImpl } = createKnownFetch({ wikipedia: "en" });
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(ethanolIdentity, "es");

  assert.equal(context.wikipedia?.language, "en");
  assert.match(context.wikipedia?.summary ?? "", /^Ethanol is/i);
});

test("aborts an obsolete lookup instead of allowing it to race a newer molecule", async () => {
  let signalWasAborted = false;
  const resolver = createCompoundContextResolver({
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        signalWasAborted = true;
        reject(new DOMException("The request was cancelled.", "AbortError"));
      }, { once: true });
    }),
  });
  const controller = new AbortController();
  const pending = resolver.resolve(ethanolIdentity, "es", controller.signal);
  controller.abort();

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(signalWasAborted, true);
});

test("caches by molecular identity, not a nomenclature alias", async () => {
  const { calls, fetchImpl } = createKnownFetch();
  const resolver = createCompoundContextResolver({ fetchImpl });
  const first = { canonicalSmiles: "CC(C)C", names: ["propan-2-il"] };
  const alias = { canonicalSmiles: "CC(C)C", names: ["isopropil"] };

  assert.equal(compoundIdentityKey(first), compoundIdentityKey(alias));
  await resolver.resolve(first, "es");
  const callsAfterFirstResolution = calls.length;
  await resolver.resolve(alias, "es");

  assert.equal(calls.length, callsAfterFirstResolution);
});
