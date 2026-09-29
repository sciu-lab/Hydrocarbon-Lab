import { serializeSessionConfig } from "./exercise-model.ts";
import type { QuestionIdentity, SessionConfig } from "./exercise-model.ts";
import { deriveSeed } from "./seeded-rng.ts";

/** Zero-based question context, independent of any RNG consumed by other questions. */
export function deriveQuestionIdentity(config: SessionConfig, index: number): QuestionIdentity {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError("A question index must be a nonnegative safe integer.");
  }
  const seed = deriveSeed(serializeSessionConfig(config), `question:${index}`);
  return {
    // Keep the full framed context so a 32-bit hash collision cannot alias exercise IDs.
    id: `exercise:${seed}`,
    seed,
    generatorVersion: config.generatorVersion,
  };
}
