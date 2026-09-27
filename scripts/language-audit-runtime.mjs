// Read-only molecule/name/reasoning probes for reports/language-audit.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { moleculeFromSmiles } from "../app/openchemlib-adapter.ts";
import { translateSpanishIupacToOpsin } from "../app/iupac-name-normalization.ts";

const server = await createServer({
  root: new URL("..", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ""),
  configFile: false,
  logLevel: "error",
  appType: "custom",
  plugins: [react()],
  server: { middlewareMode: true, hmr: false },
});
try {
  const { analyzeMolecule, buildIupacReasoningSteps, buildEnglishReasoningSteps } = await server.ssrLoadModule("/app/page.tsx");
  const results = [];
  for (const smiles of [
    "CCC", "CC=CC", "C/C=C/C", "C/C=C\\C", "CC(O)C", "CC(=O)O",
    "c1ccccc1", "CC(C)C", "C1CCCCC1", "C1CCC2CCCCC2C1", "O1CCNCC1", "CNCC",
  ]) {
    const parsed = moleculeFromSmiles(smiles);
    if (!parsed.ok) { results.push({ smiles, error: parsed.error }); continue; }
    const analysis = analyzeMolecule(parsed.molecule);
    const esSteps = buildIupacReasoningSteps(parsed.molecule, analysis, [], null);
    const enSteps = buildEnglishReasoningSteps(esSteps, parsed.molecule, analysis);
    results.push({
      smiles,
      spanishName: analysis.name,
      englishName: translateSpanishIupacToOpsin(analysis.name) || analysis.name,
      spanishSteps: esSteps.map(({ title, explanation }) => ({ title, explanation })),
      englishSteps: enSteps.map(({ title, explanation }) => ({ title, explanation })),
    });
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await server.close();
}
