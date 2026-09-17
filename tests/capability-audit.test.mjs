import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

import { buildHydrocarbonFromIupacName } from "../app/name-to-molecule.ts";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;
let analyzeMolecule;
let findMoleculeValenceViolation;
let getAtomValenceViolation;
let findBondValenceViolation;

before(async () => {
  server = await createServer({
    root: projectRoot,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    plugins: [react()],
    server: { middlewareMode: true, hmr: false },
  });
  ({
    analyzeMolecule,
    findMoleculeValenceViolation,
    getAtomValenceViolation,
    findBondValenceViolation,
  } = await server.ssrLoadModule("/app/page.tsx"));
});

after(async () => {
  await server?.close();
});

const formulas = {
  metano: "C₁H₄", etano: "C₂H₆", propano: "C₃H₈", butano: "C₄H₁₀", pentano: "C₅H₁₂", hexano: "C₆H₁₄", octano: "C₈H₁₈", decano: "C₁₀H₂₂",
  eteno: "C₂H₄", propeno: "C₃H₆", buteno: "C₄H₈", penteno: "C₅H₁₀", hexeno: "C₆H₁₂", heptano: "C₇H₁₆", hexadieno: "C₆H₁₀", hexatrieno: "C₆H₈",
  etino: "C₂H₂", propino: "C₃H₄", butino: "C₄H₆", pentino: "C₅H₈", hexyne: "C₆H₁₀", hexadiino: "C₆H₆", enino6: "C₆H₈", enino7: "C₇H₁₀",
  ciclo3: "C₃H₆", ciclo4: "C₄H₈", ciclo5: "C₅H₁₀", ciclo6: "C₆H₁₂", ciclo7: "C₇H₁₄", ciclo8: "C₈H₁₆", ciclo9: "C₉H₁₈",
  ciclopenteno: "C₅H₈", ciclohexeno: "C₆H₁₀", ciclohexadieno: "C₆H₈", benzene: "C₆H₆", toluene: "C₇H₈", ethylbenzene: "C₈H₁₀", xylene: "C₈H₁₀", ethylmethylbenzene: "C₉H₁₂", ethyldimethylbenzene: "C₁₀H₁₄",
  methanol: "C₁H₄O", ethanol: "C₂H₆O", propanol: "C₃H₈O", butanol: "C₄H₁₀O", tertbutanol: "C₄H₁₀O", diol: "C₅H₁₂O₂", triol: "C₃H₈O₃",
  phenol: "C₆H₆O", benzenediol: "C₆H₆O₂", benzenetriol: "C₆H₆O₃", ether2: "C₂H₆O", ether3: "C₃H₈O", ether4: "C₄H₁₀O",
  methanal: "C₁H₂O", ethanal: "C₂H₄O", propanal: "C₃H₆O", butanal: "C₄H₈O", methylbutanal: "C₅H₁₀O", cyclopropAldehyde: "C₄H₆O", cyclopentAldehyde: "C₆H₁₀O", ringAldehyde: "C₇H₁₂O", benzaldehyde: "C₇H₆O",
  propanone: "C₃H₆O", butanone: "C₄H₈O", pentanone: "C₅H₁₀O", methylbutanone: "C₅H₁₀O",
  formicAcid: "C₁H₂O₂", aceticAcid: "C₂H₄O₂", propionicAcid: "C₃H₆O₂", isobutyricAcid: "C₄H₈O₂", ringAcid: "C₇H₁₂O₂",
  methylFormate: "C₂H₄O₂", methylAcetate: "C₃H₆O₂", ethylAcetate: "C₄H₈O₂", methylPropionate: "C₄H₈O₂",
  methylamine: "C₁H₅N", ethylamine: "C₂H₇N", propylamine: "C₃H₉N", isopropylamine: "C₃H₉N", tertbutylamine: "C₄H₁₁N", trimethylamine: "C₃H₉N",
  formamide: "C₁H₃NO", acetamide: "C₂H₅NO", propanamide: "C₃H₇NO",
  chloromethane: "C₁H₃Cl", chloropropane: "C₃H₇Cl", bromoisobutane: "C₄H₉Br", dichloroethane: "C₂H₄Cl₂",
  mixedCarbonyl: "C₄H₆O₂", chain20: "C₂₀H₄₂", branchedStress: "C₈H₁₈", multiUnsaturation: "C₆H₆",
};

function entry(category, structure, name, smiles, formula, functional = []) {
  return { category, structure, name, smiles, formula: formulas[formula] ?? formula, functional };
}

const NAME_EXPECTATIONS = {
  butanal: "butanal",
  "3-metilbutanal": "3-metilbutanal",
  "3-oxobutanal": "3-oxobutanal",
  ciclooctano: "ciclooctano",
  vinilciclohexano: "vinilciclohexano",
  "1,2,4-trimetilbenceno": "1,2,4-trimetilbenceno",
};

