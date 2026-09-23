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
          extract: options.extract?.[language] ?? `${title} is a chemical compound. The page describes its properties.`,
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

test("removes Wikipedia's layout aside from the Spanish morpholine extract before summarizing", async () => {
  const extract = "La morfolina es un compuesto químico orgánico de fórmula O(CH2CH2)2NH. Este heterociclo, cuya imagen se muestra a la derecha, contiene tanto el grupo funcional amino como el éter.";
  const { fetchImpl } = fixtureFetch(cases.morpholine, { extract: { es: extract } });
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(cases.morpholine), "es");

  assert.equal(context.wikipedia?.summary, "La morfolina es un compuesto químico orgánico de fórmula O(CH2CH2)2NH. Este heterociclo contiene tanto el grupo funcional amino como el éter.");
  assert.equal(context.wikipedia?.url, "https://es.wikipedia.org/wiki/Morfolina");
});

test("removes equivalent English and vertical image asides without changing chemistry", async () => {
  const extract = "Morpholine has the formula O(CH2CH2)2NH. This heterocycle, pictured on the left, contains both amine and ether groups.";
  const { fetchImpl } = fixtureFetch(cases.morpholine, { extract: { en: extract } });
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(cases.morpholine), "en");
  assert.equal(context.wikipedia?.summary, "Morpholine has the formula O(CH2CH2)2NH. This heterocycle contains both amine and ether groups.");
  assert.equal(context.wikipedia?.url, "https://en.wikipedia.org/wiki/Morpholine");

  for (const [language, aside] of [["es", "en la imagen superior"], ["es", "en la imagen inferior"], ["en", "shown on the right"]]) {
    const sentence = language === "es"
      ? `El compuesto, ${aside}, contiene oxígeno.`
      : `The compound, ${aside}, contains oxygen.`;
    const { fetchImpl: verticalFetch } = fixtureFetch(cases.morpholine, { extract: { [language]: sentence } });
    const vertical = await createCompoundContextResolver({ fetchImpl: verticalFetch }).resolve(identity(cases.morpholine), language);
    assert.equal(vertical.wikipedia?.summary, language === "es" ? "El compuesto contiene oxígeno." : "The compound contains oxygen.");
  }
});

test("keeps plain extracts and scientific direction words while respecting the summary limit", async () => {
  const plain = "El enlace de la derecha conserva su orientación. El sustituyente, a la derecha del carbono central, mantiene la fórmula O(CH2CH2)2NH.";
  const { fetchImpl } = fixtureFetch(cases.morpholine, { extract: { es: plain } });
  const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(cases.morpholine), "es");
  assert.equal(context.wikipedia?.summary, plain);

  const longExtract = `Morpholine, shown on the right, has formula O(CH2CH2)2NH and ${"chemical properties ".repeat(35)}. A third sentence is excluded.`;
  const { fetchImpl: longFetch } = fixtureFetch(cases.morpholine, { extract: { en: longExtract } });
  const long = await createCompoundContextResolver({ fetchImpl: longFetch }).resolve(identity(cases.morpholine), "en");
  assert.ok(long.wikipedia?.summary.startsWith("Morpholine has formula O(CH2CH2)2NH"));
  assert.ok(long.wikipedia?.summary.length <= 420);
  assert.ok(long.wikipedia?.summary.endsWith("…"));
  assert.ok(!long.wikipedia?.summary.includes("A third sentence"));
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
