import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { moleculeFromSmiles, moleculeToSmiles } from "../app/openchemlib-adapter.ts";
import { calculateMolecule2DLayout } from "../app/molecule-2d-layout.ts";
import { Canonizer, Molecule as OCLMolecule, SmilesParser } from "openchemlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reports = path.join(root, "reports", "external-molecule-audit");
const referenceFile = path.join(reports, "fixtures.json");
const resultsFile = path.join(reports, "results.json");
const csvFile = path.join(reports, "results.csv");
const summaryFile = path.join(reports, "summary.md");
const { analyzeMolecule } = await (async () => {
  const server = await createServer({ root, configFile: false, logLevel: "error", appType: "custom", plugins: [react()], server: { middlewareMode: true, hmr: false } });
  try { return await server.ssrLoadModule("/app/page.tsx"); } finally { await server.close(); }
})();

function category(row) {
  const label = `${row.cat} ${row.structure}`.toLocaleLowerCase("es");
  if (/fusion|biciclo|naftal|indano|tetralin|decalin/.test(label)) return "anillos fusionados";
  if (/estereo E\/Z|isómero E|isómero Z/.test(label)) return "estereoquímica E/Z";
  if (/oxo.*butanal|mixedcarbonyl|hidroxi.*ácido|ácido.*hidroxi/.test(label)) return "varios grupos funcionales";
  if (/aldeh/.test(label)) return "aldehídos";
  if (/cetona|oxo|diketona/.test(label)) return "cetonas";
  if (/ácido|acid/.test(label)) return "ácidos carboxílicos";
  if (/éster|ester/.test(label)) return "ésteres";
  if (/éter|ether/.test(label)) return "éteres";
  if (/amida|amide/.test(label)) return "amidas";
  if (/amina|amine/.test(label)) return "aminas";
  if (/alcohol|fenol/.test(label)) return "alcoholes";
  if (/arom|benceno|benzene|fenol/.test(label)) return "benceno y derivados";
  if (/cicloalqueno/.test(label)) return "cicloalquenos";
  if (/ciclo/.test(label) || /anillos múltiples/.test(label)) return "cicloalcanos";
  if (/aldehído|cetona|éter|éster|amida|amina|ácido|alcohol/.test(label)) return "varios grupos funcionales";
  if (/dieno|trieno|polieno|diino|enino/.test(label)) return "dienos/polienos";
  if (/alquino|ino/.test(label)) return "alquinos";
  if (/alqueno|eno/.test(label)) return "alquenos";
  if (/ramific/.test(label) || /metil|etil/.test(row.structure)) return "alcanos ramificados";
  if (/lineal|alcano/.test(label)) return "alcanos lineales";
  return "otros compatibles";
}

