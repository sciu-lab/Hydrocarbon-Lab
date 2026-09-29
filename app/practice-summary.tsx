import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import type { ExerciseCategory, QuestionType } from "./exercise-model.ts";
import type { AttemptRecord } from "./practice-attempt.ts";
import { calculatePracticeMetrics, formatPracticePercentage, formatPracticeResponseTime } from "./practice-metrics.ts";

const typeLabels: Record<QuestionType, string> = {
  naming: "Nomenclatura", "multiple-choice": "Opción múltiple", build: "Construir la molécula",
};

export function PracticeSummary({ attempts, language, endless, categoryLabel, onConfigure, onBackToLab }: {
  attempts: readonly AttemptRecord[]; language: AppLanguage; endless: boolean;
  categoryLabel(category: ExerciseCategory): string;
  onConfigure(): void; onBackToLab(): void;
}) {
  const t = (text: string) => uiText(language, text);
  const metrics = calculatePracticeMetrics(attempts);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const percentage = (value: number) => formatPracticePercentage(value, language);
  const duration = (value: number) => metrics.answeredQuestions ? formatPracticeResponseTime(value, language) : "—";
  const cards = [
    [t("Puntuación inicial"), `${number(metrics.correctAnswers)} / ${number(metrics.answeredQuestions)}`],
    [t("Acierto en el primer intento"), percentage(metrics.firstAttemptAccuracy)],
    [t("Preguntas respondidas"), number(metrics.answeredQuestions)],
    [t("Respuestas correctas"), number(metrics.correctAnswers)],
    [t("Respuestas incorrectas"), number(metrics.incorrectAnswers)],
    [t("Preguntas para repasar"), number(metrics.questionsToReview)],
    [t("Tiempo medio de respuesta"), duration(metrics.averageResponseTimeMs)],
    [t("Mediana del tiempo de respuesta"), duration(metrics.medianResponseTimeMs)],
  ];
  return <div className="practice-complete practice-summary" role="status">
    <h3>{endless ? t("Resumen de práctica") : t("Práctica completada")}</h3>
    <h4>{t("Resultados iniciales")}</h4>
    {!metrics.answeredQuestions && <p>{t("No se enviaron respuestas en esta sesión.")}</p>}
    <dl className="practice-metric-grid">
      {cards.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <p className="practice-timing-note">{t("El tiempo mide el intervalo entre mostrar la pregunta y enviar la respuesta.")}</p>
    {metrics.answeredQuestions > 0 && <>
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
    <div className="practice-actions">
      <button type="button" className="practice-primary" onClick={onConfigure}>{t("Iniciar otra práctica")}</button>
      <button type="button" onClick={onBackToLab}>{t("Volver al laboratorio")}</button>
    </div>
  </div>;
}