const CASES = [
  // A–B. Linear and branched alkanes.
  entry("alcano lineal", "metano", "metano", "C", "metano"),
  entry("alcano lineal", "etano", "etano", "CC", "etano"),
  entry("alcano lineal", "propano", "propano", "CCC", "propano"),
  entry("alcano lineal", "butano", "butano", "CCCC", "butano"),
  entry("alcano lineal", "pentano", "pentano", "CCCCC", "pentano"),
  entry("alcano lineal", "hexano", "hexano", "CCCCCC", "hexano"),
  entry("alcano lineal", "octano", "octano", "CCCCCCCC", "octano"),
  entry("alcano lineal", "decano", "decano", "CCCCCCCCCC", "decano"),
  entry("alcano ramificado", "2-metilpropano", "2-metilpropano", "CC(C)C", "butano"),
  entry("alcano ramificado", "2-metilbutano", "2-metilbutano", "CC(C)CC", "pentano"),
  entry("alcano ramificado", "2-metilpentano", "2-metilpentano", "CC(C)CCC", "hexano"),
  entry("alcano ramificado", "3-metilpentano", "3-metilpentano", "CCC(C)CC", "hexano"),
  entry("alcano ramificado", "2,2-dimetilbutano", "2,2-dimetilbutano", "CC(C)(C)CC", "hexano"),
  entry("alcano ramificado", "2,3-dimetilbutano", "2,3-dimetilbutano", "CC(C)C(C)C", "hexano"),
  entry("alcano ramificado", "2,2,3-trimetilbutano", "2,2,3-trimetilbutano", "CC(C)(C)C(C)C", "heptano"),
  entry("alcano ramificado", "3-etil-2-metilpentano", "3-etil-2-metilpentano", "CC(C)C(CC)CC", "branchedStress"),
  entry("alcano ramificado", "2,2,3,3-tetrametilbutano", "2,2,3,3-tetrametilbutano", "CC(C)(C)C(C)(C)C", "branchedStress"),
  // C–E. Multiple bonds, including coexistence.
  entry("alqueno", "eteno", "eteno", "C=C", "eteno"),
  entry("alqueno", "propeno", "propeno", "C=CC", "propeno"),
  entry("alqueno", "but-1-eno", "but-1-eno", "C=CCC", "buteno"),
  entry("alqueno", "but-2-eno", "but-2-eno", "CC=CC", "buteno"),
  entry("alqueno", "2-metilprop-1-eno", "2-metilprop-1-eno", "C=C(C)C", "buteno"),
  entry("alqueno", "3-metilpent-2-eno", "3-metilpent-2-eno", "CC=C(C)CC", "hexeno"),
  entry("alqueno", "hexa-1,3-dieno", "hexa-1,3-dieno", "C=CC=CCC", "hexadieno"),
  entry("alqueno", "hexa-1,3,5-trieno", "hexa-1,3,5-trieno", "C=CC=CC=C", "hexatrieno"),
  entry("alquino", "etino", "etino", "C#C", "etino"),
  entry("alquino", "propino", "propino", "C#CC", "propino"),
  entry("alquino", "but-1-ino", "but-1-ino", "C#CCC", "butino"),
  entry("alquino", "but-2-ino", "but-2-ino", "CC#CC", "butino"),
  entry("alquino", "3-metilpent-1-ino", "3-metilpent-1-ino", "C#CC(C)CC", "hexyne"),
  entry("alquino", "hexa-1,3-diino", "hexa-1,3-diino", "C#CC#CCC", "hexadiino"),
  entry("enino", "hex-1-en-3-ino", "hex-1-en-3-ino", "C=CC#CCC", "enino6"),
  entry("enino", "hept-1-en-5-ino", "hept-1-en-5-ino", "C=CCCC#CC", "enino7"),
  // F–I. Rings and aromatic graphs.
  entry("cicloalcano", "ciclopropano", "ciclopropano", "C1CC1", "ciclo3"),
  entry("cicloalcano", "ciclobutano", "ciclobutano", "C1CCC1", "ciclo4"),
  entry("cicloalcano", "ciclopentano", "ciclopentano", "C1CCCC1", "ciclo5"),
  entry("cicloalcano", "ciclohexano", "ciclohexano", "C1CCCCC1", "ciclo6"),
  entry("cicloalcano", "metilciclohexano", "metilciclohexano", "CC1CCCCC1", "ciclo7"),
  entry("cicloalcano", "1,2-dimetilciclohexano", "1,2-dimetilciclohexano", "CC1CCCCC1C", "ciclo8"),
  entry("cicloalcano", "1-etil-3-metilciclohexano", "1-etil-3-metilciclohexano", "CCC1CC(C)CCC1", "ciclo9"),
  entry("cicloalqueno", "ciclopenteno", "ciclopent-1-eno", "C1=CCCC1", "ciclopenteno"),
  entry("cicloalqueno", "ciclohexeno", "ciclohex-1-eno", "C1=CCCCC1", "ciclohexeno"),
  entry("cicloalqueno", "ciclohexa-1,3-dieno", "ciclohexa-1,3-dieno", "C1=CC=CCC1", "ciclohexadieno"),
  entry("anillos múltiples", "dos ciclohexanos unidos", "ciclohexilciclohexano", "C1CCCCC1C2CCCCC2", "C₁₂H₂₂"),
  entry("anillos múltiples", "anillos mediante CH2", "ciclohexilmetilciclohexano", "C1CCCCC1CC2CCCCC2", "C₁₃H₂₄"),
  entry("anillos múltiples", "anillo lateral ramificado", "isopropilciclohexano", "C1CCCCC1C(C)C", "C₉H₁₈"),
  entry("aromático", "benceno", "benceno", "c1ccccc1", "benzene"),
  entry("aromático", "tolueno", "tolueno", "Cc1ccccc1", "toluene"),
  entry("aromático", "etilbenceno", "etilbenceno", "CCc1ccccc1", "ethylbenzene"),
  entry("aromático", "1,2-dimetilbenceno", "1,2-dimetilbenceno", "Cc1ccccc1C", "xylene"),
  entry("aromático", "1,3-dimetilbenceno", "1,3-dimetilbenceno", "Cc1cccc(C)c1", "xylene"),
  entry("aromático", "1,4-dimetilbenceno", "1,4-dimetilbenceno", "Cc1ccc(C)cc1", "xylene"),
  entry("aromático", "1-etil-3-metilbenceno", "1-etil-3-metilbenceno", "CCc1cccc(C)c1", "ethylmethylbenzene"),
  entry("aromático", "1-etil-2,4-dimetilbenceno", "1-etil-2,4-dimetilbenceno", "CCc1c(C)cc(C)cc1", "ethyldimethylbenzene"),
  // J–U. Functional groups.
  entry("alcohol", "metanol", "metanol", "CO", "methanol", ["alcohol"]),
  entry("alcohol", "etanol", "etanol", "CCO", "ethanol", ["alcohol"]),
  entry("alcohol", "propan-1-ol", "propan-1-ol", "CCCO", "propanol", ["alcohol"]),
  entry("alcohol", "propan-2-ol", "propan-2-ol", "CC(O)C", "propanol", ["alcohol"]),
  entry("alcohol", "butan-2-ol", "butan-2-ol", "CCC(O)C", "butanol", ["alcohol"]),
  entry("alcohol", "2-metilpropan-2-ol", "2-metilpropan-2-ol", "CC(C)(C)O", "tertbutanol", ["alcohol"]),
  entry("alcohol", "pentano-1,3-diol", "pentano-1,3-diol", "OCCC(O)CC", "diol", ["alcohol", "alcohol"]),
  entry("alcohol", "propano-1,2,3-triol", "propano-1,2,3-triol", "OCC(O)CO", "triol", ["alcohol", "alcohol", "alcohol"]),
  entry("fenol", "fenol", "fenol", "Oc1ccccc1", "phenol", ["alcohol"]),
  entry("fenol", "benceno-1,2-diol", "benceno-1,2-diol", "Oc1ccccc1O", "benzenediol", ["alcohol", "alcohol"]),
  entry("fenol", "benceno-1,3-diol", "benceno-1,3-diol", "Oc1cccc(O)c1", "benzenediol", ["alcohol", "alcohol"]),
  entry("fenol", "benceno-1,4-diol", "benceno-1,4-diol", "Oc1ccc(O)cc1", "benzenediol", ["alcohol", "alcohol"]),
  entry("fenol", "benceno-1,3,5-triol", "benceno-1,3,5-triol", "Oc1cc(O)cc(O)c1", "benzenetriol", ["alcohol", "alcohol", "alcohol"]),
  entry("éter", "metoximetano", "metoximetano", "COC", "ether2", ["ether"]),
  entry("éter", "metoxietano", "metoxietano", "COCC", "ether3", ["ether"]),
  entry("éter", "etoxietano", "etoxietano", "CCOCC", "ether4", ["ether"]),
  entry("éter", "1-metoxipropano", "1-metoxipropano", "COCCC", "ether4", ["ether"]),
  entry("éter", "2-metoxipropano", "2-metoxipropano", "COC(C)C", "ether4", ["ether"]),
  entry("aldehído", "metanal", "metanal", "C=O", "methanal", ["aldehyde"]),
  entry("aldehído", "etanal", "etanal", "CC=O", "ethanal", ["aldehyde"]),
  entry("aldehído", "propanal", "propanal", "CCC=O", "propanal", ["aldehyde"]),
  entry("aldehído", "butanal", "butanal", "CCCC=O", "butanal", ["aldehyde"]),
  entry("aldehído", "2-metilpropanal", "2-metilpropanal", "CC(C)C=O", "butanal", ["aldehyde"]),
  entry("aldehído", "3-metilbutanal", "3-metilbutanal", "CC(C)CC=O", "methylbutanal", ["aldehyde"]),
  entry("aldehído en anillo", "ciclopropanocarbaldehído", "ciclopropanocarbaldehído", "O=CC1CC1", "cyclopropAldehyde", ["aldehyde"]),
  entry("aldehído en anillo", "ciclopentanocarbaldehído", "ciclopentanocarbaldehído", "O=CC1CCCC1", "cyclopentAldehyde", ["aldehyde"]),
  entry("aldehído en anillo", "ciclohexanocarbaldehído", "ciclohexanocarbaldehído", "O=CC1CCCCC1", "ringAldehyde", ["aldehyde"]),
  entry("aldehído en anillo", "benzaldehído", "benzaldehído", "O=Cc1ccccc1", "benzaldehyde", ["aldehyde"]),
  entry("cetona", "propanona", "propan-2-ona", "CC(=O)C", "propanone", ["ketone"]),
  entry("cetona", "butan-2-ona", "butan-2-ona", "CCC(=O)C", "butanone", ["ketone"]),
  entry("cetona", "pentan-2-ona", "pentan-2-ona", "CCCC(=O)C", "pentanone", ["ketone"]),
  entry("cetona", "pentan-3-ona", "pentan-3-ona", "CCC(=O)CC", "pentanone", ["ketone"]),
  entry("cetona", "3-metilbutan-2-ona", "3-metilbutan-2-ona", "CC(=O)C(C)C", "methylbutanone", ["ketone"]),
  entry("oxo", "3-oxobutanal", "3-oxobutanal", "O=CCC(C)=O", "mixedCarbonyl", ["aldehyde", "ketone"]),
  entry("ácido", "ácido metanoico", "ácido metanoico", "O=CO", "formicAcid", ["carboxylicAcid"]),
  entry("ácido", "ácido etanoico", "ácido etanoico", "CC(=O)O", "aceticAcid", ["carboxylicAcid"]),
  entry("ácido", "ácido propanoico", "ácido propanoico", "CCC(=O)O", "propionicAcid", ["carboxylicAcid"]),
  entry("ácido", "ácido 2-metilpropanoico", "ácido 2-metilpropanoico", "CC(C)C(=O)O", "isobutyricAcid", ["carboxylicAcid"]),
  entry("ácido en anillo", "ácido ciclohexanocarboxílico", "ácido ciclohexanocarboxílico", "O=C(O)C1CCCCC1", "ringAcid", ["carboxylicAcid"]),
  entry("éster", "metanoato de metilo", "metanoato de metilo", "COC=O", "methylFormate", ["ester"]),
  entry("éster", "etanoato de metilo", "etanoato de metilo", "CC(=O)OC", "methylAcetate", ["ester"]),
  entry("éster", "etanoato de etilo", "etanoato de etilo", "CC(=O)OCC", "ethylAcetate", ["ester"]),
  entry("éster", "propanoato de metilo", "propanoato de metilo", "CCC(=O)OC", "methylPropionate", ["ester"]),
  entry("amina", "metanamina", "metanamina", "CN", "methylamine", ["amine"]),
  entry("amina", "etanamina", "etanamina", "CCN", "ethylamine", ["amine"]),
  entry("amina", "propan-1-amina", "propan-1-amina", "CCCN", "propylamine", ["amine"]),
  entry("amina", "propan-2-amina", "propan-2-amina", "CC(N)C", "isopropylamine", ["amine"]),
  entry("amina", "2-metilpropan-2-amina", "2-metilpropan-2-amina", "CC(C)(C)N", "tertbutylamine", ["amine"]),
  entry("amina", "trimetilamina", "trimetilamina", "CN(C)C", "trimethylamine", ["amine"]),
  entry("amida", "metanamida", "metanamida", "C(=O)N", "formamide", ["amide"]),
  entry("amida", "etanamida", "etanamida", "CC(=O)N", "acetamide", ["amide"]),
  entry("amida", "propanamida", "propanamida", "CCC(=O)N", "propanamide", ["amide"]),
  entry("halogenado", "clorometano", "clorometano", "CCl", "chloromethane", ["halogen"]),
  entry("halogenado", "1-cloropropano", "1-cloropropano", "CCCCl", "chloropropane", ["halogen"]),
  entry("halogenado", "2-cloropropano", "2-cloropropano", "CC(Cl)C", "chloropropane", ["halogen"]),
  entry("halogenado", "1-bromo-2-metilpropano", "1-bromo-2-metilpropano", "CC(C)CBr", "bromoisobutane", ["halogen"]),
  entry("halogenado", "1,2-dicloroetano", "1,2-dicloroetano", "ClCCCl", "dichloroethane", ["halogen", "halogen"]),
  // Structural stress, all intended to remain editable except explicit topology limits below.
  entry("estrés", "cadena de 20 carbonos", "icosano", "CCCCCCCCCCCCCCCCCCCC", "chain20"),
  entry("estrés", "carbonos cuaternarios múltiples", "2,2,3,3-tetrametilbutano", "CC(C)(C)C(C)(C)C", "branchedStress"),
  entry("estrés", "múltiples enlaces triples", "hexa-1,3-diino", "C#CC#CCC", "multiUnsaturation"),
  // Expanded coverage: deliberately varied positions, topology and functional contexts.
  // Alkanes (12).
  entry("alcano lineal", "nonano", "nonano", "CCCCCCCCC", "C₉H₂₀"),
  entry("alcano lineal", "undecano", "undecano", "CCCCCCCCCCC", "C₁₁H₂₄"),
  entry("alcano lineal", "dodecano", "dodecano", "CCCCCCCCCCCC", "C₁₂H₂₆"),
  entry("alcano ramificado", "2-metilhexano", "2-metilhexano", "CC(C)CCCC", "C₇H₁₆"),
  entry("alcano ramificado", "3-metilhexano", "3-metilhexano", "CCC(C)CCC", "C₇H₁₆"),
  entry("alcano ramificado", "2,2-dimetilpentano", "2,2-dimetilpentano", "CC(C)(C)CCC", "C₇H₁₆"),
  entry("alcano ramificado", "2,3-dimetilpentano", "2,3-dimetilpentano", "CC(C)C(C)CC", "C₇H₁₆"),
  entry("alcano ramificado", "2,4-dimetilpentano", "2,4-dimetilpentano", "CC(C)CC(C)C", "C₇H₁₆"),
  entry("alcano ramificado", "3,3-dimetilpentano", "3,3-dimetilpentano", "CCC(C)(C)CC", "C₇H₁₆"),
  entry("alcano ramificado", "2,2,4-trimetilpentano", "2,2,4-trimetilpentano", "CC(C)(C)CC(C)C", "C₈H₁₈"),
  entry("alcano ramificado", "2,3,4-trimetilpentano", "2,3,4-trimetilpentano", "CC(C)C(C)C(C)C", "C₈H₁₈"),
  entry("alcano ramificado", "2,2,3,3-tetrametilpentano", "2,2,3,3-tetrametilpentano", "CC(C)(C)C(C)(C)CC", "C₉H₂₀"),
  // Alkenes and dienes (15).
  entry("alqueno", "pent-1-eno", "pent-1-eno", "C=CCCC", "C₅H₁₀"),
  entry("alqueno", "pent-2-eno", "pent-2-eno", "CC=CCC", "C₅H₁₀"),
  entry("alqueno", "hex-1-eno", "hex-1-eno", "C=CCCCC", "C₆H₁₂"),
  entry("alqueno", "hex-2-eno", "hex-2-eno", "CC=CCCC", "C₆H₁₂"),
  entry("alqueno", "hex-3-eno", "hex-3-eno", "CCC=CCC", "C₆H₁₂"),
  entry("alqueno", "hept-1-eno", "hept-1-eno", "C=CCCCCC", "C₇H₁₄"),
  entry("alqueno", "hept-2-eno", "hept-2-eno", "CC=CCCCC", "C₇H₁₄"),
  entry("alqueno", "hept-3-eno", "hept-3-eno", "CCC=CCCC", "C₇H₁₄"),
  entry("alqueno", "oct-1-eno", "oct-1-eno", "C=CCCCCCC", "C₈H₁₆"),
  entry("alqueno", "oct-2-eno", "oct-2-eno", "CC=CCCCCC", "C₈H₁₆"),
  entry("alqueno", "oct-3-eno", "oct-3-eno", "CCC=CCCCC", "C₈H₁₆"),
  entry("alqueno ramificado", "3-metilhex-1-eno", "3-metilhex-1-eno", "C=CC(C)CCC", "C₇H₁₄"),
  entry("alqueno ramificado", "4-metilhex-2-eno", "4-metilhex-2-eno", "CC=CC(C)CC", "C₇H₁₄"),
  entry("dieno", "hepta-1,3-dieno", "hepta-1,3-dieno", "C=CC=CCCC", "C₇H₁₂"),
  entry("dieno", "octa-1,3,5-trieno", "octa-1,3,5-trieno", "C=CC=CC=CCC", "C₈H₁₂"),
  // Alkynes and enynes (12).
  entry("alquino", "pent-1-ino", "pent-1-ino", "C#CCCC", "C₅H₈"),
  entry("alquino", "pent-2-ino", "pent-2-ino", "CC#CCC", "C₅H₈"),
  entry("alquino", "hex-1-ino", "hex-1-ino", "C#CCCCC", "C₆H₁₀"),
  entry("alquino", "hex-2-ino", "hex-2-ino", "CC#CCCC", "C₆H₁₀"),
  entry("alquino", "hex-3-ino", "hex-3-ino", "CCC#CCC", "C₆H₁₀"),
  entry("alquino", "hept-1-ino", "hept-1-ino", "C#CCCCCC", "C₇H₁₂"),
  entry("alquino ramificado", "4-metilhex-1-ino", "4-metilhex-1-ino", "C#CCC(C)CC", "C₇H₁₂"),
  entry("alquino ramificado", "4-metilhex-2-ino", "4-metilhex-2-ino", "CC#CC(C)CC", "C₇H₁₂"),
  entry("diino", "hepta-1,3-diino", "hepta-1,3-diino", "C#CC#CCCC", "C₇H₈"),
  entry("diino", "octa-1,3-diino", "octa-1,3-diino", "C#CC#CCCCC", "C₈H₁₀"),
  entry("enino", "oct-1-en-3-ino", "oct-1-en-3-ino", "C=CC#CCCCC", "C₈H₁₂"),
  entry("enino", "hept-2-en-4-ino", "hept-2-en-4-ino", "CC=CC#CCC", "C₇H₁₀"),
  // Monocyclic structures (12).
  entry("cicloalcano", "cicloheptano", "cicloheptano", "C1CCCCCC1", "C₇H₁₄"),
  entry("cicloalcano", "ciclooctano", "ciclooctano", "C1CCCCCCC1", "C₈H₁₆"),
  entry("cicloalcano", "etilciclohexano", "etilciclohexano", "CCC1CCCCC1", "C₈H₁₆"),
  entry("cicloalcano", "1,3-dimetilciclohexano", "1,3-dimetilciclohexano", "CC1CC(C)CCC1", "C₈H₁₆"),
  entry("cicloalcano", "1,4-dimetilciclohexano", "1,4-dimetilciclohexano", "CC1CCC(C)CC1", "C₈H₁₆"),
  entry("cicloalcano", "1-etil-2-metilciclohexano", "1-etil-2-metilciclohexano", "CCC1C(C)CCCC1", "C₉H₁₈"),
  entry("cicloalcano", "etilciclopentano", "etilciclopentano", "CCC1CCCC1", "C₇H₁₄"),
  entry("cicloalqueno", "1-metilciclopenteno", "1-metilciclopent-1-eno", "CC1=CCCC1", "C₆H₁₀"),
  entry("cicloalqueno", "3-metilciclohexeno", "3-metilciclohex-1-eno", "C1=CC(C)CCC1", "C₇H₁₂"),
  entry("cicloalqueno", "1-etilciclohexeno", "1-etilciclohex-1-eno", "CCC1=CCCCC1", "C₈H₁₄"),
  entry("cicloalqueno", "1,3-dimetilciclohexeno", "1,3-dimetilciclohex-1-eno", "CC1=CC(C)CCC1", "C₈H₁₄"),
  entry("cicloalqueno", "vinilciclohexano", "vinilciclohexano", "C=CC1CCCCC1", "C₈H₁₄"),
  // Aromatics (14).
  entry("aromático", "propilbenceno", "propilbenceno", "CCCc1ccccc1", "C₉H₁₂"),
  entry("aromático", "isopropilbenceno", "isopropilbenceno", "CC(C)c1ccccc1", "C₉H₁₂"),
  entry("aromático halogenado", "fluorobenceno", "fluorobenceno", "Fc1ccccc1", "C₆H₅F", ["halogen"]),
  entry("aromático halogenado", "clorobenceno", "clorobenceno", "Clc1ccccc1", "C₆H₅Cl", ["halogen"]),
  entry("aromático halogenado", "bromobenceno", "bromobenceno", "Brc1ccccc1", "C₆H₅Br", ["halogen"]),
  entry("aromático halogenado", "yodobenceno", "yodobenceno", "Ic1ccccc1", "C₆H₅I", ["halogen"]),
  entry("aromático halogenado", "1-cloro-2-metilbenceno", "1-cloro-2-metilbenceno", "Cc1ccccc1Cl", "C₇H₇Cl", ["halogen"]),
  entry("aromático halogenado", "1-cloro-3-metilbenceno", "1-cloro-3-metilbenceno", "Cc1cccc(Cl)c1", "C₇H₇Cl", ["halogen"]),
  entry("aromático halogenado", "1-cloro-4-metilbenceno", "1-cloro-4-metilbenceno", "Cc1ccc(Cl)cc1", "C₇H₇Cl", ["halogen"]),
  entry("aromático halogenado", "1-bromo-4-metilbenceno", "1-bromo-4-metilbenceno", "Cc1ccc(Br)cc1", "C₇H₇Br", ["halogen"]),
  entry("aromático", "1-etil-2-metilbenceno", "1-etil-2-metilbenceno", "CCc1ccccc1C", "C₉H₁₂"),
  entry("aromático", "1-etil-4-metilbenceno", "1-etil-4-metilbenceno", "CCc1ccc(C)cc1", "C₉H₁₂"),
  entry("aromático", "1,2,3-trimetilbenceno", "1,2,3-trimetilbenceno", "Cc1c(C)cccc1C", "C₉H₁₂"),
  entry("aromático", "1,2,4-trimetilbenceno", "1,2,4-trimetilbenceno", "Cc1c(C)cc(C)cc1", "C₉H₁₂"),
  // Alcohols and polyols (16).
  entry("alcohol", "hexan-1-ol", "hexan-1-ol", "CCCCCCO", "C₆H₁₄O", ["alcohol"]),
  entry("alcohol", "hexan-2-ol", "hexan-2-ol", "CCCCC(O)C", "C₆H₁₄O", ["alcohol"]),
  entry("alcohol", "hexan-3-ol", "hexan-3-ol", "CCC(O)CCC", "C₆H₁₄O", ["alcohol"]),
  entry("alcohol", "heptan-1-ol", "heptan-1-ol", "CCCCCCCO", "C₇H₁₆O", ["alcohol"]),
  entry("alcohol", "heptan-2-ol", "heptan-2-ol", "CCCCCC(O)C", "C₇H₁₆O", ["alcohol"]),
  entry("alcohol", "octan-1-ol", "octan-1-ol", "CCCCCCCCO", "C₈H₁₈O", ["alcohol"]),
  entry("alcohol", "octan-2-ol", "octan-2-ol", "CCCCCCC(O)C", "C₈H₁₈O", ["alcohol"]),
  entry("alcohol", "nonan-1-ol", "nonan-1-ol", "CCCCCCCCCO", "C₉H₂₀O", ["alcohol"]),
  entry("alcohol", "decan-1-ol", "decan-1-ol", "CCCCCCCCCCO", "C₁₀H₂₂O", ["alcohol"]),
  entry("alcohol ramificado", "2-metilbutan-1-ol", "2-metilbutan-1-ol", "CCC(C)CO", "C₅H₁₂O", ["alcohol"]),
  entry("alcohol ramificado", "3-metilpentan-2-ol", "3-metilpentan-2-ol", "CCC(C)C(O)C", "C₆H₁₄O", ["alcohol"]),
  entry("alcohol ramificado", "2-metilpentan-2-ol", "2-metilpentan-2-ol", "CCCC(C)(O)C", "C₆H₁₄O", ["alcohol"]),
  entry("alcohol ramificado", "2-metilhexan-3-ol", "2-metilhexan-3-ol", "CC(C)C(O)CCC", "C₇H₁₆O", ["alcohol"]),
  entry("alcohol insaturado", "pent-3-en-1-ol", "pent-3-en-1-ol", "OCCC=CC", "C₅H₁₀O", ["alcohol"]),
  entry("alcohol insaturado", "hex-3-en-2-ol", "hex-3-en-2-ol", "CC(O)C=CCC", "C₆H₁₂O", ["alcohol"]),
  entry("cicloalcohol", "ciclohexanol", "ciclohexanol", "OC1CCCCC1", "C₆H₁₂O", ["alcohol"]),
  // Phenols (8).
  entry("fenol sustituido", "2-metilfenol", "2-metilfenol", "Cc1ccccc1O", "C₇H₈O", ["alcohol"]),
  entry("fenol sustituido", "3-metilfenol", "3-metilfenol", "Cc1cccc(O)c1", "C₇H₈O", ["alcohol"]),
  entry("fenol sustituido", "4-metilfenol", "4-metilfenol", "Cc1ccc(O)cc1", "C₇H₈O", ["alcohol"]),
  entry("fenol sustituido", "2-etilfenol", "2-etilfenol", "CCc1ccccc1O", "C₈H₁₀O", ["alcohol"]),
  entry("fenol sustituido", "3-etilfenol", "3-etilfenol", "CCc1cccc(O)c1", "C₈H₁₀O", ["alcohol"]),
  entry("fenol sustituido", "4-etilfenol", "4-etilfenol", "CCc1ccc(O)cc1", "C₈H₁₀O", ["alcohol"]),
  entry("fenol sustituido", "2,4-dimetilfenol", "2,4-dimetilfenol", "Cc1cc(C)cc(O)c1", "C₈H₁₀O", ["alcohol"]),
  entry("fenol sustituido", "2,6-dimetilfenol", "2,6-dimetilfenol", "Cc1c(C)cccc1O", "C₈H₁₀O", ["alcohol"]),
  // Aldehydes (12).
  entry("aldehído", "pentanal", "pentanal", "CCCCC=O", "C₅H₁₀O", ["aldehyde"]),
  entry("aldehído", "hexanal", "hexanal", "CCCCCC=O", "C₆H₁₂O", ["aldehyde"]),
  entry("aldehído", "heptanal", "heptanal", "CCCCCCC=O", "C₇H₁₄O", ["aldehyde"]),
  entry("aldehído", "octanal", "octanal", "CCCCCCCC=O", "C₈H₁₆O", ["aldehyde"]),
  entry("aldehído", "nonanal", "nonanal", "CCCCCCCCC=O", "C₉H₁₈O", ["aldehyde"]),
  entry("aldehído", "decanal", "decanal", "CCCCCCCCCC=O", "C₁₀H₂₀O", ["aldehyde"]),
  entry("aldehído ramificado", "2-metilbutanal", "2-metilbutanal", "CCC(C)C=O", "C₅H₁₀O", ["aldehyde"]),
  entry("aldehído ramificado", "2-metilpentanal", "2-metilpentanal", "CCCC(C)C=O", "C₆H₁₂O", ["aldehyde"]),
  entry("aldehído ramificado", "3-metilpentanal", "3-metilpentanal", "CCC(C)CC=O", "C₆H₁₂O", ["aldehyde"]),
  entry("aldehído insaturado", "pent-2-enal", "pent-2-enal", "O=CC=CCC", "C₅H₈O", ["aldehyde"]),
  entry("aldehído insaturado", "hex-2-enal", "hex-2-enal", "O=CC=CCCC", "C₆H₁₀O", ["aldehyde"]),
  entry("aldehído insaturado", "hept-2-enal", "hept-2-enal", "O=CC=CCCCC", "C₇H₁₂O", ["aldehyde"]),
  // Ketones (12).
  entry("cetona", "hexan-2-ona", "hexan-2-ona", "CCCCC(=O)C", "C₆H₁₂O", ["ketone"]),
  entry("cetona", "hexan-3-ona", "hexan-3-ona", "CCC(=O)CCC", "C₆H₁₂O", ["ketone"]),
  entry("cetona", "heptan-2-ona", "heptan-2-ona", "CCCCCC(=O)C", "C₇H₁₄O", ["ketone"]),
  entry("cetona", "heptan-3-ona", "heptan-3-ona", "CCCCC(=O)CC", "C₇H₁₄O", ["ketone"]),
  entry("cetona", "octan-2-ona", "octan-2-ona", "CCCCCCC(=O)C", "C₈H₁₆O", ["ketone"]),
  entry("cetona", "octan-3-ona", "octan-3-ona", "CCCCCC(=O)CC", "C₈H₁₆O", ["ketone"]),
  entry("cetona", "octan-4-ona", "octan-4-ona", "CCCC(=O)CCCC", "C₈H₁₆O", ["ketone"]),
  entry("cetona", "nonan-2-ona", "nonan-2-ona", "CCCCCCCC(=O)C", "C₉H₁₈O", ["ketone"]),
  entry("cetona ramificada", "4-metilpentan-2-ona", "4-metilpentan-2-ona", "CC(=O)CC(C)C", "C₆H₁₂O", ["ketone"]),
  entry("cetona ramificada", "3-metilhexan-2-ona", "3-metilhexan-2-ona", "CC(=O)C(C)CCC", "C₇H₁₄O", ["ketone"]),
  entry("cetona insaturada", "hept-3-en-2-ona", "hept-3-en-2-ona", "CC(=O)C=CCCC", "C₇H₁₂O", ["ketone"]),
  entry("dicetona", "hexano-2,5-diona", "hexano-2,5-diona", "CC(=O)CCC(=O)C", "C₆H₁₀O₂", ["ketone", "ketone"]),
  // Carboxylic acids (8).
  entry("ácido", "ácido butanoico", "ácido butanoico", "CCCC(=O)O", "C₄H₈O₂", ["carboxylicAcid"]),
  entry("ácido", "ácido pentanoico", "ácido pentanoico", "CCCCC(=O)O", "C₅H₁₀O₂", ["carboxylicAcid"]),
  entry("ácido", "ácido hexanoico", "ácido hexanoico", "CCCCCC(=O)O", "C₆H₁₂O₂", ["carboxylicAcid"]),
  entry("ácido", "ácido heptanoico", "ácido heptanoico", "CCCCCCC(=O)O", "C₇H₁₄O₂", ["carboxylicAcid"]),
  entry("ácido", "ácido octanoico", "ácido octanoico", "CCCCCCCC(=O)O", "C₈H₁₆O₂", ["carboxylicAcid"]),
  entry("ácido ramificado", "ácido 2-metilbutanoico", "ácido 2-metilbutanoico", "CCC(C)C(=O)O", "C₅H₁₀O₂", ["carboxylicAcid"]),
  entry("ácido ramificado", "ácido 3-metilbutanoico", "ácido 3-metilbutanoico", "CC(C)CC(=O)O", "C₅H₁₀O₂", ["carboxylicAcid"]),
  entry("ácido insaturado", "ácido pent-2-enoico", "ácido pent-2-enoico", "CCC=CC(=O)O", "C₅H₈O₂", ["carboxylicAcid"]),
  // Ethers (7).
  entry("éter", "1-metoxibutano", "1-metoxibutano", "COCCCC", "C₅H₁₂O", ["ether"]),
  entry("éter", "etoxipropano", "1-etoxipropano", "CCOCCC", "C₅H₁₂O", ["ether"]),
  entry("éter", "diisopropil éter", "diisopropil éter", "CC(O(C(C)C))C", "C₆H₁₄O", ["ether"]),
  entry("éter ramificado", "2-metoxi-2-metilpropano", "2-metoxi-2-metilpropano", "COC(C)(C)C", "C₅H₁₂O", ["ether"]),
  entry("éter", "metoxiciclohexano", "metoxiciclohexano", "COC1CCCCC1", "C₇H₁₄O", ["ether"]),
  entry("éter", "etoxiciclohexano", "etoxiciclohexano", "CCOC1CCCCC1", "C₈H₁₆O", ["ether"]),
  entry("éter", "metoxiciclopentano", "metoxiciclopentano", "COC1CCCC1", "C₆H₁₂O", ["ether"]),
  // Esters (7).
  entry("éster", "butanoato de metilo", "butanoato de metilo", "CCCC(=O)OC", "C₅H₁₀O₂", ["ester"]),
  entry("éster", "propanoato de etilo", "propanoato de etilo", "CCC(=O)OCC", "C₅H₁₀O₂", ["ester"]),
  entry("éster", "etanoato de propilo", "etanoato de propilo", "CC(=O)OCCC", "C₅H₁₀O₂", ["ester"]),
  entry("éster", "etanoato de isopropilo", "etanoato de isopropilo", "CC(=O)OC(C)C", "C₅H₁₀O₂", ["ester"]),
  entry("éster ramificado", "2-metilpropanoato de metilo", "2-metilpropanoato de metilo", "CC(C)C(=O)OC", "C₅H₁₀O₂", ["ester"]),
  entry("éster", "butanoato de etilo", "butanoato de etilo", "CCCC(=O)OCC", "C₆H₁₂O₂", ["ester"]),
  entry("éster", "propanoato de propilo", "propanoato de propilo", "CCC(=O)OCCC", "C₆H₁₂O₂", ["ester"]),
  // Amines and amides (12).
  entry("amina", "butan-1-amina", "butan-1-amina", "CCCCN", "C₄H₁₁N", ["amine"]),
  entry("amina", "butan-2-amina", "butan-2-amina", "CCC(N)C", "C₄H₁₁N", ["amine"]),
  entry("amina", "pentan-1-amina", "pentan-1-amina", "CCCCCN", "C₅H₁₃N", ["amine"]),
  entry("amina", "pentan-2-amina", "pentan-2-amina", "CCCC(N)C", "C₅H₁₃N", ["amine"]),
  entry("amina secundaria", "dietilamina", "dietilamina", "CCNCC", "C₄H₁₁N", ["amine"]),
  entry("amina secundaria", "etilmetilamina", "etilmetilamina", "CNCC", "C₃H₉N", ["amine"]),
  entry("amina terciaria", "trietilamina", "trietilamina", "CCN(CC)CC", "C₆H₁₅N", ["amine"]),
  entry("amina terciaria", "N-metil-2-metilpropan-2-amina", "N-metil-2-metilpropan-2-amina", "CNC(C)(C)C", "C₅H₁₃N", ["amine"]),
  entry("amida", "butanamida", "butanamida", "CCCC(=O)N", "C₄H₉NO", ["amide"]),
  entry("amida", "pentanamida", "pentanamida", "CCCCC(=O)N", "C₅H₁₁NO", ["amide"]),
  entry("amida ramificada", "2-metilpropanamida", "2-metilpropanamida", "CC(C)C(=O)N", "C₄H₉NO", ["amide"]),
  entry("amida N-sustituida", "N-metiletanamida", "N-metiletanamida", "CC(=O)NC", "C₃H₇NO", ["amide"]),
  // Halogenated structures (15).
  entry("halogenado", "fluorometano", "fluorometano", "CF", "C₁H₃F", ["halogen"]),
  entry("halogenado", "bromometano", "bromometano", "CBr", "C₁H₃Br", ["halogen"]),
  entry("halogenado", "yodometano", "yodometano", "CI", "C₁H₃I", ["halogen"]),
  entry("halogenado", "1-fluoropropano", "1-fluoropropano", "CCC(F)", "C₃H₇F", ["halogen"]),
  entry("halogenado", "2-fluoropropano", "2-fluoropropano", "CC(F)C", "C₃H₇F", ["halogen"]),
  entry("halogenado", "1-bromopropano", "1-bromopropano", "CCCBr", "C₃H₇Br", ["halogen"]),
  entry("halogenado", "2-bromopropano", "2-bromopropano", "CC(Br)C", "C₃H₇Br", ["halogen"]),
  entry("halogenado", "1-yodopropano", "1-yodopropano", "CCCI", "C₃H₇I", ["halogen"]),
  entry("halogenado", "2-yodopropano", "2-yodopropano", "CC(I)C", "C₃H₇I", ["halogen"]),
  entry("dihalogenado", "1,2-dibromoetano", "1,2-dibromoetano", "BrCCBr", "C₂H₄Br₂", ["halogen", "halogen"]),
  entry("dihalogenado", "1-bromo-2-cloroetano", "1-bromo-2-cloroetano", "BrCCCl", "C₂H₄BrCl", ["halogen", "halogen"]),
  entry("dihalogenado", "1-cloro-2-fluoroetano", "1-cloro-2-fluoroetano", "FCCCl", "C₂H₄ClF", ["halogen", "halogen"]),
  entry("dihalogenado", "1-cloro-3-yodopropano", "1-cloro-3-yodopropano", "ClCCCI", "C₃H₆ClI", ["halogen", "halogen"]),
  entry("halogenado ramificado", "2-bromo-2-metilpropano", "2-bromo-2-metilpropano", "CC(Br)(C)C", "C₄H₉Br", ["halogen"]),
  entry("ciclohalogenado", "clorociclohexano", "clorociclohexano", "ClC1CCCCC1", "C₆H₁₁Cl", ["halogen"]),
  // Structural stress (4).
  entry("estrés", "cadena de 30 carbonos", "triacontano", "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", "C₃₀H₆₂"),
  entry("estrés", "polieno conjugado C10", "deca-1,3,5,7,9-pentaeno", "C=CC=CC=CC=CC=C", "C₁₀H₁₂"),
  entry("estrés", "alcano densamente ramificado C11", "2,2,3,3,4,4-hexametilpentano", "CC(C)(C)C(C)(C)C(C)(C)C", "C₁₁H₂₄"),
  entry("estrés funcional", "ácido 2-hidroxipropanoico", "ácido 2-hidroxipropanoico", "CC(O)C(=O)O", "C₃H₆O₃", ["alcohol", "carboxylicAcid"]),
];