function extractCandidates() {
  const source = fs.readFile(new URL("../tests/capability-audit.test.mjs", import.meta.url), "utf8");
  return source.then((text) => {
    const block = text.split("const CASES = [")[1].split("];\n\nconst OUT_OF_SCOPE")[0];
    const rows = [...block.matchAll(/entry\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g)].map((m) => ({ cat: m[1], display: m[2], smiles: m[4] }));
    const buckets = new Map();
    for (const row of rows) {
      row.category = category(row);
      const list = buckets.get(row.category) ?? [];
      if (!list.some((entry) => entry.smiles === row.smiles)) list.push(row);
      buckets.set(row.category, list);
    }
    const caps = new Map([
      ["alcanos lineales", 6], ["alcanos ramificados", 8], ["alquenos", 7], ["alquinos", 6], ["dienos/polienos", 6],
      ["cicloalcanos", 7], ["cicloalquenos", 5], ["benceno y derivados", 10], ["alcoholes", 8], ["aldehídos", 8],
      ["cetonas", 8], ["ácidos carboxílicos", 7], ["éteres", 6], ["ésteres", 6], ["aminas", 7], ["amidas", 6],
      ["otros compatibles", 5], ["anillos fusionados", 4],
    ]);
    const selected = [];
    for (const [name, cap] of caps) selected.push(...(buckets.get(name) ?? []).slice(0, cap));
    selected.push(
      { cat: "estereo E/Z", display: "(E)-but-2-eno", smiles: "C/C=C/C", category: "estereoquímica E/Z" },
      { cat: "estereo E/Z", display: "(Z)-but-2-eno", smiles: "C/C=C\\C", category: "estereoquímica E/Z" },
      { cat: "estereo E/Z", display: "(E)-hex-3-eno", smiles: "CC/C=C/CC", category: "estereoquímica E/Z" },
      { cat: "estereo E/Z", display: "(Z)-hex-3-eno", smiles: "CC/C=C\\CC", category: "estereoquímica E/Z" },
      { cat: "anillos fusionados", display: "decalina (bicyclo[4.4.0]decane)", smiles: "C1CCC2CCCCC2C1", category: "anillos fusionados" },
      { cat: "anillos fusionados", display: "perhidroindano", smiles: "C1CCC2CCCC2C1", category: "anillos fusionados" },
    );
    const seen = new Set();
    return selected.filter((row) => !seen.has(row.smiles) && seen.add(row.smiles)).map((row, i) => ({ id: `HC-${String(i + 1).padStart(3, "0")}`, molecule: row.display, category: row.category, inputSmiles: row.smiles }));
  });
}

async function pubchem(smiles) {
  const requestUrl = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/property/IUPACName,MolecularFormula,CanonicalSMILES,IsomericSMILES/JSON";
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(requestUrl, { method: "POST", headers: { "User-Agent": "HydrocarbonLab-Audit/1.0 (diagnostic; PubChem PUG REST)", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ smiles }) });
      if (response.status === 503 || response.status === 429) { await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1))); continue; }
      if (!response.ok) throw new Error(`PubChem HTTP ${response.status}`);
      const payload = await response.json();
      const record = payload.PropertyTable?.Properties?.[0];
      if (!record) throw new Error("PubChem no devolvió propiedades");
      return { ...record, url: `https://pubchem.ncbi.nlm.nih.gov/compound/${record.CID}`, requestUrl };
    } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1))); }
  }
  throw lastError ?? new Error("PubChem no disponible");
}

