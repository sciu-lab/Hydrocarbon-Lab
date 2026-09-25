export const GUIDED_TOUR_STORAGE_KEY = "hydrocarbonLab.guidedTour.v1";
export const GUIDED_TOUR_STEP_COUNT = 7;

export type GuidedTourDecision = "completed" | "skipped";
export type GuidedTourCompletion = GuidedTourDecision | "pending";
export type GuidedTourTarget =
  | "carbon"
  | "add-carbon"
  | "bond-controls"
  | "name"
  | "reasoning"
  | "settings"
  | "tools";

export type GuidedTourState = {
  ready: boolean;
  open: boolean;
  step: number;
  carbonPhase: "select" | "add";
  settingsOpenedFromTour: boolean;
  completion: GuidedTourCompletion;
};

export type GuidedTourAction =
  | { type: "initialize"; decision: GuidedTourDecision | null }
  | { type: "open" }
  | { type: "previous" }
  | { type: "next" }
  | { type: "carbon-selected" }
  | { type: "carbon-added" }
  | { type: "bond-order-changed" }
  | { type: "reasoning-opened" }
  | { type: "reasoning-fragment-activated" }
  | { type: "settings-opened"; fromGuidedStep: boolean }
  | { type: "settings-closed" }
  | { type: "tools-opened" }
  | { type: "dismiss" }
  | { type: "complete" };

export const INITIAL_GUIDED_TOUR_STATE: GuidedTourState = {
  ready: false,
  open: false,
  step: 0,
  carbonPhase: "select",
  settingsOpenedFromTour: false,
  completion: "pending",
};

const stepTargets: readonly GuidedTourTarget[] = [
  "carbon",
  "bond-controls",
  "name",
  "reasoning",
  "name",
  "settings",
  "tools",
];

export function guidedTourReducer(state: GuidedTourState, action: GuidedTourAction): GuidedTourState {
  switch (action.type) {
    case "initialize":
      if (state.ready) return state;
      return {
        ready: true,
        open: action.decision === null,
        step: 0,
        carbonPhase: "select",
        settingsOpenedFromTour: false,
        completion: action.decision ?? "pending",
      };
    case "open":
      return { ...state, ready: true, open: true, step: 0, carbonPhase: "select", settingsOpenedFromTour: false };
    case "previous":
      return state.open
        ? { ...state, step: Math.max(0, state.step - 1), carbonPhase: "select", settingsOpenedFromTour: false }
        : state;
    case "next":
      if (!state.open) return state;
      if (state.step >= GUIDED_TOUR_STEP_COUNT - 1) {
        return { ...state, open: false, carbonPhase: "select", settingsOpenedFromTour: false, completion: "completed" };
      }
      return { ...state, step: state.step + 1, carbonPhase: "select", settingsOpenedFromTour: false };
    case "carbon-selected":
      return state.open && state.step === 0 && state.carbonPhase === "select"
        ? { ...state, carbonPhase: "add" }
        : state;
    case "carbon-added":
      return state.open && state.step === 0 && state.carbonPhase === "add"
        ? { ...state, step: 1, carbonPhase: "select", settingsOpenedFromTour: false }
        : state;
    case "bond-order-changed":
      return state.open && state.step === 1
        ? { ...state, step: 2, carbonPhase: "select", settingsOpenedFromTour: false }
        : state;
    case "reasoning-opened":
      return state.open && state.step === 3
        ? { ...state, step: 4, carbonPhase: "select", settingsOpenedFromTour: false }
        : state;
    case "reasoning-fragment-activated":
      return state.open && state.step === 4
        ? { ...state, step: 5, carbonPhase: "select", settingsOpenedFromTour: false }
        : state;
    case "settings-opened":
      return {
        ...state,
        settingsOpenedFromTour: action.fromGuidedStep && state.open && state.step === 5,
      };
    case "settings-closed":
      return state.settingsOpenedFromTour && state.open && state.step === 5
        ? { ...state, step: 6, carbonPhase: "select", settingsOpenedFromTour: false }
        : state.settingsOpenedFromTour ? { ...state, settingsOpenedFromTour: false } : state;
    case "tools-opened":
      return state.open && state.step === 6
        ? { ...state, open: false, carbonPhase: "select", settingsOpenedFromTour: false, completion: "completed" }
        : state;
    case "dismiss":
      return {
        ...state,
        open: false,
        carbonPhase: "select",
        settingsOpenedFromTour: false,
        completion: state.completion === "pending" ? "skipped" : state.completion,
      };
    case "complete":
      return { ...state, open: false, carbonPhase: "select", settingsOpenedFromTour: false, completion: "completed" };
  }
}

