import assert from "node:assert/strict";
import test from "node:test";

import { createCompoundContextResolver } from "../app/compound-context.ts";

const cases = {
  morpholine: { cid: 8083, key: "YNAVUWVOSKDBBP-UHFFFAOYSA-N", smiles: "O1CCNCC1", qid: "Q410243", links: { es: "Morfolina", en: "Morpholine" } },
  oxirane: { cid: 6354, key: "IAYPIBMASNFSPL-UHFFFAOYSA-N", smiles: "O1CC1", qid: "Q407473", links: { es: "Óxido de etileno", en: "Ethylene oxide" } },
  acid: { cid: 7413, key: "NZNMSOFKMUBTKW-UHFFFAOYSA-N", smiles: "O=C(O)C1CCCCC1", qid: "Q5198713", links: { en: "Cyclohexanecarboxylic acid" } },
  bicyclohexyl: { cid: 7094, key: "WVIIMZNLDWSIRH-UHFFFAOYSA-N", smiles: "C1CCCCC1C2CCCCC2", qid: "Q21099094", links: { en: "Bicyclohexyl" } },
  glucose: { cid: 5793, key: "WQZGKKKJIJFFOK-GASJEMHNSA-N", smiles: "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O", qid: "Q23905964", links: {} },
  oxazinane: { cid: 287364, key: "LQPOOAJESJYDLS-UHFFFAOYSA-N", smiles: "O1CNCCC1", qid: "Q82046256", links: {} },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function claim(value) {
  return { rank: "normal", mainsnak: { datavalue: { value: String(value) } } };
}

function fixtureFetch(record, options = {}) {
  const calls = [];
  let wikiFailures = options.wikiFailures ?? 0;
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (init?.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (url.hostname === "pubchem.ncbi.nlm.nih.gov") {
      if (url.pathname.includes("/property/")) return json({ PropertyTable: { Properties: [{
        IUPACName: record.links.en ?? `CID ${record.cid}`,
        InChIKey: record.key,
        IsomericSMILES: record.smiles,
        MolecularFormula: record.cid === 5793 ? "C6H12O6" : undefined,
      }] } });
      if (url.pathname.includes("/description/")) return json({ InformationList: { Information: [{ Title: record.links.en ?? `CID ${record.cid}` }] } });
    }
    if (url.hostname === "www.wikidata.org") {
      if (url.searchParams.get("list") === "search") return json({ query: { search: [{ title: record.qid }] } });
      assert.equal(url.searchParams.get("action"), "wbgetentities");
      return json({ entities: { [record.qid]: {
        claims: { P662: [claim(record.cid)], P235: [claim(record.key)] },
        sitelinks: Object.fromEntries(Object.entries(record.links).map(([language, title]) => [
          `${language}wiki`, { site: `${language}wiki`, title },
        ])),
      } } });
    }
    if (url.hostname.endsWith(".wikipedia.org")) {
      assert.equal(url.searchParams.get("redirects"), "1");
      assert.equal(url.searchParams.get("ppprop"), "wikibase_item");
      if (wikiFailures-- > 0) return json({}, 503);
      const language = url.hostname.split(".")[0];
      const requestedTitle = url.searchParams.get("titles");
      const title = options.redirectTitle ?? requestedTitle;
      return json({ query: {
        ...(options.redirectTitle ? { redirects: [{ from: requestedTitle, to: title }] } : {}),
        pages: { "1": {
          title,
          fullurl: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
          extract: `${title} is a chemical compound. The page describes its properties.`,
          ...(options.pageQid === null ? {} : { pageprops: { wikibase_item: options.pageQid ?? record.qid } }),
        } },
      } });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return { fetchImpl, calls };
}

function identity(record, names = []) {
  return { cid: record.cid, inchiKey: record.key, canonicalSmiles: record.smiles, names };
}

test("verified PubChem graph, Wikidata item and final page identify morpholine in ES and EN", async () => {
  const { fetchImpl, calls } = fixtureFetch(cases.morpholine);
  const resolver = createCompoundContextResolver({ fetchImpl });
  const es = await resolver.resolve(identity(cases.morpholine), "es");
  const en = await resolver.resolve(identity(cases.morpholine), "en");
  assert.equal(es.pubchem?.cid, 8083);
  assert.equal(es.wikipedia?.title, "Morfolina");
  assert.equal(es.wikipedia?.qid, "Q410243");
  assert.equal(es.wikipedia?.source, "wikidata");
  assert.equal(es.language, "es");
  assert.equal(en.wikipedia?.title, "Morpholine");
  assert.equal(en.language, "en");
  assert.equal(calls.filter(({ url }) => url.hostname === "www.wikidata.org").length, 3, "verified identity is reused on locale change");
  assert.equal(calls.filter(({ url }) => url.pathname.includes("/property/")).length, 1);
});

test("oxirane uses its verified Spanish title and a redirected page with the same QID", async () => {
  const { fetchImpl } = fixtureFetch(cases.oxirane, { redirectTitle: "Óxido de etileno" });
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(cases.oxirane), "es");
  assert.equal(context.wikipedia?.title, "Óxido de etileno");
  assert.equal(context.wikipedia?.qid, "Q407473");
});

test("English-only specific articles stay labeled English in Spanish context", async () => {
  for (const record of [cases.acid, cases.bicyclohexyl]) {
    const { fetchImpl } = fixtureFetch(record);
    const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(record), "es");
    assert.equal(context.wikipedia?.language, "en");
    assert.equal(context.wikipedia?.title, record.links.en);
    assert.equal(context.wikipedia?.qid, record.qid);
    assert.ok(!/Decalin/i.test(context.wikipedia.title));
  }
});

test("no exact sitelink never borrows glucose or morpholine by formula or alias", async () => {
  for (const [record, alias] of [[cases.glucose, "glucosa"], [cases.oxazinane, "morfolina"]]) {
    const { fetchImpl, calls } = fixtureFetch(record);
    const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(record, [alias]), "es");
    assert.equal(context.pubchem?.cid, record.cid);
    assert.equal(context.wikipediaStatus, "no-article");
    assert.equal(context.wikipedia, undefined);
    assert.equal(calls.filter(({ url }) => url.hostname.endsWith(".wikipedia.org")).length, 0);
  }
});

