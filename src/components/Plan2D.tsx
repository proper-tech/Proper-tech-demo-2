import type { Layout } from '@/data/types';
import { hasParts, m, roomArea, roomEdges } from '@/lib/geometry';

/** Maps apartment coordinates to SVG coordinates: svg = origin + sign * value. */
export interface PlanTx {
  ox: number;
  sx: 1 | -1;
  oz: number;
  sz: 1 | -1;
}

interface PlanGroupProps {
  layout: Layout;
  tx: PlanTx;
  /** Room names by id. Leave out to draw the plan without room labels. */
  names?: Record<string, string>;
  showSizes?: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  muted?: boolean;
}

/** One apartment drawn as SVG. Units are metres, so the parent sets the scale with viewBox. */
export function PlanGroup({ layout, tx, names, showSizes, selected, onSelect, muted }: PlanGroupProps) {
  const X = (x: number) => tx.ox + tx.sx * x;
  const Z = (z: number) => tx.oz + tx.sz * z;

  return (
    <g className={muted ? 'plan plan-muted' : 'plan'}>
      {layout.rooms.map((r) => (
        <rect
          key={r.id}
          className={`plan-room${r.type === 'balcony' ? ' plan-balcony' : r.wet ? ' plan-wet' : ''}${selected === (r.partOf ?? r.id) ? ' is-selected' : ''}${onSelect ? ' is-clickable' : ''}`}
          x={Math.min(X(r.x), X(r.x + r.w))}
          y={Math.min(Z(r.z), Z(r.z + r.d))}
          width={r.w}
          height={r.d}
          onClick={onSelect ? () => onSelect(r.partOf ?? r.id) : undefined}
        />
      ))}
      {layout.rooms.flatMap((r) =>
        roomEdges(r, layout.openings).flatMap((edge, ei) =>
          edge.segments.map((seg, si) => {
            if (seg.kind !== 'solid' && seg.kind !== 'window') return null;
            const [x1, z1] = edge.at(seg.from);
            const [x2, z2] = edge.at(seg.to);
            return (
              <line
                key={`${r.id}-${ei}-${si}`}
                className={seg.kind === 'window' ? 'plan-window' : 'plan-wall'}
                x1={X(x1)}
                y1={Z(z1)}
                x2={X(x2)}
                y2={Z(z2)}
              />
            );
          }),
        ),
      )}
      {names &&
        layout.rooms
          .filter((r) => !r.partOf)
          .map((r) => {
          const cx = X(r.x + r.w / 2);
          const cy = Z(r.z + r.d / 2);
          const roomy = showSizes && r.d >= 2 && r.w >= 2;
          const plain = !hasParts(layout, r);
          return (
            <g key={r.id} className="plan-label">
              <text
                x={cx}
                y={roomy ? cy - 0.2 : cy + 0.08}
                className="plan-name"
                style={{ fontSize: `${Math.min(0.26, (r.w - 0.3) / (names[r.id].length * 0.58)).toFixed(3)}px` }}
              >
                {names[r.id]}
              </text>
              {roomy && (
                <>
                  {plain && (
                    <text x={cx} y={cy + 0.18} className="plan-size">
                      {m(r.w)} × {m(r.d)} m
                    </text>
                  )}
                  <text x={cx} y={plain ? cy + 0.52 : cy + 0.18} className="plan-size">
                    {m(roomArea(r, layout))} m²
                  </text>
                </>
              )}
            </g>
          );
        })}
    </g>
  );
}

/** A single apartment plan, north at the top as on the architect's drawings. */
export function ApartmentPlan(props: Omit<PlanGroupProps, 'tx'>) {
  const { w, d } = props.layout;
  return (
    <svg className="plan-svg" viewBox={`-0.4 -0.4 ${w + 1.5} ${d + 0.8}`} role="img">
      <PlanGroup {...props} tx={{ ox: 0, sx: 1, oz: 0, sz: 1 }} />
      <g className="plan-north" transform={`translate(${w + 0.6} 0.15)`}>
        <path d="M0 -0.05 L0.22 0.5 L0 0.38 L-0.22 0.5 Z" />
        <text x={0} y={0.85}>
          N
        </text>
      </g>
    </svg>
  );
}
