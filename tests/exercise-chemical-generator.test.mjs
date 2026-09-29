import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { build } from "vite";
import { EXERCISE_CATEGORIES, normalizeSessionConfig } from "../app/exercise-model.ts";
import { deriveQuestionIdentity } from "../app/exercise-seed.ts";
import { createSeededRng } from "../app/seeded-rng.ts";
import {
  ChemicalGenerationError, createRestrictedChemicalGenerator, deriveChemicalCandidateSeed,
  exerciseStructuralIdentity, MAX_CHEMICAL_GENERATION_ATTEMPTS,
} from "../app/exercise-chemical-generator.ts";
import { buildExerciseChemicalCandidate } from "../app/exercise-chemical-candidate.ts";
import { validateExerciseChemistry, validateExerciseDomain } from "../app/exercise-domain.ts";
import { moleculeFromSmiles, inspectSmilesStructure } from "../app/openchemlib-adapter.ts";
import { inspectDoubleBondStereochemistry } from "../app/double-bond-stereochemistry.ts";
import { parseMolecularFormula } from "../app/formula-isomers.ts";
import { loadExerciseChemistry } from "./helpers/exercise-chemistry.mjs";

let chemistry;
let generate;
before(async () => {
  chemistry = await loadExerciseChemistry();
  generate = createRestrictedChemicalGenerator(chemistry.oracles);
});
after(async () => { await chemistry?.close(); });

export const configFor = (category, seed = "CHEM-PHASE2") => ({
  mode: "practice", questionCount: 12, questionTypes: ["naming"], categories: [category],
  difficulty: "basic", locale: "es", seed, generatorVersion: 1,
});
const graphHash = (molecule) => createHash("sha256").update(JSON.stringify(molecule)).digest("hex");
const fromSmiles = (smiles) => {
  const result = moleculeFromSmiles(smiles);
  assert.equal(result.ok, true, result.error);
  return result.molecule;
};

function assertConnected(molecule) {
  const seen = new Set();
  const pending = [molecule.atoms[0].id];
  while (pending.length) {
    const id = pending.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const [left, right] of molecule.bonds) {
      if (left === id) pending.push(right);
      if (right === id) pending.push(left);
    }
  }
  assert.equal(seen.size, molecule.atoms.length);
}

// Independent closed-form compositions for these single-function recipes,
// rather than trusting the generator's validator as the only evidence.
function expectedComposition(category, molecule) {
  const counts = {};
  for (const atom of molecule.atoms) counts[atom.element ?? "C"] = (counts[atom.element ?? "C"] ?? 0) + 1;
  const c = counts.C;
  const hydrogen = {
    alkane: 2 * c + 2, alkene: 2 * c, alkyne: 2 * c - 2,
    halogenated: 2 * c + 2 - (counts.F ?? 0) - (counts.Cl ?? 0) - (counts.Br ?? 0) - (counts.I ?? 0),
    alcohol: 2 * c + 2, aldehyde: 2 * c, ketone: 2 * c, "carboxylic-acid": 2 * c,
    ether: 2 * c + 2, ester: 2 * c, amine: 2 * c + 3, amide: 2 * c + 1,
    "simple-carbocycle": 2 * c, aromatic: 2 * c - 6, ez: 2 * c, nitrile: 2 * c - 1, nitro: 2 * c + 1,
  }[category];
  return { ...counts, H: hydrogen };
}

function assertAccepted(result, category) {
  const { molecule, reference } = result;
  assert.equal(result.category, category);
  assert.equal(validateExerciseChemistry(molecule, chemistry.oracles).valid, true);
  assert.equal(validateExerciseDomain(molecule, category, chemistry.oracles).valid, true);
  assert.equal(chemistry.engine.findMoleculeValenceViolation(molecule), null);
  assertConnected(molecule);
  assert.ok(molecule.atoms.every((atom) => ["C", "O", "N", "F", "Cl", "Br", "I"].includes(atom.element ?? "C")));
  assert.ok(molecule.atoms.every((atom) => atom.tetrahedralParity === undefined));
  assert.equal(molecule.bonds.length - molecule.atoms.length + 1, ["aromatic", "simple-carbocycle"].includes(category) ? 1 : 0);
  for (const language of ["en", "es"]) assert.ok(reference.names[language].length > 1);
  assert.equal(reference.name, reference.names.es);
  assert.equal(reference.formula, chemistry.engine.analyzeMolecule(molecule).formula);
  const parsed = parseMolecularFormula(reference.formula);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.atoms, expectedComposition(category, molecule));
  const inspected = inspectSmilesStructure(reference.smiles);
  assert.equal(inspected.ok, true);
  assert.deepEqual(parseMolecularFormula(inspected.formula).atoms, parsed.atoms);
  const restored = fromSmiles(reference.smiles);
  assert.equal(exerciseStructuralIdentity(restored), reference.structuralIdentity);
  assert.equal(exerciseStructuralIdentity(JSON.parse(JSON.stringify(molecule))), reference.structuralIdentity);
  assert.equal(chemistry.oracles.reference(restored).names.es, reference.names.es);
  assert.equal(chemistry.oracles.reference(restored).names.en, reference.names.en);
}

