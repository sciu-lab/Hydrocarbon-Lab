"use client";

import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import type { ReviewModel } from "./practice-review.ts";
import { formatPracticeReviewMessage } from "./practice-review-i18n.ts";

/** Read-only presentation; all lifecycle actions remain owned by Practice. */
export function PracticeReviewPanel({ model, language, activeStep, onSelectStep, onClose, onNext, closeLabel = "Volver al feedback", nextLabel = "Siguiente" }: {
  model: ReviewModel; language: AppLanguage; activeStep: string;
  onSelectStep(id: string): void; onClose(): void; onNext(): void;
  closeLabel?: string; nextLabel?: string;
}) {
  const t = (key: string) => uiText(language, key);
  return <section className="practice-review" aria-labelledby="practice-review-title" data-review-status={model.status}>
    <h3 id="practice-review-title" tabIndex={-1}>{t("Revisión detallada")}</h3>
    <strong>{model.status === "CORRECT" ? `✓ ${t("Correcto")}` : t("No exactamente.")}</strong>
    <dl className="practice-review-answers">
      <dt>{t("Tu respuesta")}</dt><dd>{model.studentAnswer}</dd>
      <dt>{t("Idioma de la respuesta enviada")}</dt><dd>{model.submittedLocale.toUpperCase()}</dd>
      <dt>{t("Nombre de referencia de Hydrocarbon Lab:")}</dt><dd>{model.reference.names[language]}</dd>
    </dl>
    {model.issues.map((issue) => <p className="practice-review-issue" data-issue-code={issue.code} key={issue.code}>
      {formatPracticeReviewMessage(issue.messageKey, issue.params, language)}
    </p>)}
    <p>{t("Selecciona un paso para resaltar sus átomos y enlaces.")}</p>
    <ol className="practice-review-steps">
      {model.steps.map((step, index) => <li key={step.id} data-review-step={step.kind}>
        <button type="button" aria-pressed={activeStep === step.id} onClick={() => onSelectStep(step.id)}>
          {index + 1}. {formatPracticeReviewMessage(step.titleKey, {}, language)}
        </button>
        <p>{formatPracticeReviewMessage(step.messageKey, step.params, language)}</p>
      </li>)}
    </ol>
    <div className="practice-actions">
      <button type="button" onClick={onClose}>{t(closeLabel)}</button>
      <button type="button" className="practice-primary" onClick={onNext}>{t(nextLabel)}</button>
    </div>
  </section>;
}