const OUT_OF_SCOPE = [
  ["biciclo simple", "C1CC2CCC1C2"],
  ["anillos aromáticos fusionados", "c1ccc2ccccc2c1"],
  ["anillo espiro", "C1CCC2(CC1)CCCC2"],
];

function countElements(molecule) {
  return molecule.atoms.reduce((counts, atom) => {
    const element = atom.element ?? "C";
    counts[element] = (counts[element] ?? 0) + 1;
    return counts;
  }, {});
}

function isConnected(molecule) {
  if (!molecule.atoms.length) return false;
  const adjacency = new Map(molecule.atoms.map((atom) => [atom.id, []]));
  molecule.bonds.forEach(([left, right]) => {
    adjacency.get(left)?.push(right);
    adjacency.get(right)?.push(left);
  });
  const visited = new Set();
  const queue = [molecule.atoms[0].id];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(adjacency.get(current) ?? []));
  }
  return visited.size === molecule.atoms.length;
}

function renderIsUsable(molecule, analysis) {
  const positions = calculateMolecule2DLayout(molecule, analysis.mainChain);
  if (positions.size !== molecule.atoms.length) return false;
  return [...positions.values()].every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
}

function graphSignature(molecule) {
  const element = (atom) => atom.element ?? "C";
  const atomById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const degree = new Map(molecule.atoms.map((atom) => [atom.id, 0]));
  const neighborData = new Map(molecule.atoms.map((atom) => [atom.id, []]));
  const aromaticPairs = new Set(
    (molecule.rings ?? [])
      .filter((ring) => ring.kind === "aromatic")
      .flatMap((ring) => ring.atomIds.map((atomId, index) => [atomId, ring.atomIds[(index + 1) % ring.atomIds.length]]))
      .map(([left, right]) => [left, right].sort((a, b) => a - b).join(":")),
  );
  const edgeKinds = [];
  molecule.bonds.forEach(([left, right, order = 1]) => {
    degree.set(left, (degree.get(left) ?? 0) + order);
    degree.set(right, (degree.get(right) ?? 0) + order);
    const topologyOrder = aromaticPairs.has([left, right].sort((a, b) => a - b).join(":")) ? 1 : order;
    neighborData.get(left).push([right, topologyOrder]);
    neighborData.get(right).push([left, topologyOrder]);
    edgeKinds.push([element(atomById.get(left)), element(atomById.get(right))].sort().join("-") + ":" + topologyOrder);
  });
  let labels = new Map(molecule.atoms.map((atom) => [atom.id, element(atom)]));
  const digest = (value) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  for (let iteration = 0; iteration < molecule.atoms.length; iteration += 1) {
    const next = new Map(molecule.atoms.map((atom) => [
      atom.id,
      `${element(atom)}:${digest(`${element(atom)}(${(neighborData.get(atom.id) ?? [])
        .map(([neighbor, order]) => `${order}:${labels.get(neighbor)}`)
        .sort()
        .join(",")})`)}`,
    ]));
    if (JSON.stringify([...next.values()].sort()) === JSON.stringify([...labels.values()].sort())) break;
    labels = next;
  }
  return JSON.stringify({
    elements: Object.fromEntries(Object.entries(countElements(molecule)).sort(([left], [right]) => left.localeCompare(right))),
    degrees: molecule.atoms.map((atom) => `${element(atom)}:${degree.get(atom.id)}`).sort(),
    edgeKinds: edgeKinds.sort(),
    topology: [...labels.values()].sort(),
  });
}

