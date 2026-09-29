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
} from "./practice-session.ts";
import type { PracticeGenerator, PracticeState } from "./practice-session.ts";
import { browserPracticeClock } from "./practice-timing.ts";
import type { PracticeClock } from "./practice-timing.ts";
import { formatPracticeResponseTime } from "./practice-metrics.ts";
import { PracticeSummary } from "./practice-summary.tsx";

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

type StructureRenderer = (molecule: GeneratedMolecule, label: string, width: number, height: number) => ReactNode;
type ViewActions = {
  answer(value: string): void;
  check(): void;
  next(): void;
  end(): void;
  retry(): void;
  configure(): void;
  back(): void;
};

function PracticeStructure({ molecule, language, renderStructure }: {
  molecule: GeneratedMolecule; language: AppLanguage; renderStructure: StructureRenderer;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.min(900, entry.contentRect.width))));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div className="practice-structure" ref={container}>
    {renderStructure(molecule, uiText(language, "Estructura molecular de la pregunta"), width, 300)}
    <p>{uiText(language, "Cada vértice representa un carbono; sus hidrógenos son implícitos.")}</p>
  </div>;
}

/** Stateless presentation makes answer hiding, disabled controls and feedback testable. */
export function PracticeSessionView({ state, language, renderStructure, actions, answerRef, feedbackRef, onQuestionAvailable }: {
  state: Exclude<PracticeState, { phase: "CONFIG" }>;
  language: AppLanguage;
  renderStructure: StructureRenderer;
  actions: ViewActions;
  answerRef?: RefObject<HTMLInputElement | null>;
  feedbackRef?: RefObject<HTMLDivElement | null>;
  onQuestionAvailable?(questionId: string, index: number): void;
}) {
  const currentId = state.phase === "QUESTION" || state.phase === "FEEDBACK" ? state.question.question.id : null;
  const currentIndex = state.phase === "QUESTION" || state.phase === "FEEDBACK" ? state.index : -1;
  const phase = state.phase;
  const inputRef = useCallback((input: HTMLInputElement | null) => {
    if (answerRef) answerRef.current = input;
    // The DOM commit, rather than generation or render, starts presentation.
    if (input && phase === "QUESTION" && currentId !== null) onQuestionAvailable?.(currentId, currentIndex);
  }, [answerRef, onQuestionAvailable, phase, currentId, currentIndex]);
  const t = (text: string) => uiText(language, text);
  const categoryLabelFor = (category: ExerciseCategory) => t(PRACTICE_TOPIC_GROUPS.flatMap((group) => [...group.topics])
    .find(([id]) => id === category)![1]);
  if (state.phase === "COMPLETE") return <PracticeSummary attempts={state.attempts} language={language}
    endless={state.config.questionCount === "endless"} categoryLabel={categoryLabelFor}
    onConfigure={actions.configure} onBackToLab={actions.back} />;
  if (state.phase === "ERROR") return <div className="practice-error" role="alert">
    <p>{t("No se pudo generar esta pregunta. Puedes reintentar o volver a la configuración.")}</p>
    <div className="practice-actions">
      <button type="button" onClick={actions.retry}>{t("Reintentar")}</button>
      <button type="button" onClick={actions.configure}>{t("Volver a la configuración")}</button>
      <button type="button" onClick={actions.end}>{t("Terminar práctica")}</button>
    </div>
  </div>;
  const heading = state.config.questionCount === "endless" ? t("Pregunta {current}") : t("Pregunta {current} de {total}");
  return <>
    <div className="practice-question-heading">
      <h3>{heading.replace("{current}", String(state.index + 1)).replace("{total}", String(state.config.questionCount))}</h3>
      <span className="scope-pill">{categoryLabelFor(state.question.category)}</span>
    </div>
    <PracticeStructure molecule={state.question.molecule} language={language} renderStructure={renderStructure} />
    <form className="practice-answer" onSubmit={(event) => { event.preventDefault(); actions.check(); }}>
      <label htmlFor="practice-answer">{t("¿Cuál es el nombre IUPAC?")}</label>
      <input id="practice-answer" ref={inputRef} value={state.answer} onChange={(event) => actions.answer(event.target.value)}
        disabled={state.phase === "FEEDBACK" || state.timing === null} autoComplete="off" autoCapitalize="none" spellCheck={false} />
      {state.phase === "QUESTION" && <button type="submit" className="practice-primary" disabled={!state.answer.trim() || state.timing === null}>{t("Comprobar respuesta")}</button>}
    </form>
    {state.phase === "FEEDBACK" && <div className={`practice-feedback ${state.correct ? "is-correct" : ""}`}
      role="status" aria-live="polite" tabIndex={-1} ref={feedbackRef}>
      <strong>{state.correct ? `✓ ${t("Correcto")}` : t("No exactamente.")}</strong>
      <p>{t("Nombre de referencia de Hydrocarbon Lab:")}</p>
      <p className="practice-reference">{state.question.reference.name}</p>
      <p>{t("Tiempo de respuesta")}: {formatPracticeResponseTime(state.attempts[state.attempts.length - 1].responseTimeMs, language)}</p>
      <button type="button" className="practice-primary" onClick={actions.next}>{t("Siguiente")}</button>
    </div>}
    <button type="button" className="practice-end" onClick={actions.end}>{t("Terminar práctica")}</button>
  </>;
}