test("wrong or absent destination QID is rejected even when title and extract look correct", async () => {
  for (const pageQid of ["Q999", null]) {
    const { fetchImpl } = fixtureFetch(cases.morpholine, { pageQid });
    const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(cases.morpholine), "es");
    assert.equal(context.wikipedia, undefined);
    assert.equal(context.wikipediaStatus, "identity-mismatch");
  }
});

test("PubChem structural mismatch prevents Wikidata and alias-based article lookup", async () => {
  const { fetchImpl: baseFetch, calls } = fixtureFetch(cases.morpholine);
  const fetchImpl = (input, init) => String(input).includes("/property/")
    ? Promise.resolve(json({ PropertyTable: { Properties: [{ InChIKey: cases.oxirane.key, IsomericSMILES: cases.oxirane.smiles }] } }))
    : baseFetch(input, init);
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(cases.morpholine, ["morfolina"]), "es");
  assert.equal(context.pubchem, undefined);
  assert.equal(context.wikipedia, undefined);
  assert.equal(context.wikipediaStatus, "unverified");
  assert.equal(calls.filter(({ url }) => url.hostname.includes("wikidata") || url.hostname.includes("wikipedia")).length, 0);
});

test("article retrieval errors are not cached as permanent absence", async () => {
  const { fetchImpl, calls } = fixtureFetch(cases.morpholine, { wikiFailures: 3 });
  const resolver = createCompoundContextResolver({ fetchImpl });
  const first = await resolver.resolve(identity(cases.morpholine), "es");
  assert.equal(first.wikipediaStatus, "retrieval-error");
  assert.equal(first.wikipedia, undefined);
  const second = await resolver.resolve(identity(cases.morpholine), "es");
  assert.equal(second.wikipedia?.qid, "Q410243");
  assert.ok(calls.filter(({ url }) => url.hostname === "es.wikipedia.org").length >= 4);
});

test("cancellation rejects a late result and a later molecule receives only its own article", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const morpholineFetch = fixtureFetch(cases.morpholine);
  const oxiraneFetch = fixtureFetch(cases.oxirane);
  const fetchImpl = async (input, init) => {
    const url = String(input);
    if (url.includes("/cid/8083/property/")) {
      await gate;
      // Deliberately ignore AbortSignal, as a late remote response can do.
      return morpholineFetch.fetchImpl(input, { ...init, signal: undefined });
    }
    return url.includes("/cid/8083/") || url.includes("haswbstatement%3AP662%3D8083")
      ? morpholineFetch.fetchImpl(input, init)
      : oxiraneFetch.fetchImpl(input, init);
  };
  const resolver = createCompoundContextResolver({ fetchImpl });
  const controller = new AbortController();
  const old = resolver.resolve(identity(cases.morpholine), "en", controller.signal);
  controller.abort();
  release();
  await assert.rejects(old, { name: "AbortError" });
  const current = await resolver.resolve(identity(cases.oxirane), "es");
  assert.equal(current.wikipedia?.qid, "Q407473");
  assert.equal(current.wikipedia?.title, "Óxido de etileno");
});