for (const category of EXERCISE_CATEGORIES) {
  test(`generator ${category}: production category, composition, connected graph, names and serialization`, () => {
    const config = configFor(category);
    const first = generate(config, 0);
    assertAccepted(first, category);
    assert.deepEqual(generate(config, 0), first);
    assert.deepEqual(createRestrictedChemicalGenerator(chemistry.oracles)(JSON.parse(JSON.stringify(config)), 0), first);
  });
}

test("v1 frozen chemical vectors preserve question seeds, exact graph bytes and derived references", () => {
  const vectors = [
    ["alkane", "C₆H₁₄", "hexano", "hexane", "CCCCCC", "gGP@DiVj`@", "d56a993a73ecfe340f3d5374752311db9218e3e66399c5b460e3b520f62a622e"],
    ["halogenated", "C₅H₁₀Br₂", "1,2-dibromopentano", "1,2-dibromopentane", "CCCC(CBr)Br", "gNpDAbGDRY^jh@", "2bab4bf73d2e303f97e4f9a22990125a1d23b47aac98df21fa3c0b4d7213ec4c"],
    ["ester", "C₅H₁₀O₂", "propanoato de etilo", "ethyl propanoate", "CCC(OCC)=O", "gNp`@dfUZj@@", "f925ef68f3304325bd8259d238ad29886a67710b45fe0e049d1638d9a5ea95de"],
    ["ez", "C₁₀H₂₀", "(5E)-dec-5-eno", "(5E)-5-decene", "CCCC/C=C/CCCC", "ded@@DiUUZjjB@`", "2ec80616779be2a8ea249af4f786a350ae9e940cefbde9f7f7f9fb79bd892908"],
    ["nitro", "C₇H₁₅NO₂", "4-nitroheptano", "4-nitroheptane", "CCCC(CCC)[N+]([O-])=O", "defDAHAHeNR[eUjjh@@", "51690a2b7cd84821923dc99d92d7e3ec163af972da84781c1ea28808ec957600"],
  ];
  for (const [category, formula, es, en, smiles, identity, hash] of vectors) {
    const result = generate(configFor(category), 0);
    const serializedConfig = `{"mode":"practice","questionCount":12,"questionTypes":["naming"],"categories":["${category}"],"difficulty":"basic","locale":"es","seed":"CHEM-PHASE2","generatorVersion":1}`;
    assert.equal(result.question.seed, JSON.stringify(["hydrocarbon-lab-seed", serializedConfig, "question:0"]));
    assert.equal(result.reference.formula, formula);
    assert.deepEqual(result.reference.names, { es, en });
    assert.equal(result.reference.smiles, smiles);
    assert.equal(result.reference.structuralIdentity, identity);
    assert.equal(graphHash(result.molecule), hash);
    assert.equal(result.generation.attempt, 0);
  }
});

test("bounded deterministic sweep checks every category against real chemistry and reports diversity", () => {
  const start = performance.now();
  const metrics = [];
  for (const category of EXERCISE_CATEGORIES) {
    const identities = new Set();
    let maxRetries = 0;
    for (let seed = 0; seed < 32; seed += 1) {
      const result = generate(configFor(category, `sweep:${seed}`), 0);
      assertAccepted(result, category);
      identities.add(result.reference.structuralIdentity);
      maxRetries = Math.max(maxRetries, result.generation.attempt);
    }
    assert.ok(identities.size > 1, `${category} must not degenerate into one structure`);
    metrics.push({ category, seeds: 32, unique: identities.size, failures: 0, maxRetries });
  }
  console.log(`GENERATOR_SWEEP=${JSON.stringify({ metrics, durationMs: Math.round(performance.now() - start) })}`);
});

