// Optional network audit. Raw OPSIN evidence is independent of the namer.
// This script NEVER writes expected, alternatives, authority or verification.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadExerciseChemistry } from "../tests/helpers/exercise-chemistry.mjs";
import { corpusDirectory, loadCorpus, loadSnapshots, currentEnglishName, digest, evaluateName } from "../tests/helpers/reference-corpus.mjs";

const capture = process.argv.includes("--capture");
const offline = process.argv.includes("--offline");
const reportArguments = process.argv.slice(2).filter((arg) => arg.startsWith("--report="));
const reportName = reportArguments[0]?.slice("--report=".length);
if (process.argv.slice(2).some((arg) => !["--capture", "--offline"].includes(arg) && !arg.startsWith("--report="))
  || (capture && offline) || reportArguments.length > 1
  || (reportName !== undefined && !/^[a-z0-9-]+\.json$/.test(reportName))) {
  throw new Error("Usage: npm run audit:reference-corpus -- [--capture | --offline] [--report=filename.json]");
}
const records = loadCorpus();
const chemistry = await loadExerciseChemistry();
try {
  const actualNames = new Map(records.map((record) => [record.id, currentEnglishName(record, chemistry)]));
  const snapshotPath = new URL("opsin-snapshots.json", corpusDirectory);
  const snapshots = (offline || capture) && existsSync(snapshotPath) ? loadSnapshots() : new Map();
  const names = [...new Set(records.flatMap((record) => [record.expected.en,
    ...(record.acceptedAlternatives?.en ?? []), actualNames.get(record.id)]))];
  if (!offline) {
    for (const name of names) {
      if (capture && snapshots.has(name)) continue;
      const url = `https://www.ebi.ac.uk/opsin/ws/${encodeURIComponent(name)}.json`;
      // Bounded, sequential requests. Failures cannot promote records to gold.
      let evidence;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(15000),
            headers: { Accept: "application/json", "User-Agent": "HydrocarbonLab-ReferenceCorpus/1.0" } });
          const body = await response.text();
          JSON.parse(body);
          if (response.status >= 500 || response.status === 429) throw new Error(`HTTP ${response.status}`);
          evidence = { name, url, retrievedAt: new Date().toISOString(), httpStatus: response.status, sha256: digest(body), body };
          break;
        } catch (error) {
          if (attempt === 1) console.error(`${name}: ${error.message}`);
        }
      }
      if (evidence) snapshots.set(name, evidence);
      if (capture) {
        writeFileSync(snapshotPath, `${JSON.stringify({ schemaVersion: 1,
          service: "OPSIN public web service; service version is not supplied in the response",
          responses: [...snapshots.values()].sort((a, b) => a.name.localeCompare(b.name, "en")) }, null, 2)}\n`);
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  const results = records.map((record) => evaluateName(record, actualNames.get(record.id), snapshots));
  const count = (field, authority) => Object.fromEntries(["PASS", "FAIL", "SKIP"].map((status) => [status,
    results.filter((item) => (!authority || item.authority === authority) && item[field] === status).length]));
  const report = { schemaVersion: 1, mode: offline ? "frozen-offline" : "live-opsin",
    entries: records.length, goldExact: count("exact", "gold"), expectedStructure: count("expectedStructure"),
    actualStructure: count("structure"), results };
  const reportDirectory = new URL("../reports/reference-corpus/", import.meta.url);
  mkdirSync(reportDirectory, { recursive: true });
  writeFileSync(new URL(reportName ?? (offline ? "offline-results.json" : "live-results.json"), reportDirectory), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ entries: report.entries, goldExact: report.goldExact,
    expectedStructure: report.expectedStructure, actualStructure: report.actualStructure }, null, 2));
  for (const result of results.filter((item) => (item.authority === "gold" && item.exact === "FAIL")
    || item.structure === "FAIL" || item.expectedStructure !== "PASS")) console.log(JSON.stringify(result));
  // A successful HTTP audit is not a successful naming audit.
  if (report.goldExact.FAIL || report.expectedStructure.FAIL || report.actualStructure.FAIL
    || report.expectedStructure.SKIP || report.actualStructure.SKIP) process.exitCode = 1;
} finally {
  await chemistry.close();
}