function auditCase(item) {
  const imported = moleculeFromSmiles(item.smiles);
  const local = buildHydrocarbonFromIupacName(item.name);
  if (!imported.ok) {
    return { ...item, status: "FAIL-CONSTRUCTION", imported: false, local: local.ok, observed: imported.error };
  }
  const molecule = imported.molecule;
  const analysis = analyzeMolecule(molecule);
  const groupKinds = analysis.functionalGroups.map((group) => group.kind).sort();
  const expectedGroups = [...item.functional].sort();
  const exported = moleculeToSmiles(molecule);
  const roundTrip = exported.ok ? moleculeFromSmiles(exported.smiles) : { ok: false };
  const roundTripOk = isConnected(molecule)
    && exported.ok
    && roundTrip.ok
    && molecule.atoms.length > 0
    && graphSignature(molecule) === graphSignature(roundTrip.molecule);
  const formulaOk = analysis.formula === item.formula;
  const functionalOk = JSON.stringify(groupKinds) === JSON.stringify(expectedGroups);
  const valenceOk = findMoleculeValenceViolation(molecule) === null;
  const renderOk = renderIsUsable(molecule, analysis);
  const localAnalysis = local.ok ? analyzeMolecule(local.molecule, local.enabledAliases) : null;
  const localGraphOk = local.ok && graphSignature(local.molecule) === graphSignature(molecule);
  const localFormulaOk = local.ok && localAnalysis?.formula === item.formula;
  const localFunctionalOk = local.ok
    && JSON.stringify(localAnalysis.functionalGroups.map((group) => group.kind).sort()) === JSON.stringify(expectedGroups);
  const expectedName = NAME_EXPECTATIONS[item.structure];
  const nameOk = !expectedName || analysis.name === expectedName;
  const result = !valenceOk
      ? "FAIL-VALENCE"
      : !formulaOk
        ? "FAIL-FORMULA"
        : !functionalOk
          ? "FAIL-FUNCTIONAL-GROUP"
          : !renderOk
            ? "FAIL-RENDER"
            : local.ok && !localGraphOk
              ? "FAIL-GRAPH"
              : local.ok && !localFormulaOk
                ? "FAIL-FORMULA"
                : local.ok && !localFunctionalOk
                  ? "FAIL-FUNCTIONAL-GROUP"
                  : !nameOk
                    ? "FAIL-NAME"
                  : !local.ok
              ? "PARTIAL"
              : "PASS";
  return {
    ...item,
    status: result,
    imported: true,
    local: local.ok,
    atoms: molecule.atoms.length,
    elements: countElements(molecule),
    bonds: molecule.bonds.length,
    formulaObserved: analysis.formula,
    nameObserved: analysis.name,
    groupsObserved: groupKinds,
    graphOk: isConnected(molecule),
    roundTripOk,
    valenceOk,
    renderOk,
    functionalOk,
    formulaOk,
    localError: local.ok ? null : local.error,
    localGraphOk,
    localFormulaOk,
    localFunctionalOk,
    localFormulaObserved: localAnalysis?.formula ?? null,
    localNameObserved: localAnalysis?.name ?? null,
    nameOk,
  };
}