test("alkanes include linear, branched and multiple-branch skeletons; alkynes vary positions", () => {
  const branches = new Set();
  const tripleLocants = new Set();
  for (let index = 0; index < 32; index += 1) {
    const alkane = generate(configFor("alkane", `variety:${index}`), 0);
    branches.add(chemistry.engine.analyzeMolecule(alkane.molecule).substituents.length);
    const alkyne = generate(configFor("alkyne", `variety:${index}`), 0);
    tripleLocants.add(chemistry.engine.analyzeMolecule(alkyne.molecule).tripleBondLocants[0]);
  }
  assert.ok(branches.has(0) && [...branches].some((count) => count >= 2));
  assert.ok(tripleLocants.size > 1);
});

test("halogen recipes vary all four elements, locants and safe alkyl substitution in EN and ES", () => {
  const elements = new Set();
  const locants = new Set();
  let alkyl = false;
  let localizedOrder = false;
  for (let index = 0; index < 48; index += 1) {
    const result = generate(configFor("halogenated", `halo:${index}`), 0);
    const analysis = chemistry.engine.analyzeMolecule(result.molecule);
    for (const atom of result.molecule.atoms) if (atom.element !== "C") elements.add(atom.element);
    analysis.functionalGroups.forEach((group) => locants.add(analysis.numberedAtoms.get(group.carbonId)));
    alkyl ||= analysis.substituents.some((substituent) => /metil|etil/.test(substituent.name));
    localizedOrder ||= /iodo.*methyl/.test(result.reference.names.en) && /metil.*yodo/.test(result.reference.names.es);
  }
  assert.deepEqual([...elements].sort(), ["Br", "Cl", "F", "I"]);
  assert.ok(locants.size > 1 && alkyl);
  assert.ok(localizedOrder, "locale-dependent alphabetization must remain visible");
});

test("alkene remains unspecified; E/Z seeds produce both real explicit configurations and distinct identities", () => {
  const configurations = new Set();
  for (let index = 0; index < 24; index += 1) {
    const alkene = generate(configFor("alkene", `stereo:${index}`), 0);
    assert.ok(alkene.molecule.bonds.every((bond) => !bond[3]));
    assert.doesNotMatch(alkene.reference.smiles, /[/\\]/);
    assert.doesNotMatch(alkene.reference.name, /\(\d+[EZ]\)/);
    const ez = generate(configFor("ez", `stereo:${index}`), 0);
    const explicit = ez.molecule.bonds.find((bond) => bond[3]);
    const inspection = inspectDoubleBondStereochemistry(ez.molecule, explicit[0], explicit[1]);
    assert.equal(inspection.stereogenic, true);
    configurations.add(inspection.configuration);
    assert.match(ez.reference.name, new RegExp(`\\(\\d+${inspection.configuration}\\)`));
    assertAccepted(ez, "ez");
  }
  assert.deepEqual([...configurations].sort(), ["E", "Z"]);
  assert.notEqual(exerciseStructuralIdentity(fromSmiles("C/C=C/C")), exerciseStructuralIdentity(fromSmiles("C/C=C\\C")));
});

test("nitro's charge-balanced motif and formula survive graph JSON and isomeric SMILES", () => {
  const result = generate(configFor("nitro"), 0);
  for (const molecule of [result.molecule, JSON.parse(JSON.stringify(result.molecule)), fromSmiles(result.reference.smiles)]) {
    assert.equal(molecule.atoms.find((atom) => atom.element === "N").charge, 1);
    assert.equal(molecule.atoms.filter((atom) => atom.element === "O" && atom.charge === -1).length, 1);
    assert.equal(molecule.atoms.reduce((sum, atom) => sum + (atom.charge ?? 0), 0), 0);
    assert.equal(validateExerciseDomain(molecule, "nitro", chemistry.oracles).valid, true);
  }
});

test("canonical configuration, independent category selection and isolated output mutations reproduce", () => {
  const config = { ...configFor("alkane"), categories: ["alcohol", "alkane", "alcohol"] };
  const original = generate(config, 10);
  assert.ok(config.categories.includes(original.category));
  assert.deepEqual(generate(normalizeSessionConfig(config), 10), original);
  assert.deepEqual(generate(Object.fromEntries(Object.entries(config).reverse()), 10), original);
  const otherCategory = config.categories.find((category) => category !== original.category);
  assert.throws(() => generate(config, 10, { category: otherCategory }), ChemicalGenerationError);
  const mutable = generate(config, 10);
  mutable.molecule.atoms[0].x = 999;
  mutable.reference.names.es = "changed";
  assert.deepEqual(generate(config, 10), original);
});

