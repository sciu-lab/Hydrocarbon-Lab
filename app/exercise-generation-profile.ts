import type { SessionConfig, QuestionIdentity } from "./exercise-model.ts";
import { EXERCISE_DOMAIN_VERSION, INTERMEDIATE_DOMAIN_VERSION } from "./exercise-domain.ts";

export const EASY_GENERATOR_VERSION = 2;
export const INTERMEDIATE_GENERATOR_VERSION = 3;

/** Published versions are immutable. Advanced remains legacy chemistry until
 * Hard certification; current version changes its namespace, not that policy. */
export function exerciseGenerationProfile(config: Pick<SessionConfig, "generatorVersion" | "difficulty">) {
  if (config.generatorVersion >= INTERMEDIATE_GENERATOR_VERSION && config.difficulty === "intermediate") return "intermediate";
  if (config.generatorVersion >= EASY_GENERATOR_VERSION && config.difficulty === "basic") return "easy";
  return "legacy";
}

export function exerciseDomainPolicy(question: QuestionIdentity) {
  return question.generatorVersion >= INTERMEDIATE_GENERATOR_VERSION ? "intermediate" as const : "legacy" as const;
}

export function exerciseGenerationDomainVersion(profile: ReturnType<typeof exerciseGenerationProfile>) {
  return profile === "intermediate" ? INTERMEDIATE_DOMAIN_VERSION : EXERCISE_DOMAIN_VERSION;
}
