export type HoverTimer = { current: ReturnType<typeof setTimeout> | null };

export function cancelReasoningHover(timer: HoverTimer) {
  if (timer.current !== null) clearTimeout(timer.current);
  timer.current = null;
}

export function scheduleReasoningHover(
  timer: HoverTimer,
  stepNumber: string,
  preview: (stepNumber: string) => void,
  navigate: (stepNumber: string) => void,
) {
  cancelReasoningHover(timer);
  preview(stepNumber);
  timer.current = setTimeout(() => {
    timer.current = null;
    navigate(stepNumber);
  }, 400);
}

export function activateReasoningReference(
  timer: HoverTimer,
  stepNumber: string,
  navigate: (stepNumber: string) => void,
) {
  cancelReasoningHover(timer);
  navigate(stepNumber);
}

export function scrollToReasoningStep(
  stepNumber: string,
  doc: Pick<Document, "getElementById"> = document,
  view: Pick<Window, "matchMedia"> = window,
) {
  const target = doc.getElementById(`iupac-reasoning-step-${stepNumber}`);
  if (!target) return false;
  const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "center" });
  return true;
}
