import { Molecule as OCLMolecule, SmilesParser } from "openchemlib";
import { parseMolecularFormula } from "./formula-isomers.ts";
import { inspectSmilesStructure, moleculeFromSmiles, moleculeToSmiles } from "./openchemlib-adapter.ts";
import type { GeneratedAtom, GeneratedMolecule } from "./name-to-molecule";

const PUBCHEM = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
const MAX_CIDS = 5;
const DEFAULT_CACHE_SIZE = 20;

export type FormulaCandidate = {
  cid: number;
  molecularFormula: string;
  iupacName?: string;
  inchiKey?: string;
  smiles: string;
  molecule: GeneratedMolecule;
  /** Canonical isomeric SMILES produced after the editor-graph round trip. */
  structureKey: string;
  stereoSpecified: boolean;
};

export type FormulaCandidateSearchResult =
  | { status: "success"; formula: string; receivedRecords: number; acceptedCount: number; rejectedCount: number; candidates: FormulaCandidate[] }
  | { status: "no-compatible-candidates"; formula: string; receivedRecords: number; acceptedCount: 0; rejectedCount: number; candidates: [] }
  | { status: "no-records"; formula: string; receivedRecords: 0; acceptedCount: 0; rejectedCount: 0; candidates: [] }
  | { status: "service-error"; formula: string; receivedRecords: number; acceptedCount: 0; rejectedCount: number; candidates: []; message: string }
  | { status: "cancelled"; formula: string; receivedRecords: number; acceptedCount: 0; rejectedCount: number; candidates: [] }
  | { status: "invalid-response"; formula: string; receivedRecords: number; acceptedCount: 0; rejectedCount: number; candidates: []; message: string }
  | { status: "invalid-formula"; message: string };

export type FormulaCandidateResolverOptions = {
  fetchImpl?: typeof fetch;
  cacheSize?: number;
};

export type FormulaCandidateResolver = {
  search(formula: string, signal?: AbortSignal): Promise<FormulaCandidateSearchResult>;
  clearCache(): void;
};

type PubChemProperty = {
  CID?: unknown;
  MolecularFormula?: unknown;
  IUPACName?: unknown;
  InChIKey?: unknown;
  IsomericSMILES?: unknown;
  SMILES?: unknown;
  CanonicalSMILES?: unknown;
};

