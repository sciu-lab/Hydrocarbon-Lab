"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";
import { PracticeSessionView, PracticeStructure, PRACTICE_TOPIC_GROUPS } from "./practice-panel.tsx";
import type { StructureRenderer } from "./practice-panel.tsx";
import { PracticeBuildEditor } from "./practice-build-editor.tsx";
import type { BuildEditorRenderer } from "./practice-build-editor.tsx";
import { CompletedSessionReview } from "./session-review-dashboard.tsx";
import type { PracticeReviewer } from "./practice-review.ts";
import type { PracticeClock } from "./practice-timing.ts";
import type { BuildSubmissionValidator, StructuralAnswerEvaluator } from "./practice-structural-answer.ts";
import { isMultipleChoiceQuestion } from "./practice-question.ts";
import { backToExamResults, examAnsweredCount, examQuestion, hasExamDrafts, isExamDraftComplete,
  localizeExamState, markExamQuestionAvailable, navigateExam, openExamPostReview,
  submitExam, updateExamAnswer, updateExamStructure } from "./exam-session.ts";
import type { ExamState } from "./exam-session.ts";
import type { PracticeState } from "./practice-session.ts";

type ExamActions = {
  answer(value: string): void; structure(molecule: GeneratedMolecule): void;
  available(questionId: string, index: number): void;
  go(index: number): void; submit(): void; configure(): void; back(): void;
  review(): void; results(): void;
};

