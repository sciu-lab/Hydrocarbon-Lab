import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Molecule as OCLMolecule, SmilesParser } from "openchemlib";

// Diagnostic arbitration only. Never rewrites fixtures or the phase-one results.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "reports", "external-molecule-audit");
const inputPaths = ["fixtures.json", "results.json", "results.csv", "summary.md"].map((name) => path.join(dir, name));
const inputs = await Promise.all(inputPaths.map((p) => fs.readFile(p)));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const inputHashes = Object.fromEntries(inputPaths.map((p, i) => [path.basename(p), sha256(inputs[i])]));
const frozenHashes = {
  "fixtures.json": "8d23645ee49e9d25d84d471aabd7d99c979a9bf0890619afb6647b5984899ad8",
  "results.json": "d8c5b5e714595aaf5009ceb87ba5dfa15e89750e993046fb7e4e1e9d4badb61e",
  "results.csv": "d967ffbe058db18b2ebda902d368b168ec4d3102b217eb4721eee0522ef17917",
  "summary.md": "54beeb4d2d946bf7127b9a4fdd15a24e77055c02dfceb219513ad7ba6d7974cb",
};
for (const [name, hash] of Object.entries(frozenHashes)) if (inputHashes[name] !== hash) throw new Error(`La auditoría original cambió: ${name}`);
const fixtures = JSON.parse(inputs[0].toString("utf8"));
const original = JSON.parse(inputs[1].toString("utf8"));
const fixtureById = new Map(fixtures.cases.map((item) => [item.id, item]));
const originalById = new Map(original.results.map((item) => [item.id, item]));

if (fixtures.cases.length !== 122 || new Set(fixtures.cases.map((item) => item.cid)).size !== 122) throw new Error("El lote original ya no contiene 122 estructuras/CID únicos.");
if (original.results.length !== 122 || original.results.filter((item) => item.status === "PARTIAL").length !== 100) throw new Error("Los resultados originales ya no tienen 122 casos y 100 PARTIAL.");
if (fixtures.cases.some((item) => !originalById.has(item.id))) throw new Error("Un fixture no existe en el resultado original.");

const blueBook = {
  general: "https://iupac.qmul.ac.uk/BlueBook/P1.html",
  locants: "https://iupac.qmul.ac.uk/BlueBook/P1.html#P-14.3",
  bicyclic: "https://iupac.qmul.ac.uk/BlueBook/P2.html#P-23.2",
  functional: "https://iupac.qmul.ac.uk/BlueBook/P3.html",
  acids: "https://iupac.qmul.ac.uk/BlueBook/P6.html#P-65.1.1.1",
  stereo: "https://iupac.qmul.ac.uk/BlueBook/P9.html#P-91.2.2",
};

function translateSpanish(raw) {
  let value = raw.toLowerCase().normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "");
  if (value.startsWith("acido ")) return `${translateSpanish(value.slice(6))} acid`;
  if (value.includes(" de ")) {
    const [acid, alkyl] = value.split(" de ");
    return `${translateSpanish(alkyl.replace(/o$/, ""))} ${translateSpanish(acid)}`;
  }
  value = value.replaceAll("carbaldehido", "carbaldehyde").replaceAll("carboxilico", "carboxylic");
  value = value.replaceAll("benceno", "benzene").replaceAll("biciclo", "bicyclo").replaceAll("ciclo", "cyclo");
  value = value.replaceAll("metoxi", "methoxy").replaceAll("etoxi", "ethoxy");
  value = value.replaceAll("metil", "methyl").replaceAll("etil", "ethyl").replaceAll("propil", "propyl").replaceAll("cloro", "chloro");
  value = value.replaceAll("etan", "ethan"); // Also converts metan -> methan without changing other roots.
  value = value.replaceAll("eteno", "ethene").replaceAll("etino", "ethyne");
  value = value.replaceAll(/ano(?=carbaldehyde|carboxylic)/g, "ane");
  value = value.replaceAll("trieno", "triene").replaceAll("dieno", "diene").replaceAll("diino", "diyne");
  value = value.replaceAll("eno", "ene").replaceAll("ino", "yne");
  value = value.replaceAll("amida", "amide").replaceAll("amina", "amine").replaceAll(/ona$/g, "one");
  value = value.replaceAll("oico", "oic").replaceAll(/ato$/g, "ate");
  value = value.replaceAll(/(pent|prop)an(?=-[\d,]+-(?:diol|triol))/g, "$1ane");
  value = value.replaceAll(/ano(?!ic|ate)/g, "ane");
  return value;
}