test("auditoría reproducible de capacidades del constructor", () => {
  const records = CASES.map(auditCase);
  const outOfScope = OUT_OF_SCOPE.map(([structure, smiles]) => {
    const result = moleculeFromSmiles(smiles);
    return { structure, status: result.ok ? "UNEXPECTEDLY_EDITABLE" : "OUT-OF-SCOPE", observed: result.ok ? null : result.error };
  });

  // This is a diagnostic suite: graph, valence and formula discrepancies are
  // deliberately recorded as capability outcomes rather than failing the run.
  assert.equal(records.length, CASES.length);
  outOfScope.forEach((record) => assert.equal(record.status, "OUT-OF-SCOPE", record.structure));

  console.log("CAPABILITY_AUDIT_SUMMARY_JSON=" + JSON.stringify({
    caseCount: records.length,
    totals: Object.fromEntries(
      Object.entries(Object.groupBy(records, ({ status }) => status)).map(([status, entries]) => [status, entries.length]),
    ),
    issues: records
      .filter((record) => record.status !== "PASS")
      .map((record) => ({
        structure: record.structure,
        status: record.status,
        expectedFormula: record.formula,
        observedFormula: record.formulaObserved ?? null,
        expectedGroups: record.functional,
        observedGroups: record.groupsObserved ?? null,
        localGraph: record.localGraphOk,
        localFormula: record.localFormulaObserved,
        expectedName: NAME_EXPECTATIONS[record.structure] ?? null,
        observedName: record.nameObserved,
        localName: record.localNameObserved,
        error: record.localError,
      })),
    outOfScope,
  }));
});