/** Pre-submit markup reads only the student draft and neutral completion policy. */
export function ExamSessionView({ state, language, renderStructure, renderBuilder, review, actions }: {
  state: Exclude<ExamState, { phase: "CONFIG" }>; language: AppLanguage;
  renderStructure: StructureRenderer; renderBuilder?: BuildEditorRenderer;
  review: PracticeReviewer; actions: ExamActions;
}) {
  const t = (text: string) => uiText(language, text);
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const index = "index" in state ? state.index : -1;
  const id = "plan" in state && index >= 0 ? state.plan.slots[index].questionIdentity : null;
  const phase = state.phase;
  const available = actions.available;
  const structure = actions.structure;
  const inputRef = useCallback((element: HTMLInputElement | null) => {
    input.current = element;
    if (element && phase === "EXAM_QUESTION" && id) available(id, index);
  }, [phase, id, index, available]);
  const buildReady = useCallback(() => { if (phase === "EXAM_QUESTION" && id) available(id, index); }, [phase, id, index, available]);
  const buildChange = useCallback((graph: GeneratedMolecule) => structure(graph), [structure]);
  useEffect(() => { if (phase === "EXAM_QUESTION") input.current?.focus(); else heading.current?.focus(); }, [phase, index]);
  const categoryLabel = (category: string) => t(PRACTICE_TOPIC_GROUPS.flatMap((group) => [...group.topics]).find(([key]) => key === category)![1]);
  const typeLabel = (type: string) => t(type === "build" ? "Construir la molécula" : type === "multiple-choice" ? "Opción múltiple" : "Nomenclatura");
  if (state.phase === "EXAM_ERROR") return <div role="alert" className="practice-error">
    <h3 ref={heading} tabIndex={-1}>{t("No se pudo preparar el examen. Prueba otra semilla o vuelve a la configuración.")}</h3>
    {state.reason === "insufficient-unique-questions" && <p>{t("Hydrocarbon-Lab no pudo generar suficientes preguntas únicas para esta configuración. Prueba con menos preguntas o selecciona más categorías.")}</p>}
    <button type="button" onClick={actions.configure}>{t("Volver a la configuración")}</button>
  </div>;
  if (state.phase === "EXAM_RESULTS") return <CompletedSessionReview state={state} language={language}
    renderStructure={renderStructure} review={review} categoryLabel={categoryLabel} onCorrectMistakes={() => {}}
    onConfigure={actions.configure} onBackToLab={actions.back} onReviewAnswers={actions.review} />;
  if (state.phase === "EXAM_POST_REVIEW") {
    const attempt = state.attempts[state.index];
    const draft = state.drafts[state.index];
    const feedback: Extract<PracticeState, { phase: "FEEDBACK" }> = {
      phase: "FEEDBACK", config: state.config, index: state.index,
      generationIndex: state.plan.slots[state.index].generationIndex, recentIdentities: [],
      question: examQuestion(state, language), answer: attempt.selectedOptionId ?? attempt.answer,
      attempts: [attempt], timing: null, correct: attempt.correct, submittedLocale: attempt.localeAtSubmission,
      ...(draft.type === "build" ? { studentMolecule: draft.studentMolecule } : {}),
    };
    return <>
      <h3 ref={heading} tabIndex={-1}>{t("Revisión del examen")}</h3>
      <div className="practice-actions"><button type="button" disabled={state.index === 0} onClick={() => actions.go(state.index - 1)}>{t("Anterior")}</button>
        <button type="button" onClick={actions.results}>{t("Volver a resultados")}</button></div>
      <PracticeSessionView key={state.index} state={feedback} language={language} renderStructure={renderStructure}
        review={review} showBuildReference endLabel={t("Volver a resultados")} actions={{ answer: () => {}, check: () => {},
          next: () => state.index + 1 < state.plan.slots.length ? actions.go(state.index + 1) : actions.results(),
          end: actions.results, back: actions.back, configure: actions.configure, retry: () => {}, correctMistakes: () => {} }} />
    </>;
  }
  if (state.phase === "EXAM_REVIEW") return <>
    <h3 ref={heading} tabIndex={-1}>{t("Revisar antes de enviar")}</h3>
    <p>{t("{answered} de {total} respondidas").replace("{answered}", String(examAnsweredCount(state))).replace("{total}", String(state.plan.slots.length))}</p>
    <ol className="exam-review-list">{state.plan.slots.map((slot, i) => <li key={i}>
      <span>{t("Pregunta {current}").replace("{current}", String(i + 1))} · {typeLabel(slot.questionType)}</span>
      <span>{t(isExamDraftComplete(slot, state.drafts[i]) ? "Respondida" : "Sin responder")}</span>
      <button type="button" disabled={state.locked || confirming} onClick={() => actions.go(i)}>{t("Ir a la pregunta")}</button>
    </li>)}</ol>
    {state.gradingError && <p role="alert">{t("No se pudo calificar el examen. Tus borradores se conservan; reintenta el envío.")}</p>}
    {!confirming ? <button type="button" className="practice-primary"
      disabled={examAnsweredCount(state) !== state.plan.slots.length} onClick={() => setConfirming(true)}>{t("Enviar examen")}</button>
      : <div role="alertdialog" aria-modal="false" aria-labelledby="exam-submit-title" className="exam-confirmation">
        <h4 id="exam-submit-title">{t("¿Enviar el examen?")}</h4>
        <p>{t("Después de enviar no podrás cambiar tus respuestas.")}</p>
        <div className="practice-actions"><button type="button" autoFocus onClick={() => setConfirming(false)}>{t("Cancelar")}</button>
          <button type="button" className="practice-primary" disabled={examAnsweredCount(state) !== state.plan.slots.length}
            onClick={() => { setConfirming(false); actions.submit(); }}>{t("Confirmar envío")}</button></div>
      </div>}
  </>;
  const question = examQuestion(state, language);
  const draft = state.drafts[state.index];
  return <>
    <div className="practice-question-heading"><h3 ref={heading} tabIndex={-1}>{t("Pregunta {current} de {total}")
      .replace("{current}", String(state.index + 1)).replace("{total}", String(state.plan.slots.length))}</h3>
      </div>
    {draft.type === "build" ? <>
      <h3>{t("Construir la molécula")}</h3>
      <p className="practice-build-target">{t("Objetivo")}: <strong>{question.reference.name}</strong></p>
      {renderBuilder && <PracticeBuildEditor key={state.index} language={language} disabled={false} hideCategory
        initialMolecule={draft.studentMolecule} renderBuilder={renderBuilder} onChange={buildChange} onReady={buildReady} />}
      {draft.validationError && <p role="status">{t(draft.validationError === "INVALID_SUBMISSION"
        ? "La estructura no es válida para enviar. Revisa sus enlaces y el dominio admitido."
        : "No se pudo validar la estructura. Puedes reintentar editándola.")}</p>}
    </> : <>
      <PracticeStructure molecule={question.molecule} language={language} renderStructure={renderStructure} />
      {draft.type === "multiple-choice" && isMultipleChoiceQuestion(question) ? <fieldset className="practice-options">
        <legend>{t("¿Cuál es el nombre IUPAC correcto?")}</legend>
        {question.options.map((option, i) => <label key={option.id} className="practice-option">
          <input type="radio" name="exam-option" value={`option-${i + 1}`} ref={i === 0 ? inputRef : undefined}
            checked={draft.selectedOptionId === option.id} onChange={() => actions.answer(option.id)} />
          <span><b>{String.fromCharCode(65 + i)}.</b> {option.name[language]}</span>
        </label>)}
      </fieldset> : draft.type === "naming" && <div className="practice-answer">
        <label htmlFor="exam-answer">{t("¿Cuál es el nombre IUPAC?")}</label>
        <input id="exam-answer" ref={inputRef} value={draft.rawText} onChange={(event) => actions.answer(event.target.value)}
          autoComplete="off" autoCapitalize="none" spellCheck={false} />
      </div>}
    </>}
    <div className="practice-actions exam-navigation">
      <button type="button" disabled={state.index === 0} onClick={() => actions.go(state.index - 1)}>{t("Anterior")}</button>
      <button type="button" className="practice-primary" onClick={() => actions.go(state.index + 1)}>{t("Siguiente")}</button>
      <button type="button" onClick={() => actions.go(state.plan.slots.length)}>{t("Revisar antes de enviar")}</button>
    </div>
  </>;
}

