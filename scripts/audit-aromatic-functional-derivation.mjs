import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { derivationAuditCases } from "../tests/fixtures/aromatic-functional-derivation.mjs";

export function inspectDerivation(row, name, steps, fragments, parts, analysis) {
  const anomalies = [];
  const evidence = Object.entries(fragments).flatMap(([target, fragment]) =>
    [fragment, ...(fragment.additionalFragments ?? [])].map((item) => ({ ...item, target })));
  if (!evidence.length) anomalies.push("zero-fragments");
  if (!evidence.some((item) => item.kind === "parent")) anomalies.push("missing-parent");
  if (analysis.primaryFunctionalGroup && !evidence.some((item) => item.kind === "function")) anomalies.push("missing-principal-function");
  const fullNameRoles = new Set(evidence.filter((item) => item.text === name).map((item) => item.kind));
  if (fullNameRoles.size > 1) anomalies.push("full-name-multiple-roles");
  if (row.language === "es" && /phenyl|methyl|methan|ethan|\bamine\b/i.test(name)) anomalies.push("english-in-spanish");
  if (row.language === "en" && /phenyl(?:met|et)(?=an|en|in)/i.test(name)) anomalies.push("unlocalized-english-parent-root");
  if (parts.map((part) => part.text).join("") !== name) anomalies.push("changed-name-characters");
  if (parts.some((part) => [part.stepNumber, ...(part.relatedStepNumbers ?? [])].filter(Boolean)
    .some((target) => !steps.some((step) => step.number === target)))) anomalies.push("orphan-link");
  return anomalies;
}

export async function auditAromaticFunctionalDerivation({ baseline = false } = {}) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const sources = new Map(baseline ? ["app/page.tsx", "app/iupac-name-normalization.ts"].map((path) =>
    [resolve(root, path).replaceAll("\\", "/"), execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 2_000_000 })]) : []);
  const server = await createServer({ root, configFile: false, logLevel: "error", appType: "custom",
    plugins: [{ name: "derivation-head-baseline", enforce: "pre", load(id) { return sources.get(id.split("?")[0]); } }, react()],
    server: { middlewareMode: true, hmr: false } });
  try {
    const page = await server.ssrLoadModule("/app/page.tsx");
    const { moleculeFromSmiles } = await server.ssrLoadModule("/app/openchemlib-adapter.ts");
    const { translateSpanishIupacForDisplay } = await server.ssrLoadModule("/app/iupac-name-normalization.ts");
    const { deriveReasoningNameFragments } = await server.ssrLoadModule("/app/reasoning-name-fragments.ts");
    const { buildReasoningNameLinkParts } = await server.ssrLoadModule("/app/reasoning-name-links.ts");
    const rows = [];
    for (const fixture of derivationAuditCases) {
      const imported = moleculeFromSmiles(fixture.smiles);
      if (!imported.ok) throw new Error(`${fixture.label}: ${imported.error}`);
      const analysis = page.analyzeMolecule(imported.molecule);
      const supported = !page.externalCandidateNeedsNeutralLocalName(imported.molecule, analysis);
      const spanish = page.buildIupacReasoningSteps(imported.molecule, analysis);
      for (const language of ["es", "en"]) {
        const steps = language === "en" ? page.buildEnglishReasoningSteps(spanish, imported.molecule, analysis) : spanish;
        // Mirror the current dock's safety gate and its existing external fallback.
        const name = supported ? language === "en" ? translateSpanishIupacForDisplay(analysis.name) : analysis.name
          : fixture.externalName ?? page.externalCandidateLocalDisplayName(imported.molecule, analysis, language);
        const fragments = deriveReasoningNameFragments({ analysis, displayedName: name, language, steps, canHighlight: supported });
        const parts = buildReasoningNameLinkParts(name, fragments, steps);
        const row = { label: fixture.label, smiles: fixture.smiles, language, name, supported,
          excluded: fixture.excluded ?? false, acceptedException: fixture.acceptedException,
          spans: parts.filter((part) => part.stepNumber).map((part) => ({ text: part.text,
            role: steps.find((step) => step.number === part.stepNumber).nameRole })) };
        rows.push({ ...row, anomalies: inspectDerivation(row, name, steps, fragments, parts, analysis) });
      }
    }
    return rows;
  } finally { await server.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = await auditAromaticFunctionalDerivation({ baseline: process.argv.includes("--baseline") });
  const unexpected = rows.filter((row) => !row.excluded && row.anomalies.some((anomaly) =>
    !(row.acceptedException === "indivisible-retained-parent" && anomaly === "full-name-multiple-roles")));
  console.log(JSON.stringify({ structures: rows.length / 2, localizedOutputs: rows.length,
    supportedOutputs: rows.filter((row) => row.supported).length,
    unexpectedOutputs: unexpected.length,
    anomalies: rows.filter((row) => row.anomalies.length).map(({ label, language, name, excluded, acceptedException, anomalies }) =>
      ({ label, language, name, excluded, acceptedException, anomalies })),
    ...(process.argv.includes("--all") ? { rows } : {}) }, null, 2));
  process.exitCode = unexpected.length ? 1 : 0;
}
