import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";

import { calculateSemiDevelopedLayout } from "../app/semi-developed-layout.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
let server;
let SemiDevelopedAtomSvg;
let getSemiDevelopedAtomBadgeRadius;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [reactPlugin()],
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, hmr: false },
  });
  ({ SemiDevelopedAtomSvg, getSemiDevelopedAtomBadgeRadius } =
    await server.ssrLoadModule("/app/semi-developed-svg-renderer.tsx"));
});

after(async () => {
  await server?.close();
});

function renderAtom({ element = "C", label, hydrogenSubscript, charge = "", selected = false }) {
  const markup = renderToStaticMarkup(React.createElement(SemiDevelopedAtomSvg, {
    glyph: { atomId: 1, element, hydrogens: hydrogenSubscript ?? 0, charge: 0, carbonGroup: null },
    label,
    hydrogenSubscript,
    charge,
    selected,
    functionalGroupScale: 1,
  }));
  const hitTarget = markup.match(/<circle class="semi-developed-hit-target"[^>]*>/)?.[0];
  assert.ok(hitTarget, `rendered ${label} badge has one pointer target`);
  const hitCount = (markup.match(/class="semi-developed-hit-target"/g) ?? []).length;
  assert.equal(hitCount, 1);
  return { markup, hitTarget };
}

test("rendered badges size one invisible editor hit target from the visible badge radius", () => {
  const cases = [
    { label: "C" },
    { label: "CH", hydrogenSubscript: 1 },
    { label: "CH", hydrogenSubscript: 2 },
    { label: "CH", hydrogenSubscript: 3 },
    { label: "CH", hydrogenSubscript: 4 },
    { element: "O", label: "O" },
    { element: "O", label: "OH" },
    { element: "Cl", label: "Cl" },
  ];

  for (const entry of cases) {
    const { markup, hitTarget } = renderAtom(entry);
    const visibleRadius = getSemiDevelopedAtomBadgeRadius(entry.label, entry.hydrogenSubscript);
    const hitRadius = Number(hitTarget.match(/\br="([\d.]+)"/)?.[1]);
    assert.equal(Number(markup.match(/class="atom-circle semi-developed-label-background[^>]* r="([\d.]+)"/)?.[1]), visibleRadius);
    assert.equal(hitRadius, visibleRadius + 4);
    assert.match(hitTarget, /data-editor-only="true"/);
    assert.match(hitTarget, /aria-hidden="true"/);
    assert.match(hitTarget, /pointer-events="all"/);
    assert.ok(markup.indexOf("class=\"semi-developed-hit-target\"") > markup.indexOf("class=\"semi-developed-label-background"));
    assert.doesNotMatch(hitTarget, /role=|aria-label=/);
  }
});

test("atom hit target stays smaller than the selection ring and does not swallow a chain bond", () => {
  const { hitTarget } = renderAtom({ label: "CH", hydrogenSubscript: 1, selected: true });
  const hitRadius = Number(hitTarget.match(/\br="([\d.]+)"/)?.[1]);
  const selectionRadius = Number(renderAtom({ label: "CH", hydrogenSubscript: 1, selected: true })
    .markup.match(/class="selection-ring" r="([\d.]+)"/)?.[1]);
  assert.ok(hitRadius < selectionRadius);

  const chain = {
    atoms: [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }],
    bonds: [[1, 2, 1]],
  };
  const positions = calculateSemiDevelopedLayout(chain);
  const separation = Math.hypot(positions.get(2).x - positions.get(1).x, positions.get(2).y - positions.get(1).y);
  const exposedBondLength = separation - 2 * hitRadius;
  assert.ok(exposedBondLength > 30, `bond keeps an exposed clickable segment (${exposedBondLength})`);

  const branch = {
    atoms: [1, 2, 3, 4].map((id) => ({ id, x: id, y: 0 })),
    bonds: [[1, 2, 1], [2, 3, 1], [2, 4, 1]],
  };
  const branchPositions = calculateSemiDevelopedLayout(branch);
  const center = branchPositions.get(2);
  for (const neighborId of [1, 3, 4]) {
    const neighbor = branchPositions.get(neighborId);
    assert.ok(Math.hypot(neighbor.x - center.x, neighbor.y - center.y) > 2 * hitRadius);
  }
});

test("node hit targets are above bond targets and reuse the existing atom event owner", () => {
  const bondLayerIndex = page.indexOf('className="bond-hit-target"');
  const nodeLayerIndex = page.indexOf('<g className="molecule-nodes-layer">');
  const rendererIndex = page.indexOf("<SemiDevelopedAtomSvg", nodeLayerIndex);
  assert.ok(bondLayerIndex >= 0 && nodeLayerIndex > bondLayerIndex && rendererIndex > nodeLayerIndex);

  const atomOwner = page.slice(page.indexOf("className={`carbon-node"), rendererIndex);
  assert.match(atomOwner, /onClick=\{\(event\) => \{/);
  assert.match(atomOwner, /if \(placementTool\) \{\s*event\.stopPropagation\(\);[\s\S]*?addAlkylGroup\(placementTool\.template, atom\.id\)[\s\S]*?addFunctionalGroup\(placementTool\.template, atom\.id\)[\s\S]*?loadRingTemplate\(placementTool\.template, placementTool\.mode, atom\.id\)/);
  assert.match(atomOwner, /setSelectedId\(atom\.id\)/);
  assert.match(atomOwner, /onKeyDown=\{\(event\) => \{/);

  const bondStart = page.indexOf("className={`bond-control");
  const bondEnd = page.indexOf("className=\"bond-hit-target\"", bondStart);
  assert.ok(bondStart >= 0 && bondEnd > bondStart);
  assert.match(page.slice(bondStart, bondEnd), /onClick=\{\(event\) => \{/);
  assert.match(page.slice(bondStart, bondEnd), /changeBondOrderFromInput\(a, b, undefined, event\.altKey\)/);
  assert.match(styles, /\.semi-developed-hit-target\s*\{[^}]*pointer-events:\s*all;[^}]*cursor:\s*pointer;/s);
  assert.match(page, /"\[class\*='hit-target'\]"/);
  assert.match(page, /querySelectorAll\(SVG_EXPORT_INTERFACE_SELECTOR\)\.forEach\(\(element\) => element\.remove\(\)\)/);
});
