import type { SemiDevelopedAtomGlyph } from "./semi-developed-renderer.ts";

/** SVG atom presentation for the semi-developed view; editor hit targets stay in the owning canvas. */
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
  const badgeWidth = Math.max(28, label.length * 10 + (hydrogenSubscript ? 6 : 0) + (charge ? 7 : 0));
  return (
    <g className="semi-developed-glyph" aria-hidden="true" pointerEvents="none">
      {selected && <circle className="selection-ring" r="39" />}
      <circle className={`atom-circle semi-developed-label-background${carbon ? "" : " semi-developed-hetero-badge"}`} r={Math.max(28, badgeWidth / 2 + 5)} />
      <g transform={carbon ? undefined : `scale(${functionalGroupScale})`}>
      <text className="atom-label semi-developed-label" textAnchor="middle" dominantBaseline="central">
        <tspan>{label}</tspan>
        {hydrogenSubscript && (
          <tspan className="hydrogen-subscript" baselineShift="sub">{hydrogenSubscript}</tspan>
        )}
        {charge && <tspan className="atom-charge" baselineShift="super">{charge}</tspan>}
      </text>
      </g>
    </g>
  );
}
