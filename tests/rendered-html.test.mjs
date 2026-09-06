import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;
const googleAnalyticsTag = /https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-FZ76EQBG32/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, developmentPreviewMeta);
  assert.match(html, googleAnalyticsTag);
  assert.match(html, /gtag\(['"]config['"],\s*analyticsMeasurementId/i);
  assert.match(html, /debug_mode:\s*analyticsDebugMode/i);

  const bondsLayerIndex = html.indexOf('class="molecule-bonds-layer"');
  const nodesLayerIndex = html.indexOf('class="molecule-nodes-layer"');
  assert.ok(bondsLayerIndex >= 0, "the SVG includes a dedicated bond layer");
  assert.ok(nodesLayerIndex > bondsLayerIndex, "atom nodes render above every bond");
});

test("GitHub Pages entries include the same debuggable Google tag", async () => {
  for (const entry of ["../pages-src/index.html", "../pages-src/es/index.html", "../pages-src/en/index.html"]) {
    const html = await readFile(new URL(entry, import.meta.url), "utf8");
    assert.match(html, googleAnalyticsTag, entry);
    assert.match(html, /debug_mode:\s*analyticsDebugMode/i, entry);
    assert.match(html, /gtag\.js (?:bloqueado|was blocked)/i, entry);
    assert.match(html, /Evento de prueba enviado|Test event sent/i, entry);
  }
});
