import { getSemiDevelopedLabelExtent } from "./semi-developed-label-geometry.ts";

/** Semi-developed atom glyph and hit target; interaction handlers stay on the owning canvas node. */
export function SemiDevelopedAtomSvg({
  label,
  hydrogenSubscript,
  charge,
  selected,
  labelScale,
}: {
  label: string;
  hydrogenSubscript?: number;
  charge: string;
  selected: boolean;
  labelScale: number;
}) {
  const labelExtent = getSemiDevelopedLabelExtent(
    label,
    hydrogenSubscript,
    charge,
    labelScale,
  );
  return (
    <g className="semi-developed-glyph" aria-hidden="true" pointerEvents="none">
      {selected && <circle className="selection-ring semi-developed-selection-ring" data-editor-only="true" r={labelExtent.hitRadius + 7} />}
      <circle className="semi-developed-hover-ring" data-editor-only="true" aria-hidden="true" r={labelExtent.hitRadius + 3} />
      <g transform={labelScale === 1 ? undefined : `scale(${labelScale})`}>
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
        r={labelExtent.hitRadius}
        fill="transparent"
        pointerEvents="all"
      />
    </g>
  );
}
