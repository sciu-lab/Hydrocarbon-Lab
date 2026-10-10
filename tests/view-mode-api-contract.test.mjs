import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const history = readFileSync(new URL("../app/api/history/route.ts", import.meta.url), "utf8");
const saved = readFileSync(new URL("../app/api/saved/route.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0002_view_mode_version.sql", import.meta.url), "utf8");

test("history and saved APIs explicitly decode, persist, return, and fingerprint view versions", () => {
  for (const [name, source] of [["history", history], ["saved", saved]]) {
    assert.match(source, /viewModeVersion\?: unknown/);
    assert.match(source, /decodeApiViewMode\(payload\.viewMode, payload\.viewModeVersion\)/, name);
    assert.match(source, /viewModeVersion,/g, name);
    assert.match(source, /viewModeFingerprintKey\(decodedViewMode\)/, name);
    assert.match(source, /decodeViewModeV1\(row\.viewMode\)/, name);
    assert.match(source, /decodeViewModeV2\(row\.viewMode\)/, name);
  }
});

test("migration keeps existing cloud rows at V1 and only adds version columns", () => {
  assert.match(schema, /viewModeVersion: integer\("view_mode_version"\)\.notNull\(\)\.default\(1\)/g);
  assert.match(migration, /ALTER TABLE `molecule_history` ADD `view_mode_version` integer DEFAULT 1 NOT NULL/);
  assert.match(migration, /ALTER TABLE `saved_molecules` ADD `view_mode_version` integer DEFAULT 1 NOT NULL/);
  assert.doesNotMatch(migration, /UPDATE\s+(?:molecule_history|saved_molecules)/i);
});
