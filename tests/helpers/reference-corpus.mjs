import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import Ajv from "ajv";
import { CanonizerUtil, Molecule, SmilesParser } from "openchemlib";
import { moleculeFromSmiles } from "../../app/openchemlib-adapter.ts";
import { translateSpanishIupacForDisplay } from "../../app/iupac-name-normalization.ts";
import { applyNomenclatureConvention } from "../../app/nomenclature-conventions.ts";
import { EXERCISE_CATEGORIES } from "../../app/exercise-model.ts";
import { validateExerciseDomain } from "../../app/exercise-domain.ts";

export const corpusDirectory = new URL("../reference-corpus/", import.meta.url);
export const families = Object.freeze({
  alkanes: ["ALKANE", "alkane"], alkenes: ["ALKENE", "alkene"], alkynes: ["ALKYNE", "alkyne"],
  alcohols: ["ALCOHOL", "alcohol"], aldehydes: ["ALDEHYDE", "aldehyde"], ketones: ["KETONE", "ketone"],
  ethers: ["ETHER", "ether"], esters: ["ESTER", "ester"], "carboxylic-acids": ["ACID", "carboxylic-acid"],
  amines: ["AMINE", "amine"], amides: ["AMIDE", "amide"], aromatics: ["AROMATIC", "aromatic"],
  rings: ["RING", "simple-carbocycle"],
});
export const readCorpusJson = (filename) => JSON.parse(readFileSync(new URL(filename, corpusDirectory), "utf8"));
export const schema = readCorpusJson("schema.json");
export const ajv = new Ajv({ allErrors: true, jsonPointers: true, strictKeywords: true });
export const validateFamily = ajv.compile(schema);
export const digest = (body) => createHash("sha256").update(body).digest("hex");

export function loadCorpus() {
  const allowed = new Set([...Object.keys(families).map((name) => `${name}.json`), "schema.json", "opsin-snapshots.json"]);
  for (const name of readdirSync(corpusDirectory).filter((name) => name.endsWith(".json"))) {
    if (!allowed.has(name)) throw new Error(`Unregistered corpus file: ${name}`);
  }
  return Object.keys(families).flatMap((category) => {
    const records = readCorpusJson(`${category}.json`);
    if (!validateFamily(records)) throw new Error(`${category}: ${ajv.errorsText(validateFamily.errors)}`);
    for (const record of records) {
      if (record.category !== category || !record.id.startsWith(`${families[category][0]}-`)) {
        throw new Error(`${record.id}: category/file/ID mismatch in ${category}.json`);
      }
      const allowedDomains = category === "alkanes" ? ["alkane", "halogenated"] : [families[category][1]];
      if (!EXERCISE_CATEGORIES.includes(record.domainCategory) || !allowedDomains.includes(record.domainCategory)) {
        throw new Error(`${record.id}: invalid domainCategory ${record.domainCategory}`);
      }
    }
    return records;
  });
}

// Canonical graph identity includes bond orders, charges, isotopes and the full
// stereo state (including unspecified stereo). Never compare SMILES strings.
export function structuralIdentity(smiles) {
  const graph = new SmilesParser().parseMolecule(smiles);
  graph.ensureHelperArrays(Molecule.cHelperCIP);
  return CanonizerUtil.getIDCode(graph, CanonizerUtil.NORMAL);
}

export function importRecord(record, chemistry) {
  const parsed = moleculeFromSmiles(record.smiles);
  if (!parsed.ok) throw new Error(`${record.id}: SMILES import: ${parsed.error}`);
  const domain = validateExerciseDomain(parsed.molecule, record.domainCategory, chemistry.oracles);
  if (!domain.valid) throw new Error(`${record.id}: Domain v1: ${domain.reason}`);
  return parsed.molecule;
}

