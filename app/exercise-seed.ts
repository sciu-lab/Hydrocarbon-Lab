import { normalizeSessionConfig, serializeSessionConfig } from "./exercise-model.ts";
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

/** Generation projection discards the requested presentation locale. The fixed
 * "es" slot is a v1 compatibility anchor, preserving the frozen chemical seeds
 * and graphs. Other fields, including mode and questionCount, retain their v1
 * semantics; the complete session identity above remains locale-sensitive.
 */
export function deriveGenerationIdentity(config: SessionConfig, index: number): QuestionIdentity {
  const canonical = normalizeSessionConfig(config);
  return deriveQuestionIdentity({ ...canonical, locale: "es" }, index);
}
