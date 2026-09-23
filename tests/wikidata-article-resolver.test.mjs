import assert from "node:assert/strict";
import test from "node:test";

import { createWikidataArticleResolver } from "../app/wikidata-article-resolver.ts";

const identities = {
  morpholine: { cid: 8083, inchiKey: "YNAVUWVOSKDBBP-UHFFFAOYSA-N" },
  oxirane: { cid: 6354, inchiKey: "IAYPIBMASNFSPL-UHFFFAOYSA-N" },
  acid: { cid: 7413, inchiKey: "NZNMSOFKMUBTKW-UHFFFAOYSA-N" },
  glucose: { cid: 5793, inchiKey: "WQZGKKKJIJFFOK-GASJEMHNSA-N" },
  bicyclohexyl: { cid: 7094, inchiKey: "WVIIMZNLDWSIRH-UHFFFAOYSA-N" },
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

function claim(value) {
  return { mainsnak: { datavalue: { value: String(value) } }, rank: "normal" };
}

function item(cid, inchiKey, links = {}) {
  return {
    claims: { P662: [claim(cid)], P235: [claim(inchiKey)] },
    sitelinks: Object.fromEntries(Object.entries(links).map(([language, title]) => [
      language + "wiki", { site: language + "wiki", title },
    ])),
  };
}

function fixture(identity, qid, links = {}) {
  return { cidResults: [qid], keyResults: [qid], entities: { [qid]: item(identity.cid, identity.inchiKey, links) } };
}

function mockedFetch({ cidResults = [], keyResults = [], entities = {}, responseOverride } = {}) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (responseOverride) return responseOverride(url, init, calls.length);
    assert.equal(url.hostname, "www.wikidata.org");
    assert.equal(url.searchParams.get("origin"), "*");
    if (url.searchParams.get("list") === "search") {
      const term = url.searchParams.get("srsearch");
      const results = term?.startsWith("haswbstatement:P662=") ? cidResults : keyResults;
      return json({ query: { search: results.map((title) => ({ title })) } });
    }
    assert.equal(url.searchParams.get("action"), "wbgetentities");
    const ids = url.searchParams.get("ids")?.split("|") ?? [];
    return json({ entities: Object.fromEntries(ids.map((id) => [id, entities[id]])) });
  };
  return { fetchImpl, calls };
}

test("morpholine resolves the structurally corroborated ES and EN sitelinks", async () => {
  const { fetchImpl, calls } = mockedFetch(fixture(identities.morpholine, "Q410243", {
    es: "Morfolina", en: "Morpholine",
  }));
  const resolver = createWikidataArticleResolver({ fetchImpl });
  const spanish = await resolver.resolve(identities.morpholine, "es");
  assert.equal(spanish.status, "article");
  assert.equal(spanish.identity.qid, "Q410243");
  assert.deepEqual(spanish.identity.evidence, { cid: "P662", inchiKey: "P235" });
  assert.equal(spanish.identity.cid, 8083);
  assert.equal(spanish.identity.inchiKey, identities.morpholine.inchiKey);
  assert.equal(spanish.article.language, "es");
  assert.equal(spanish.identity.links.en.title, "Morpholine");

  const english = await resolver.resolve(identities.morpholine, "en");
  assert.equal(english.status, "article");
  assert.equal(english.article.title, "Morpholine");
  assert.equal(calls.length, 3, "changing language reuses the verified identity and sitelinks");
  assert.equal(calls[0].url.searchParams.get("srlimit"), "5");
  assert.equal(calls[1].url.searchParams.get("srlimit"), "5");
  assert.equal(calls[2].url.searchParams.get("sitefilter"), "eswiki|enwiki");
  assert.ok(calls.every(({ init }) => init.headers["Api-User-Agent"]));
});

test("oxirane resolves its Spanish article despite the different title", async () => {
  const { fetchImpl } = mockedFetch(fixture(identities.oxirane, "Q407473", {
    es: "Óxido de etileno", en: "Ethylene oxide",
  }));
  const result = await createWikidataArticleResolver({ fetchImpl }).resolve(identities.oxirane, "es");
  assert.equal(result.status, "article");
  assert.equal(result.article.title, "Óxido de etileno");
  assert.equal(result.article.url, "https://es.wikipedia.org/wiki/%C3%93xido_de_etileno");
});

test("cyclohexanecarboxylic acid explicitly falls back to English", async () => {
  const { fetchImpl } = mockedFetch(fixture(identities.acid, "Q5198713", {
    en: "Cyclohexanecarboxylic acid",
  }));
  const result = await createWikidataArticleResolver({ fetchImpl }).resolve(identities.acid, "es");
  assert.equal(result.status, "article");
  assert.equal(result.article.language, "en");
  assert.equal(result.identity.links.es, undefined);
});

