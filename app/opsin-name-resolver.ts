import { getOpsinNameCandidates } from "./iupac-name-normalization.ts";

const OPSIN_ENDPOINT = "https://www.ebi.ac.uk/opsin/ws";

type OpsinResponse = {
  message?: string;
  smiles?: string;
  status?: string;
  warnings?: string[];
};

export type NameStructureResolution = {
  interpretedName: string;
  originalName: string;
  smiles: string;
  source: "OPSIN" | "integrated-fallback";
  warnings: string[];
};

export type NameStructureResolutionResult =
  | { ok: true; value: NameStructureResolution }
  | {
      ok: false;
      detail: string;
      error: string;
      serviceReached: boolean;
    };

const embeddedSmilesFallback: Record<string, string> = {
  "2-ethyl-5-methyl-4-(methoxycarbonyl)heptanoic acid": "O=C(O)C(CC)CC(C(=O)OC)C(C)CC",
  "3-(2-chloroethyl)-4-methylhexanoic acid": "O=C(O)CC(CCCl)C(C)CC",
  "2,3-dichloro-4-(methoxycarbonyl)pentanoic acid": "O=C(O)C(Cl)C(Cl)C(C(=O)OC)C",
  "2-ethyl-3-(2-chloroethyl)butanedioic acid": "O=C(O)C(CC)C(CCCl)C(=O)O",
  "3-(bromomethyl)-4-(2-chloroethyl)hexanoic acid": "O=C(O)CC(CBr)C(CCCl)CC",
  "methyl 2-ethyl-4-(methoxycarbonyl)hexanoate": "COC(=O)C(CC)CC(C(=O)OC)CC",
  "ethyl 3-chloro-2-(methoxycarbonyl)propanoate": "CCOC(=O)C(C(=O)OC)CCl",
  "methyl 2-bromo-3-(ethoxycarbonyl)butanoate": "COC(=O)C(Br)C(C(=O)OCC)C",
  "4-ethyl-3-(2-chloroethyl)-2-hydroxyhexanoic acid": "O=C(O)C(O)C(CCCl)C(CC)CC",
  "2-(bromomethyl)-3-(2-chloroethyl)-4-methylpentanedioic acid": "O=C(O)C(CBr)C(CCCl)C(C)C(=O)O",
  "3-(2-chloroethyl)-4-(methoxycarbonyl)hexanoic acid": "O=C(O)CC(CCCl)C(C(=O)OC)CC",
  "(2E)-2-ethyl-3-methylhex-2-enal": "C(C)/C(/C=O)=C(\\CCC)/C",
  "N-(2-cyclohexylethyl)-4-methyl-3-oxohexanamide": "C1(CCCCC1)CCNC(CC(C(CC)C)=O)=O",
  "N-cyclohexyl-N-methylpropan-2-amine": "C1(CCCCC1)N(C(C)C)C",
  "N-methylethanamine": "CCNC",
  "N,N-dimethylethanamine": "CCN(C)C",
  "2-nitropropane": "CC([N+](=O)[O-])C",
  "2-nitrobutane": "CC([N+](=O)[O-])CC",
  "4-nitroaniline": "Nc1ccc([N+](=O)[O-])cc1",
  "butanenitrile": "CCCC#N",
  "pentanedinitrile": "N#CCCCC#N",
  "benzonitrile": "N#Cc1ccccc1",
  "aniline": "Nc1ccccc1",
  "3-fluoro-3-(2-oxopropyl)cyclohexan-1-one": "O=C1CC(F)(CC(=O)C)CCC1",
  "2-methylpropanoic acid": "CC(C)C(=O)O",
  "3-(2-oxopropyl)cyclohexanone": "O=C(CC1CC(CCC1)=O)C",
  "benzene-1,3,5-triol": "Oc1cc(O)cc(O)c1",
  "butan-2-one": "CC(=O)CC",
  "chloroethane": "CCCl",
  "ethanamide": "CC(=O)N",
  "ethanamine": "CCN",
  "ethanal": "CC=O",
  "ethanoic acid": "CC(=O)O",
  "ethanol": "CCO",
  "methoxyethane": "COCC",
  "methyl ethanoate": "CC(=O)OC",
  "phenol": "Oc1ccccc1",
  "propan-2-ol": "CC(O)C",
  "propan-2-one": "CC(=O)C",
  tetrahydropyran: "O1CCCCC1",
};

function embeddedFallback(candidate: string, originalName: string): NameStructureResolution | null {
  const smiles = embeddedSmilesFallback[candidate];
  return smiles
    ? {
        interpretedName: candidate,
        originalName,
        smiles,
        source: "integrated-fallback",
        warnings: [],
      }
    : null;
}

type ResolverOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Resolves a Spanish or English IUPAC name through the public OPSIN service.
 * OPSIN explicitly enables browser CORS, so GitHub Pages can use this function
 * without depending on an authenticated Sites API. Known classroom examples
 * retain an embedded SMILES fallback for temporary network outages.
 */
export async function resolveNameWithOpsin(
  originalName: string,
  options: ResolverOptions = {},
): Promise<NameStructureResolutionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const candidates = getOpsinNameCandidates(originalName);
  const impossibleCarbonylSubstitution = candidates.find((candidate) => {
    const normalizedCandidate = candidate.toLocaleLowerCase("en");
    const ketoneLocant = normalizedCandidate.match(/-(\d+)-one$/)?.[1];
    return ketoneLocant
      ? new RegExp(`(?:^|-)${ketoneLocant}-(?:fluoro|chloro|bromo|iodo)(?:-|$)`).test(normalizedCandidate)
      : false;
  });
  if (impossibleCarbonylSubstitution) {
    return {
      ok: false,
      serviceReached: false,
      error: "El nombre asigna un halógeno al mismo carbono de una cetona; ese carbono superaría la valencia permitida.",
      detail: "Cambia el localizador del halógeno o el de la cetona antes de volver a intentarlo.",
    };
  }
  let serviceReached = false;
  let lastMessage = "OPSIN no reconoció ese nombre.";

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 9_000);
    try {
      const response = await fetchImpl(
        `${OPSIN_ENDPOINT}/${encodeURIComponent(candidate)}.json`,
        {
          credentials: "omit",
          headers: { accept: "application/json" },
          signal: controller.signal,
        },
      );
      serviceReached = true;

      let data: OpsinResponse = {};
      try {
        data = await response.json() as OpsinResponse;
      } catch {
        lastMessage = "OPSIN devolvió una respuesta que no se pudo leer.";
      }

      if (response.ok && data.status === "SUCCESS" && data.smiles) {
        return {
          ok: true,
          value: {
            interpretedName: candidate,
            originalName,
            smiles: data.smiles,
            source: "OPSIN",
            warnings: data.warnings ?? [],
          },
        };
      }

      if (data.message) lastMessage = data.message;
      const fallback = embeddedFallback(candidate, originalName);
      if (fallback) return { ok: true, value: fallback };
    } catch {
      const fallback = embeddedFallback(candidate, originalName);
      if (fallback) return { ok: true, value: fallback };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    serviceReached,
    error: serviceReached
      ? "El motor químico no pudo interpretar ese nombre IUPAC. Revisa localizadores, paréntesis, guiones y sufijos."
      : "No fue posible conectar con OPSIN. Revisa tu conexión y vuelve a intentarlo; el constructor local seguirá disponible.",
    detail: lastMessage,
  };
}