const alternatives = new Map([
  ["HC-022", { area: "parent alquino", reason: "El grafo C≡C tiene dos carbonos; «ethyne» es la construcción sistemática para el mismo parent que IUPAC también denomina mediante el nombre retenido «acetylene». Los dos designan exactamente C₂H₂.", referenceKind: "C: retenido/PIN", generatedKind: "B: sistemático general", source: blueBook.general }],
  ["HC-047", { area: "parent aromático", reason: "El grafo es un anillo bencénico con un solo grupo metilo. «Methylbenzene» expresa la misma sustitución que el nombre retenido «toluene»; no cambia parent ni posición.", referenceKind: "C: retenido", generatedKind: "B: sistemático general", source: blueBook.general }],
  ["HC-049", { area: "parent aromático y localizadores", reason: "El CID tiene dos metilos vecinos en benceno (1,2). «1,2-Dimethylbenzene» especifica esos mismos átomos que «1,2-xylene»; es la forma sustitucional sistemática.", referenceKind: "C: xileno retenido en nomenclatura general", generatedKind: "B: sistemático general", source: blueBook.locants }],
  ["HC-050", { area: "parent aromático y localizadores", reason: "El CID tiene dos metilos en relación 1,3 sobre benceno. «1,3-Dimethylbenzene» y «1,3-xylene» son nombres de ese mismo isómero; los localizadores son correctos.", referenceKind: "C: xileno retenido en nomenclatura general", generatedKind: "B: sistemático general", source: blueBook.locants }],
  ["HC-051", { area: "parent aromático y localizadores", reason: "El CID tiene dos metilos en relación 1,4 sobre benceno. «1,4-Dimethylbenzene» expresa el mismo isómero que «1,4-xylene».", referenceKind: "C: xileno retenido en nomenclatura general", generatedKind: "B: sistemático general", source: blueBook.locants }],
  ["HC-055", { area: "sustituyente ramificado", reason: "El anillo bencénico porta –CH(CH₃)₂. «(1-Methylethyl)benzene» describe el sustituyente propan-2-il mediante un nombre sistemático de sustituyente; «cumene» es el nombre tradicional del mismo grafo.", referenceKind: "C/D: tradicional retenido", generatedKind: "B: sistemático general", source: blueBook.general }],
  ["HC-064", { area: "sufijo aldehído", reason: "C=O con un solo carbono y dos hidrógenos es el aldehído de un carbono. «Methanal» usa el sufijo sistemático -al; «formaldehyde» es el nombre tradicional para la misma estructura.", referenceKind: "C/D: tradicional", generatedKind: "B: sistemático general", source: blueBook.functional }],
  ["HC-065", { area: "sufijo aldehído", reason: "CC=O es un aldehído terminal de dos carbonos. «Ethanal» expresa correctamente ese parent y el sufijo -al; «acetaldehyde» designa la misma estructura.", referenceKind: "C/D: tradicional", generatedKind: "B: sistemático general", source: blueBook.functional }],
  ["HC-080", { area: "ácido carboxílico", reason: "H–C(=O)OH es el ácido carboxílico de un carbono. IUPAC distingue explícitamente «formic acid» como nombre retenido PIN y «methanoic acid» como alternativa sistemática válida.", referenceKind: "A/C: retenido y PIN", generatedKind: "B: sistemático general", source: blueBook.acids }],
  ["HC-081", { area: "ácido carboxílico", reason: "CH₃–C(=O)OH es el ácido carboxílico de dos carbonos. IUPAC cita «acetic acid» como retenido PIN y «ethanoic acid» como alternativa sistemática válida.", referenceKind: "A/C: retenido y PIN", generatedKind: "B: sistemático general", source: blueBook.acids }],
  ["HC-093", { area: "nomenclatura de éster", reason: "La conectividad es H–C(=O)–O–CH₃: metanoato de metilo. «Methyl methanoate» usa el parent sistemático del ácido metanoico; «methyl formate» usa la raíz retenida formiato.", referenceKind: "C/D: éster de ácido retenido", generatedKind: "B: sistemático general", source: blueBook.acids }],
  ["HC-094", { area: "nomenclatura de éster", reason: "La conectividad es CH₃–C(=O)–O–CH₃. «Methyl ethanoate» y «methyl acetate» nombran el mismo éster; etanoato y acetato son las dos raíces válidas aquí.", referenceKind: "C/D: éster de ácido retenido", generatedKind: "B: sistemático general", source: blueBook.acids }],
  ["HC-095", { area: "nomenclatura de éster", reason: "La conectividad es CH₃–C(=O)–O–CH₂CH₃. «Ethyl ethanoate» conserva el grupo etilo y el ácido etanoico de «ethyl acetate».", referenceKind: "C/D: éster de ácido retenido", generatedKind: "B: sistemático general", source: blueBook.acids }],
  ["HC-106", { area: "sufijo amida", reason: "H–C(=O)–NH₂ es la amida de un carbono. «Methanamide» expresa el parent y sufijo amida de forma sistemática; «formamide» es su nombre tradicional.", referenceKind: "C/D: tradicional", generatedKind: "B: sistemático general", source: blueBook.functional }],
  ["HC-107", { area: "sufijo amida", reason: "CH₃–C(=O)–NH₂ es la amida de dos carbonos. «Ethanamide» y «acetamide» identifican la misma conectividad y función.", referenceKind: "C/D: tradicional", generatedKind: "B: sistemático general", source: blueBook.functional }],
  ["HC-121", { area: "parent bicíclico", reason: "Dos ciclohexanos comparten un enlace: los trayectos entre cabezas de puente contienen 4, 4 y 0 átomos internos, y el total es 10. «Bicyclo[4.4.0]decane» nombra exactamente el grafo saturado que PubChem describe como decahydronaphthalene; la estereoquímica de unión no está definida en el fixture.", referenceKind: "B: nombre por hidrogenación de parent fusionado", generatedKind: "B: nombre sistemático von Baeyer", source: blueBook.bicyclic }],
  ["HC-122", { area: "parent bicíclico", reason: "Los dos anillos fusionados comparten un enlace; los tres trayectos de puente contienen 4, 3 y 0 átomos internos, para 9 carbonos en total. «Bicyclo[4.3.0]nonane» expresa el mismo grafo saturado que octahydro-1H-indene; el fixture no define estereoquímica de unión.", referenceKind: "B: nombre por hidrogenación de parent fusionado", generatedKind: "B: nombre sistemático von Baeyer", source: blueBook.bicyclic }],
]);
const expectedAlternativeEnglish = new Map([
  ["HC-022", "ethyne"], ["HC-047", "methylbenzene"], ["HC-049", "1,2-dimethylbenzene"],
  ["HC-050", "1,3-dimethylbenzene"], ["HC-051", "1,4-dimethylbenzene"],
  ["HC-055", "(1-methylethyl)benzene"], ["HC-064", "methanal"], ["HC-065", "ethanal"],
  ["HC-080", "methanoic acid"], ["HC-081", "ethanoic acid"], ["HC-093", "methyl methanoate"],
  ["HC-094", "methyl ethanoate"], ["HC-095", "ethyl ethanoate"],
  ["HC-106", "methanamide"], ["HC-107", "ethanamide"],
  ["HC-121", "bicyclo[4.4.0]decane"], ["HC-122", "bicyclo[4.3.0]nonane"],
]);
const missingLocants = new Map([
  ["HC-044", { expected: "1-methylcyclopentene", position: 1, other: "3-methylcyclopentene", source: blueBook.locants }],
  ["HC-045", { expected: "3-methylcyclohexene", position: 3, other: "1-methylcyclohexene", source: blueBook.locants }],
]);
const allowedStyleDifferences = new Map([
  ["HC-041", "El localizador 1 del único doble enlace del ciclopenteno es redundante para un anillo monosaturado sin otros sustituyentes; ambas formas identifican el mismo parent."],
  ["HC-042", "El localizador 1 del único doble enlace del ciclohexeno es redundante en este anillo no sustituido; ambas formas nombran la misma estructura."],
  ["HC-057", "El localizador 1 del OH en un parent etano de dos carbonos no añade distinción estructural; ethan-1-ol y ethanol identifican el mismo alcohol."],
]);