export function currentEnglishName(record, chemistry) {
  const molecule = importRecord(record, chemistry);
  const analysis = chemistry.engine.analyzeMolecule(molecule);
  if (chemistry.engine.localNamerCannotSafelyName(molecule, analysis)) throw new Error(`${record.id}: local name unsupported`);
  return applyNomenclatureConvention(translateSpanishIupacForDisplay(
    chemistry.engine.suggestedIupacNameWithOmittedLocants(analysis)), "current", "en");
}

export function loadSnapshots() {
  const cache = readCorpusJson("opsin-snapshots.json");
  if (cache.schemaVersion !== 1 || !Array.isArray(cache.responses)) throw new Error("Invalid OPSIN snapshot envelope");
  const byName = new Map();
  for (const item of cache.responses) {
    if (byName.has(item.name) || item.sha256 !== digest(item.body)
      || item.url !== `https://www.ebi.ac.uk/opsin/ws/${encodeURIComponent(item.name)}.json`
      || !Number.isFinite(Date.parse(item.retrievedAt)) || !Number.isInteger(item.httpStatus)) {
      throw new Error(`Invalid/duplicate OPSIN evidence: ${item.name}`);
    }
    JSON.parse(item.body);
    byName.set(item.name, item);
  }
  return byName;
}

export function interpretedStructure(name, snapshots) {
  const evidence = snapshots.get(name);
  if (!evidence) return { status: "SKIP", reason: "No frozen independent OPSIN response for this exact text" };
  const body = JSON.parse(evidence.body);
  if (body.status === "FAILURE") return { status: "FAIL", reason: `OPSIN could not interpret name: ${body.message ?? "FAILURE"}` };
  if (evidence.httpStatus !== 200 || !["SUCCESS", "WARNING"].includes(body.status) || !body.smiles) {
    return { status: "SKIP", reason: "Frozen response is not a usable OPSIN interpretation" };
  }
  return { status: "PASS", identity: structuralIdentity(body.smiles), smiles: body.smiles };
}

export function evaluateName(record, actual, snapshots) {
  const expected = interpretedStructure(record.expected.en, snapshots);
  const observed = interpretedStructure(actual, snapshots);
  const input = structuralIdentity(record.smiles);
  const expectedStructure = expected.status !== "PASS" ? expected.status : expected.identity === input ? "PASS" : "FAIL";
  const structure = expectedStructure !== "PASS" ? "SKIP" : observed.status !== "PASS" ? observed.status
    : observed.identity === expected.identity ? "PASS" : "FAIL";
  const exact = actual === record.expected.en ? "PASS" : "FAIL";
  const acceptedAlternative = record.acceptedAlternatives?.en?.includes(actual) ?? false;
  const classification = expectedStructure === "FAIL" ? "REFERENCE_STRUCTURE_MISMATCH"
    : exact === "PASS" ? "EXACT_NAME_MATCH"
    : structure === "PASS" ? "CANONICAL_NAME_MISMATCH"
    : structure === "FAIL" ? "NAME_STRUCTURE_MISMATCH" : "NAME_MISMATCH_STRUCTURE_UNVERIFIED";
  return { id: record.id, category: record.category, smiles: record.smiles, authority: record.authority,
    expected: record.expected.en, actual, exact, expectedStructure, structure, acceptedAlternative, classification,
    structuralReason: structure === "SKIP" ? observed.reason ?? expected.reason
      : structure === "FAIL" ? observed.reason ?? "OPSIN actual-name interpretation has a different canonical graph from the reference/input" : undefined };
}

export function mismatchMessage(result) {
  const lines = [
    `[${result.id}] Category: ${result.category}`,
    `SMILES: ${result.smiles}`, `Expected: ${result.expected}`, `Actual: ${result.actual}`,
    `Exact name: ${result.exact}`, `Expected vs input structure: ${result.expectedStructure}`,
    `Structural equivalence: ${result.structure}`, `Accepted alternative: ${result.acceptedAlternative}`,
    `Classification: ${result.classification}`,
  ];
  if (result.structuralReason) lines.push(`Reason: ${result.structuralReason}`);
  return lines.join("\n");
}
