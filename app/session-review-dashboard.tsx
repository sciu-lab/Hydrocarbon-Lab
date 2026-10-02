"use client";

import { useEffect, useRef, useState } from "react";
import { uiText } from "./i18n.ts";
import type { AppLanguage } from "./i18n.ts";
import type { ExerciseCategory, QuestionType } from "./exercise-model.ts";
import { formatPracticePercentage, formatPracticeResponseTime } from "./practice-metrics.ts";
import { buildCompletedSessionReview, filterSessionReviewQuestions } from "./session-review.ts";
import type { SessionReviewModel, SessionReviewFilters, QuestionReviewEntry, ReviewStatus } from "./session-review.ts";
import { reconstructSessionReviewQuestion } from "./session-review-question.ts";
import type { SessionQuestionReview } from "./session-review-question.ts";
import type { PracticeQuestionGenerator } from "./practice-question.ts";
import { isMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeState } from "./practice-session.ts";
import type { ExamState } from "./exam-session.ts";
import type { PracticeReviewer, ReviewModel } from "./practice-review.ts";
import { PracticeReviewPanel } from "./practice-review-panel.tsx";
import { PracticeStructure } from "./practice-panel.tsx";
import type { StructureRenderer } from "./practice-panel.tsx";
import { PracticeSummary } from "./practice-summary.tsx";

const STATUS_TEXT: Record<ReviewStatus, string> = { CORRECT_FIRST_TRY: "Correcta en el primer intento",
  CORRECTED: "Corregida", UNRESOLVED: "Sin resolver", CORRECT: "Correcto", INCORRECT: "Incorrecto" };
const TYPE_TEXT: Record<QuestionType, string> = { naming: "Nomenclatura", "multiple-choice": "Opción múltiple", build: "Construir la molécula" };

export function SessionQuestionDetail({ detail, attemptNumber, language, renderStructure, reviewerModel,
  activeStep, onAttempt, onOpenReviewer, onStep, onCloseReviewer, onClose, onNext }: {
  detail: SessionQuestionReview; attemptNumber: number; language: AppLanguage; renderStructure: StructureRenderer;
  reviewerModel: ReviewModel | null; activeStep: string; onAttempt(number: number): void;
  onOpenReviewer(): void; onStep(id: string): void; onCloseReviewer(): void; onClose(): void; onNext(): void;
}) {
  const t = (key: string) => uiText(language, key);
  const attempt = detail.entry.attempts.find((record) => record.attemptNumber === attemptNumber)!;
  const question = detail.question;
  const highlights = reviewerModel?.steps.find((step) => step.id === activeStep);
  const submitted = detail.studentStructures.find((value) => value.attemptNumber === attemptNumber);
  return <section className="session-question-detail" aria-labelledby="session-question-detail-title">
    <h4 id="session-question-detail-title" tabIndex={-1}>{t("Pregunta {current}").replace("{current}", String(detail.entry.displayOrdinal))}</h4>
    {question.type === "build" && submitted && <><h5>{t("Tu estructura")}</h5>
      <PracticeStructure molecule={submitted.molecule} language={language} renderStructure={renderStructure} /></>}
    <h5>{t(question.type === "build" ? "Estructura de referencia" : "Estructura molecular de la pregunta")}</h5>
    <PracticeStructure molecule={question.molecule} language={language} renderStructure={renderStructure} highlights={highlights} />
    <dl className="practice-review-answers"><dt>{t("Respuesta del estudiante")}</dt><dd><pre>{attempt.answer}</pre></dd>
      <dt>{t("Respuesta de referencia")}</dt><dd>{question.reference.names[language]}</dd>
      <dt>{t("Resultado")}</dt><dd>{t(attempt.correct ? "Correcto" : "Incorrecto")}</dd>
      <dt>{t("Tiempo de respuesta")}</dt><dd>{formatPracticeResponseTime(attempt.responseTimeMs, language)}</dd>
      <dt>{t("Idioma de la respuesta enviada")}</dt><dd>{attempt.localeAtSubmission.toUpperCase()}</dd></dl>
    {isMultipleChoiceQuestion(question) && <ol className="session-review-options" aria-label={t("Opciones originales")}>
      {question.options.map((option) => <li key={option.id} data-option-id={option.id}>
        {option.name[language]}{option.id === attempt.selectedOptionId && <strong> · {t("Opción seleccionada")}</strong>}
        {option.id === question.correctOptionId && <strong> · ✓ {t("Opción correcta")}</strong>}
      </li>)}
    </ol>}
    <h5>{t("Historial de intentos")}</h5>
    <ol className="session-attempt-history">{detail.entry.attempts.map((record) => <li key={record.attemptNumber}>
      <button type="button" aria-pressed={attemptNumber === record.attemptNumber} onClick={() => onAttempt(record.attemptNumber)}>
        {t("Intento {number}").replace("{number}", String(record.attemptNumber))} · {t(record.correct ? "Correcto" : "Incorrecto")} · {formatPracticeResponseTime(record.responseTimeMs, language)}
      </button><pre>{record.answer}</pre>
    </li>)}</ol>
    {reviewerModel ? <PracticeReviewPanel model={reviewerModel} language={language} activeStep={activeStep}
      onSelectStep={onStep} onClose={onCloseReviewer} onNext={onNext}
      closeLabel="Volver a la pregunta" nextLabel="Siguiente pregunta" />
      : <button type="button" onClick={onOpenReviewer}>{t("Revisar respuesta")}</button>}
    <div className="practice-actions"><button type="button" onClick={onClose}>{t("Volver al resumen de sesión")}</button>
      <button type="button" onClick={onNext}>{t("Siguiente pregunta")}</button></div>
  </section>;
}

