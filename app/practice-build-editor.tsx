"use client";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import type { AppLanguage } from "./i18n.ts";
import { uiText } from "./i18n.ts";
import type { GeneratedMolecule } from "./name-to-molecule.ts";

/** The existing Home editor accepts this bridge. No target is passed to it. */
export type BuildEditorProps = {
  language: AppLanguage; disabled: boolean;
  /** Exam omits student-family scaffolding until submission. */
  hideCategory?: boolean;
  /** Student draft only. The target never crosses this editor bridge. */
  initialMolecule?: GeneratedMolecule;
  onChange(molecule: GeneratedMolecule): void; onReady(): void;
};
export type BuildEditorRenderer = (props: BuildEditorProps) => ReactNode;
export function PracticeBuildEditor({ language, disabled, hideCategory, initialMolecule, renderBuilder, onChange, onReady }: BuildEditorProps & {
  renderBuilder: BuildEditorRenderer;
}) {
  const [reset, setReset] = useState(0);
  const ready = useCallback(() => onReady(), [onReady]);
  return <div className="practice-build-working">
    <div key={reset}>{renderBuilder({ language, disabled, hideCategory, onChange, onReady: ready,
      ...(reset === 0 && initialMolecule ? { initialMolecule } : {}) })}</div>
    <button type="button" disabled={disabled} onClick={() => setReset((value) => value + 1)}>{uiText(language, "Reiniciar estructura")}</button>
  </div>;
}
