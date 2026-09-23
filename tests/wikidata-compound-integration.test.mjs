import assert from "node:assert/strict";
import test from "node:test";

import { createCompoundContextResolver } from "../app/compound-context.ts";
import { externalInfoUnavailableReason, shouldShowExternalInfo } from "../app/external-info-state.ts";

const cases = {
  morpholine: { cid: 8083, key: "YNAVUWVOSKDBBP-UHFFFAOYSA-N", smiles: "O1CCNCC1", qid: "Q410243", links: { es: "Morfolina", en: "Morpholine" } },
  oxirane: { cid: 6354, key: "IAYPIBMASNFSPL-UHFFFAOYSA-N", smiles: "O1CC1", qid: "Q407473", links: { es: "Óxido de etileno", en: "Ethylene oxide" } },
  acid: { cid: 7413, key: "NZNMSOFKMUBTKW-UHFFFAOYSA-N", smiles: "O=C(O)C1CCCCC1", qid: "Q5198713", links: { en: "Cyclohexanecarboxylic acid" } },
  bicyclohexyl: { cid: 7094, key: "WVIIMZNLDWSIRH-UHFFFAOYSA-N", smiles: "C1CCCCC1C2CCCCC2", qid: "Q21099094", links: { en: "Bicyclohexyl" } },
  glucose: { cid: 5793, key: "WQZGKKKJIJFFOK-GASJEMHNSA-N", smiles: "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O", qid: "Q23905964", links: {}, iupacName: "(3R,4S,5S,6R)-6-(hydroxymethyl)oxane-2,3,4,5-tetrol" },
  openGlucose: { cid: 107526, key: "GZCGUPFRVQAUEE-SLPGGIOYSA-N", smiles: "OC[C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O", qid: "Q21036645", links: {}, iupacName: "(2R,3S,4R,5R)-2,3,4,5,6-pentahydroxyhexanal" },
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
      if (url.pathname.includes("/cids/JSON")) return json({ IdentifierList: { CID: [record.cid] } });
      if (url.pathname.includes("/property/")) return json({ PropertyTable: { Properties: [{
        IUPACName: record.iupacName ?? record.links.en ?? `CID ${record.cid}`,
        InChIKey: record.key,
        IsomericSMILES: record.smiles,
        MolecularFormula: record.cid === 5793 || record.cid === 107526 ? "C6H12O6" : undefined,
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
  const progress = [];
  const es = await resolver.resolve(identity(cases.morpholine), "es", undefined, (context) => progress.push(context));
  const en = await resolver.resolve(identity(cases.morpholine), "en");
  assert.equal(progress[0].pubchem?.cid, 8083);
  assert.equal(progress[0].wikipedia, undefined);
  assert.equal(es.pubchem?.cid, 8083);
  assert.equal(es.wikipedia?.url, "https://es.wikipedia.org/wiki/Morfolina");
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
    assert.equal(context.pubchem?.inchiKey, record.key);
    if (record === cases.glucose) {
      assert.equal(context.pubchem?.iupacName, record.iupacName);
      assert.equal(context.pubchem?.molecularFormula, "C6H12O6");
    }
    assert.equal(context.wikipediaStatus, "no-article");
    assert.equal(context.wikipedia, undefined);
    assert.equal(calls.filter(({ url }) => url.hostname.endsWith(".wikipedia.org")).length, 0);
  }
});

test("open and cyclic D-glucose resolve distinct structurally verified CIDs", async () => {
  for (const record of [cases.openGlucose, cases.glucose]) {
    const { fetchImpl, calls } = fixtureFetch(record);
    const context = await createCompoundContextResolver({ fetchImpl }).resolve({ canonicalSmiles: record.smiles }, "es");
    assert.equal(context.pubchemStatus, "verified");
    assert.equal(context.pubchem?.cid, record.cid);
    assert.equal(context.pubchem?.inchiKey, record.key);
    assert.equal(context.pubchem?.molecularFormula, "C6H12O6");
    assert.equal(context.wikipediaStatus, "no-article");
    assert.equal(context.wikipedia, undefined);
    assert.ok(calls.some(({ url }) => url.pathname.includes("/smiles/") && url.pathname.endsWith("/cids/JSON")));
    assert.ok(calls.some(({ url }) => url.pathname.includes(`/cid/${record.cid}/property/`)));
    assert.ok(!calls.some(({ url }) => url.pathname.includes(`/cid/${record === cases.openGlucose ? 5793 : 107526}/property/`)));
  }
});

test("a cyclic CID returned for the open glucose graph is rejected", async () => {
  const { fetchImpl } = fixtureFetch(cases.glucose);
  const context = await createCompoundContextResolver({ fetchImpl }).resolve({ canonicalSmiles: cases.openGlucose.smiles }, "es");
  assert.equal(context.pubchemStatus, "identity-mismatch");
  assert.equal(context.pubchem, undefined);
  assert.equal(context.wikipedia, undefined);
});

test("PubChem HTTP 500 leaves a visible temporary state and can recover on a manual retry", async () => {
  const { fetchImpl: baseFetch } = fixtureFetch(cases.openGlucose);
  let failing = true;
  let pubchemRequests = 0;
  let wikidataRequests = 0;
  const fetchImpl = (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "pubchem.ncbi.nlm.nih.gov") {
      pubchemRequests += 1;
      if (failing) return Promise.resolve(json({}, 500));
    }
    if (url.hostname === "www.wikidata.org") wikidataRequests += 1;
    return baseFetch(input, init);
  };
  const resolver = createCompoundContextResolver({ fetchImpl });
  const failed = await resolver.resolve({ canonicalSmiles: cases.openGlucose.smiles }, "es");
  assert.equal(failed.pubchemStatus, "retrieval-error");
  assert.equal(failed.pubchem, undefined);
  assert.equal(failed.wikipedia, undefined);
  assert.equal(externalInfoUnavailableReason(failed), "temporary");
  assert.equal(shouldShowExternalInfo(true, false, failed), true);
  assert.equal(pubchemRequests, 3, "automatic attempts are bounded");
  assert.equal(wikidataRequests, 0, "Wikidata requires verified PubChem identity");

  failing = false;
  const recovered = await resolver.resolve({ canonicalSmiles: cases.openGlucose.smiles }, "es");
  assert.equal(recovered.pubchemStatus, "verified");
  assert.equal(recovered.pubchem?.cid, 107526);
  assert.equal(recovered.wikipediaStatus, "no-article");
  assert.equal(externalInfoUnavailableReason(recovered), null);
  assert.equal(shouldShowExternalInfo(true, false, recovered), true);
});

test("a failed optional PubChem description keeps validated structural properties", async () => {
  const { fetchImpl: baseFetch } = fixtureFetch(cases.openGlucose);
  const fetchImpl = (input, init) => String(input).includes("/description/")
    ? Promise.resolve(json({}, 500))
    : baseFetch(input, init);
  const context = await createCompoundContextResolver({ fetchImpl }).resolve({ canonicalSmiles: cases.openGlucose.smiles }, "es");
  assert.equal(context.pubchemStatus, "verified");
  assert.equal(context.pubchem?.cid, 107526);
  assert.equal(context.pubchem?.recordTitle, undefined);
});

test("wrong or absent destination QID is rejected even when title and extract look correct", async () => {
  for (const pageQid of ["Q999", null]) {
    const { fetchImpl } = fixtureFetch(cases.morpholine, { pageQid });
    const context = await createCompoundContextResolver({ fetchImpl }).resolve(identity(cases.morpholine), "es");
    assert.equal(context.wikipedia, undefined);
    assert.equal(context.wikipediaStatus, "identity-mismatch");
    assert.equal(context.pubchem?.cid, cases.morpholine.cid);
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
  assert.equal(first.pubchem?.cid, cases.morpholine.cid);
  const second = await resolver.resolve(identity(cases.morpholine), "es");
  assert.equal(second.wikipedia?.qid, "Q410243");
  assert.ok(calls.filter(({ url }) => url.hostname === "es.wikipedia.org").length >= 4);
});

test("publishes verified PubChem while Wikipedia is pending and retains it on cancellation", async () => {
  let releaseWikipedia;
  const wikipediaGate = new Promise((resolve) => { releaseWikipedia = resolve; });
  const { fetchImpl: baseFetch } = fixtureFetch(cases.morpholine);
  const fetchImpl = async (input, init) => {
    if (String(input).includes("wikidata.org")) await wikipediaGate;
    return baseFetch(input, init);
  };
  const controller = new AbortController();
  const snapshots = [];
  const pending = createCompoundContextResolver({ fetchImpl }).resolve(
    identity(cases.morpholine), "es", controller.signal, (context) => snapshots.push(context),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].pubchem?.cid, cases.morpholine.cid);
  assert.equal(snapshots[0].wikipedia, undefined);
  controller.abort();
  releaseWikipedia();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(snapshots[0].pubchem?.cid, cases.morpholine.cid);
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
  const oldProgress = [];
  const old = resolver.resolve(identity(cases.morpholine), "en", controller.signal, (context) => oldProgress.push(context));
  controller.abort();
  release();
  await assert.rejects(old, { name: "AbortError" });
  const currentProgress = [];
  const current = await resolver.resolve(identity(cases.oxirane), "es", undefined, (context) => currentProgress.push(context));
  assert.equal(oldProgress.length, 0);
  assert.equal(currentProgress[0].pubchem?.cid, cases.oxirane.cid);
  assert.equal(currentProgress[0].identityKey, current.identityKey);
  assert.equal(current.wikipedia?.qid, "Q407473");
  assert.equal(current.wikipedia?.title, "Óxido de etileno");
});
