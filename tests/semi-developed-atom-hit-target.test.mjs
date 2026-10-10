import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import reactPlugin from "@vitejs/plugin-react";
import { createServer } from "vite";

import { calculateSemiDevelopedLayout } from "../app/semi-developed-layout.ts";
import { clipSemiDevelopedBondSegments } from "../app/semi-developed-bond-geometry.ts";
import { getSemiDevelopedLabelExtent } from "../app/semi-developed-label-geometry.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
let server;
let SemiDevelopedAtomSvg;

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
  ({ SemiDevelopedAtomSvg } =
    await server.ssrLoadModule("/app/semi-developed-svg-renderer.tsx"));
});

after(async () => {
  await server?.close();
});

function renderAtom({ label, hydrogenSubscript, charge = "", selected = false, scale = 1 }) {
  const markup = renderToStaticMarkup(React.createElement(SemiDevelopedAtomSvg, {
    label,
    hydrogenSubscript,
    charge,
    selected,
    labelScale: scale,
  }));
  const hitTarget = markup.match(/<circle class="semi-developed-hit-target"[^>]*>/)?.[0];
  assert.ok(hitTarget, `rendered ${label} badge has one pointer target`);
  const hitCount = (markup.match(/class="semi-developed-hit-target"/g) ?? []).length;
  assert.equal(hitCount, 1);
  return { markup, hitTarget };
}

test("text-first atoms have no permanent badge and retain one invisible editor hit target", () => {
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
    const hitRadius = Number(hitTarget.match(/\br="([\d.]+)"/)?.[1]);
    const extent = getSemiDevelopedLabelExtent(entry.label, entry.hydrogenSubscript, "", 1);
    assert.match(markup, /class="atom-label semi-developed-label"/);
    assert.doesNotMatch(markup, /semi-developed-label-background|semi-developed-hetero-badge/);
    assert.equal(hitRadius, extent.hitRadius);
    assert.match(hitTarget, /data-editor-only="true"/);
    assert.match(hitTarget, /aria-hidden="true"/);
    assert.match(hitTarget, /pointer-events="all"/);
    assert.ok(markup.indexOf("class=\"semi-developed-hit-target\"") > markup.indexOf("class=\"atom-label semi-developed-label\""));
    assert.doesNotMatch(hitTarget, /role=|aria-label=/);
  }
});

test("selection and hover cues are editor-only while the hit target leaves exposed bond space", () => {
  const { hitTarget } = renderAtom({ label: "CH", hydrogenSubscript: 1, selected: true });
  const hitRadius = Number(hitTarget.match(/\br="([\d.]+)"/)?.[1]);
  const selectionRadius = Number(renderAtom({ label: "CH", hydrogenSubscript: 1, selected: true })
    .markup.match(/class="selection-ring semi-developed-selection-ring"[^>]* r="([\d.]+)"/)?.[1]);
  const markup = renderAtom({ label: "CH", hydrogenSubscript: 1, selected: true }).markup;
  assert.ok(hitRadius < selectionRadius);
  assert.match(markup, /class="semi-developed-hover-ring" data-editor-only="true"/);
  assert.match(markup, /class="selection-ring semi-developed-selection-ring" data-editor-only="true"/);
  assert.match(styles, /\.semi-developed-node:hover \.semi-developed-hover-ring[\s\S]*?stroke: rgba\(76, 155, 135, 0\.34\)/);
  assert.match(styles, /\.semi-developed-node\.selected \.semi-developed-hover-ring\s*\{\s*display: none;/);

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

test("bond clipping follows each label width and keeps double strokes clear", () => {
  const start = { x: 0, y: 0 }, end = { x: 142, y: 0 };
  const rawDouble = [
    { x: 0, y: -3, x2: 142, y2: -3 },
    { x: 0, y: 3, x2: 142, y2: 3 },
  ];
  const methyl = getSemiDevelopedLabelExtent("CH", 3);
  const chloride = getSemiDevelopedLabelExtent("Cl");
  const clipped = clipSemiDevelopedBondSegments(rawDouble, start, end, methyl, chloride);
  assert.equal(clipped.length, 2);
  assert.ok(Math.abs(clipped[0].x - clipped[1].x) < 1e-8, "parallel strokes share a balanced text clearance");
  assert.ok(clipped[0].x >= methyl.halfWidth + 7.9 && clipped[0].x <= methyl.halfWidth + 8.1, "CH3 endpoint leaves the configured text clearance without retaining the old badge gap");
  const chlorideClearance = end.x - clipped[0].x2;
  assert.ok(chlorideClearance >= chloride.halfWidth + 7.9 && chlorideClearance <= chloride.halfWidth + 8.1, "Cl endpoint uses its own text extent");
  assert.ok(Math.hypot(clipped[0].x2 - clipped[0].x, clipped[0].y2 - clipped[0].y) > 80);
});

test("scaled labels stay inside their atom targets and selection rings at 75–175%", () => {
  for (const scale of [0.75, 1, 1.25, 1.5, 1.75]) {
    const { markup, hitTarget } = renderAtom({ label: "CH", hydrogenSubscript: 3, scale, selected: true });
    const extent = getSemiDevelopedLabelExtent("CH", 3, "", scale);
    const hitRadius = Number(hitTarget.match(/\br="([\d.]+)"/)?.[1]);
    const selectionRadius = Number(markup.match(/class="selection-ring semi-developed-selection-ring"[^>]* r="([\d.]+)"/)?.[1]);
    assert.equal(hitRadius, extent.hitRadius);
    assert.ok(hitRadius >= extent.halfWidth + 8);
    assert.ok(selectionRadius > extent.halfWidth);
    if (scale !== 1) assert.match(markup, new RegExp(`scale\\(${scale}\\)`));
  }
});

test("node hit targets are above bond targets and reuse the existing atom event owner", () => {
  const bondLayerIndex = page.indexOf('className="bond-hit-target"');
  const nodeLayerIndex = page.indexOf('<g className="molecule-nodes-layer"');
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
  assert.match(page, /"\[data-editor-only='true'\]"/);
  assert.match(styles, /html\[data-theme="dark"\] \.semi-developed-node:hover \.semi-developed-hover-ring/);
});
