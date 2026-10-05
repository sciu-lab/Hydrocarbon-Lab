"use client";

import { useId } from "react";
import { uiText } from "./i18n.ts";
import type { AppLanguage } from "./i18n.ts";
import { EXERCISE_DIFFICULTIES } from "./exercise-model.ts";
import type { ExerciseDifficulty } from "./exercise-model.ts";

const DIFFICULTY_COPY: Record<ExerciseDifficulty, { label: string; description: string }> = {
  basic: { label: "Fácil", description: "Una idea principal de nomenclatura a la vez." },
  intermediate: { label: "Intermedio", description: "Combina reglas de nomenclatura, insaturación y sustituyentes." },
  advanced: { label: "Difícil", description: "Combina varias decisiones de nomenclatura y mayor complejidad estructural." },
};

/** Labels are presentation only; radio values use the canonical session IDs. */
export function DifficultySelector({ language, value, onChange }: {
  language: AppLanguage;
  value: ExerciseDifficulty;
  onChange(value: ExerciseDifficulty): void;
}) {
  const id = useId();
  return <fieldset className="difficulty-selector" aria-describedby={`${id}-description`}>
    <legend>{uiText(language, "Dificultad")}</legend>
    <div className="difficulty-options">
      {EXERCISE_DIFFICULTIES.map((difficulty) => <label key={difficulty}>
        <input type="radio" name={`${id}-difficulty`} value={difficulty} checked={value === difficulty}
          onChange={() => onChange(difficulty)} />
        <span>{uiText(language, DIFFICULTY_COPY[difficulty].label)}</span>
      </label>)}
    </div>
    <p id={`${id}-description`}>{uiText(language, DIFFICULTY_COPY[value].description)}</p>
  </fieldset>;
}