function resultBase(formula: string, status: "cancelled" | "service-error" | "invalid-response", receivedRecords: number, message?: string): FormulaCandidateSearchResult {
  if (status === "cancelled") return { status, formula, receivedRecords, acceptedCount: 0, rejectedCount: 0, candidates: [] };
  if (status === "service-error") return { status, formula, receivedRecords, acceptedCount: 0, rejectedCount: 0, candidates: [], message: message ?? "PubChem could not complete the search." };
  return { status, formula, receivedRecords, acceptedCount: 0, rejectedCount: 0, candidates: [], message: message ?? "PubChem returned an unreadable response." };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeComposition(value: string) {
  const parsed = parseMolecularFormula(value);
  return parsed.ok ? parsed.atoms : null;
}

function sameComposition(left: string, right: string) {
  const leftAtoms = normalizeComposition(left);
  const rightAtoms = normalizeComposition(right);
  if (!leftAtoms || !rightAtoms) return false;
  const elements = new Set([...Object.keys(leftAtoms), ...Object.keys(rightAtoms)]);
  return [...elements].every((element) => leftAtoms[element as keyof typeof leftAtoms] === rightAtoms[element as keyof typeof rightAtoms]);
}

function editorValenceIsValid(molecule: GeneratedMolecule) {
  const maxValence: Record<NonNullable<GeneratedAtom["element"]>, number> = {
    C: 4, N: 3, O: 2, S: 2, F: 1, Cl: 1, Br: 1, I: 1,
  };
  return molecule.atoms.every((atom) => {
    const element = atom.element ?? "C";
    const limit = element === "N" && atom.charge === 1
      ? 4
      : element === "O" && atom.charge === -1
        ? 1
        : maxValence[element];
    const used = molecule.bonds.reduce((sum, bond) => sum + (bond[0] === atom.id || bond[1] === atom.id ? (bond[2] ?? 1) : 0), 0);
    return used <= limit;
  });
}

function canonicalIsomericSmiles(smiles: string) {
  const parsed = new SmilesParser().parseMolecule(smiles);
  parsed.ensureHelperArrays(OCLMolecule.cHelperCIP);
  return parsed.toSmiles();
}

/** Returns false if the editable graph's SMILES round trip loses any encoded stereo. */
export function editorRoundTripPreservesSmiles(smiles: string, molecule: GeneratedMolecule) {
  try {
    const exported = moleculeToSmiles(molecule);
    return exported.ok && canonicalIsomericSmiles(smiles) === canonicalIsomericSmiles(exported.smiles);
  } catch {
    return false;
  }
}

function propertySmiles(record: PubChemProperty) {
  return asNonEmptyString(record.IsomericSMILES)
    ?? asNonEmptyString(record.SMILES)
    ?? asNonEmptyString(record.CanonicalSMILES);
}

function makeCandidate(record: PubChemProperty, requestedFormula: string): FormulaCandidate | null {
  if (!Number.isSafeInteger(record.CID) || Number(record.CID) <= 0) return null;
  const cid = Number(record.CID);
  const formula = asNonEmptyString(record.MolecularFormula);
  const smiles = propertySmiles(record);
  if (!formula || !smiles || !sameComposition(formula, requestedFormula)) return null;

  const inspected = inspectSmilesStructure(smiles);
  if (!inspected.ok || !sameComposition(inspected.formula, requestedFormula)) return null;
  if (inspected.unpreservedTetrahedralStereoCenterCount > 0) return null;
  const built = moleculeFromSmiles(smiles);
  if (!built.ok || !editorValenceIsValid(built.molecule)) return null;

  let roundTripSmiles: string;
  let structureKey: string;
  try {
    const exported = moleculeToSmiles(built.molecule);
    if (!exported.ok) return null;
    roundTripSmiles = exported.smiles;
    structureKey = canonicalIsomericSmiles(roundTripSmiles);
    // Compare the complete isomeric canonical representation, not just connectivity.
    if (!editorRoundTripPreservesSmiles(smiles, built.molecule)) return null;
  } catch {
    return null;
  }

  return {
    cid,
    molecularFormula: requestedFormula,
    ...(asNonEmptyString(record.IUPACName) ? { iupacName: asNonEmptyString(record.IUPACName) } : {}),
    ...(asNonEmptyString(record.InChIKey) ? { inchiKey: asNonEmptyString(record.InChIKey) } : {}),
    smiles: roundTripSmiles,
    molecule: built.molecule,
    structureKey,
    stereoSpecified: inspected.hasTetrahedralStereo || /[\\/]/.test(smiles),
  };
}

function resultCacheable(result: FormulaCandidateSearchResult) {
  return result.status === "success" || result.status === "no-records" || result.status === "no-compatible-candidates";
}

/** Creates an isolated PubChem formula lookup with a small, successful-result-only memory cache. */
export function createFormulaCandidateResolver(options: FormulaCandidateResolverOptions = {}): FormulaCandidateResolver {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cacheSize = Math.max(0, Math.floor(options.cacheSize ?? DEFAULT_CACHE_SIZE));
  const cache = new Map<string, FormulaCandidateSearchResult>();

  const search = async (input: string, signal?: AbortSignal): Promise<FormulaCandidateSearchResult> => {
    const parsedFormula = parseMolecularFormula(input);
    if (!parsedFormula.ok) return { status: "invalid-formula", message: parsedFormula.error };
    const formula = parsedFormula.asciiFormula;
    if (signal?.aborted) return resultBase(formula, "cancelled", 0);
    const cached = cache.get(formula);
    if (cached) return cached;
    let receivedRecords = 0;

    try {
      const cidUrl = `${PUBCHEM}/compound/fastformula/${encodeURIComponent(formula)}/cids/JSON?MaxRecords=${MAX_CIDS}`;
      const cidResponse = await fetchImpl(cidUrl, { signal });
      if (!cidResponse.ok) return resultBase(formula, "service-error", 0);
      let cidPayload: unknown;
      try { cidPayload = await cidResponse.json(); } catch { return resultBase(formula, "invalid-response", 0); }
      const identifierList = isObject(cidPayload) && isObject(cidPayload.IdentifierList) ? cidPayload.IdentifierList : null;
      if (!identifierList || !Array.isArray(identifierList.CID)
        || identifierList.CID.some((cid) => !Number.isSafeInteger(cid) || Number(cid) <= 0)) {
        return resultBase(formula, "invalid-response", 0);
      }
      const cids = [...new Set(identifierList.CID as number[])].slice(0, MAX_CIDS);
      if (!cids.length) {
        const result: FormulaCandidateSearchResult = { status: "no-records", formula, receivedRecords: 0, acceptedCount: 0, rejectedCount: 0, candidates: [] };
        if (cacheSize) cache.set(formula, result);
        return result;
      }
      receivedRecords = cids.length;
      const propertyUrl = `${PUBCHEM}/compound/cid/${cids.join(",")}/property/MolecularFormula,IUPACName,InChIKey,IsomericSMILES,SMILES,CanonicalSMILES/JSON`;
      const propertyResponse = await fetchImpl(propertyUrl, { signal });
      if (!propertyResponse.ok) return resultBase(formula, "service-error", receivedRecords);
      let propertyPayload: unknown;
      try { propertyPayload = await propertyResponse.json(); } catch { return resultBase(formula, "invalid-response", receivedRecords); }
      const propertyTable = isObject(propertyPayload) && isObject(propertyPayload.PropertyTable) ? propertyPayload.PropertyTable : null;
      if (!propertyTable || !Array.isArray(propertyTable.Properties)) return resultBase(formula, "invalid-response", receivedRecords);

      const requestedCids = new Set(cids);
      const seenCids = new Set<number>();
      const seenStructures = new Set<string>();
      const candidates: FormulaCandidate[] = [];
      let rejectedCount = 0;
      for (const rawRecord of propertyTable.Properties.slice(0, MAX_CIDS)) {
        if (!isObject(rawRecord)) { rejectedCount += 1; continue; }
        const record = rawRecord as PubChemProperty;
        const cid = record.CID;
        if (!Number.isSafeInteger(cid) || !requestedCids.has(Number(cid)) || seenCids.has(Number(cid))) { rejectedCount += 1; continue; }
        seenCids.add(Number(cid));
        const candidate = makeCandidate(record, formula);
        if (!candidate || seenStructures.has(candidate.structureKey)) { rejectedCount += 1; continue; }
        seenStructures.add(candidate.structureKey);
        candidates.push(candidate);
      }
      rejectedCount += Math.max(0, cids.length - seenCids.size);
      const result: FormulaCandidateSearchResult = candidates.length
        ? { status: "success", formula, receivedRecords, acceptedCount: candidates.length, rejectedCount, candidates }
        : { status: "no-compatible-candidates", formula, receivedRecords, acceptedCount: 0, rejectedCount, candidates: [] };
      if (cacheSize && resultCacheable(result)) {
        cache.delete(formula);
        cache.set(formula, result);
        while (cache.size > cacheSize) cache.delete(cache.keys().next().value!);
      }
      return result;
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        return resultBase(formula, "cancelled", receivedRecords);
      }
      return resultBase(formula, "service-error", receivedRecords);
    }
  };

  return {
    search,
    clearCache: () => cache.clear(),
  };
}
