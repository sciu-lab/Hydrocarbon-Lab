import { getOpsinNameCandidates } from "./iupac-name-normalization.ts";
import { inspectSmilesStructure } from "./openchemlib-adapter.ts";
import {
  type NameStructureResolution,
  type NameStructureResolutionResult,
  resolveNameWithOpsin,
} from "./opsin-name-resolver.ts";
import { verifiedCommonNameQuery } from "./verified-common-name-equivalences.ts";

const PUBCHEM_BASE_URL = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";
function stereoWarning(unpreservedCenterCount: number) {
  return `No se pudo conservar la configuración tetraédrica de ${unpreservedCenterCount} ${unpreservedCenterCount === 1 ? "centro" : "centros"}; la conectividad sí se conservó.`;
}

type PubChemCidPayload = {
  IdentifierList?: { CID?: number[] };
};

type PubChemProperty = {
  CID?: number;
  IUPACName?: string;
  InChIKey?: string;
  IsomericSMILES?: string;
  SMILES?: string;
  CanonicalSMILES?: string;
  ConnectivitySMILES?: string;
  MolecularFormula?: string;
};

type PubChemPropertyPayload = {
  PropertyTable?: { Properties?: PubChemProperty[] };
};

type NameResolverOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type PubChemResolutionResult = NameStructureResolutionResult & {
  ambiguous?: boolean;
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: string, signal: AbortSignal) {
  const response = await fetchImpl(url, {
    credentials: "omit",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) return { reached: true, value: undefined as T | undefined };
  try {
    return { reached: true, value: await response.json() as T };
  } catch {
    return { reached: true, value: undefined as T | undefined };
  }
}

function pubChemSmiles(property: PubChemProperty) {
  return clean(property.IsomericSMILES)
    || clean(property.SMILES)
    || clean(property.CanonicalSMILES)
    || clean(property.ConnectivitySMILES);
}

async function resolveNameWithPubChem(
  originalName: string,
  options: NameResolverOptions,
): Promise<PubChemResolutionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const verifiedEquivalent = verifiedCommonNameQuery(originalName);
  const candidates: Array<{ query: string; expectedInchiKey?: string }> = [...new Map([
    originalName.trim(),
    ...getOpsinNameCandidates(originalName),
  ].filter(Boolean).map((query) => [query, { query }])).values()];
  if (verifiedEquivalent && !candidates.some(({ query }) => query === verifiedEquivalent.query)) {
    candidates.push(verifiedEquivalent);
  } else if (verifiedEquivalent) {
    const candidate = candidates.find(({ query }) => query === verifiedEquivalent.query);
    if (candidate) Object.assign(candidate, verifiedEquivalent);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 9_000);
  let serviceReached = false;

  try {
    for (const candidate of candidates) {
      const cidResponse = await fetchJson<PubChemCidPayload>(
        fetchImpl,
        `${PUBCHEM_BASE_URL}/name/${encodeURIComponent(candidate.query)}/cids/JSON`,
        controller.signal,
      );
      serviceReached ||= cidResponse.reached;
      const cids = [...new Set(cidResponse.value?.IdentifierList?.CID ?? [])]
        .filter((cid) => Number.isInteger(cid) && cid > 0);
      if (!cids.length) continue;
      if (cids.length > 8) {
        return {
          ok: false,
          ambiguous: true,
          serviceReached: true,
          error: "PubChem encontró varias estructuras posibles para ese nombre común.",
          detail: "Usa un nombre más específico o incluye los descriptores estereoquímicos necesarios.",
        };
      }

      const propertiesResponse = await fetchJson<PubChemPropertyPayload>(
        fetchImpl,
        `${PUBCHEM_BASE_URL}/cid/${cids.join(",")}/property/IUPACName,InChIKey,IsomericSMILES,CanonicalSMILES,ConnectivitySMILES,MolecularFormula/JSON`,
        controller.signal,
      );
      serviceReached ||= propertiesResponse.reached;
      const validated = (propertiesResponse.value?.PropertyTable?.Properties ?? []).flatMap((property) => {
        const smiles = pubChemSmiles(property);
        const molecularFormula = clean(property.MolecularFormula);
        const inspection = smiles ? inspectSmilesStructure(smiles) : null;
        const inchiKey = clean(property.InChIKey).toLocaleUpperCase("en");
        if (
          !property.CID
          || !inspection?.ok
          || !molecularFormula
          || inspection.formula !== molecularFormula
          || (candidate.expectedInchiKey && inchiKey !== candidate.expectedInchiKey)
        ) return [];
        const identity = inchiKey
          || `${inspection.canonicalConnectivity}|${molecularFormula}|${smiles}`;
        return [{ property, smiles, molecularFormula, inspection, identity }];
      });
      if (!validated.length) continue;

      const identities = new Set(validated.map(({ identity }) => identity));
      if (identities.size !== 1) {
        return {
          ok: false,
          ambiguous: true,
          serviceReached: true,
          error: "PubChem encontró varias estructuras posibles para ese nombre común.",
          detail: "Usa un nombre más específico o incluye los descriptores estereoquímicos necesarios.",
        };
      }

      const selected = validated[0];
      return {
        ok: true,
        value: {
          originalName,
          interpretedName: clean(selected.property.IUPACName) || candidate.query,
          smiles: selected.smiles,
          source: "PubChem",
          cid: selected.property.CID,
          molecularFormula: selected.molecularFormula,
          ...(clean(selected.property.IUPACName) ? { iupacName: clean(selected.property.IUPACName) } : {}),
          ...(clean(selected.property.InChIKey) ? { inchiKey: clean(selected.property.InChIKey).toLocaleUpperCase("en") } : {}),
          warnings: selected.inspection.unpreservedTetrahedralStereoCenterCount > 0
            ? [stereoWarning(selected.inspection.unpreservedTetrahedralStereoCenterCount)]
            : [],
        },
      };
    }
  } catch {
    // The combined resolver below retains the more useful OPSIN failure when
    // PubChem is unavailable rather than exposing a transport exception.
  } finally {
    clearTimeout(timeout);
  }

  return {
    ok: false,
    serviceReached,
    error: serviceReached
      ? "PubChem no encontró una estructura inequívoca y compatible para ese nombre."
      : "No fue posible conectar con PubChem.",
    detail: "Prueba un sinónimo más específico o un nombre sistemático.",
  };
}

/**
 * Keeps the existing OPSIN route first, then resolves common-name synonyms
 * through PubChem and validates the returned graph with OpenChemLib.
 */
export async function resolveChemicalName(
  originalName: string,
  options: NameResolverOptions = {},
): Promise<NameStructureResolutionResult> {
  const opsin = await resolveNameWithOpsin(originalName, options);
  if (opsin.ok) return opsin;

  const pubchem = await resolveNameWithPubChem(originalName, options);
  if (pubchem.ok || pubchem.ambiguous) return pubchem;
  if (!pubchem.serviceReached) return opsin;
  return {
    ok: false,
    serviceReached: true,
    error: "OPSIN y PubChem no pudieron resolver ese nombre de forma inequívoca.",
    detail: `${opsin.detail} ${pubchem.detail}`.trim(),
  };
}

export type { NameStructureResolution };