export function SessionReviewDashboard({ model, language, categoryLabel, renderStructure, review, generate, frozenPlan }: {
  model: SessionReviewModel; language: AppLanguage; categoryLabel(category: ExerciseCategory): string;
  renderStructure: StructureRenderer; review?: PracticeReviewer; generate?: PracticeQuestionGenerator;
  frozenPlan?: Extract<ExamState, { phase: "EXAM_RESULTS" | "EXAM_POST_REVIEW" }>["plan"];
}) {
  const t = (key: string) => uiText(language, key);
  const [filters, setFilters] = useState<SessionReviewFilters>({ status: "all", category: "all", questionType: "all" });
  const [detail, setDetail] = useState<SessionQuestionReview | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [reviewerModel, setReviewerModel] = useState<ReviewModel | null>(null);
  const [activeStep, setActiveStep] = useState("");
  const [error, setError] = useState<"reconstruction" | "reviewer" | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const key = detail?.entry.key;
  useEffect(() => { if (key) document.getElementById("session-question-detail-title")?.focus(); }, [key]);
  const percentage = (ratio: number) => formatPracticePercentage(ratio * 100, language);
  const duration = (ms: number | null) => ms === null ? "—" : formatPracticeResponseTime(ms, language);
  const open = (entry: QuestionReviewEntry) => {
    const frozen = frozenPlan?.slots.find((slot) => slot.questionIdentity === entry.questionId
      && slot.generationIndex === entry.generationIndex)?.question;
    const result = reconstructSessionReviewQuestion(model.config, entry, generate, frozen);
    if (!result.ok) { setError("reconstruction"); return; }
    setDetail(result.detail); setAttemptNumber(1); setReviewerModel(null); setError(null);
  };
  const close = () => {
    const ordinal = detail?.entry.displayOrdinal;
    setDetail(null); setReviewerModel(null); setError(null);
    window.requestAnimationFrame(() => (document.getElementById(`session-review-question-${ordinal}`) ?? heading.current)?.focus());
  };
  const questions = filterSessionReviewQuestions(model, filters);
  const next = () => {
    const index = questions.findIndex((entry) => entry.key === detail?.entry.key);
    if (index >= 0 && index + 1 < questions.length) open(questions[index + 1]); else close();
  };
  const breakdown = (rows: SessionReviewModel["byCategory"] | SessionReviewModel["byQuestionType"], label: string, category: boolean) =>
    <div className="session-review-table"><table className="practice-metrics-table"><caption>{t(label)}</caption>
      <thead><tr><th scope="col">{t(category ? "Categoría" : "Tipo de pregunta")}</th><th scope="col">{t("Correctas / Respondidas")}</th>
        <th scope="col">{t("Acierto inicial")}</th><th scope="col">{t("Primera respuesta media")}</th>
        {model.mode === "practice" && <th scope="col">{t("Dominio final")}</th>}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{category ? categoryLabel(row.id as ExerciseCategory) : t(TYPE_TEXT[row.id as QuestionType])}</th>
        <td>{row.initialCorrect} / {row.questions}</td><td>{percentage(row.initialAccuracy)}</td><td>{duration(row.averageInitialResponseTimeMs)}</td>
        {row.mode === "practice" && <td>{row.mastered} / {row.questions} · {percentage(row.mastery)}</td>}</tr>)}</tbody>
    </table></div>;
  return <section className="session-dashboard" aria-labelledby="session-dashboard-title">
    <h3 id="session-dashboard-title" ref={heading} tabIndex={-1}>{t("Revisión de sesión")}</h3>
    <dl className="practice-metric-grid">
      {model.mode === "practice" && <>
        <div><dt>{t("Dominio final")}</dt><dd>{model.overview.masteredQuestions} / {model.questionCount} · {percentage(model.overview.mastery)}</dd></div>
        <div><dt>{t("Corregidas")}</dt><dd>{model.overview.correctedQuestions}</dd></div>
        <div><dt>{t("Sin resolver")}</dt><dd>{model.overview.unresolvedQuestions}</dd></div>
      </>}
      <div><dt>{t("Tiempo activo inicial total")}</dt><dd>{duration(model.timing.initial.totalMs)}</dd></div>
      <div><dt>{t("Intentos totales")}</dt><dd>{model.overview.totalAttempts}</dd></div>
      {model.mode === "practice" && <div><dt>{t("Tiempo de correcciones")}</dt><dd>{duration(model.timing.corrections.totalMs)}</dd></div>}
    </dl>
    {model.questions.length > 0 ? <>
      {breakdown(model.byCategory, "Acierto por categoría", true)}
      {breakdown(model.byQuestionType, "Acierto por tipo de pregunta", false)}
      <div className="session-review-filters">
        <label>{t("Estado")}<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value as ReviewStatus | "all" })}>
          <option value="all">{t("Todas")}</option>
          {(model.mode === "practice" ? ["CORRECT_FIRST_TRY", "CORRECTED", "UNRESOLVED"] as const : ["CORRECT", "INCORRECT"] as const)
            .map((status) => <option key={status} value={status}>{t(STATUS_TEXT[status])}</option>)}
        </select></label>
        <label>{t("Tipo de pregunta")}<select value={filters.questionType} onChange={(event) => setFilters({ ...filters, questionType: event.target.value as QuestionType | "all" })}>
          <option value="all">{t("Todas")}</option>{model.byQuestionType.map((row) => <option key={row.id} value={row.id}>{t(TYPE_TEXT[row.id])}</option>)}
        </select></label>
        <label>{t("Categoría")}<select value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value as ExerciseCategory | "all" })}>
          <option value="all">{t("Todas")}</option>{model.byCategory.map((row) => <option key={row.id} value={row.id}>{categoryLabel(row.id)}</option>)}
        </select></label>
      </div>
      {error && <p role="alert">{t(error === "reconstruction" ? "No se pudo reconstruir esta pregunta. Tus resultados se conservan; vuelve a pulsar Revisar pregunta para reintentar."
        : "No se pudo abrir la revisión detallada. Tus resultados se conservan.")}</p>}
      {detail ? <SessionQuestionDetail detail={detail} attemptNumber={attemptNumber} language={language} renderStructure={renderStructure}
        reviewerModel={reviewerModel} activeStep={activeStep} onStep={setActiveStep} onCloseReviewer={() => setReviewerModel(null)}
        onAttempt={(number) => { setAttemptNumber(number); setReviewerModel(null); setError(null); }} onClose={close} onNext={next}
        onOpenReviewer={() => { try {
          if (!review) throw new Error("Reviewer unavailable.");
          const selected = detail.entry.attempts.find((attempt) => attempt.attemptNumber === attemptNumber)!;
          const result = review(detail.question, selected); setReviewerModel(result); setActiveStep(result.steps[0]?.id ?? ""); setError(null);
          window.requestAnimationFrame(() => document.getElementById("practice-review-title")?.focus());
        } catch { setError("reviewer"); } }} />
        : <ol className="session-review-questions">{questions.map((entry) => <li key={entry.key}>
          <h4>{t("Pregunta {current}").replace("{current}", String(entry.displayOrdinal))}</h4>
          <p>{categoryLabel(entry.category)} · {t(TYPE_TEXT[entry.questionType])}</p>
          <p>{t("Resultado inicial")}: {t(entry.initialCorrect ? "Correcto" : "Incorrecto")} · <strong>{t(STATUS_TEXT[entry.reviewStatus])}</strong></p>
          <p>{t("Intentos")}: {entry.attempts.length} · {t("Primera respuesta")}: {duration(entry.initialResponseTimeMs)}</p>
          <button type="button" id={`session-review-question-${entry.displayOrdinal}`} disabled={!generate && !frozenPlan}
            onClick={() => open(entry)}>{t("Revisar pregunta")}</button>
        </li>)}</ol>}
      {!detail && !questions.length && <p role="status">{t("Ninguna pregunta coincide con los filtros.")}</p>}
    </> : <p>{t("No hay datos de revisión disponibles.")}</p>}
    <details className="session-review-metadata"><summary>{t("Detalles de sesión")}</summary><dl>
      <dt>{t("Modo de práctica")}</dt><dd>{t(model.mode === "practice" ? "Práctica" : "Examen")}</dd>
      <dt>{t("Semilla")}</dt><dd><code>{model.seed}</code></dd>
      <dt>generatorVersion</dt><dd>{model.generatorVersion}</dd>
      <dt>{t("Preguntas configuradas")}</dt><dd>{model.config.questionCount === "endless" ? t("Sin límite") : model.config.questionCount}</dd>
      <dt>{t("Preguntas respondidas")}</dt><dd>{model.questionCount}</dd>
      <dt>{t("Tipos de pregunta")}</dt><dd><code>{JSON.stringify(model.config.questionTypes)}</code></dd>
      <dt>{t("Temas")}</dt><dd><code>{JSON.stringify(model.config.categories)}</code></dd>
    </dl></details>
  </section>;
}

