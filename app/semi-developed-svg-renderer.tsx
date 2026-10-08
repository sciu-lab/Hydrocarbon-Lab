import type { SemiDevelopedAtomGlyph } from "./semi-developed-renderer.ts";

const SEMI_DEVELOPED_BADGE_MIN_RADIUS = 28;
const SEMI_DEVELOPED_HIT_PADDING = 4;

export function getSemiDevelopedAtomBadgeRadius(
  label: string,
  hydrogenSubscript?: number,
  charge = "",
) {
  const badgeWidth = Math.max(
    SEMI_DEVELOPED_BADGE_MIN_RADIUS,
    label.length * 10 + (hydrogenSubscript ? 6 : 0) + (charge ? 7 : 0),
  );
  return Math.max(SEMI_DEVELOPED_BADGE_MIN_RADIUS, badgeWidth / 2 + 5);
}

/** Semi-developed atom glyph and hit target; interaction handlers stay on the owning canvas node. */
export function SemiDevelopedAtomSvg({
  glyph,
  label,
  hydrogenSubscript,
  charge,
  selected,
  functionalGroupScale,
}: {
  glyph: SemiDevelopedAtomGlyph;
  label: string;
  hydrogenSubscript?: number;
  charge: string;
  selected: boolean;
  functionalGroupScale: number;
}) {
  const carbon = glyph.element === "C";
  const badgeRadius = getSemiDevelopedAtomBadgeRadius(label, hydrogenSubscript, charge);
  return (
    <g className="semi-developed-glyph" aria-hidden="true" pointerEvents="none">
      {selected && <circle className="selection-ring" r="39" />}
      <circle className={`atom-circle semi-developed-label-background${carbon ? "" : " semi-developed-hetero-badge"}`} r={badgeRadius} />
      <g transform={carbon ? undefined : `scale(${functionalGroupScale})`}>
      <text className="atom-label semi-developed-label" textAnchor="middle" dominantBaseline="central">
        <tspan>{label}</tspan>
        {hydrogenSubscript && (
          <tspan className="hydrogen-subscript" baselineShift="sub">{hydrogenSubscript}</tspan>
        )}
        {charge && <tspan className="atom-charge" baselineShift="super">{charge}</tspan>}
      </text>
      </g>
      <circle
        className="semi-developed-hit-target"
        data-editor-only="true"
        aria-hidden="true"
        r={badgeRadius + SEMI_DEVELOPED_HIT_PADDING}
        fill="transparent"
        pointerEvents="all"
      />
    </g>
  );
}