test("auditoría de límites de valencia y rechazo preventivo", () => {
  const atoms = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 1, y: 0 },
    { id: 3, x: 2, y: 0 },
    { id: 4, x: 3, y: 0 },
    { id: 5, x: 4, y: 0 },
    { id: 6, x: 5, y: 0, element: "O" },
    { id: 7, x: 6, y: 0, element: "N" },
    { id: 8, x: 7, y: 0, element: "N", charge: 1 },
  ];
  const molecule = (bonds, selectedAtoms) => ({ atoms: selectedAtoms, bonds });
  const c = atoms.slice(0, 5);
  const o = atoms.slice(0, 6);
  const n = atoms.slice(0, 8);

  const cases = [
    ["C con cuatro simples", molecule([[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 1]], c), false],
    ["C con doble y dos simples", molecule([[1, 2, 2], [1, 3, 1], [1, 4, 1]], c), false],
    ["C con triple y simple", molecule([[1, 2, 3], [1, 3, 1]], c), false],
    ["C pentavalente", molecule([[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 1], [1, 6, 1]], atoms.slice(0, 6)), true],
    ["O con dos enlaces", molecule([[6, 1, 1], [6, 2, 1]], o), false],
    ["O con tres enlaces", molecule([[6, 1, 1], [6, 2, 1], [6, 3, 1]], o), true],
    ["N neutro con tres enlaces", molecule([[7, 1, 1], [7, 2, 1], [7, 3, 1]], n.slice(0, 7)), false],
    ["N neutro tetravalente", molecule([[7, 1, 1], [7, 2, 1], [7, 3, 1], [7, 4, 1]], n.slice(0, 7)), true],
    ["N positivo con cuatro enlaces", molecule([[8, 1, 1], [8, 2, 1], [8, 3, 1], [8, 4, 1]], n), false],
  ];

  const results = cases.map(([structure, candidate, shouldReject]) => {
    const violation = findMoleculeValenceViolation(candidate);
    return { structure, shouldReject, rejected: violation !== null, message: violation?.message ?? null };
  });
  results.forEach((result) => assert.equal(result.rejected, result.shouldReject, result.structure));

  const saturatedCarbon = molecule([[1, 2, 1], [1, 3, 1], [1, 4, 1], [1, 5, 1]], c);
  const atomViolation = getAtomValenceViolation(saturatedCarbon, 1, 1);
  const bondViolation = findBondValenceViolation(
    saturatedCarbon,
    1,
    2,
    3,
  );
  assert.ok(atomViolation, "la comprobación puntual debe detectar carbono con cinco enlaces");
  assert.ok(bondViolation, "la comprobación previa debe bloquear un triple inválido");
  console.log("CAPABILITY_AUDIT_VALENCE_JSON=" + JSON.stringify(results));
});
