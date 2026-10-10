import type { KeyboardEvent, MouseEvent } from "react";
import type { CondensedRenderModel, CondensedToken } from "./condensed-layout";

type CondensedRendererProps = {
  model: CondensedRenderModel;
  selectedAtomId: number | null;
  showNumbering: boolean;
  language: "es" | "en";
  advancedScreenReaderEnabled: boolean;
  onSelectAtom: (atomId: number) => void;
  onActivateBond: (left: number, right: number, toggleStereo?: boolean) => void;
  onToggleTetrahedral: (atomId: number) => void;
};

const fontSize = 34;

function AtomText({ token }: { token: Extract<CondensedToken, { type: "atom" }> }) {
  const baseText = token.text.replace(/[0-9]+$/, "");
  const subscript = token.text.slice(baseText.length);
  return (
    <text className="condensed-atom-text" textAnchor="middle" dominantBaseline="central" fontSize={fontSize}>
      {baseText}
      {subscript && <tspan className="condensed-subscript" baselineShift="sub" fontSize={fontSize * 0.7}>{subscript}</tspan>}
      {token.charge !== 0 && <tspan className="condensed-charge" baselineShift="super" fontSize={fontSize * 0.62}>{token.charge > 0 ? "+" : "−"}</tspan>}
    </text>
  );
}

function activateBond(
  event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>,
  token: Extract<CondensedToken, { type: "bond" }>,
  onActivateBond: CondensedRendererProps["onActivateBond"],
) {
  if ("key" in event && event.key !== "Enter" && event.key !== " ") return;
  if ("key" in event) event.preventDefault();
  else event.stopPropagation();
  onActivateBond(token.atomIds[0], token.atomIds[1], Boolean(event.altKey));
}

export function CondensedMoleculeSvg({
  model,
  selectedAtomId,
  showNumbering,
  language,
  advancedScreenReaderEnabled,
  onSelectAtom,
  onActivateBond,
  onToggleTetrahedral,
}: CondensedRendererProps) {
  return (
    <g className="condensed-renderer" aria-label={language === "en" ? "Condensed structural formula" : "Fórmula estructural condensada"}>
      {model.tokens.map((token, index) => {
        if (token.type === "atom") {
          const isSelected = token.atomId === selectedAtomId;
          const roleProps = advancedScreenReaderEnabled ? { role: "button" as const, tabIndex: 0 } : {};
          return (
            <g
              key={`atom-${token.atomId}`}
              className={`condensed-token condensed-atom ${token.branchDepth ? "condensed-branch-token" : "condensed-main-token"}${isSelected ? " selected" : ""}`}
              transform={`translate(${token.x + token.width / 2} ${token.y})`}
              data-atom-id={token.atomId}
              {...roleProps}
              aria-label={advancedScreenReaderEnabled
                ? language === "en" ? `Select ${token.text} atom ${token.locant ?? token.atomId}` : `Seleccionar átomo ${token.text} ${token.locant ?? token.atomId}`
                : undefined}
              onClick={(event) => { event.stopPropagation(); onSelectAtom(token.atomId); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectAtom(token.atomId);
                }
              }}
            >
              <rect className="condensed-atom-hit-target" x={-token.width / 2 - 5} y={-26} width={token.width + 10} height={52} rx={9} data-editor-only="true" />
              {isSelected && <rect className="condensed-selection-halo" x={-token.width / 2 - 2} y={-22} width={token.width + 4} height={44} rx={8} data-editor-only="true" />}
              {showNumbering && token.locant !== undefined && (
                <text className="condensed-locant" textAnchor="middle" y={-34} fontSize={15}>{token.locant}</text>
              )}
              <AtomText token={token} />
              {token.tetrahedralParity && (
                <g
                  className="condensed-stereo-badge condensed-rs-badge"
                  transform={`translate(0 -51)`}
                  role="button"
                  tabIndex={0}
                  aria-label={language === "en"
                    ? `Change tetrahedral configuration from ${token.tetrahedralParity}`
                    : `Cambiar configuración tetraédrica ${token.tetrahedralParity}`}
                  onClick={(event) => { event.stopPropagation(); onToggleTetrahedral(token.atomId); }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      onToggleTetrahedral(token.atomId);
                    }
                  }}
                >
                  <rect x="-15" y="-10" width="30" height="20" rx="10" />
                  <text textAnchor="middle" dominantBaseline="central">{token.tetrahedralParity}</text>
                </g>
              )}
            </g>
          );
        }
        if (token.type === "bond") {
          const roleProps = advancedScreenReaderEnabled ? { role: "button" as const, tabIndex: 0 } : {};
          return (
            <g
              key={`bond-${token.bondId}`}
              className={`condensed-token condensed-bond ${token.branchDepth ? "condensed-branch-token" : "condensed-main-token"} condensed-bond-order-${token.order}`}
              transform={`translate(${token.x + token.width / 2} ${token.y})`}
              data-bond-a={token.atomIds[0]}
              data-bond-b={token.atomIds[1]}
              {...roleProps}
              aria-label={language === "en"
                ? `${token.order === 1 ? "Single" : token.order === 2 ? "Double" : "Triple"} bond between atoms ${token.atomIds[0]} and ${token.atomIds[1]}`
                : `Enlace ${token.order === 1 ? "simple" : token.order === 2 ? "doble" : "triple"} entre átomos ${token.atomIds[0]} y ${token.atomIds[1]}`}
              onClick={(event) => activateBond(event, token, onActivateBond)}
              onKeyDown={(event) => activateBond(event, token, onActivateBond)}
            >
              <rect className="condensed-bond-hit-target" x={-token.width / 2} y={-27} width={token.width} height={54} rx={7} data-editor-only="true" />
              {token.text && <text textAnchor="middle" dominantBaseline="central" fontSize={fontSize}>{token.text}</text>}
            </g>
          );
        }
        if (token.type === "ez-badge") {
          return (
            <g key={`ez-${token.bondId}`} className="condensed-stereo-badge condensed-ez-badge" transform={`translate(${token.x + token.width / 2} ${token.y})`}>
              <rect x="-15" y="-10" width="30" height="20" rx="10" />
              <text textAnchor="middle" dominantBaseline="central">{token.configuration}</text>
            </g>
          );
        }
        const role = token.type === "branch-open" ? "condensed-branch-open" : token.type === "branch-close" ? "condensed-branch-close" : "condensed-hydrogen-suffix";
        return (
          <text key={`${role}-${index}`} className={`condensed-token ${role}`} x={token.x + token.width / 2} y={token.y} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} onClick={(event) => event.stopPropagation()}>
            {token.type === "hydrogen-suffix" ? "H" : token.text}
          </text>
        );
      })}
    </g>
  );
}