/** Only completed Practice and successfully graded Exam reach the shared dashboard. */
export function CompletedSessionReview({ state, language, categoryLabel, renderStructure, review, generate,
  onConfigure, onBackToLab, onCorrectMistakes, onReviewAnswers }: {
  state: PracticeState | ExamState; language: AppLanguage; categoryLabel(category: ExerciseCategory): string;
  renderStructure: StructureRenderer; review?: PracticeReviewer; generate?: PracticeQuestionGenerator;
  onConfigure(): void; onBackToLab(): void; onCorrectMistakes(): void; onReviewAnswers?(): void;
}) {
  const result = buildCompletedSessionReview(state);
  const t = (key: string) => uiText(language, key);
  if (!result.ok) return result.code === "NOT_COMPLETED" ? null : <section className="session-dashboard">
    <p role="alert">{t("Los datos de revisión de la sesión están incompletos.")}</p>
    <div className="practice-actions"><button type="button" onClick={onConfigure}>{t("Volver a la configuración")}</button>
      <button type="button" onClick={onBackToLab}>{t("Volver al laboratorio")}</button></div>
  </section>;
  const model = result.model;
  const frozenPlan = state.phase === "EXAM_RESULTS" || state.phase === "EXAM_POST_REVIEW" ? state.plan : undefined;
  return <PracticeSummary attempts={"attempts" in state ? state.attempts : []} language={language}
    mode={model.mode} endless={model.config.questionCount === "endless"} categoryLabel={categoryLabel}
    review={state.phase === "CORRECTION_SUMMARY"} onConfigure={onConfigure} onBackToLab={onBackToLab}
    onCorrectMistakes={onCorrectMistakes} onReviewAnswers={onReviewAnswers} sessionReview={model}
    dashboard={<SessionReviewDashboard model={model} language={language} categoryLabel={categoryLabel}
      renderStructure={renderStructure} review={review} generate={generate} frozenPlan={frozenPlan} />} />;
}