function structuralProfile(fixture, result) {
  const molecule = new SmilesParser().parseMolecule(fixture.isomericSmiles || fixture.canonicalSmiles);
  molecule.ensureHelperArrays(OCLMolecule.cHelperCIP);
  const elements = {};
  for (let atom = 0; atom < molecule.getAllAtoms(); atom += 1) {
    const element = molecule.getAtomLabel(atom);
    elements[element] = (elements[element] ?? 0) + 1;
  }
  let doubles = 0; let triples = 0;
  for (let bond = 0; bond < molecule.getAllBonds(); bond += 1) {
    const order = molecule.getBondOrder(bond);
    if (order === 2) doubles += 1;
    if (order === 3) triples += 1;
  }
  return { elements, heavyAtoms: molecule.getAllAtoms(), doubleBonds: doubles, tripleBonds: triples, perceivedRings: result.observations?.before?.rings ?? null, specifiedGeometricStereo: /[\\/]/.test(fixture.isomericSmiles ?? ""), formula: fixture.formula };
}
function relevantSynonyms(fixture, generated) {
  const selected = [fixture.referenceName, fixture.commonName, (fixture.synonyms ?? []).find((synonym) => synonym.toLowerCase() === generated.toLowerCase())].filter(Boolean);
  for (const synonym of fixture.synonyms ?? []) {
    if (selected.length >= 8) break;
    if (synonym.length > 70 || /^\d{2,}-\d{2,}-\d$/.test(synonym) || /^(CHEBI|DTX|UNII|EINECS|CAS|BRN|NSC|AKOS|CHEMBL|CTK|AC1)/i.test(synonym)) continue;
    if (!selected.some((entry) => entry.toLowerCase() === synonym.toLowerCase())) selected.push(synonym);
  }
  return selected;
}
const normalize = (s) => s.toLowerCase().replaceAll(/\s+/g, " ").trim();
const reviews = [];
const styleMismatches = [];
for (const result of original.results.filter((item) => item.status === "PARTIAL")) {
  const fixture = fixtureById.get(result.id);
  if (!fixture || fixture.cid == null) throw new Error(`Falta fixture ${result.id}`);
  const translated = translateSpanish(result.nameHydrocarbonLab);
  const profile = structuralProfile(fixture, result);
  const base = {
    id: result.id, pubchemCid: String(fixture.cid), category: fixture.category, molecule: fixture.molecule,
    canonicalSmiles: fixture.canonicalSmiles, isomericSmiles: fixture.isomericSmiles,
    smiles: fixture.isomericSmiles || fixture.canonicalSmiles, formula: fixture.formula,
    referenceName: fixture.referenceName, hydrocarbonLabName: result.nameHydrocarbonLab,
    englishInterpretation: translated, relevantSynonyms: relevantSynonyms(fixture, result.nameHydrocarbonLab),
    originalStatus: "PARTIAL", structureProfile: profile, sourceUrl: fixture.sourceUrl,
    synonymPolicy: "E: los sinónimos de PubChem se registran como evidencia auxiliar; no se usan como lista de nombres sistemáticos válidos.",
  };
  const fail = missingLocants.get(result.id);
  const alternative = alternatives.get(result.id);
  let decision;
  if (fail) {
    decision = {
      reviewStatus: "FAIL-NAME-NUMBERING", confidence: "high", ruleArea: "localizador de sustituyente en cicloalqueno",
      reason: `El nombre «${translated}» omite el localizador del grupo metilo. La referencia contiene metilo en C-${fail.position}; ${fail.other} es un isómero constitucional distinto posible en ese parent. IUPAC P-14.3.4 permite omitir un localizador solo cuando no surge ambigüedad. Aquí la omisión impide identificar el CID.`,
      notes: `Nombre esperado después de una futura corrección: ${fail.expected}. El SMILES del fixture no define E/Z y el anillo tiene menos de ocho miembros, por lo que no se exige descriptor geométrico.`,
      referenceNameKind: "PubChem IUPACName; PIN no inferido de la etiqueta de PubChem", hydrocarbonLabNameKind: "F: nombre incorrecto por ambigüedad de posición", nomenclatureSources: [fail.source, blueBook.stereo],
    };
  } else if (alternative) {
    if (normalize(translated) !== normalize(expectedAlternativeEnglish.get(result.id) ?? "")) throw new Error(`Interpretación inglesa alternativa inesperada: ${result.id}: ${translated}`);
    decision = {
      reviewStatus: "PASS-ALTERNATIVE", confidence: "high", ruleArea: alternative.area,
      reason: alternative.reason,
      notes: `Interpretación inglesa de la salida en español: ${translated}. El perfil estructural y los localizadores corresponden al CID; el nombre PubChem no se trató como única forma válida.`,
      referenceNameKind: alternative.referenceKind, hydrocarbonLabNameKind: alternative.generatedKind, nomenclatureSources: [alternative.source],
    };
  } else {
    const extra = allowedStyleDifferences.get(result.id);
    if (normalize(translated) !== normalize(fixture.referenceName) && !extra) styleMismatches.push({ id: result.id, translated, reference: fixture.referenceName });
    decision = {
      reviewStatus: "PASS-STYLE", confidence: "high", ruleArea: extra ? "omisión o inclusión de localizador redundante" : "terminología y ortografía español/inglés",
      reason: extra ?? `«${result.nameHydrocarbonLab}» se interpreta como «${translated}» en inglés sistemático, igual al nombre estructural publicado para el CID. El parent, los localizadores, las insaturaciones, la función y los sustituyentes expresados no cambian.`,
      notes: extra ? `El fixture corresponde al mismo grafo; la salida se capturó en español y la referencia PubChem está en inglés.` : `Equivalencia evaluada tras traducción controlada de morfemas nomenclaturales, conservando los números y el orden de sustituyentes. Perfil: ${profile.elements.C ?? 0} C; ${profile.doubleBonds} dobles; ${profile.tripleBonds} triples; ${profile.perceivedRings ?? "?"} anillos.`,
      referenceNameKind: "PubChem IUPACName; condición PIN no presumida", hydrocarbonLabNameKind: "B: forma sistemática general con diferencia ortográfica/idiomática", nomenclatureSources: [blueBook.general, blueBook.locants],
    };
  }
  reviews.push({ ...base, ...decision });
}
if (styleMismatches.length) throw new Error(`Revisar antes de clasificar como estilo: ${JSON.stringify(styleMismatches, null, 2)}`);
if (reviews.length !== 100 || new Set(reviews.map((item) => item.id)).size !== 100) throw new Error("No se arbitraron exactamente los 100 PARTIAL distintos.");
if (reviews.some((item) => !["high", "medium", "low"].includes(item.confidence))) throw new Error("Valor de confianza inválido.");
if (reviews.some((item) => item.reviewStatus.startsWith("FAIL") && (!item.reason || item.confidence !== "high"))) throw new Error("Un FAIL no tiene fundamento concreto de alta confianza.");