test("CID 5793 remains verified without borrowing the general glucose article", async () => {
  const { fetchImpl } = mockedFetch(fixture(identities.glucose, "Q23905964"));
  const result = await createWikidataArticleResolver({ fetchImpl }).resolve(identities.glucose, "es");
  assert.equal(result.status, "no-article");
  assert.equal(result.identity.qid, "Q23905964");
  assert.deepEqual(result.identity.links, {});
});

test("two bonded cyclohexane rings resolve Bicyclohexyl, not decalin", async () => {
  const { fetchImpl } = mockedFetch(fixture(identities.bicyclohexyl, "Q21099094", {
    en: "Bicyclohexyl",
  }));
  const result = await createWikidataArticleResolver({ fetchImpl }).resolve(identities.bicyclohexyl, "es");
  assert.equal(result.status, "article");
  assert.equal(result.identity.cid, 7094);
  assert.equal(result.article.title, "Bicyclohexyl");
  assert.equal(result.article.language, "en");
});

test("a candidate with a matching CID and contradictory InChIKey is rejected", async () => {
  const data = fixture(identities.morpholine, "Q410243", { en: "Morpholine" });
  data.entities.Q410243.claims.P235 = [claim(identities.oxirane.inchiKey)];
  const { fetchImpl } = mockedFetch(data);
  assert.equal((await createWikidataArticleResolver({ fetchImpl }).resolve(identities.morpholine, "en")).status,
    "discordant-identifiers");
});

test("an item grouping another CID or stereochemical key is not an exact identity", async () => {
  const data = fixture(identities.glucose, "Q23905964", { en: "Glucose" });
  data.entities.Q23905964.claims.P662.push(claim(12345));
  const first = mockedFetch(data);
  assert.equal((await createWikidataArticleResolver({ fetchImpl: first.fetchImpl })
    .resolve(identities.glucose, "en")).status, "discordant-identifiers");

  data.entities.Q23905964.claims.P662 = [claim(5793)];
  data.entities.Q23905964.claims.P235.push(claim(identities.morpholine.inchiKey));
  const second = mockedFetch(data);
  assert.equal((await createWikidataArticleResolver({ fetchImpl: second.fetchImpl })
    .resolve(identities.glucose, "en")).status, "discordant-identifiers");
});

test("candidates matching different identifiers separately are not combined", async () => {
  const { fetchImpl } = mockedFetch({
    cidResults: ["Q1"], keyResults: ["Q2"],
    entities: {
      Q1: item(8083, identities.oxirane.inchiKey, { en: "Wrong" }),
      Q2: item(6354, identities.morpholine.inchiKey, { en: "Wrong" }),
    },
  });
  assert.equal((await createWikidataArticleResolver({ fetchImpl }).resolve(identities.morpholine, "en")).status,
    "discordant-identifiers");
});

test("two apparently equivalent verified items are ambiguous", async () => {
  const { fetchImpl } = mockedFetch({
    cidResults: ["Q1", "Q2"], keyResults: ["Q2", "Q1"],
    entities: {
      Q1: item(8083, identities.morpholine.inchiKey, { en: "Morpholine" }),
      Q2: item(8083, identities.morpholine.inchiKey, { en: "Morpholine" }),
    },
  });
  assert.equal((await createWikidataArticleResolver({ fetchImpl }).resolve(identities.morpholine, "en")).status,
    "ambiguous");
});

test("a unique exact item wins over incompatible search hits regardless of order", async () => {
  const { fetchImpl } = mockedFetch({
    cidResults: ["Q1", "Q410243"], keyResults: ["Q410243", "Q2"],
    entities: {
      Q1: item(8083, identities.oxirane.inchiKey),
      Q2: item(6354, identities.morpholine.inchiKey),
      Q410243: item(8083, identities.morpholine.inchiKey, { es: "Morfolina" }),
    },
  });
  const result = await createWikidataArticleResolver({ fetchImpl }).resolve(identities.morpholine, "es");
  assert.equal(result.status, "article");
  assert.equal(result.identity.qid, "Q410243");
});

test("missing evidence is not upgraded to verified identity", async () => {
  const data = fixture(identities.morpholine, "Q410243");
  delete data.entities.Q410243.claims.P235;
  const { fetchImpl } = mockedFetch(data);
  assert.equal((await createWikidataArticleResolver({ fetchImpl }).resolve(identities.morpholine, "es")).status,
    "unverified");
});

