"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EXERCISE_CATEGORIES } from "./exercise-model.ts";
import type { ExerciseCategory, ExerciseDifficulty } from "./exercise-model.ts";
import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import { DifficultySelector } from "./difficulty-selector.tsx";
import { PRACTICE_TOPIC_GROUPS } from "./practice-panel.tsx";
import type { PracticeQuestionGenerator } from "./practice-question.ts";
import type { DocxStructurePreview } from "./docx-structure-assets-browser.ts";
import { createDefaultDocxExportUiSettings, createDocxExportRequest, DOCX_EXPORT_QUESTION_COUNTS } from "./docx-export-ui-model.ts";
import type { DocxExportQuestionCount, DocxExportQuestionType } from "./docx-export-ui-model.ts";
type DownloadLink = Readonly<{ filename: string; url: string; audience: "student" | "teacher" }>;

export function DocxExportPanel({ language, onClose, generate, Preview }: {
  language: AppLanguage;
  onClose(): void;
  generate: PracticeQuestionGenerator;
  Preview: DocxStructurePreview;
}) {
  const t = (value: string) => uiText(language, value);
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [defaults] = useState(() => createDefaultDocxExportUiSettings(language));
  const [questionType, setQuestionType] = useState<DocxExportQuestionType>(defaults.questionType);
  const [questionCount, setQuestionCount] = useState<DocxExportQuestionCount>(defaults.questionCount);
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty>(defaults.difficulty);
  const [categories, setCategories] = useState<ExerciseCategory[]>(() => [...defaults.categories]);
  const [documentLanguageOverride, setDocumentLanguageOverride] = useState<AppLanguage | null>(null);
  const documentLanguage = documentLanguageOverride ?? language;
  const [seed, setSeed] = useState("");
  const [output, setOutput] = useState<"student" | "teacher" | "both">(defaults.output);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);
  const [downloadLinks, setDownloadLinks] = useState<readonly DownloadLink[]>([]);

  useEffect(() => () => downloadLinks.forEach(({ url }) => URL.revokeObjectURL(url)), [downloadLinks]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const changeCategory = (category: ExerciseCategory, checked: boolean) => {
    setCategories((current) => checked
      ? current.includes(category) ? current : [...current, category]
      : current.filter((value) => value !== category));
    setFeedback(null);
  };

  const invalidateOutput = () => {
    setFeedback(null);
    setDownloadLinks([]);
  };

  const generateDocuments = async () => {
    if (generating || categories.length === 0) return;
    setGenerating(true);
    invalidateOutput();
    try {
      const request = createDocxExportRequest({ questionType, questionCount, difficulty, categories,
        documentLanguage, seed, output }, () => {
          if (!globalThis.crypto?.randomUUID) throw new Error("Secure random seed generation is unavailable.");
          return `worksheet-${globalThis.crypto.randomUUID()}`;
        });
      if (request.generatedSeed) setSeed(request.config.seed);
      const { createWorksheetFiles, downloadWorksheetFiles } = await import("./docx-browser-export.ts");
      const files = await createWorksheetFiles({
        config: request.config,
        generate,
        Preview,
        output: request.output,
      });
      await downloadWorksheetFiles(files);
      setDownloadLinks(files.map((file) => Object.freeze({
        filename: file.filename,
        url: URL.createObjectURL(file.blob),
        audience: file.filename.endsWith("-teacher.docx") ? "teacher" : "student",
      })));
      setFeedback("success");
    } catch (error) {
      console.error("Worksheet export failed.", error);
      setFeedback("error");
    } finally {
      setGenerating(false);
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={dialogRef} className="docx-export-dialog" aria-labelledby={`${id}-title`} tabIndex={-1}
      onCancel={(event) => { event.preventDefault(); if (!generating) onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current && !generating) onClose(); }}>
      <div className="docx-export-heading">
        <h2 id={`${id}-title`}>{t("Crear guía")}</h2>
        <button type="button" aria-label={t("Cerrar")}
          disabled={generating} onClick={onClose}>×</button>
      </div>
      <div className="docx-export-fields">
        <fieldset>
          <legend>{t("Tipo de pregunta")}</legend>
          <div className="docx-export-choice-row">
            {([ ["naming", "Nomenclatura"], ["multiple-choice", "Selección múltiple"] ] as const).map(([value, label]) => (
              <label key={value}>
                <input type="radio" name={`${id}-question-type`} value={value} checked={questionType === value}
                  onChange={() => { setQuestionType(value); invalidateOutput(); }} />
                <span>{t(label)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="docx-export-field" htmlFor={`${id}-count`}>
          {t("Preguntas")}
          <select id={`${id}-count`} value={questionCount}
            onChange={(event) => { setQuestionCount(Number(event.target.value) as DocxExportQuestionCount); invalidateOutput(); }}>
            {DOCX_EXPORT_QUESTION_COUNTS.map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>

        <DifficultySelector language={language} value={difficulty} onChange={(value) => { setDifficulty(value); invalidateOutput(); }} />

        <fieldset className="docx-export-categories">
          <legend>{t("Categorías")}</legend>
          <div className="docx-export-category-actions">
            <button type="button" onClick={() => { setCategories([...EXERCISE_CATEGORIES]); invalidateOutput(); }}>{t("Seleccionar todas")}</button>
            <button type="button" onClick={() => { setCategories([]); invalidateOutput(); }}>{t("Limpiar")}</button>
          </div>
          {PRACTICE_TOPIC_GROUPS.map((group) => (
            <fieldset key={group.label} className="docx-export-category-group">
              <legend>{t(group.label)}</legend>
              <div className="docx-export-category-grid">
                {group.topics.map(([category, label]) => (
                  <label key={category}>
                    <input type="checkbox" checked={categories.includes(category)}
                      onChange={(event) => changeCategory(category, event.target.checked)} />
                    <span>{t(label)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {categories.length === 0 && <p className="docx-export-help">{t("Selecciona al menos una categoría para generar la guía.")}</p>}
        </fieldset>

        <label className="docx-export-field" htmlFor={`${id}-language`}>
          {t("Idioma del documento")}
          <select id={`${id}-language`} value={documentLanguage} onChange={(event) => {
            setDocumentLanguageOverride(event.target.value as AppLanguage);
            invalidateOutput();
          }}>
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="docx-export-field" htmlFor={`${id}-seed`}>
          {t("Semilla")}
          <input id={`${id}-seed`} value={seed} autoComplete="off" spellCheck={false}
            onChange={(event) => { setSeed(event.target.value); invalidateOutput(); }} />
        </label>
        <p className="docx-export-help">{t("Usa la misma semilla y configuración para recrear esta guía.")}</p>

        <fieldset>
          <legend>{t("Versión del documento")}</legend>
          <div className="docx-export-choice-row">
            {([ ["student", "Estudiante"], ["teacher", "Docente"], ["both", "Ambas"] ] as const).map(([value, label]) => (
              <label key={value}>
                <input type="radio" name={`${id}-output`} value={value} checked={output === value}
                  onChange={() => { setOutput(value); invalidateOutput(); }} />
                <span>{t(label)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="docx-export-footer">
        <div className="docx-export-feedback">
        <p className={feedback === "error" ? "docx-export-error" : "docx-export-status"} role={feedback === "error" ? "alert" : "status"} aria-live="polite">
          {generating ? t("Generando documento…") : feedback === "error" ? t("No se pudo generar el documento. Inténtalo de nuevo.")
            : feedback === "success" ? t("Guía lista para descargar.") : ""}
        </p>
        {downloadLinks.length > 0 && <div className="docx-export-downloads">
          {downloadLinks.map((file) => <a key={file.filename} href={file.url} download={file.filename}>
            {t("Descargar")} {t(file.audience === "student" ? "Estudiante" : "Docente")}
          </a>)}
        </div>}
        </div>
        <button type="button" className="docx-export-generate" disabled={generating || categories.length === 0}
          onClick={() => void generateDocuments()}>{generating ? t("Generando documento…") : t("Generar y descargar")}</button>
      </div>
    </dialog>,
    document.body,
  );
}
