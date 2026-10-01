// Reproducible offline audit and annotation coverage. This command never
// captures evidence, edits references, or invokes production network adapters.
import { readFileSync, writeFileSync } from "node:fs";
import { loadExerciseChemistry } from "../tests/helpers/exercise-chemistry.mjs";
import { currentEnglishName, evaluateName, families, interpretedStructure, loadCorpus, loadSnapshots, structuralIdentity } from "../tests/helpers/reference-corpus.mjs";
import { coverageSummary } from "../tests/helpers/reference-coverage.mjs";

const records = loadCorpus(), snapshots = loadSnapshots();
const manifest = JSON.parse(readFileSync(new URL("../tests/fixtures/reference-corpus-v1-manifest.json", import.meta.url), "utf8"));
const originalIDs = new Set(manifest.records.map((record) => record.id));
const original = records.filter((record) => originalIDs.has(record.id));
const added = records.filter((record) => !originalIDs.has(record.id));
const originalFetch = globalThis.fetch;
let requests = 0;
let chemistry;
globalThis.fetch = () => { requests += 1; throw new Error("The reference report must run offline"); };
try {
  chemistry = await loadExerciseChemistry();
  // Do not stop at the first naming exception: every admitted record is audited.
  const results = records.map((record) => {
    try {
      const result = evaluateName(record, currentEnglishName(record, chemistry), snapshots);
      return { ...result, candidateExact: result.exact,
        exact: record.authority === "gold" ? result.exact : "SKIP",
        classification: record.authority !== "gold" && result.structure === "PASS"
          ? "NON_GOLD_STRUCTURE_MATCH" : result.classification,
        exactReason: record.authority !== "gold" ? `${record.authority}: not an exact naming oracle` : undefined };
    } catch (error) {
      const reference = interpretedStructure(record.expected.en, snapshots);
      return { id: record.id, category: record.category, smiles: record.smiles, authority: record.authority,
        expected: record.expected.en, actual: null, exact: record.authority === "gold" ? "FAIL" : "SKIP",
        expectedStructure: reference.status === "PASS"
          ? (reference.identity === structuralIdentity(record.smiles) ? "PASS" : "FAIL") : reference.status,
        structure: "SKIP", classification: "NAMER_ERROR", structuralReason: error.message };
    }
  });
  const count = (field, selection = results) => Object.fromEntries(["PASS", "FAIL", "SKIP"].map((status) =>
    [status, selection.filter((result) => result[field] === status).length]));
  const authority = (selection) => Object.fromEntries(["gold", "silver", "generated"].map((level) =>
    [level, selection.filter((record) => record.authority === level).length]));
  const failures = results.filter((result) => !originalIDs.has(result.id)
    && (result.exact === "FAIL" || result.structure === "FAIL" || result.expectedStructure !== "PASS"));
  const findings = failures.map((result, index) => ({ finding: `REFERENCE2-${String(index + 1).padStart(3, "0")}`, ...result }));
  const report = {
    schemaVersion: 1, mode: "frozen-offline", protectedHead: manifest.head,
    entries: records.length, before: original.length, added: added.length,
    authority: authority(records), addedAuthority: authority(added),
    profiles: [...new Set(records.map((record) => record.profile))],
    families: Object.fromEntries(Object.keys(families).map((family) => [family, {
      before: original.filter((record) => record.category === family).length,
      added: added.filter((record) => record.category === family).length,
      total: records.filter((record) => record.category === family).length,
    }])),
    coverage: { before: coverageSummary(original), added: coverageSummary(added), total: coverageSummary(records) },
    exact: count("exact"), goldExact: count("exact", results.filter((result) => result.authority === "gold")),
    expectedStructure: count("expectedStructure"), actualStructure: count("structure"),
    addedResults: {
      exact: count("exact", results.filter((result) => !originalIDs.has(result.id))),
      structure: count("structure", results.filter((result) => !originalIDs.has(result.id))),
    }, findings, results, networkRequests: requests,
  };
  if (requests !== 0) throw new Error("Offline audit attempted network access");
  writeFileSync(new URL("../reports/reference-corpus/phase-2-results.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ entries: report.entries, added: report.added, authority: report.authority,
    exact: report.exact, expectedStructure: report.expectedStructure, actualStructure: report.actualStructure,
    findings: findings.map((finding) => finding.finding), networkRequests: requests }, null, 2));
  if (report.exact.FAIL || report.expectedStructure.FAIL || report.expectedStructure.SKIP
    || report.actualStructure.FAIL || report.actualStructure.SKIP) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
  await chemistry?.close();
}