test("locale/difficulty remain part of Phase 1 identity while a fixed candidate seed has no locale input", () => {
  const config = configFor("halogenated");
  const changed = { ...config, locale: "en", difficulty: "advanced" };
  assert.notEqual(deriveQuestionIdentity(config, 0).seed, deriveQuestionIdentity(changed, 0).seed);
  const seed = deriveChemicalCandidateSeed(deriveQuestionIdentity(config, 0).seed, "halogenated", 0);
  const graph = buildExerciseChemicalCandidate("halogenated", seed);
  assert.deepEqual(buildExerciseChemicalCandidate("halogenated", seed), graph);
  const names = chemistry.oracles.reference(graph).names;
  assert.equal(chemistry.oracles.reference(graph).names.en, names.en);
  assert.equal(generate(changed, 0).reference.name, generate(changed, 0).reference.names.en);
});

test("deterministically rejected candidates retry on isolated sub-seeds without changing question 4", () => {
  const config = configFor("halogenated", "retry-isolation");
  const before = generate(config, 4);
  const firstSeed = deriveChemicalCandidateSeed(deriveQuestionIdentity(config, 2).seed, "halogenated", 0);
  const rejectedIdentity = exerciseStructuralIdentity(buildExerciseChemicalCandidate("halogenated", firstSeed));
  assert.notEqual(before.reference.structuralIdentity, rejectedIdentity);
  const retryGenerator = createRestrictedChemicalGenerator({
    ...chemistry.oracles,
    reference(molecule) {
      const reference = chemistry.oracles.reference(molecule);
      return { ...reference, namingSupported: reference.namingSupported && exerciseStructuralIdentity(molecule) !== rejectedIdentity };
    },
  });
  const retried = retryGenerator(config, 2);
  assert.ok(retried.generation.attempt > 0);
  assert.equal(retried.generation.rejections[0].reason, "naming-unavailable");
  assert.deepEqual(retryGenerator(config, 2), retried);
  const unrelatedRng = createSeededRng(retried.generation.candidateSeed);
  for (let index = 0; index < 10000; index += 1) unrelatedRng.next();
  assert.deepEqual(retryGenerator(config, 4), before);
});

test("explicit bounded failure contracts cover unsupported requests and oracle exhaustion", () => {
  const config = configFor("alkane");
  for (const options of [{ category: "ether" }, { category: "sulfur" }, ...[0, 17, 0.5, NaN].map((maxAttempts) => ({ maxAttempts }))]) {
    assert.throws(() => generate(config, 0, options), (error) => error instanceof ChemicalGenerationError && error.code === "unsupported-request");
  }
  assert.throws(() => generate({ ...config, questionTypes: ["build"] }, 0), ChemicalGenerationError);
  const impossible = createRestrictedChemicalGenerator({
    ...chemistry.oracles, reference: (molecule) => ({ ...chemistry.oracles.reference(molecule), names: { es: "", en: "-" } }),
  });
  for (const maxAttempts of [2, MAX_CHEMICAL_GENERATION_ATTEMPTS]) {
    assert.throws(() => impossible(config, 0, { maxAttempts }), (error) => {
      assert.equal(error.code, "attempts-exhausted");
      assert.equal(error.rejections.length, maxAttempts);
      assert.ok(error.rejections.every((rejection, index) => rejection.attempt === index && rejection.stage === "oracle"));
      return true;
    });
  }
});

test("pipeline refuses chemistry, domain, placeholder, formula and topology failures at their own boundary", () => {
  const config = configFor("alcohol");
  const cases = [
    [{ ...chemistry.oracles, findMoleculeValenceViolation: () => ({ atomId: 1 }) }, "chemical", "invalid-valence"],
    [{ ...chemistry.oracles, detectFunctionalGroups: () => [] }, "domain", "category-group-mismatch"],
    [{ ...chemistry.oracles, reference: (molecule) => ({ ...chemistry.oracles.reference(molecule), names: { es: "Nombre no disponible", en: "Name unavailable" } }) }, "oracle", "naming-unavailable"],
    [{ ...chemistry.oracles, reference: (molecule) => ({ ...chemistry.oracles.reference(molecule), formula: "CH4" }) }, "oracle", "formula-or-stereo-mismatch"],
    [{ ...chemistry.oracles, reference: (molecule) => ({ ...chemistry.oracles.reference(molecule), family: "polycyclic" }) }, "oracle", "analysis-topology-mismatch"],
  ];
  for (const [oracles, stage, reason] of cases) {
    assert.throws(() => createRestrictedChemicalGenerator(oracles)(config, 0, { maxAttempts: 1 }), (error) => {
      assert.equal(error.code, "attempts-exhausted");
      assert.deepEqual(error.rejections, [{ attempt: 0, stage, reason }]);
      return true;
    });
  }
});

