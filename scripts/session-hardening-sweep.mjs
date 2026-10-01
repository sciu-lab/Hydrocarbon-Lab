import { loadExerciseChemistry } from "../tests/helpers/exercise-chemistry.mjs";
import { HARDENING_TYPES, runFiniteSession } from "../tests/helpers/session-hardening-sweep.mjs";
import { createRestrictedChemicalGenerator } from "../app/exercise-chemical-generator.ts";
import { createPracticeQuestionGenerator } from "../app/practice-question.ts";
import { createDeterministicDistractorEngine } from "../app/practice-distractor-engine.ts";
const chemistry = await loadExerciseChemistry();
try {
  const generate = createPracticeQuestionGenerator(createRestrictedChemicalGenerator(chemistry.oracles),
    createDeterministicDistractorEngine(chemistry.engine, chemistry.oracles));
  const rows = [];
  for (const mode of ["practice", "exam"]) for (const types of HARDENING_TYPES) {
    const row = { mode, configuration: types.join("+"), sessions: 0, questions: 0, duplicates: 0, exhaustions: 0,
      candidateCalls: 0, skippedCandidates: 0, retryTotal: 0, maxRetries: 0, failures: 0 };
    for (const seed of ["HARDENING-1", "HARDENING-2", "HARDENING-3"]) {
      const run = runFiniteSession(mode, 15, types, seed, generate, chemistry.oracles);
      row.sessions++; row.questions += run.accepted.length; row.duplicates += run.duplicates;
      row.exhaustions += Number(run.exhausted); row.candidateCalls += run.calls;
      row.skippedCandidates += run.calls - run.accepted.length;
      row.retryTotal += run.retries.reduce((a, b) => a + b, 0); row.maxRetries = Math.max(row.maxRetries, ...run.retries);
      if (run.duplicates || (run.exhausted && run.state.reason !== "insufficient-unique-questions")) row.failures++;
    }
    row.averageRetries = row.questions ? row.retryTotal / row.questions : null;
    rows.push(row);
  }
  const restrictive = runFiniteSession("exam", 15, ["naming"], "RESTRICTIVE-9.1", generate, chemistry.oracles, ["ez"]);
  console.log(JSON.stringify({ count: 15, seeds: ["HARDENING-1", "HARDENING-2", "HARDENING-3"], rows,
    restrictive: { mode: "exam", categories: ["ez"], count: 15, phase: restrictive.state.phase,
      reason: restrictive.state.reason, duplicates: restrictive.duplicates, candidateCalls: restrictive.calls } }, null, 2));
  if (rows.some((row) => row.failures)) process.exitCode = 1;
} finally { await chemistry.close(); }
