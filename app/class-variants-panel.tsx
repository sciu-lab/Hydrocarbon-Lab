"use client";

import { useState } from "react";
import { uiText } from "./i18n.ts";
import type { AppLanguage } from "./i18n.ts";
import { parseFiniteQuestionCount } from "./exercise-model.ts";
import { ClassAssignmentError, automaticParticipantIds, classVariantInputSignature, createClassAssignmentConfig,
  customParticipantIds, generateClassAssignments } from "./class-assignment.ts";
import type { ClassAssignmentErrorCode, ClassAssignmentManifest, ClassSessionSelection } from "./class-assignment.ts";
import { CLASS_ASSIGNMENT_CSV_FILENAME, serializeClassAssignmentCsv } from "./class-assignment-csv.ts";

export const CLASS_PREVIEW_ROWS = 100;
const ERROR_TEXT: Record<ClassAssignmentErrorCode, string> = {
  EMPTY_CLASS_SEED: "Introduce una semilla de clase.",
  INVALID_CONFIGURATION: "Selecciona temas, tipos de pregunta y un número entero positivo de preguntas. Las variantes de clase requieren una sesión finita.",
  UNSUPPORTED_VERSION: "Esta versión de asignaciones de clase no está soportada.",
  INVALID_PARTICIPANT_COUNT: "Introduce un número entero positivo de participantes.",
  EMPTY_ROSTER: "Introduce al menos un identificador de participante.",
  DUPLICATE_PARTICIPANT_ID: "Hay identificadores de participante duplicados después de normalizarlos. Corrige la lista.",
  RESOURCE_LIMIT: "El manifiesto supera el límite de memoria local. Reduce la lista de participantes o la longitud del texto.",
  INVALID_TEXT: "La semilla o los identificadores contienen caracteres de texto no válidos.",
};

export function ClassVariantsPreview({ manifest, language, stale = false, onExport, onUseSeed }: {
  manifest: ClassAssignmentManifest; language: AppLanguage; stale?: boolean;
  onExport(): void; onUseSeed(seed: string): void;
}) {
  const t = (text: string) => uiText(language, text);
  return <div className="class-variants-preview">
    <p role="status">{t("{count} variantes generadas.").replace("{count}", String(manifest.participants.length))}</p>
    {stale && <p role="status">{t("La configuración cambió. Vuelve a generar las variantes antes de exportar o usar una semilla.")}</p>}
    <div className="class-variants-table">
      <table><caption>{t("Asignaciones de clase")}</caption>
        <thead><tr><th scope="col">{t("Participante")}</th><th scope="col">{t("Semilla de sesión")}</th></tr></thead>
        <tbody>{manifest.participants.slice(0, CLASS_PREVIEW_ROWS).map((assignment) => <tr key={assignment.participantId}>
          <th scope="row">{assignment.participantId}</th><td>
            <input aria-label={`${t("Semilla de sesión")}: ${assignment.participantId}`} readOnly value={assignment.sessionSeed} />
            <button type="button" disabled={stale} onClick={() => onUseSeed(assignment.sessionSeed)}>{t("Usar esta semilla")}</button>
          </td>
        </tr>)}</tbody>
      </table>
    </div>
    {manifest.participants.length > CLASS_PREVIEW_ROWS && <p>{t("La vista muestra los primeros {count} participantes; el CSV incluye todas las asignaciones.")
      .replace("{count}", String(CLASS_PREVIEW_ROWS))}</p>}
    <button type="button" disabled={stale} onClick={onExport}>{t("Exportar CSV")}</button>
  </div>;
}

/** Metadata only. This component has no generator, molecule, evaluator, or session instance. */
export function ClassVariantsPanel({ selection, language, onUseSeed }: {
  selection: ClassSessionSelection; language: AppLanguage; onUseSeed(seed: string): void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [classSeed, setClassSeed] = useState("");
  const [rosterMode, setRosterMode] = useState<"automatic" | "custom">("automatic");
  const [countText, setCountText] = useState("36");
  const [customText, setCustomText] = useState("");
  const [generated, setGenerated] = useState<{ manifest: ClassAssignmentManifest; inputSignature: string } | null>(null);
  const [error, setError] = useState<ClassAssignmentErrorCode | null>(null);
  const t = (text: string) => uiText(language, text);
  const signature = classVariantInputSignature(selection, classSeed, rosterMode, countText, customText);
  const stale = generated !== null && generated.inputSignature !== signature;
  const generateVariants = () => {
    try {
      const config = createClassAssignmentConfig(selection, classSeed);
      const count = parseFiniteQuestionCount(countText);
      if (rosterMode === "automatic" && count === null) throw new ClassAssignmentError("INVALID_PARTICIPANT_COUNT");
      const ids = rosterMode === "automatic" ? automaticParticipantIds(count!) : customParticipantIds(customText);
      const manifest = generateClassAssignments(config, ids);
      setGenerated({ manifest, inputSignature: signature });
      setError(null);
    } catch (failure) {
      setError(failure instanceof ClassAssignmentError ? failure.code : "INVALID_CONFIGURATION");
    }
  };
  const exportCsv = () => {
    if (!generated || stale) return;
    const url = URL.createObjectURL(new Blob([serializeClassAssignmentCsv(generated.manifest, language)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = CLASS_ASSIGNMENT_CSV_FILENAME;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <section className="class-variants" aria-labelledby="class-variants-title">
    <h3 id="class-variants-title">{t("Variantes de clase")}</h3>
    <label className="class-variants-toggle"><input type="checkbox" checked={enabled}
      onChange={(event) => setEnabled(event.target.checked)} />{t("Generar variantes para una clase")}</label>
    {enabled && <>
      <p>{t("Usa identificadores anónimos en lugar de nombres cuando sea posible. Los datos de clase se procesan solo en este dispositivo.")}</p>
      <div className="class-variants-seed">
        <label>{t("Semilla de clase")}<input value={classSeed} onChange={(event) => setClassSeed(event.target.value)}
          autoComplete="off" spellCheck={false} /></label>
        <button type="button" onClick={() => setClassSeed(`class-${crypto.randomUUID()}`)}>{t("Generar semilla")}</button>
      </div>
      <fieldset><legend>{t("Participantes")}</legend>
        <label className="class-variants-toggle"><input type="radio" name="class-roster-mode" checked={rosterMode === "automatic"}
          onChange={() => setRosterMode("automatic")} />{t("Generar identificadores")}</label>
        {rosterMode === "automatic" && <label>{t("Número de participantes")}<input type="number" min="1" step="1" value={countText}
          onChange={(event) => setCountText(event.target.value)} /></label>}
        <label className="class-variants-toggle"><input type="radio" name="class-roster-mode" checked={rosterMode === "custom"}
          onChange={() => setRosterMode("custom")} />{t("Identificadores personalizados")}</label>
        {rosterMode === "custom" && <label>{t("Un identificador por línea")}<textarea rows={5} value={customText}
          onChange={(event) => setCustomText(event.target.value)} autoComplete="off" spellCheck={false} /></label>}
      </fieldset>
      <p>{t("Cada participante recibe una semilla reproducible. Puede haber moléculas coincidentes entre variantes.")}</p>
      <button type="button" onClick={generateVariants}>{t("Generar variantes")}</button>
      {error && <p role="alert">{t(ERROR_TEXT[error])}</p>}
      {generated && <ClassVariantsPreview manifest={generated.manifest} language={language} stale={stale}
        onExport={exportCsv} onUseSeed={onUseSeed} />}
    </>}
  </section>;
}