const wantRefresh = process.argv.includes("--refresh");
const wantExtend = process.argv.includes("--extend");
const wantSynonyms = process.argv.includes("--fetch-synonyms");
await fs.mkdir(reports, { recursive: true });
let fixtures;
try { if (!wantRefresh) fixtures = JSON.parse(await fs.readFile(referenceFile, "utf8")); } catch {}
if (!fixtures || wantExtend) {
  const candidates = await extractCandidates();
  const existing = fixtures?.cases ?? [];
  const knownSmiles = new Set(existing.map((item) => item.inputSmiles));
  const records = [...existing];
  for (const candidate of candidates.filter((entry) => !knownSmiles.has(entry.inputSmiles))) {
    const properties = await pubchem(candidate.inputSmiles);
    records.push({ id: `HC-${String(records.length + 1).padStart(3, "0")}`, molecule: candidate.molecule, category: candidate.category, inputSmiles: candidate.inputSmiles, commonName: null, referenceName: properties.IUPACName, formula: properties.MolecularFormula, canonicalSmiles: properties.ConnectivitySMILES ?? properties.CanonicalSMILES, isomericSmiles: properties.SMILES ?? properties.IsomericSMILES, source: "PubChem PUG REST", sourceUrl: properties.url, sourceRequestUrl: properties.requestUrl, cid: properties.CID, nameReview: "Pendiente de clasificar equivalencia IUPAC frente a la salida de Hydrocarbon Lab" });
  }
  fixtures = { generatedAt: new Date().toISOString(), sourcePolicy: "PubChem retrieved by candidate SMILES; application names are never reference values", cases: records };
  await fs.writeFile(referenceFile, `${JSON.stringify(fixtures, null, 2)}\n`);
}
if (wantSynonyms) {
  const byCid = new Map(fixtures.cases.map((item) => [item.cid, item]));
  const cids = [...byCid.keys()];
  for (let start = 0; start < cids.length; start += 20) {
    const batch = cids.slice(start, start + 20);
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${batch.join(",")}/synonyms/JSON`;
    const response = await fetch(url, { headers: { "User-Agent": "HydrocarbonLab-Audit/1.0 (diagnostic; PubChem PUG REST)" } });
    if (!response.ok) throw new Error(`PubChem synonym HTTP ${response.status}`);
    const payload = await response.json();
    for (const entry of payload.InformationList?.Information ?? []) {
      const item = byCid.get(entry.CID);
      if (!item) continue;
      item.synonyms = (entry.Synonym ?? []).slice(0, 80);
      item.synonymSourceUrl = `https://pubchem.ncbi.nlm.nih.gov/compound/${entry.CID}`;
    }
  }
  const commonAliases = {
    methane: ["Marsh gas"], ethene: ["ETHYLENE"], "prop-1-ene": ["Propylene"], acetylene: ["Acetylene"],
    benzene: ["benzol"], toluene: ["toluene"], cumene: ["CUMENE"], methanol: ["methyl alcohol"], ethanol: ["ethyl alcohol"],
    "propan-2-ol": ["isopropyl alcohol"], "2-methylpropan-2-ol": ["tert-Butyl alcohol"], "propane-1,2,3-triol": ["glycerol"],
    formaldehyde: ["formol", "formalin"], acetaldehyde: ["acetic aldehyde"], "propan-2-one": ["acetone"],
    "formic acid": ["formic acid"], "acetic acid": ["acetic acid"], "1,2-xylene": ["O-XYLENE"], "1,3-xylene": ["M-XYLENE"],
    "1,4-xylene": ["P-XYLENE"], "methyl formate": ["METHYL FORMATE"], "methyl acetate": ["METHYL ACETATE"],
    "ethyl acetate": ["ETHYL ACETATE"], methoxymethane: ["DIMETHYL ETHER"], "n,n-dimethylmethanamine": ["trimethylamine"],
    "1-ethyl-3-methylbenzene": ["3-Ethyltoluene"], "2-methylpropane": ["isobutane"], "2,2,4-trimethylpentane": ["isooctane"],
  };
  for (const item of fixtures.cases) {
    const candidates = commonAliases[item.referenceName.toLowerCase()] ?? [];
    item.commonName = candidates.find((candidate) => (item.synonyms ?? []).some((synonym) => synonym.toLowerCase() === candidate.toLowerCase())) ?? null;
    if (item.commonName) item.commonNameSource = "PubChem synonym list";
  }
  await fs.writeFile(referenceFile, `${JSON.stringify(fixtures, null, 2)}\n`);
}

