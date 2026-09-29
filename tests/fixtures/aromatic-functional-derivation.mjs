// Current supported parent/substituent grammar, plus explicitly excluded probes.
// English corrections use the established meth/eth roots; Spanish conventions stay systematic.
export const arylFunctionalCases = [
  { label: "phenylmethanol", smiles: "OCc1ccccc1", es: "fenilmetanol", en: "phenylmethanol", rootEs: "metan", rootEn: "methan", group: "alcohol", suffixEs: "ol", suffixEn: "ol", externalName: "phenylmethanol" },
  { label: "phenylmethanamine", smiles: "NCc1ccccc1", es: "fenilmetanamina", en: "phenylmethanamine", rootEs: "metan", rootEn: "methan", group: "amine", suffixEs: "amina", suffixEn: "amine", externalName: "phenylmethanamine" },
  { label: "terminal phenylethanol", smiles: "OCCc1ccccc1", es: "2-feniletan-1-ol", en: "2-phenylethan-1-ol", rootEs: "etan", rootEn: "ethan", group: "alcohol", suffixEs: "1-ol", suffixEn: "1-ol" },
  { label: "benzylic ethan ol", smiles: "CC(O)c1ccccc1", es: "1-feniletan-1-ol", en: "1-phenylethan-1-ol", rootEs: "etan", rootEn: "ethan", group: "alcohol", suffixEs: "1-ol", suffixEn: "1-ol" },
  { label: "terminal phenylethanamine", smiles: "NCCc1ccccc1", es: "2-feniletan-1-amina", en: "2-phenylethan-1-amine", rootEs: "etan", rootEn: "ethan", group: "amine", suffixEs: "1-amina", suffixEn: "1-amine" },
  { label: "benzylic ethan amine", smiles: "CC(N)c1ccccc1", es: "1-feniletan-1-amina", en: "1-phenylethan-1-amine", rootEs: "etan", rootEn: "ethan", group: "amine", suffixEs: "1-amina", suffixEn: "1-amine" },
  { label: "phenylethanal", smiles: "O=CCc1ccccc1", es: "2-feniletanal", en: "2-phenylethanal", rootEs: "etan", rootEn: "ethan", group: "aldehyde", suffixEs: "al", suffixEn: "al" },
  { label: "phenyl ketone", smiles: "CC(=O)c1ccccc1", es: "1-feniletan-1-ona", en: "1-phenylethan-1-one", rootEs: "etan", rootEn: "ethan", group: "ketone", suffixEs: "1-ona", suffixEn: "1-one" },
  { label: "phenylacetic acid", smiles: "O=C(O)Cc1ccccc1", es: "ácido 2-feniletanoico", en: "2-phenylethanoic acid", rootEs: "etan", rootEn: "ethan", group: "carboxylicAcid", suffixEs: "oico", suffixEn: "oic" },
  { label: "phenyl amide", smiles: "NC(=O)Cc1ccccc1", es: "2-feniletanamida", en: "2-phenylethanamide", rootEs: "etan", rootEn: "ethan", group: "amide", suffixEs: "amida", suffixEn: "amide" },
  { label: "phenyl nitrile", smiles: "N#CCc1ccccc1", es: "2-feniletanonitrilo", en: "2-phenylethanenitrile", rootEs: "etano", rootEn: "ethane", group: "nitrile", suffixEs: "nitrilo", suffixEn: "nitrile" },
  { label: "phenylpropanol", smiles: "OCCCc1ccccc1", es: "3-fenilpropan-1-ol", en: "3-phenylpropan-1-ol", rootEs: "propan", rootEn: "propan", group: "alcohol", suffixEs: "1-ol", suffixEn: "1-ol" },
  { label: "phenylpropanamine", smiles: "NCCCc1ccccc1", es: "3-fenilpropan-1-amina", en: "3-phenylpropan-1-amine", rootEs: "propan", rootEn: "propan", group: "amine", suffixEs: "1-amina", suffixEn: "1-amine" },
  { label: "branched phenyl alcohol", smiles: "OCC(C)c1ccccc1", es: "2-fenilpropan-1-ol", en: "2-phenylpropan-1-ol", rootEs: "propan", rootEn: "propan", group: "alcohol", suffixEs: "1-ol", suffixEn: "1-ol" },
  { label: "branched phenyl acid", smiles: "CC(c1ccccc1)C(=O)O", es: "ácido 2-fenilpropanoico", en: "2-phenylpropanoic acid", rootEs: "propan", rootEn: "propan", group: "carboxylicAcid", suffixEs: "oico", suffixEn: "oic" },
  { label: "unsaturated phenyl alcohol", smiles: "OCC=Cc1ccccc1", es: "3-fenilprop-2-en-1-ol", en: "3-phenylprop-2-en-1-ol", rootEs: "prop", rootEn: "prop", group: "alcohol", suffixEs: "1-ol", suffixEn: "1-ol" },
];

export const derivationControls = [
  ["alcohol", "CCC(O)C"], ["ether", "CCOCC"], ["aldehyde", "CCCC=O"], ["ketone", "CC(=O)C"],
  ["acid", "CCCCC(=O)O"], ["ester", "CCC(=O)OC"], ["amine", "CCN"], ["amide", "CCC(=O)N"],
  ["nitrile", "CCC#N"], ["nitro", "CC[N+](=O)[O-]"], ["fluoro", "CCF"], ["chloro", "CCCl"], ["bromo", "CCBr"], ["iodo", "CCI"],
  ["methoxybenzene", "COc1ccccc1"], ["benzaldehyde", "O=Cc1ccccc1"], ["benzoic acid", "O=C(O)c1ccccc1"],
  ["benzamide", "NC(=O)c1ccccc1"], ["benzonitrile", "N#Cc1ccccc1"], ["benzene triol", "Oc1cc(O)cc(O)c1"],
  ["polyol", "OCC(O)CO"], ["diacid", "O=C(O)CCC(=O)O"], ["branched ester", "CC(C)C(=O)OCC"],
  ["nitro and alkyl", "CC(C)C[N+](=O)[O-]"], ["mixed halogens", "CC(Br)C(Cl)C(F)C(I)C"],
  ...["F", "Cl", "Br", "I"].map((element) => [`${element} and methyl`, `CC(${element})C(C)CCC`]),
  // The established fragment model intentionally treats these as indivisible.
  ["phenol", "Oc1ccccc1", "indivisible-retained-parent"],
  ["aniline", "Nc1ccccc1", "indivisible-retained-parent"],
].map(([label, smiles, acceptedException]) => ({ label, smiles, acceptedException }));

export const excludedArylCases = [
  ["benzyl methyl ether", "COCc1ccccc1"],
  ["ring-substituted benzyl alcohol", "OCc1ccc(C)cc1"],
  ["ring-substituted benzylamine", "NCc1ccc(Cl)cc1"],
].map(([label, smiles]) => ({ label, smiles, excluded: true }));

export const derivationAuditCases = [...arylFunctionalCases, ...derivationControls, ...excludedArylCases];
