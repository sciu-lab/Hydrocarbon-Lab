"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import type { ExerciseCategory } from "./exercise-model.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import {
  createPracticeConfig, endPractice, localizePracticeState, markPracticeQuestionAvailable, nextPracticeQuestion,
  PRACTICE_LENGTHS, resolvePracticeSeed, retryPracticeGeneration, startPractice,
  submitPracticeAnswer, updatePracticeAnswer,
  hasPracticeQuestion, isPracticeAnswerState, startPracticeCorrections,
} from "./practice-session.ts";
import type { PracticeGenerator, PracticeState } from "./practice-session.ts";
import { browserPracticeClock } from "./practice-timing.ts";
import type { PracticeClock } from "./practice-timing.ts";
import { formatPracticeResponseTime } from "./practice-metrics.ts";
import { PracticeSummary } from "./practice-summary.tsx";
import type { PracticeReviewer, ReviewHighlights, ReviewModel } from "./practice-review.ts";
import { PracticeReviewPanel } from "./practice-review-panel.tsx";
import { isMultipleChoiceQuestion } from "./practice-question.ts";
import type { PracticeQuestionType } from "./practice-question.ts";

export const PRACTICE_TOPIC_GROUPS = [
  { label: "Hidrocarburos", topics: [["alkane", "Alcanos"], ["alkene", "Alquenos"], ["alkyne", "Alquinos"]] },
  { label: "Grupos funcionales", topics: [
    ["halogenated", "Compuestos halogenados"], ["alcohol", "Alcoholes"], ["aldehyde", "Aldehídos"],
    ["ketone", "Cetonas"], ["carboxylic-acid", "Ácidos carboxílicos"], ["ether", "Éteres"], ["ester", "Ésteres"],
    ["amine", "Aminas"], ["amide", "Amidas"], ["nitrile", "Nitrilos"], ["nitro", "Compuestos nitro"],
  ] },
  { label: "Cíclicos / Aromáticos", topics: [["simple-carbocycle", "Ciclos de carbono simples"], ["aromatic", "Aromáticos"]] },
  { label: "Estereoquímica", topics: [["ez", "Estereoquímica E/Z"]] },
] as const;

type StructureRenderer = (molecule: GeneratedMolecule, label: string, width: number, height: number, highlights?: ReviewHighlights) => ReactNode;
type ViewActions = {
  answer(value: string): void;
  check(): void;
  next(): void;
  end(): void;
  retry(): void;
  configure(): void;
  back(): void;
  correctMistakes(): void;
};