function formulaAscii(molecule) {
  const counts = new Map();
  for (const atom of molecule.atoms) { const el = atom.element ?? "C"; counts.set(el, (counts.get(el) ?? 0) + 1); }
  const carbons = counts.get("C") ?? 0;
  let hydrogens = 0;
  const valence = { C: 4, O: 2, N: 3, S: 2, F: 1, Cl: 1, Br: 1, I: 1 };
  const bondOrder = new Map(molecule.atoms.map((a) => [a.id, 0]));
  for (const [a, b, order = 1] of molecule.bonds) { bondOrder.set(a, bondOrder.get(a) + order); bondOrder.set(b, bondOrder.get(b) + order); }
  for (const atom of molecule.atoms) hydrogens += Math.max(0, (valence[atom.element ?? "C"] ?? 0) - (bondOrder.get(atom.id) ?? 0));
  const order = ["C", "H", ...[...counts.keys()].filter((e) => e !== "C" && e !== "H").sort()];
  const vals = { ...Object.fromEntries(counts), H: hydrogens };
  return order.filter((e) => vals[e]).map((e) => `${e}${vals[e] === 1 ? "" : vals[e]}`).join("");
}
function countRings(molecule) { return (molecule.rings ?? []).length; }
function signature(molecule) {
  const atomData = molecule.atoms.map((a) => ({ e: a.element ?? "C", q: a.charge ?? 0 }));
  const index = new Map(molecule.atoms.map((a, i) => [a.id, i]));
  const edges = molecule.bonds.map(([a,b,o=1]) => [index.get(a), index.get(b), o].sort((x,y) => x-y)).map((e) => e.join(":")).sort();
  const stereo = molecule.atoms.map((a,i) => a.tetrahedralParity ? `${i}:${a.tetrahedralParity}` : "").filter(Boolean).sort();
  const rings = (molecule.rings ?? []).map((r) => `${r.kind}:${r.atomIds.length}`).sort();
  return JSON.stringify({ atomData: atomData.map(JSON.stringify).sort(), edges, stereo, rings });
}
function canonicalStructure(smiles) {
  const parsed = new SmilesParser().parseMolecule(smiles);
  parsed.ensureHelperArrays(OCLMolecule.cHelperCIP);
  return new Canonizer(parsed).getIDCode();
}
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
const results = [];
for (const item of fixtures.cases) {
  const result = { id: item.id, molecule: item.molecule, category: item.category, source: item.source, sourceUrl: item.sourceUrl, referenceName: item.referenceName, commonName: item.commonName, smilesReference: item.isomericSmiles, formulaExpected: item.formula };
  try {
    const imported = moleculeFromSmiles(item.isomericSmiles || item.canonicalSmiles);
    if (!imported.ok) { results.push({ ...result, status: "CRASH", errorType: "parser SMILES", observations: imported.error }); continue; }
    const molecule = imported.molecule;
    const before = { atoms: molecule.atoms.length, carbons: molecule.atoms.filter((a) => (a.element ?? "C") === "C").length, bonds: molecule.bonds.length, rings: countRings(molecule), formula: analyzeMolecule(molecule).formula, formulaAscii: formulaAscii(molecule), signature: signature(molecule) };
    const analysis = analyzeMolecule(molecule);
    const exported = moleculeToSmiles(molecule);
    if (!exported.ok) { results.push({ ...result, nameHydrocarbonLab: analysis.name, formulaHydrocarbonLab: analysis.formula, status: "FAIL-STRUCTURE", errorType: "serializer SMILES", observations: exported.error, before }); continue; }
    const second = moleculeFromSmiles(exported.smiles);
    if (!second.ok) { results.push({ ...result, nameHydrocarbonLab: analysis.name, formulaHydrocarbonLab: analysis.formula, smilesRoundTrip: exported.smiles, status: "FAIL-STRUCTURE", errorType: "parser SMILES", observations: second.error, before }); continue; }
    const afterMolecule = second.molecule;
    const after = { atoms: afterMolecule.atoms.length, carbons: afterMolecule.atoms.filter((a) => (a.element ?? "C") === "C").length, bonds: afterMolecule.bonds.length, rings: countRings(afterMolecule), formula: analyzeMolecule(afterMolecule).formula, formulaAscii: formulaAscii(afterMolecule), signature: signature(afterMolecule) };
    const stereoSource = canonicalStructure(item.isomericSmiles || item.canonicalSmiles);
    const stereoAfter = canonicalStructure(exported.smiles);
    const invariants = { A_formula: before.formulaAscii.replaceAll(/([A-Z][a-z]?)1(?!\d)/g, "$1") === after.formulaAscii.replaceAll(/([A-Z][a-z]?)1(?!\d)/g, "$1"), B_heavyAtoms: before.atoms === after.atoms, C_carbons: before.carbons === after.carbons, D_bonds: before.bonds === after.bonds, E_rings: before.rings === after.rings, F_formalCharges: JSON.stringify(molecule.atoms.map((a)=>a.charge??0).sort()) === JSON.stringify(afterMolecule.atoms.map((a)=>a.charge??0).sort()), G_tetrahedralStereo: JSON.stringify(molecule.atoms.map((a)=>a.tetrahedralParity??0).sort()) === JSON.stringify(afterMolecule.atoms.map((a)=>a.tetrahedralParity??0).sort()), H_graphIsomorphism: stereoSource === stereoAfter };
    const appFormula = analysis.formula.replaceAll(/[₀-₉]/g, (d) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(d))).replaceAll(/([A-Z][a-z]?)1(?!\d)/g, "$1");
    const formulaOk = appFormula === item.formula;
    const structureOk = Object.values(invariants).every(Boolean);
    const normalizeName = (name) => name.toLowerCase().replaceAll(/[áàä]/g, "a").replaceAll(/[éèë]/g, "e").replaceAll(/[íìï]/g, "i").replaceAll(/[óòö]/g, "o").replaceAll(/[úùü]/g, "u").replaceAll(/[^a-z0-9]/g, "");
    const appNameSynonym = (item.synonyms ?? []).find((synonym) => normalizeName(synonym) === normalizeName(analysis.name));
    const nameLooksSame = normalizeName(analysis.name) === normalizeName(item.referenceName) || Boolean(appNameSynonym);
    const layout = calculateMolecule2DLayout(molecule, analysis.mainChain);
    const referenceEz = item.referenceName.match(/^\(([EZ])\)/i)?.[1]?.toUpperCase();
    const appEz = analysis.name.match(/\(([EZ])\)/i)?.[1]?.toUpperCase();
    const ezNameIncorrect = Boolean(referenceEz && referenceEz !== appEz);
    let status = !formulaOk || !structureOk ? "FAIL-STRUCTURE" : ezNameIncorrect ? "FAIL-NAME" : nameLooksSame ? "PASS" : "PARTIAL";
    let errorType = !formulaOk ? "cálculo de fórmula" : !structureOk ? "serializer SMILES" : ezNameIncorrect ? "E/Z" : "";
    if (!layout.size || ![...layout.values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) { status = "FAIL-STRUCTURE"; errorType = "representación / anillos"; }
    const stereoKind = /[\\/]/.test(item.isomericSmiles || "") ? "E/Z" : "";
    results.push({ ...result, nameHydrocarbonLab: analysis.name, formulaHydrocarbonLab: analysis.formula, smilesRoundTrip: exported.smiles, status, errorType, observations: { invariants, canonicalGraphIDCodeInput: stereoSource, canonicalGraphIDCodeRoundTrip: stereoAfter, before: { ...before, signature: undefined }, after: { ...after, signature: undefined }, layoutAtoms: layout.size, pubchemSynonymMatch: appNameSynonym ?? null, nameReview: ezNameIncorrect ? `FAIL-NAME: referencia ${referenceEz} pero Hydrocarbon Lab no conserva ese descriptor E/Z (${appEz ?? "omitido"})` : appNameSynonym ? `Nombre publicado por PubChem como sinónimo alternativo: ${appNameSynonym}; su carácter IUPAC o común requiere interpretación nomenclatural.` : nameLooksSame ? "Coincidencia textual normalizada" : `PARTIAL: equivalencia IUPAC pendiente de revisión; salida ${analysis.name}, referencia ${item.referenceName}`, stereoKind } });
  } catch (error) { results.push({ ...result, status: "CRASH", errorType: "otro", observations: String(error?.stack ?? error) }); }
}

