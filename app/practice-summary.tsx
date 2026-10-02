import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import type { ExerciseCategory, QuestionType } from "./exercise-model.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import { calculatePracticeMetrics, formatPracticePercentage, formatPracticeResponseTime } from "./practice-metrics.ts";
import { calculatePracticeMastery } from "./practice-corrections.ts";
import type { ReactNode } from "react";
import type { SessionReviewModel } from "./session-review.ts";

const typeLabels: Record<QuestionType, string> = {
  naming: "Nomenclatura", "multiple-choice": "Opción múltiple", build: "Construir la molécula",
};

export function PracticeSummary({ attempts, language, endless, categoryLabel, onConfigure, onBackToLab, review, onCorrectMistakes, mode = "practice", onReviewAnswers, sessionReview, dashboard }: {
  attempts: readonly AttemptRecord[]; language: AppLanguage; endless: boolean;
  categoryLabel(category: ExerciseCategory): string;
  onConfigure(): void; onBackToLab(): void;
  review: boolean; onCorrectMistakes(): void;
  mode?: "practice" | "exam"; onReviewAnswers?(): void;
  sessionReview?: SessionReviewModel; dashboard?: ReactNode;
}) {
  const t = (text: string) => uiText(language, text);
  const metrics = sessionReview?.initialResults ?? calculatePracticeMetrics(attempts);
  const mastery = mode === "practice" ? sessionReview?.mode === "practice" ? sessionReview.masteryResults : calculatePracticeMastery(attempts) : null;
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const percentage = (value: number) => formatPracticePercentage(value, language);
  const duration = (value: number) => metrics.answeredQuestions ? formatPracticeResponseTime(value, language) : "—";
  const cards = [
    [t(mode === "exam" ? "Puntuación" : "Puntuación inicial"), `${number(metrics.correctAnswers)} / ${number(metrics.answeredQuestions)}`],
    [t(mode === "exam" ? "Acierto" : "Acierto en el primer intento"), percentage(metrics.firstAttemptAccuracy)],
    [t("Preguntas respondidas"), number(metrics.answeredQuestions)],
    [t("Respuestas correctas"), number(metrics.correctAnswers)],
    [t("Respuestas incorrectas"), number(metrics.incorrectAnswers)],
    ...(mode === "practice" ? [[t("Preguntas para repasar"), number(metrics.questionsToReview)]] : []),
    [t("Tiempo medio de respuesta"), duration(metrics.averageResponseTimeMs)],
    [t("Mediana del tiempo de respuesta"), duration(metrics.medianResponseTimeMs)],
  ];
  return <div className="practice-complete practice-summary" role="status">
    <h3>{mode === "exam" ? t("Examen completado") : review ? t("Repaso de práctica") : endless ? t("Resumen de práctica") : t("Práctica completada")}</h3>
    <h4>{t(mode === "exam" ? "Resultados del examen" : "Resultados iniciales")}</h4>
    {!metrics.answeredQuestions && <p>{t("No se enviaron respuestas en esta sesión.")}</p>}
    <dl className="practice-metric-grid">
      {cards.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <p className="practice-timing-note">{t(mode === "exam" ? "El tiempo acumula las visitas a cada pregunta; la revisión previa no cuenta." : "El tiempo mide el intervalo entre mostrar la pregunta y enviar la respuesta.")}</p>
    {!dashboard && metrics.answeredQuestions > 0 && <>
      <table className="practice-metrics-table">
        <caption>{t("Acierto por categoría")}</caption>
        <thead><tr><th scope="col">{t("Categoría")}</th><th scope="col">{t("Correctas / Respondidas")}</th><th scope="col">{t("Acierto")}</th></tr></thead>
        <tbody>{metrics.byCategory.map((row) => <tr key={row.id}><th scope="row">{categoryLabel(row.id)}</th>
          <td>{number(row.correct)} / {number(row.answered)}</td><td>{percentage(row.accuracy)}</td></tr>)}</tbody>
      </table>
      <table className="practice-metrics-table">
        <caption>{t("Acierto por tipo de pregunta")}</caption>
        <thead><tr><th scope="col">{t("Tipo de pregunta")}</th><th scope="col">{t("Correctas / Respondidas")}</th><th scope="col">{t("Acierto")}</th></tr></thead>
        <tbody>{metrics.byQuestionType.map((row) => <tr key={row.id}><th scope="row">{t(typeLabels[row.id])}</th>
          <td>{number(row.correct)} / {number(row.answered)}</td><td>{percentage(row.accuracy)}</td></tr>)}</tbody>
      </table>
    </>}
    {review && mastery && <section className="practice-corrections" aria-label={t("Correcciones")}>
      <h4>{t("Correcciones")}</h4>
      <dl className="practice-metric-grid">
        <div><dt>{t("Corregidas")}</dt><dd>{number(mastery.correctedQuestions)} / {number(mastery.originalQuestionsToReview)}</dd></div>
        <div><dt>{t("Pendientes")}</dt><dd>{number(mastery.remainingMistakes)}</dd></div>
        <div><dt>{t("Intentos de corrección")}</dt><dd>{number(mastery.correctionAttempts)}</dd></div>
        <div><dt>{t("Dominio final")}</dt><dd>{number(mastery.finalMasteredQuestions)} / {number(mastery.initialAnswered)}<br />{percentage(mastery.finalMastery)}</dd></div>
      </dl>
      {!mastery.remainingMistakes && <p>{t("Todos los errores corregidos")}</p>}
    </section>}
    {dashboard}
    <div className="practice-actions">
      {mastery && mastery.remainingMistakes > 0 && <button type="button" className="practice-primary" onClick={onCorrectMistakes}>
        {review ? t("Reintentar los errores pendientes") : t("Corregir errores")}
      </button>}
      {mode === "exam" && <button type="button" className="practice-primary" onClick={onReviewAnswers}>{t("Revisar respuestas")}</button>}
      <button type="button" className="practice-primary" onClick={onConfigure}>{t(mode === "exam" ? "Iniciar otro examen" : "Iniciar otra práctica")}</button>
      <button type="button" onClick={onBackToLab}>{t("Volver al laboratorio")}</button>
    </div>
  </div>;
}