function PracticeStructure({ molecule, language, renderStructure, highlights }: {
  molecule: GeneratedMolecule; language: AppLanguage; renderStructure: StructureRenderer;
  highlights?: ReviewHighlights;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.min(900, entry.contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div className={`practice-structure${highlights ? " is-reviewing" : ""}`} ref={container}>
    {renderStructure(molecule, uiText(language, "Estructura molecular de la pregunta"), width, 300, highlights)}
    <p>{uiText(language, "Cada vértice representa un carbono; sus hidrógenos son implícitos.")}</p>
  </div>;
}

/** Session data stays read-only; review selection is local presentation state. */
export function PracticeSessionView({ state, language, renderStructure, review, actions, answerRef, feedbackRef, onQuestionAvailable }: {
  state: Exclude<PracticeState, { phase: "CONFIG" }>;
  language: AppLanguage;
  renderStructure: StructureRenderer;
  review: PracticeReviewer;
  actions: ViewActions;
  answerRef?: RefObject<HTMLInputElement | null>;
  feedbackRef?: RefObject<HTMLDivElement | null>;
  onQuestionAvailable?(questionId: string, index: number): void;
}) {
  const [reviewState, setReviewState] = useState<{ model: ReviewModel; activeStep: string } | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const currentId = hasPracticeQuestion(state) ? state.question.question.id : null;
  const currentIndex = hasPracticeQuestion(state) ? state.index : -1;
  const phase = state.phase;
  const inputRef = useCallback((input: HTMLInputElement | null) => {
    if (answerRef) answerRef.current = input;
    // The DOM commit, rather than generation or render, starts presentation.
    if (input && (phase === "QUESTION" || phase === "CORRECTION_QUESTION") && currentId !== null) onQuestionAvailable?.(currentId, currentIndex);
  }, [answerRef, onQuestionAvailable, phase, currentId, currentIndex]);
  const t = (text: string) => uiText(language, text);
  const categoryLabelFor = (category: ExerciseCategory) => t(PRACTICE_TOPIC_GROUPS.flatMap((group) => [...group.topics])
    .find(([id]) => id === category)![1]);
  if (state.phase === "COMPLETE" || state.phase === "CORRECTION_SUMMARY") return <PracticeSummary attempts={state.attempts} language={language}
    endless={state.config.questionCount === "endless"} categoryLabel={categoryLabelFor}
    review={state.phase === "CORRECTION_SUMMARY"} onCorrectMistakes={actions.correctMistakes}
    onConfigure={actions.configure} onBackToLab={actions.back} />;
  if (state.phase === "CORRECTION_ERROR") return <div className="practice-error" role="alert">
    <h3>{t("Corregir errores")}</h3>
    <p>{t("No se pudo reconstruir la pregunta original. Puedes reintentar o finalizar el repaso; tus resultados se conservan.")}</p>
    <div className="practice-actions">
      <button type="button" onClick={actions.retry}>{t("Reintentar")}</button>
      <button type="button" onClick={actions.end}>{t("Finalizar repaso")}</button>
    </div>
  </div>;
  if (state.phase === "ERROR") return <div className="practice-error" role="alert">
    {state.reason === "insufficient-safe-distractors" && <p>{t("No se encontraron suficientes opciones seguras para estos temas. Prueba otra semilla o Nomenclatura.")}</p>}
    <p>{t("No se pudo generar esta pregunta. Puedes reintentar o volver a la configuración.")}</p>
    <div className="practice-actions">
      <button type="button" onClick={actions.retry}>{t("Reintentar")}</button>
      <button type="button" onClick={actions.configure}>{t("Volver a la configuración")}</button>
      <button type="button" onClick={actions.end}>{t("Terminar práctica")}</button>
    </div>
  </div>;
  const correction = state.phase === "CORRECTION_QUESTION" || state.phase === "CORRECTION_FEEDBACK";
  const feedback = state.phase === "FEEDBACK" || state.phase === "CORRECTION_FEEDBACK";
  const mcq = isMultipleChoiceQuestion(state.question) ? state.question : null;
  const attempt = feedback ? state.attempts[state.attempts.length - 1] : null;
  const reviewKey = attempt ? `${attempt.questionId}:${attempt.generationIndex}:${attempt.attemptNumber}` : null;
  const openReview = feedback && reviewState && attempt
    && reviewState.model.questionId === attempt.questionId
    && reviewState.model.generationIndex === attempt.generationIndex
    && reviewState.model.attemptNumber === attempt.attemptNumber ? reviewState : null;
  const highlights = openReview?.model.steps.find((step) => step.id === openReview.activeStep);
  const closeReview = () => {
    setReviewState(null); setReviewError(null);
    window.requestAnimationFrame(() => feedbackRef?.current?.focus());
  };
  const advance = () => { closeReview(); actions.next(); };
  const heading = correction ? t("Corrección {current} de {total}")
    : state.config.questionCount === "endless" ? t("Pregunta {current}") : t("Pregunta {current} de {total}");
  return <>
    {correction && <h3>{t("Corregir errores")}</h3>}
    <div className="practice-question-heading">
      <h3>{heading.replace("{current}", String(correction ? state.correctionIndex + 1 : state.index + 1))
        .replace("{total}", String(correction ? state.queue.length : state.config.questionCount))}</h3>
      <span className="scope-pill">{categoryLabelFor(state.question.category)}</span>
    </div>
    <PracticeStructure molecule={state.question.molecule} language={language} renderStructure={renderStructure} highlights={highlights} />
    {!openReview && <form className="practice-answer" onSubmit={(event) => { event.preventDefault(); actions.check(); }}>
      {mcq ? <fieldset className="practice-options">
        <legend>{t("¿Cuál es el nombre IUPAC correcto?")}</legend>
        {mcq.options.map((option, index) => <label key={option.id}
          className={`practice-option${feedback && option.correct ? " is-correct" : ""}${feedback && state.answer === option.id && !option.correct ? " is-incorrect" : ""}`}>
          <input type="radio" name="practice-option" value={option.id} ref={index === 0 ? inputRef : undefined}
            checked={state.answer === option.id} disabled={feedback || state.timing === null}
            onChange={() => actions.answer(option.id)} />
          <span><b>{String.fromCharCode(65 + index)}.</b> {option.name[language]}
            {feedback && option.correct && <strong> · ✓ {t("Correcto")}</strong>}
            {feedback && state.answer === option.id && !option.correct && <strong> · ✗ {t("Tu respuesta")}</strong>}
          </span>
        </label>)}
      </fieldset> : <>
      <label htmlFor="practice-answer">{t("¿Cuál es el nombre IUPAC?")}</label>
      <input id="practice-answer" ref={inputRef} value={state.answer} onChange={(event) => actions.answer(event.target.value)}
        disabled={feedback || state.timing === null} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </>}
      {isPracticeAnswerState(state) && <button type="submit" className="practice-primary" disabled={!(mcq ? mcq.options.some((option) => option.id === state.answer) : state.answer.trim()) || state.timing === null}>{t("Comprobar respuesta")}</button>}
    </form>}
    {openReview && <PracticeReviewPanel model={openReview.model} language={language} activeStep={openReview.activeStep}
      onSelectStep={(activeStep) => setReviewState({ ...openReview, activeStep })} onClose={closeReview} onNext={advance} />}
    {feedback && !openReview && <div className={`practice-feedback ${state.correct ? "is-correct" : ""}`}
      role="status" aria-live="polite" tabIndex={-1} ref={feedbackRef}>
      <strong>{state.correct ? `✓ ${t("Correcto")}` : t("No exactamente.")}</strong>
      <p>{t("Nombre de referencia de Hydrocarbon Lab:")}</p>
      <p className="practice-reference">{state.question.reference.name}</p>
      <p>{t("Tiempo de respuesta")}: {formatPracticeResponseTime(state.attempts[state.attempts.length - 1].responseTimeMs, language)}</p>
      {reviewError === reviewKey && <p role="alert">{t("No se pudo abrir la revisión. Puedes continuar la práctica; tus resultados se conservan.")}</p>}
      <div className="practice-actions">
        <button type="button" onClick={() => {
          try {
            const model = review(state.question, attempt!);
            setReviewState({ model, activeStep: model.steps[0].id }); setReviewError(null);
            window.requestAnimationFrame(() => document.getElementById("practice-review-title")?.focus());
          } catch { setReviewError(reviewKey); }
        }}>{t("Revisar respuesta")}</button>
        <button type="button" className="practice-primary" onClick={advance}>{t("Siguiente")}</button>
      </div>
    </div>}
    <button type="button" className="practice-end" onClick={actions.end}>{correction ? t("Finalizar repaso") : t("Terminar práctica")}</button>
  </>;
}

export function PracticePanel({ language, onLanguageChange, onBackToLab, generate, renderStructure, review, clock = browserPracticeClock }: {
  language: AppLanguage;
  onLanguageChange(language: AppLanguage): void;
  onBackToLab(): void;
  generate: PracticeGenerator;
  renderStructure: StructureRenderer;
  review: PracticeReviewer;
  clock?: PracticeClock;
}) {
  const [session, setSession] = useState<PracticeState>({ phase: "CONFIG" });
  const [categories, setCategories] = useState<ExerciseCategory[]>(["alkane"]);
  const [questionTypes, setQuestionTypes] = useState<PracticeQuestionType[]>(["naming"]);
  const [count, setCount] = useState<number | "endless">(10);
  const [seed, setSeed] = useState("");
  const [configError, setConfigError] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const index = hasPracticeQuestion(session) ? session.index : -1;
  const answerAvailable = isPracticeAnswerState(session) && session.timing !== null;
  const onQuestionAvailable = useCallback((questionId: string, index: number) => {
    const time = clock.read();
    setSession((state) => markPracticeQuestionAvailable(state, time, { questionId, index }));
  }, [clock]);
  useEffect(() => {
    if (session.phase === "QUESTION" || session.phase === "CORRECTION_QUESTION") {
      if (answerAvailable) answerRef.current?.focus();
    }
    else if (session.phase === "FEEDBACK" || session.phase === "CORRECTION_FEEDBACK") feedbackRef.current?.focus();
    else titleRef.current?.focus();
  }, [session.phase, index, answerAvailable]);
  const t = (text: string) => uiText(language, text);
  const localized = localizePracticeState(session, language);
  const actions: ViewActions = {
    answer: (value) => setSession((state) => updatePracticeAnswer(state, value)),
    check: () => {
      // Capture the press once, outside React's replayable state updater.
      const submitted = clock.read();
      setSession((state) => submitPracticeAnswer(state, language, submitted));
    },
    next: () => setSession((state) => nextPracticeQuestion(localizePracticeState(state, language), generate)),
    end: () => setSession((state) => endPractice(localizePracticeState(state, language))),
    retry: () => setSession((state) => retryPracticeGeneration(localizePracticeState(state, language), generate)),
    configure: () => { setSession({ phase: "CONFIG" }); setConfigError(false); },
    back: onBackToLab,
    correctMistakes: () => setSession((state) => startPracticeCorrections(localizePracticeState(state, language), generate)),
  };
  return <section id="practice-panel" className="practice-card" aria-labelledby="practice-title">
    <header className="practice-header">
      <h2 id="practice-title" tabIndex={-1} ref={titleRef}>{t("Práctica / Examen")}</h2>
      <div className="language-switch" role="group" aria-label={t("Idioma")}>
        {(["es", "en"] as const).map((locale) => <button key={locale} type="button" className={language === locale ? "active" : ""}
          aria-pressed={language === locale} onClick={() => onLanguageChange(locale)}>{locale.toUpperCase()}</button>)}
      </div>
      <button type="button" onClick={onBackToLab}>{t("Volver al laboratorio")}</button>
    </header>
    <div className="practice-mode" role="group" aria-label={t("Modo de práctica")}>
      <button type="button" aria-pressed="true">{t("Práctica")}</button>
      <button type="button" disabled>{t("Examen")} · {t("Próximamente")}</button>
    </div>
    {localized.phase === "CONFIG" ? <form className="practice-config" onSubmit={(event) => {
      event.preventDefault();
      setConfigError(false);
      try {
        const resolved = resolvePracticeSeed(seed, () => `practice-${crypto.randomUUID()}`);
        setSession(startPractice(createPracticeConfig(categories, count, language, resolved, questionTypes), generate));
      } catch { setConfigError(true); }
    }}>
      <p>{t("Practica nombres con estructuras generadas. Tu molécula del laboratorio se conserva.")}</p>
      <h3>{t("Temas")}</h3>
      <div className="practice-topics">
        {PRACTICE_TOPIC_GROUPS.map((group) => <fieldset key={group.label}>
          <legend>{t(group.label)}</legend>
          <div>{group.topics.map(([id, label]) => <label key={id}>
            <input type="checkbox" checked={categories.includes(id)} onChange={(event) => setCategories((current) =>
              event.target.checked ? [...current, id] : current.filter((category) => category !== id))} />{t(label)}
          </label>)}</div>
        </fieldset>)}
      </div>
      {!categories.length && <p role="status">{t("Selecciona al menos un tema.")}</p>}
      <fieldset className="practice-question-types"><legend>{t("Tipos de pregunta")}</legend>
        {(["naming", "multiple-choice"] as const).map((type) => <label key={type}>
          <input type="checkbox" checked={questionTypes.includes(type)} onChange={(event) => setQuestionTypes((current) =>
            event.target.checked ? [...current, type] : current.filter((item) => item !== type))} />
          {t(type === "naming" ? "Nomenclatura" : "Opción múltiple")}
        </label>)}
      </fieldset>
      {!questionTypes.length && <p role="status">{t("Selecciona al menos un tipo de pregunta.")}</p>}
      <div className="practice-config-fields">
        <label>{t("Preguntas")}<select value={count} onChange={(event) => setCount(event.target.value === "endless" ? "endless" : Number(event.target.value))}>
          {PRACTICE_LENGTHS.map((length) => <option key={length} value={length}>{length === "endless" ? t("Sin límite") : length}</option>)}
        </select></label>
        <label>{t("Semilla (opcional)")}<input value={seed} onChange={(event) => setSeed(event.target.value)} autoComplete="off" spellCheck={false} /></label>
      </div>
      {configError && <p role="alert">{t("No se pudo iniciar la práctica. Revisa los temas y vuelve a intentarlo.")}</p>}
      <button type="submit" className="practice-primary" disabled={!categories.length || !questionTypes.length}>{t("Iniciar práctica")}</button>
    </form> : <>
      <p className="practice-seed">{t("Semilla")}: <code>{localized.config.seed}</code></p>
      <PracticeSessionView state={localized} language={language} renderStructure={renderStructure} review={review} actions={actions}
        answerRef={answerRef} feedbackRef={feedbackRef} onQuestionAvailable={onQuestionAvailable} />
    </>}
  </section>;
}