const statuses = ["PASS", "PASS-ALTERNATIVE", "PASS-STYLE", "PARTIAL-REVIEW", "FAIL-NAME-PARENT", "FAIL-NAME-NUMBERING", "FAIL-NAME-FUNCTIONAL", "FAIL-NAME-SUBSTITUENT", "FAIL-NAME-MULTIPLE-BOND", "FAIL-NAME-STEREO", "FAIL-NAME-SYNTAX", "FAIL-NAME-OTHER", "FAIL-STRUCTURE", "CRASH"];
const originalCounts = Object.fromEntries(["PASS", "PARTIAL", "FAIL-NAME", "FAIL-STRUCTURE", "CRASH"].map((key) => [key, original.results.filter((item) => item.status === key).length]));
const reviewById = new Map(reviews.map((item) => [item.id, item]));
const updatedRows = original.results.map((item) => ({ ...item, updatedStatus: item.status === "PARTIAL" ? reviewById.get(item.id).reviewStatus : item.status === "FAIL-NAME" ? "FAIL-NAME-STEREO" : item.status }));
const updatedCounts = Object.fromEntries(statuses.map((key) => [key, updatedRows.filter((item) => item.updatedStatus === key).length]));
if (Object.values(updatedCounts).reduce((a, b) => a + b, 0) !== 122) throw new Error("El nuevo recuento no suma 122.");
const familyRows = [...new Set(updatedRows.map((item) => item.category))].map((category) => {
  const rows = updatedRows.filter((item) => item.category === category);
  const passed = rows.filter((item) => ["PASS", "PASS-ALTERNATIVE", "PASS-STYLE"].includes(item.updatedStatus)).length;
  const pending = rows.filter((item) => item.updatedStatus === "PARTIAL-REVIEW").length;
  const failed = rows.length - passed - pending;
  return { category, total: rows.length, passed, partialReview: pending, failed, resolvedSuccessPercent: rows.length === pending ? null : Number((100 * passed / (rows.length - pending)).toFixed(1)) };
});
const newFailures = reviews.filter((item) => item.reviewStatus.startsWith("FAIL"));
const frozenFailures = original.results.filter((item) => item.status.startsWith("FAIL"));
const pct = (n) => `${(100 * n / 122).toFixed(1)} %`;
const mdRow = (cells) => `| ${cells.join(" | ")} |`;
const originalTable = [mdRow(["Estado original", "Casos", "% de 122"]), mdRow(["---", "---:", "---:"]), ...Object.entries(originalCounts).map(([key, count]) => mdRow([key, count, pct(count)]))].join("\n");
const updatedTable = [mdRow(["Estado tras arbitraje", "Casos", "% de 122"]), mdRow(["---", "---:", "---:"]), ...Object.entries(updatedCounts).map(([key, count]) => mdRow([key, count, pct(count)]))].join("\n");
const familyTable = [mdRow(["Familia", "Total", "PASS + alternativas + estilo", "PARTIAL-REVIEW", "FAIL", "Éxito entre resueltos"]), mdRow(["---", "---:", "---:", "---:", "---:", "---:"]), ...familyRows.map((item) => mdRow([item.category, item.total, item.passed, item.partialReview, item.failed, item.resolvedSuccessPercent === null ? "n/a" : `${item.resolvedSuccessPercent} %`]))].join("\n");
const repros = [
  { title: "Localizador de metilo omitido en cicloalquenos", count: newFailures.length, ids: newFailures.map((item) => item.id), minimum: "HC-045", input: "C1=CC(C)CCC1", expected: "3-methylcyclohexene", observed: "metilciclohex-1-eno (methylcyclohex-1-ene)", difference: "falta 3- para metilo", rule: "IUPAC P-14.3.4: el localizador no puede omitirse si permite otro isómero", hypothesis: "Hipótesis: la generación del nombre del cicloalqueno elimina también el localizador del sustituyente al simplificar el del doble enlace." },
  { title: "Descriptor E/Z omitido en el nombre, ya confirmado en fase uno", count: 4, ids: ["HC-117", "HC-118", "HC-119", "HC-120"], minimum: "HC-117", input: "C/C=C/C", expected: "(E)-but-2-ene", observed: "but-2-eno", difference: "falta (E)-", rule: "IUPAC P-91: un doble enlace acíclico con configuración definida necesita descriptor E/Z", hypothesis: "Hipótesis: la ruta de nomenclatura no incorpora la configuración geométrica almacenada en el grafo." },
  { title: "Configuración E/Z añadida al exportar, ya confirmada en fase uno", count: 5, ids: ["HC-018", "HC-020", "HC-021", "HC-030", "HC-031"], minimum: "HC-018", input: "CC=CC", expected: "but-2-ene; SMILES exportado sin E/Z especificado", observed: "but-2-eno; SMILES exportado C/C=C/C", difference: "la salida selecciona un estereoisómero ausente en la entrada", rule: "La estructura exportada debe preservar la configuración especificada o no especificada del fixture", hypothesis: "Hipótesis: el serializer infiere E/Z de las coordenadas de dibujo cuando la entrada no definía configuración." },
];
const nomenclatureRows = reviews.map((item) => mdRow([item.id, item.category, `\`${item.referenceName}\``, `\`${item.hydrocarbonLabName}\``, item.reviewStatus, item.confidence, item.ruleArea]));
const report = `# Arbitraje nomenclatural de los 100 PARTIAL\n\n## Auditoría original\n\n${originalTable}\n\n## Tras el arbitraje\n\n${updatedTable}\n\nLote congelado: **122 fixtures, 122 CID únicos**. Se revisaron exactamente los **100 PARTIAL** de \`results.json\`. Los 13 PASS, 4 FAIL-NAME, 5 FAIL-STRUCTURE y 0 CRASH originales se conservan en sus archivos y solo se reflejan en el recuento global; los 4 FAIL-NAME originales se muestran bajo el subtipo estereoquímico ya confirmado.\n\n## Criterio nomenclatural\n\nEl campo \`IUPACName\` de PubChem se utiliza como referencia, pero no se presume que cada valor sea un PIN. A = PIN verificado; B = nombre sistemático IUPAC válido no necesariamente preferido; C = nombre retenido aceptable; D = tradicional/común; E = sinónimo de base de datos sin validez sistemática inferida; F = incorrecto. Los sinónimos PubChem se registraron como información auxiliar y nunca como lista blanca. IUPAC admite nombres generales sistemáticos válidos distintos del PIN ([Blue Book P-1](${blueBook.general})); el tratamiento de localizadores sigue P-14.3.3–4 ([Blue Book P-1](${blueBook.locants})).\n\nLa salida de la primera auditoría fue capturada en español, mientras PubChem publicó los nombres en inglés. Se tradujeron morfemas nomenclaturales conservando localizadores, sufijos y orden antes de arbitrar. Este informe evalúa el contenido químico de esas salidas; no afirma haber probado el texto de la interfaz en inglés.\n\n## Resultados por familia\n\n${familyTable}\n\n## Causas raíz probables y reproducciones mínimas\n\n${repros.map((item) => `### ${item.title}\n\n- Casos afectados: ${item.count} (${item.ids.join(", ")}).\n- Caso mínimo: ${item.minimum}.\n- SMILES de entrada: \`${item.input}\`.\n- Nombre/representación esperada: \`${item.expected}\`.\n- Salida observada: \`${item.observed}\`.\n- Diferencia: ${item.difference}.\n- Regla violada: ${item.rule}.\n- Resultado esperado tras una futura corrección: \`${item.expected}\`.\n- ${item.hypothesis}\n`).join("\n")}\n## Dictámenes individuales de los 100 PARTIAL\n\n${[mdRow(["ID", "Familia", "Nombre PubChem", "Nombre Hydrocarbon Lab", "Dictamen", "Confianza", "Área"]), mdRow(["---", "---", "---", "---", "---", "---", "---"]), ...nomenclatureRows].join("\n")}\n\nLos motivos, SMILES canonical/isomeric, fórmula, sinónimos relevantes, perfil del grafo y fuentes de cada dictamen están en \`nomenclature-review.json\`.\n\n## Integridad\n\n- Fixtures al inicio y al final: 122; CID únicos: 122.\n- PARTIAL originales arbitrados: ${reviews.length}.\n- Los cuatro archivos de la fase uno permanecen disponibles y no se sobrescribieron.\n- Huellas SHA-256 de entrada: ${Object.entries(inputHashes).map(([name, hash]) => `\`${name}\` = \`${hash}\``).join("; ")}.\n- El corpus y los SMILES permanecieron inalterados; no se modificó código de producción ni se escribieron tests de regresión.\n- Los FAIL nuevos tienen razón específica y confianza alta. La mera diferencia textual y la presencia en sinónimos no determinaron un FAIL ni un PASS.\n`;
const json = {
  phase: "nomenclature arbitration of phase-one PARTIAL cases", generatedAt: new Date().toISOString(),
  frozenAudit: { fixtureCount: fixtures.cases.length, uniquePubchemCidCount: new Set(fixtures.cases.map((item) => item.cid)).size, originalCounts, inputHashes },
  reviewedPartialCount: reviews.length, reviewedCounts: Object.fromEntries(statuses.map((key) => [key, reviews.filter((item) => item.reviewStatus === key).length])),
  updatedCounts, familyResults: familyRows, bugGroups: repros, nomenclatureReferences: blueBook, reviews,
};
const jsonPath = path.join(dir, "nomenclature-review.json");
const mdPath = path.join(dir, "nomenclature-review.md");
await fs.writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`);
await fs.writeFile(mdPath, report);
const persisted = JSON.parse(await fs.readFile(jsonPath, "utf8"));
const requiredFields = ["id", "pubchemCid", "category", "smiles", "referenceName", "hydrocarbonLabName", "originalStatus", "reviewStatus", "confidence", "reason", "ruleArea", "notes"];
if (persisted.reviews.length !== 100 || new Set(persisted.reviews.map((item) => item.id)).size !== 100) throw new Error("El JSON persistido no contiene 100 dictámenes únicos.");
if (persisted.reviews.some((item) => requiredFields.some((field) => typeof item[field] !== "string" || !item[field]))) throw new Error("El JSON persistido tiene campos obligatorios ausentes.");
if (persisted.reviews.some((item) => !fixtureById.has(item.id) || originalById.get(item.id)?.status !== "PARTIAL")) throw new Error("El JSON persistido incluye un ID ajeno a los 100 PARTIAL.");
if (Object.values(persisted.updatedCounts).reduce((sum, count) => sum + count, 0) !== 122 || persisted.familyResults.reduce((sum, row) => sum + row.total, 0) !== 122) throw new Error("Inconsistencia entre recuentos globales y por familia.");
if (persisted.reviews.some((item) => item.reviewStatus.startsWith("FAIL") && (item.confidence !== "high" || !item.nomenclatureSources?.length))) throw new Error("Un fallo carece de fuente nomenclatural o confianza alta.");
for (const [i, p] of inputPaths.entries()) if (sha256(await fs.readFile(p)) !== sha256(inputs[i])) throw new Error(`Se alteró un archivo original: ${p}`);
console.log(JSON.stringify({ reviewed: reviews.length, reviewedCounts: json.reviewedCounts, updatedCounts, paths: { jsonPath, mdPath } }, null, 2));