/** Synchronous ref commits guard double presses and keep grading outside replayable updaters. */
export function ExamPanel({ initialState, language, onLanguageChange, onBackToLab, onConfigure,
  renderStructure, renderBuilder, evaluateStructure, validateStructure, review, clock }: {
  initialState: ExamState; language: AppLanguage; onLanguageChange(language: AppLanguage): void;
  onBackToLab(): void; onConfigure(): void; renderStructure: StructureRenderer;
  renderBuilder?: BuildEditorRenderer; evaluateStructure?: StructuralAnswerEvaluator;
  validateStructure?: BuildSubmissionValidator; review: PracticeReviewer; clock: PracticeClock;
}) {
  const [state, setState] = useState(initialState);
  const latest = useRef(initialState);
  const commit = useCallback((next: ExamState) => { latest.current = next; setState(next); }, []);
  const [exit, setExit] = useState<"configure" | "lab" | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const t = (text: string) => uiText(language, text);
  const current = localizeExamState(state, language);
  const index = "index" in current ? current.index : -1;
  const questionId = "plan" in current && index >= 0 ? current.plan.slots[index].questionIdentity : "";
  const available = useCallback((id: string, i: number) => commit(markExamQuestionAvailable(latest.current, clock.read(), { questionId: id, index: i })), [clock, commit]);
  const structure = useCallback((molecule: GeneratedMolecule) => {
    if (validateStructure) commit(updateExamStructure(latest.current, molecule, validateStructure, { questionId, index }));
  }, [commit, validateStructure, questionId, index]);
  const requestExit = (destination: "configure" | "lab") => {
    if ((current.phase === "EXAM_QUESTION" || current.phase === "EXAM_REVIEW") && hasExamDrafts(current)) setExit(destination);
    else (destination === "lab" ? onBackToLab : onConfigure)();
  };
  useEffect(() => { if (current.phase !== "EXAM_QUESTION") title.current?.focus(); }, [current.phase]);
  if (current.phase === "CONFIG") return null;
  const actions: ExamActions = {
    available, structure,
    answer: (value) => commit(updateExamAnswer(latest.current, value)),
    go: (i) => commit(navigateExam(latest.current, i, clock.read())),
    submit: () => commit(submitExam(latest.current, language, clock.read(), evaluateStructure)),
    configure: () => requestExit("configure"), back: () => requestExit("lab"),
    review: () => commit(openExamPostReview(latest.current)), results: () => commit(backToExamResults(latest.current)),
  };
  return <section id="practice-panel" className="practice-card" aria-labelledby="exam-title">
    <header className="practice-header"><h2 id="exam-title" ref={title} tabIndex={-1}>{t("Examen")}</h2>
      <div className="language-switch" role="group" aria-label={t("Idioma")}>{(["es", "en"] as const).map((locale) =>
        <button key={locale} type="button" className={language === locale ? "active" : ""} aria-pressed={language === locale}
          onClick={() => onLanguageChange(locale)}>{locale.toUpperCase()}</button>)}</div>
      <button type="button" onClick={actions.configure}>{t("Volver a la configuración")}</button>
      <button type="button" onClick={actions.back}>{t("Volver al laboratorio")}</button></header>
    <p className="practice-seed">{t("Semilla")}: <code>{current.config.seed}</code></p>
    {exit ? <div role="alertdialog" aria-modal="false" aria-labelledby="exam-exit-title" className="exam-confirmation">
      <h3 id="exam-exit-title">{t("¿Salir del examen?")}</h3><p>{t("Se perderán los borradores de este examen.")}</p>
      <div className="practice-actions"><button type="button" autoFocus onClick={() => setExit(null)}>{t("Cancelar")}</button>
        <button type="button" onClick={() => (exit === "lab" ? onBackToLab : onConfigure)()}>{t("Salir y descartar")}</button></div>
    </div> : <ExamSessionView state={current} language={language} renderStructure={renderStructure}
      renderBuilder={renderBuilder} review={review} actions={actions} />}
  </section>;
}