test("canonical identity ignores atom IDs, ordering, orientation and layout without merging isomers", () => {
  for (const category of EXERCISE_CATEGORIES) {
    const { molecule, reference } = generate(configFor(category), 0);
    const remap = new Map(molecule.atoms.map((atom, index) => [atom.id, 100 + molecule.atoms.length - index]));
    const changed = {
      atoms: molecule.atoms.map((atom) => ({ ...atom, id: remap.get(atom.id), x: -atom.y + 20, y: atom.x - 50 })).reverse(),
      bonds: molecule.bonds.map(([left, right, order, stereo]) => [remap.get(right), remap.get(left), order, stereo]).reverse(),
      rings: molecule.rings.map((ring) => ({ ...ring, atomIds: ring.atomIds.map((id) => remap.get(id)) })),
    };
    assert.equal(exerciseStructuralIdentity(changed), reference.structuralIdentity);
  }
  assert.notEqual(exerciseStructuralIdentity(fromSmiles("CCCC")), exerciseStructuralIdentity(fromSmiles("CC(C)C")));
});

test("separate fresh Node processes reproduce every category with entropy and clock APIs disabled", () => {
  const helper = new URL("./helpers/exercise-chemistry.mjs", import.meta.url).href;
  const core = new URL("../app/exercise-chemical-generator.ts", import.meta.url).href;
  const configs = JSON.stringify(EXERCISE_CATEGORIES.map((category) => configFor(category)));
  const source = `
    const {loadExerciseChemistry} = await import(${JSON.stringify(helper)});
    const {createRestrictedChemicalGenerator} = await import(${JSON.stringify(core)});
    const chemistry = await loadExerciseChemistry();
    const generate = createRestrictedChemicalGenerator(chemistry.oracles);
    const originalDate=globalThis.Date, originalRandom=Math.random;
    try {
      Math.random=()=>{throw new Error("Math.random forbidden");};
      globalThis.Date=class {constructor(){throw new Error("Date forbidden");} static now(){throw new Error("Date.now forbidden");}};
      Object.defineProperty(globalThis.crypto,"randomUUID",{value:()=>{throw new Error("randomUUID forbidden");}});
      console.log(JSON.stringify(${configs}.map((config)=>generate(config,0))));
    } finally { globalThis.Date=originalDate; Math.random=originalRandom; await chemistry.close(); }
  `;
  const run = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 30000 }));
  const expected = EXERCISE_CATEGORIES.map((category) => generate(configFor(category), 0));
  assert.deepEqual(run(), expected);
  assert.deepEqual(run(), expected);
});

test("core source imports no React/page module and uses no unseeded entropy or time", () => {
  for (const path of ["exercise-chemical-generator", "exercise-chemical-candidate", "exercise-domain", "exercise-chemistry-oracles"]) {
    const source = readFileSync(new URL(`../app/${path}.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\s+["'](?:react|.*page\.tsx)["']/);
    assert.doesNotMatch(source, /Math\.random\s*\(|Date\.now\s*\(|new\s+Date\b|randomUUID\s*\(/);
  }
});

test("the same core bundles as browser ESM without React, page.tsx or Node runtime modules", async () => {
  const result = await build({
    configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), logLevel: "silent",
    build: {
      lib: { entry: "app/exercise-chemical-generator.ts", formats: ["es"] },
      write: false, minify: false,
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap(({ output }) => output.filter((entry) => entry.type === "chunk"));
  assert.ok(chunks.length);
  for (const chunk of chunks) {
    assert.doesNotMatch(Object.keys(chunk.modules).join("\n"), /(?:node_modules.*[\\/]react[\\/]|app[\\/]page\.tsx)/);
    assert.doesNotMatch(chunk.code, /from\s+["']node:/);
  }
});
