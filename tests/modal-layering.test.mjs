import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const layer = (name) => {
  const match = css.match(new RegExp(`--layer-${name}:\\s*(\\d+)`));
  assert.ok(match, `missing --layer-${name}`);
  return Number(match[1]);
};

test("global layer tokens order workspace, expanded canvas and modal content", () => {
  const levels = [
    layer("workspace-sticky"),
    layer("workspace-floating"),
    layer("expanded-backdrop"),
    layer("expanded-content"),
    layer("modal-backdrop"),
    layer("modal-content"),
    layer("modal-popover"),
  ];
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
  assert.equal(new Set(levels).size, levels.length);

  assert.match(css, /\.iupac-dock\s*\{[^}]*z-index:\s*var\(--layer-workspace-floating\)/s);
  assert.match(css, /\.construction-context-slot\s*\{[^}]*z-index:\s*var\(--layer-workspace-sticky\)/s);
  assert.match(css, /\.canvas-expand-scrim\s*\{[^}]*z-index:\s*var\(--layer-expanded-backdrop\)/s);
  assert.match(css, /\.molecule-workspace\.is-expanded\s*\{[^}]*z-index:\s*var\(--layer-expanded-content\)/s);
  assert.match(css, /\.history-overlay\s*\{[^}]*z-index:\s*var\(--layer-modal-backdrop\)/s);
  assert.match(css, /\.history-overlay\s*\{[^}]*inset:\s*0;[^}]*width:\s*100vw/s);
  assert.match(css, /\.history-drawer\s*\{[^}]*z-index:\s*var\(--layer-modal-content\)/s);
  assert.match(css, /\.png-export-overlay\s*\{[^}]*z-index:\s*var\(--layer-modal-backdrop\)/s);
  assert.match(css, /\.png-export-overlay\s*\{[^}]*inset:\s*0;[^}]*width:\s*100vw/s);
  assert.match(css, /\.canvas-expand-scrim\s*\{[^}]*inset:\s*0;[^}]*width:\s*100vw;[^}]*height:\s*100dvh/s);
  assert.match(css, /\.png-export-dialog\s*\{[^}]*z-index:\s*var\(--layer-modal-content\)/s);
  assert.doesNotMatch(css, /z-index:\s*(?:999|1000|1300|1400|1500)\b/);
});

test("History, Saved, expanded canvas and Export share the body portal and inert the workspace", () => {
  assert.match(page, /function OverlayPortal[\s\S]*?createPortal\(children, document\.body\)/);
  assert.match(page, /function ViewportPortal[\s\S]*?<OverlayPortal active=\{active\}>/);
  assert.match(page, /historyOpen && \([\s\S]*?<OverlayPortal active=\{historyOpen\}>[\s\S]*?className="history-overlay"/);
  assert.match(page, /pngExportOpen && \([\s\S]*?<OverlayPortal active=\{pngExportOpen\}>[\s\S]*?className="png-export-overlay"/);
  assert.match(page, /<ViewportPortal active=\{canvasExpanded\}>/);
  assert.match(page, /inert=\{historyOpen \|\| pngExportOpen \|\| canvasExpanded\}/);
  assert.match(page, /inert=\{pngExportOpen\}/);
  assert.match(page, /role="dialog"\s+aria-modal="true"/);
  assert.match(page, /className="history-scrim"[\s\S]*?onClick=\{\(\) => setHistoryOpen\(false\)\}/);
  assert.match(page, /className="png-export-scrim"[\s\S]*?onClick=\{\(\) => setPngExportOpen\(false\)\}/);
  assert.match(css, /\.history-scrim\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
  assert.match(css, /\.png-export-scrim\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;/s);
});

test("modal scroll locks are shared and modal controls retain their own scrolling", () => {
  assert.match(page, /if \(!canvasExpanded && !pngExportOpen && !historyOpen\) return undefined/);
  assert.match(page, /\[canvasExpanded, pngExportOpen, historyOpen\]/);
  assert.equal((page.match(/body\.style\.overflow = "hidden"/g) ?? []).length, 1, "only the shared scroll-lock effect sets body overflow");
  assert.match(page, /window\.innerWidth - window\.document\.documentElement\.clientWidth/);
  assert.match(page, /previousPaddingRight/);
  assert.doesNotMatch(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /\.history-drawer\s*\{[^}]*overflow:\s*hidden/);
  assert.match(css, /\.png-export-dialog\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s);
});

test("Export suspends the expanded-canvas focus loop and restores its active controls on close", () => {
  assert.match(page, /if \(!canvasExpanded \|\| pngExportOpen\) return undefined/);
  assert.match(page, /\}, \[canvasExpanded, pngExportOpen\]\);/);
  assert.match(page, /historyCloseButtonRef\.current\?\.focus/);
  assert.match(page, /pngExportCloseButtonRef\.current\?\.focus/);
  assert.match(page, /previouslyFocused\?\.isConnected\) previouslyFocused\.focus/);
});