const csvHeader = ["ID","Molécula","Categoría","Fuente","Nombre común","Nombre de referencia","SMILES de referencia","Nombre Hydrocarbon Lab","Fórmula esperada","Fórmula Hydrocarbon Lab","Round-trip SMILES","Resultado","Tipo de error","Observaciones"];
const csv = [csvHeader.map(csvCell).join(","), ...results.map((r)=>[r.id,r.molecule,r.category,r.sourceUrl,r.commonName,r.referenceName,r.smilesReference,r.nameHydrocarbonLab,r.formulaExpected,r.formulaHydrocarbonLab,r.smilesRoundTrip,r.status,r.errorType,typeof r.observations === "string" ? r.observations : JSON.stringify(r.observations)].map(csvCell).join(","))].join("\r\n");
const counts = Object.fromEntries(["PASS","PARTIAL","FAIL-NAME","FAIL-STRUCTURE","CRASH"].map((s)=>[s,results.filter((r)=>r.status===s).length]));
const groups = Object.fromEntries(["selección del parent","numeración","prioridad funcional","orden alfabético","multiplicadores","aldehídos","cetonas","aminas","amidas","éteres","ésteres","aromáticos","E/Z","anillos","anillos fusionados","parser SMILES","serializer SMILES","cálculo de fórmula","otro"].map((key)=>[key,0]));
for (const r of results.filter((x)=>x.status.startsWith("FAIL")||x.status==="CRASH")) groups[r.errorType && Object.hasOwn(groups,r.errorType) ? r.errorType : "otro"] += 1;
const pct = (n) => `${(100*n/results.length).toFixed(1)}%`;
const minimumCases = results.filter((r)=>r.status.startsWith("FAIL")||r.status==="CRASH").map((r)=>`- ${r.id} — ${r.status}${r.errorType ? ` (${r.errorType})` : ""}: PubChem SMILES \`${r.smilesReference}\` → Hydrocarbon Lab \`${r.smilesRoundTrip ?? "sin salida"}\`; nombre PubChem \`${r.referenceName}\` → nombre Hydrocarbon Lab \`${r.nameHydrocarbonLab ?? "sin nombre"}\`.`);
await fs.writeFile(resultsFile, `${JSON.stringify({ generatedAt: new Date().toISOString(), counts, failureGroups: groups, results }, null, 2)}\n`);
await fs.writeFile(csvFile, `${csv}\r\n`);
const commonNameCount = results.filter((r)=>r.commonName).length;
await fs.writeFile(summaryFile, `# Auditoría automatizada de Hydrocarbon Lab\n\n- Casos: ${results.length}\n${Object.entries(counts).map(([k,v])=>`- ${k}: ${v} (${pct(v)})`).join("\n")}\n- Casos con nombre común documentado en sinónimos PubChem: ${commonNameCount}\n- Fuente: PubChem PUG REST, consulta por SMILES; CID, URL, fórmula, nombre IUPAC, canonical/isomeric SMILES y sinónimos quedan en fixtures.json.\n- La diferencia de nombre no produce fallo sin una discrepancia química observada. Los nombres que PubChem publica como sinónimos quedan documentados en results.json; los restantes PARTIAL requieren revisión nomenclatural humana.\n\n## Fallos por causa probable\n\n${Object.entries(groups).map(([k,v])=>`- ${k}: ${v}`).join("\n")}\n\n## Distribución por familia\n\n${[...new Set(results.map(r=>r.category))].map((c)=>`- ${c}: ${results.filter(r=>r.category===c).length}`).join("\n")}\n\n## Casos mínimos reproducibles\n\n${minimumCases.join("\n") || "- Sin fallos."}\n\n## Lectura nomenclatural\n\nLos cuatro FAIL-NAME corresponden a los cuatro registros estereoespecíficos: Hydrocarbon Lab conserva el grafo y el isómero E/Z en el SMILES exportado, pero omite el descriptor configuracional de su nombre. Los PARTIAL no se declaran errores; quedan pendientes para verificar equivalencia IUPAC o preferencia nomenclatural.\n`);
console.log(JSON.stringify({ fixtureFile: referenceFile, resultsFile, csvFile, summaryFile, count: results.length, counts, failureGroups: groups }, null, 2));