test("absent identifiers and absent search hits are distinct", async () => {
  const { fetchImpl, calls } = mockedFetch();
  const resolver = createWikidataArticleResolver({ fetchImpl });
  assert.equal((await resolver.resolve({ cid: 8083 }, "es")).status, "insufficient-identity");
  assert.equal((await resolver.resolve({ inchiKey: identities.morpholine.inchiKey }, "es")).status, "insufficient-identity");
  assert.equal(calls.length, 0);
  assert.equal((await resolver.resolve(identities.morpholine, "es")).status, "not-found");
  assert.equal(calls.length, 2);
});

test("malformed search, entity and sitelink responses are explicit errors", async () => {
  const malformedSearch = mockedFetch({ responseOverride: () => json({ query: {} }) });
  assert.equal((await createWikidataArticleResolver({ fetchImpl: malformedSearch.fetchImpl })
    .resolve(identities.morpholine, "es")).status, "invalid-response");

  const malformedEntity = mockedFetch({
    cidResults: ["Q410243"], keyResults: ["Q410243"],
    responseOverride: (url) => url.searchParams.get("list") === "search"
      ? json({ query: { search: [{ title: "Q410243" }] } }) : json({ entities: [] }),
  });
  assert.equal((await createWikidataArticleResolver({ fetchImpl: malformedEntity.fetchImpl })
    .resolve(identities.morpholine, "es")).status, "invalid-response");

  const data = fixture(identities.morpholine, "Q410243");
  data.entities.Q410243.sitelinks.eswiki = { title: "" };
  const malformedLink = mockedFetch(data);
  assert.equal((await createWikidataArticleResolver({ fetchImpl: malformedLink.fetchImpl })
    .resolve(identities.morpholine, "es")).status, "invalid-response");

  data.entities.Q410243.sitelinks.eswiki = { site: "enwiki", title: "Morpholine" };
  const wrongSite = mockedFetch(data);
  assert.equal((await createWikidataArticleResolver({ fetchImpl: wrongSite.fetchImpl })
    .resolve(identities.morpholine, "es")).status, "invalid-response");
});

test("HTTP and network errors are not cached as missing articles", async () => {
  let attempts = 0;
  const resolver = createWikidataArticleResolver({ fetchImpl: async () => {
    attempts += 1;
    return json({}, 503);
  } });
  assert.equal((await resolver.resolve(identities.morpholine, "es")).status, "service-error");
  assert.equal((await resolver.resolve(identities.morpholine, "es")).status, "service-error");
  assert.equal(attempts, 2);
  const network = createWikidataArticleResolver({ fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal((await network.resolve(identities.morpholine, "es")).status, "service-error");
});

test("abort is passed to fetch and late results are discarded", async () => {
  const controller = new AbortController();
  let release;
  const pendingFetch = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const resolver = createWikidataArticleResolver({ fetchImpl: (_input, init) => {
    calls.push(init);
    return pendingFetch;
  } });
  const pending = resolver.resolve(identities.morpholine, "es", controller.signal);
  controller.abort();
  release(json({ query: { search: [{ title: "Q410243" }] } }));
  assert.equal((await pending).status, "cancelled");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal, controller.signal);
  assert.equal((await resolver.resolve(identities.morpholine, "es", controller.signal)).status, "cancelled");
});

test("each search and the total entity request remain bounded", async () => {
  const candidates = Array.from({ length: 15 }, (_, index) => "Q" + (index + 1));
  const { fetchImpl, calls } = mockedFetch({
    cidResults: candidates, keyResults: [...candidates].reverse(),
    entities: Object.fromEntries(candidates.map((qid) => [qid, item(1, identities.morpholine.inchiKey)])),
  });
  await createWikidataArticleResolver({ fetchImpl }).resolve(identities.morpholine, "es");
  assert.equal(calls.length, 3);
  assert.ok((calls[2].url.searchParams.get("ids")?.split("|").length ?? 0) <= 10);
  assert.equal(calls[0].url.searchParams.get("srlimit"), "5");
  assert.equal(calls[1].url.searchParams.get("srlimit"), "5");
});

test("clearCache removes a verified identity without affecting error behavior", async () => {
  const { fetchImpl, calls } = mockedFetch(fixture(identities.morpholine, "Q410243", { en: "Morpholine" }));
  const resolver = createWikidataArticleResolver({ fetchImpl });
  assert.equal((await resolver.resolve(identities.morpholine, "en")).status, "article");
  assert.equal((await resolver.resolve(identities.morpholine, "en")).status, "article");
  assert.equal(calls.length, 3);
  resolver.clearCache();
  assert.equal((await resolver.resolve(identities.morpholine, "en")).status, "article");
  assert.equal(calls.length, 6);
});
