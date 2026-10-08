import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { uiText } from "../app/i18n.ts";
import { clipSemiDevelopedBondSegments, SEMI_DEVELOPED_BOND_LABEL_GAP } from "../app/semi-developed-bond-geometry.ts";
import {
  DEFAULT_SEMI_DEVELOPED_LABEL_SCALE,
  getSemiDevelopedLabelExtent,
  normalizeSemiDevelopedLabelScale,
  SEMI_DEVELOPED_LABEL_SCALE_OPTIONS,
} from "../app/semi-developed-label-geometry.ts";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../app/semi-developed-svg-renderer.tsx", import.meta.url), "utf8");
const skeletalGeometry = readFileSync(new URL("../app/skeletal-bond-geometry.ts", import.meta.url), "utf8");

test("the supported Semi-developed label scales are discrete and default to 125%", () => {
  assert.equal(uiText("en", "Semides."), "Semi-dev.");
  assert.equal(uiText("en", "Vista semidesarrollada"), "Semi-developed structural view");
  assert.deepEqual(SEMI_DEVELOPED_LABEL_SCALE_OPTIONS, [0.75, 1, 1.25, 1.5, 1.75]);
  assert.equal(DEFAULT_SEMI_DEVELOPED_LABEL_SCALE, 1.25);
  assert.equal(normalizeSemiDevelopedLabelScale("1.5"), 1.5);
  for (const invalid of [NaN, 0, -1, 9999, "not-a-scale", "125%", 1.1]) {
    assert.equal(normalizeSemiDevelopedLabelScale(invalid), DEFAULT_SEMI_DEVELOPED_LABEL_SCALE);
  }
});

test("all supported scales keep a clickable bond segment and clear the complete CH3 label", () => {
  const start = { x: 0, y: 0 }, end = { x: 142, y: 0 };
  const raw = [{ x: 0, y: 0, x2: 142, y2: 0 }];
  let previousWidth = 0;
  for (const scale of SEMI_DEVELOPED_LABEL_SCALE_OPTIONS) {
    const extent = getSemiDevelopedLabelExtent("CH", 3, "", scale);
    const clipped = clipSemiDevelopedBondSegments(raw, start, end, extent, extent)[0];
    const startGap = clipped.x - extent.halfWidth;
    const endGap = end.x - clipped.x2 - extent.halfWidth;
    const exposedLength = clipped.x2 - clipped.x;
    assert.ok(extent.halfWidth > previousWidth, `${scale} grows the label extent`);
    assert.ok(extent.hitRadius >= extent.halfWidth + 8, `${scale} hit target covers the text plus pointer padding`);
    assert.ok(Math.abs(startGap - SEMI_DEVELOPED_BOND_LABEL_GAP) < 1e-8, `${scale} start gap`);
    assert.ok(Math.abs(endGap - SEMI_DEVELOPED_BOND_LABEL_GAP) < 1e-8, `${scale} end gap`);
    assert.ok(exposedLength > 60, `${scale} preserves a usable exposed bond segment (${exposedLength})`);
    previousWidth = extent.halfWidth;
  }
  assert.equal(SEMI_DEVELOPED_BOND_LABEL_GAP, 8);
});

test("subscripts and heteroatom text contribute to the shared label footprint", () => {
  const at100 = getSemiDevelopedLabelExtent("CH", 3, "", 1);
  const withoutSubscript = getSemiDevelopedLabelExtent("CH", undefined, "", 1);
  const oxygen = getSemiDevelopedLabelExtent("O", undefined, "", 1);
  const chlorine = getSemiDevelopedLabelExtent("Cl", undefined, "", 1);
  assert.ok(at100.halfWidth > withoutSubscript.halfWidth, "CH3 includes its subscript width");
  assert.ok(at100.halfWidth > chlorine.halfWidth, "CH3 is wider than Cl");
  assert.ok(chlorine.halfWidth > oxygen.halfWidth, "Cl receives more clearance than O");
  assert.ok(getSemiDevelopedLabelExtent("OH", undefined, "", 1.5).halfWidth > getSemiDevelopedLabelExtent("OH", undefined, "", 1).halfWidth);
  assert.ok(getSemiDevelopedLabelExtent("N", undefined, "+", 1.75).halfHeight > getSemiDevelopedLabelExtent("N", undefined, "+", 1).halfHeight);
});

test("text clearance is orientation-aware for vertical and diagonal bonds", () => {
  const extent = getSemiDevelopedLabelExtent("CH", 3, "", 1.25);
  const start = { x: 0, y: 0 };
  for (const end of [{ x: 0, y: 142 }, { x: 100, y: 100 }]) {
    const length = Math.hypot(end.x, end.y);
    const clipped = clipSemiDevelopedBondSegments(
      [{ x: start.x, y: start.y, x2: end.x, y2: end.y }],
      start,
      end,
      extent,
      extent,
    )[0];
    const ux = end.x / length, uy = end.y / length;
    const expectedTrim = Math.min(
      extent.halfWidth / Math.abs(ux),
      extent.halfHeight / Math.abs(uy),
    ) + SEMI_DEVELOPED_BOND_LABEL_GAP;
    assert.ok(Math.abs(Math.hypot(clipped.x, clipped.y) - expectedTrim) < 1e-8);
    assert.ok(Math.hypot(clipped.x2 - clipped.x, clipped.y2 - clipped.y) > 0);
  }
});

test("the preference persists locally and is isolated from Skeletal and numbering scales", () => {
  assert.equal(uiText("es", "Tamaño semidesarrollado"), "Tamaño semidesarrollado");
  assert.equal(uiText("en", "Tamaño semidesarrollado"), "Semi-developed size");
  assert.match(page, /hydrocarbonLab\.semiDevelopedLabelScale\.v1/);
  assert.match(page, /normalizeSemiDevelopedLabelScale\(stored\)/);
  assert.match(page, /localStorage\.setItem\(SEMI_DEVELOPED_LABEL_SCALE_STORAGE_KEY, String\(semiDevelopedLabelScale\)\)/);
  assert.match(page, /viewMode === "semi-developed" && \([\s\S]*?Tamaño semidesarrollado[\s\S]*?semiDevelopedLabelScale/);
  assert.match(page, /viewMode === "skeletal" && \([\s\S]*?Tamaño de grupos funcionales/);
  assert.match(page, /numberingGeometry = getSkeletalNumberBadgeGeometry\(numberingScale\)/);
  assert.match(page, /<SemiDevelopedAtomSvg[\s\S]*?labelScale=\{semiDevelopedLabelScale\}/);
  assert.match(renderer, /getSemiDevelopedLabelExtent\([\s\S]*?labelScale/);
  assert.match(renderer, /<g transform=\{labelScale === 1 \? undefined : `scale\(\$\{labelScale\}\)`\}>[\s\S]*?<text[\s\S]*?hydrogen-subscript[\s\S]*?atom-charge/);
  const moleculeType = page.slice(page.indexOf("type Molecule ="), page.indexOf("type PubChemStructureIdentity"));
  assert.doesNotMatch(moleculeType, /semiDevelopedLabelScale/);
  assert.doesNotMatch(skeletalGeometry, /semi-developed-label-scale|semiDevelopedLabelScale/);
  assert.match(page, /const visualExtents = \[\.\.\.numberingBadgeExtents, \.\.\.atomLabelExtents/);
  assert.match(page, /getSemiDevelopedBounds\(displayPositions\.values\(\), \{[\s\S]*?extents: visualExtents/);
});