export function PracticePanel({ language, onLanguageChange, onBackToLab, generate, renderStructure, clock = browserPracticeClock }: {
  language: AppLanguage;
  onLanguageChange(language: AppLanguage): void;
  onBackToLab(): void;
  generate: PracticeGenerator;
  renderStructure: StructureRenderer;
  clock?: PracticeClock;
}) {
  const [session, setSession] = useState<PracticeState>({ phase: "CONFIG" });
  const [categories, setCategories] = useState<ExerciseCategory[]>(["alkane"]);
  const [count, setCount] = useState<number | "endless">(10);
  const [seed, setSeed] = useState("");
  const [configError, setConfigError] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const index = session.phase === "QUESTION" || session.phase === "FEEDBACK" ? session.index : -1;
  const answerAvailable = session.phase === "QUESTION" && session.timing !== null;
  const onQuestionAvailable = useCallback((questionId: string, index: number) => {
    const time = clock.read();
    setSession((state) => markPracticeQuestionAvailable(state, time, { questionId, index }));
  }, [clock]);
  useEffect(() => {
    if (session.phase === "QUESTION") {
      if (answerAvailable) answerRef.current?.focus();
    }
    else if (session.phase === "FEEDBACK") feedbackRef.current?.focus();
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
        setSession(startPractice(createPracticeConfig(categories, count, language, resolved), generate));
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
      <div className="practice-config-fields">
        <label>{t("Tipo de pregunta")}<input value={t("Nomenclatura")} readOnly /></label>
        <label>{t("Preguntas")}<select value={count} onChange={(event) => setCount(event.target.value === "endless" ? "endless" : Number(event.target.value))}>
          {PRACTICE_LENGTHS.map((length) => <option key={length} value={length}>{length === "endless" ? t("Sin límite") : length}</option>)}
        </select></label>
        <label>{t("Semilla (opcional)")}<input value={seed} onChange={(event) => setSeed(event.target.value)} autoComplete="off" spellCheck={false} /></label>
      </div>
      {configError && <p role="alert">{t("No se pudo iniciar la práctica. Revisa los temas y vuelve a intentarlo.")}</p>}
      <button type="submit" className="practice-primary" disabled={!categories.length}>{t("Iniciar práctica")}</button>
    </form> : <>
      <p className="practice-seed">{t("Semilla")}: <code>{localized.config.seed}</code></p>
      <PracticeSessionView state={localized} language={language} renderStructure={renderStructure} actions={actions}
        answerRef={answerRef} feedbackRef={feedbackRef} onQuestionAvailable={onQuestionAvailable} />
    </>}
  </section>;
}