export function readGuidedTourDecision(storage: Pick<Storage, "getItem">): GuidedTourDecision | null {
  try {
    const value = storage.getItem(GUIDED_TOUR_STORAGE_KEY);
    return value === "completed" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}

export function writeGuidedTourDecision(
  storage: Pick<Storage, "setItem">,
  decision: GuidedTourDecision,
): boolean {
  try {
    storage.setItem(GUIDED_TOUR_STORAGE_KEY, decision);
    return true;
  } catch {
    return false;
  }
}

export function guidedTourTargetForStep(step: number, carbonPhase: "select" | "add" = "select"): GuidedTourTarget {
  if (step === 0 && carbonPhase === "add") return "add-carbon";
  return stepTargets[Math.min(Math.max(step, 0), stepTargets.length - 1)];
}

export function guidedTourIsSuspendedByOverlay(overlays: {
  historyOpen: boolean;
  settingsOpen: boolean;
  exportOpen: boolean;
  canvasExpanded: boolean;
}): boolean {
  return overlays.historyOpen || overlays.settingsOpen || overlays.exportOpen || overlays.canvasExpanded;
}

export type GuidedTourCopy = {
  title: string;
  description: string;
  followUp?: string;
  action?: string;
  exampleAction?: string;
  exampleNote?: string;
};

export function guidedTourCopy(
  language: "es" | "en",
  step: number,
  options: {
    hasInteractiveName?: boolean;
    acetoneAlreadyLoaded?: boolean;
    needsExampleForReasoning?: boolean;
    isPristineInitialMolecule?: boolean;
    carbonPhase?: "select" | "add";
  } = {},
): GuidedTourCopy {
  const english = language === "en";
  const currentStep = Math.min(Math.max(step, 0), GUIDED_TOUR_STEP_COUNT - 1);

  switch (currentStep) {
    case 0:
      if (options.carbonPhase === "add") {
        return english
          ? {
              title: "Build a molecule",
              description: "Now choose one of the real Add C arrows below the canvas. The new carbon is added in that direction.",
            }
          : {
              title: "Construye una molécula",
              description: "Ahora elige una de las flechas reales «Añadir C» bajo el canvas. El nuevo carbono se agrega en esa dirección.",
            };
      }
      return english
        ? {
            title: "Build a molecule",
            description: options.isPristineInitialMolecule
              ? "Start with this CH₄ carbon. Click it to select it, then choose an Add C arrow below the canvas to add another carbon."
              : "Click a carbon in the canvas to select it, then choose an Add C arrow below the canvas. The new carbon appears in that direction.",
          }
        : {
            title: "Construye una molécula",
            description: options.isPristineInitialMolecule
              ? "Empieza con este carbono de CH₄. Haz clic para seleccionarlo y luego elige una flecha «Añadir C», bajo el canvas, para agregar otro carbono."
              : "Haz clic en un carbono del canvas para seleccionarlo y luego elige una flecha «Añadir C», bajo el canvas. El nuevo carbono aparece en esa dirección.",
          };
    case 1:
      return english
        ? {
            title: "Choose a bond order",
            description: "Before adding a carbon, choose Single, Double, or Triple here. To change a bond already in the canvas, click or activate that bond; each activation cycles its order.",
          }
        : {
            title: "Elige el orden del enlace",
            description: "Antes de añadir un carbono, elige aquí Simple, Doble o Triple. Para cambiar un enlace del canvas, haz clic o actívalo; cada activación recorre su orden.",
          };
    case 2:
      return english
        ? {
            title: "Watch the IUPAC name",
            description: "The name updates as you build and stays in the fixed bar at the bottom.",
            ...(options.isPristineInitialMolecule ? {
              exampleAction: "Try propanone to see a full name",
              exampleNote: "This is optional; Undo restores your current structure.",
            } : {}),
          }
        : {
            title: "Observa el nombre IUPAC",
            description: "El nombre se actualiza mientras construyes y permanece en la barra fija de abajo.",
            ...(options.isPristineInitialMolecule ? {
              exampleAction: "Probar con propanona y ver un nombre completo",
              exampleNote: "Es opcional; Deshacer recupera tu estructura actual.",
            } : {}),
          };
    case 3:
      return options.needsExampleForReasoning
        ? english
          ? {
              title: "Understand the name",
              description: "This structure has no explanation to show yet. Load the propanone example explicitly; its “How it is derived” steps explain the name. Undo restores your structure.",
              exampleAction: "Load propanone and show its explanation",
            }
          : {
              title: "Comprende el nombre",
              description: "Esta estructura todavía no tiene una explicación disponible. Carga el ejemplo de propanona para ver sus pasos en «Cómo se obtiene». Deshacer recupera tu estructura.",
              exampleAction: "Cargar propanona y mostrar su explicación",
            }
        : english
          ? {
              title: "See how the name is derived",
              description: "Open “How it is derived” to see why the structure receives this name and how its parts match the chemical rules.",
              action: "Show the explanation",
            }
          : {
              title: "Mira cómo se obtiene el nombre",
              description: "Abre «Cómo se obtiene» para ver por qué la estructura recibe este nombre y cómo sus partes corresponden a las reglas químicas.",
              action: "Mostrar la explicación",
            };
    case 4:
      return english
        ? {
            title: "Explore the name",
            description: "Select a linked part in the real IUPAC name below to jump to its explanation. Hover previews it; click, keyboard, and touch work too.",
            followUp: options.hasInteractiveName
              ? "The same fragment is highlighted in the explanation."
              : "This name has no links yet; the propanone example shows them on the real name.",
            action: options.acetoneAlreadyLoaded || options.hasInteractiveName ? undefined : "Try the propanone example",
            exampleNote: options.acetoneAlreadyLoaded || options.hasInteractiveName
              ? undefined
              : "Suggested displays “propan-2-one”; Undo restores your current structure.",
          }
        : {
            title: "Explora el nombre",
            description: "Selecciona una parte enlazada del nombre IUPAC real, abajo, para ir a su explicación. El mouse la previsualiza; también funciona con clic, teclado y toque.",
            followUp: options.hasInteractiveName
              ? "La explicación destaca el mismo fragmento."
              : "Este nombre aún no tiene enlaces; el ejemplo de propanona los muestra en el nombre real.",
            action: options.acetoneAlreadyLoaded || options.hasInteractiveName ? undefined : "Probar con propanona",
            exampleNote: options.acetoneAlreadyLoaded || options.hasInteractiveName
              ? undefined
              : "IUPAC sugerido muestra «propan-2-ona»; Deshacer recupera tu estructura.",
          };
    case 5:
      return english
        ? {
            title: "Personalize the view",
            description: "Open Settings from the gear beside History and Saved. Adjust implicit hydrogens, numbering, substituent highlighting, and label sizes. Accessibility options and keyboard shortcuts are farther down in the same panel.",
          }
        : {
            title: "Personaliza la visualización",
            description: "Abre Configuración con el engranaje junto a Historial y Guardados. Ajusta H implícitos, numeración, resaltado de sustituyentes y tamaño de etiquetas. Más abajo están Accesibilidad y los atajos de teclado.",
          };
    default:
      return english
        ? {
            title: "Keep exploring",
            description: "Try Examples or build a structure from By name. You can reopen this guide any time.",
          }
        : {
            title: "Sigue explorando",
            description: "Prueba Ejemplos o construye una estructura desde Por nombre. Puedes volver a abrir esta guía cuando quieras.",
          };
  }
}

export function guidedTourControls(language: "es" | "en") {
  return language === "en"
    ? {
        open: "How to use?",
        close: "Close guide",
        skip: "Skip",
        previous: "Previous",
        next: "Next",
        finish: "Finish",
        progress: (step: number) => `Step ${step + 1} of ${GUIDED_TOUR_STEP_COUNT}`,
      }
    : {
        open: "¿Cómo se usa?",
        close: "Cerrar guía",
        skip: "Omitir",
        previous: "Anterior",
        next: "Siguiente",
        finish: "Terminar",
        progress: (step: number) => `Paso ${step + 1} de ${GUIDED_TOUR_STEP_COUNT}`,
      };
}

export type GuidedTourBox = { top: number; right: number; bottom: number; left: number; width?: number; height?: number };
export type GuidedTourPlacement = { top: number; left: number; side: "above" | "below" | "left" | "right" };

export function placeGuidedTourCard(options: {
  anchor: GuidedTourBox;
  card: { width: number; height: number };
  viewport: { width: number; height: number };
  dockHeight?: number;
  preferHorizontal?: boolean;
  preferAbove?: boolean;
  margin?: number;
  gap?: number;
}): GuidedTourPlacement {
  const { anchor, card, viewport } = options;
  const margin = options.margin ?? 12;
  const gap = options.gap ?? 10;
  const safeBottom = Math.max(margin, viewport.height - (options.dockHeight ?? 58) - margin);
  const maxLeft = Math.max(margin, viewport.width - card.width - margin);
  const maxTop = Math.max(margin, safeBottom - card.height);
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  if (options.preferHorizontal) {
    const rightLeft = anchor.right + gap;
    if (rightLeft + card.width <= viewport.width - margin) {
      return { top: clamp(anchor.top, margin, maxTop), left: rightLeft, side: "right" };
    }
    const leftLeft = anchor.left - gap - card.width;
    if (leftLeft >= margin) {
      return { top: clamp(anchor.top, margin, maxTop), left: leftLeft, side: "left" };
    }
  }

  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - gap - card.height;
  if (options.preferAbove && aboveTop >= margin) {
    return {
      top: Math.min(aboveTop, maxTop),
      left: clamp(anchor.left + (anchor.right - anchor.left - card.width) / 2, margin, maxLeft),
      side: "above",
    };
  }

  if (belowTop + card.height <= safeBottom) {
    return {
      top: belowTop,
      left: clamp(anchor.left + (anchor.right - anchor.left - card.width) / 2, margin, maxLeft),
      side: "below",
    };
  }

  if (aboveTop >= margin) {
    return {
      top: Math.min(aboveTop, maxTop),
      left: clamp(anchor.left + (anchor.right - anchor.left - card.width) / 2, margin, maxLeft),
      side: "above",
    };
  }

  const aboveSpace = anchor.top - margin - gap;
  const belowSpace = safeBottom - anchor.bottom - gap;
  const side = aboveSpace >= belowSpace ? "above" : "below";
  const desiredTop = side === "above" ? anchor.top - gap - card.height : belowTop;
  return {
    top: clamp(desiredTop, margin, maxTop),
    left: clamp(anchor.left + (anchor.right - anchor.left - card.width) / 2, margin, maxLeft),
    side,
  };
}

export function guidedTourScrollDelta(options: {
  anchor: Pick<GuidedTourBox, "top" | "bottom">;
  viewportHeight: number;
  dockHeight?: number;
  margin?: number;
  targetTop?: number;
}): number {
  const margin = options.margin ?? 12;
  const safeBottom = options.viewportHeight - (options.dockHeight ?? 58) - margin;
  const anchorIsVisible = options.anchor.top >= margin && options.anchor.bottom <= safeBottom;
  const anchorIsNearRequestedPosition = options.targetTop === undefined
    || Math.abs(options.anchor.top - options.targetTop) < 16;
  if (anchorIsVisible && anchorIsNearRequestedPosition) return 0;
  const visibleHeight = Math.max(0, safeBottom - margin);
  const defaultTop = margin + Math.max(0, (visibleHeight - (options.anchor.bottom - options.anchor.top)) / 2);
  const maxTargetTop = Math.max(margin, safeBottom - (options.anchor.bottom - options.anchor.top));
  const targetTop = Math.min(maxTargetTop, Math.max(margin, options.targetTop ?? defaultTop));
  return options.anchor.top - targetTop;
}
