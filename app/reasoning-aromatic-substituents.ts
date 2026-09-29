import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import { translateSpanishIupacForDisplay } from "./iupac-name-normalization.ts";
import type { FunctionalReasoningAnalysis } from "./reasoning-functional-groups.ts";

type AromaticReasoningMolecule = {
  rings?: readonly { kind: string; atomIds: readonly number[] }[];
  bonds: readonly (readonly number[])[];
};

/** Use the chosen chain and the engine's ring atom provenance, never name substrings. */
export function aromaticFunctionalChainReasoning(
  molecule: AromaticReasoningMolecule,
  analysis: FunctionalReasoningAnalysis,
  language: AppLanguage,
) {
  if (analysis.family !== "acyclic" || !analysis.primaryFunctionalGroup || !analysis.mainChain.length) return;
  const primary = analysis.functionalGroups.find((group) => group.kind === analysis.primaryFunctionalGroup);
  if (!primary || !analysis.mainChain.includes(primary.carbonId)) return;
  const phenyl = analysis.substituents.filter((substituent) => !substituent.complex
    && substituent.name === "fenil" && substituent.atomIds?.length === 6
    && molecule.rings?.some((ring) => ring.kind === "aromatic" && ring.atomIds.length === 6
      && ring.atomIds.every((id) => substituent.atomIds!.includes(id))
      && ring.atomIds.every((id) => !analysis.mainChain.includes(id)))
    && molecule.bonds.some(([a, b, order]) => (order ?? 1) === 1
      && (a === analysis.mainChain[substituent.locant - 1] && substituent.atomIds!.includes(b)
        || b === analysis.mainChain[substituent.locant - 1] && substituent.atomIds!.includes(a))));
  if (!phenyl.length) return;
  const count = analysis.mainChain.length;
  const group = uiText(language, primary.label ?? "Grupo funcional principal").toLocaleLowerCase(language);
  const parent = language === "en" ? translateSpanishIupacForDisplay(analysis.chainName) : analysis.chainName;
  // –NH2 is specific to a primary amine; secondary/tertiary amines keep their
  // existing amino-group wording rather than acquiring an incorrect motif.
  const nitrogen = primary.atomIds?.find((id) => id !== primary.carbonId);
  const primaryAmine = primary.kind === "amine" && nitrogen !== undefined
    && molecule.bonds.filter(([a, b]) => a === nitrogen || b === nitrogen).length === 1;
  return language === "en" ? {
    parent: `The parent is the ${count}-carbon chain containing the principal ${group} function; its base name is ${parent}. The six benzene-ring carbons belong to the phenyl substituent.`,
    substituent: "Replacing one hydrogen of a benzene ring with its bond to the parent gives the aryl substituent “phenyl”. Its ring atoms are separate from the functional parent chain.",
    function: primaryAmine ? "The principal amino group is –NH₂, attached to the parent chain." : "",
  } : {
    parent: `El padre es la cadena de ${count} ${count === 1 ? "carbono" : "carbonos"} que contiene la función principal ${group}; su nombre base es ${parent}. Los seis carbonos del anillo bencénico pertenecen al sustituyente fenil.`,
    substituent: "Al sustituir un hidrógeno de un anillo bencénico por su enlace con el padre, se obtiene el sustituyente arilo «fenil». Sus átomos de anillo son independientes de la cadena padre funcional.",
    function: primaryAmine ? "El grupo amino principal es –NH₂, unido a la cadena padre." : "",
  };
}
