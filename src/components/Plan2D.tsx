import { planPhotos, type PlanPhoto } from '@/data/planPhotos';
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
}

/** One apartment drawn as SVG. Units are metres, so the parent sets the scale with viewBox. */
export function PlanGroup({ layout, tx, names, showSizes, selected, onSelect }: PlanGroupProps) {
  const X = (x: number) => tx.ox + tx.sx * x;
  const Z = (z: number) => tx.oz + tx.sz * z;

  return (
    <g className="plan">
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
  const photo = planPhotos[props.layout.plan];
  if (photo) return <PhotoPlan {...props} photo={photo} />;
  const { w, d } = props.layout;
  return (
    <svg className="plan-svg" viewBox={`-0.4 -0.4 ${w + 1.5} ${d + 0.8}`} role="img">
      <PlanGroup {...props} tx={{ ox: 0, sx: 1, oz: 0, sz: 1 }} />
      <NorthArrow x={w + 0.6} />
    </svg>
  );
}

function NorthArrow({ x }: { x: number }) {
  return (
    <g className="plan-north" transform={`translate(${x} 0.15)`}>
      <path d="M0 -0.05 L0.22 0.5 L0 0.38 L-0.22 0.5 Z" />
      <text x={0} y={0.85}>
        N
      </text>
    </g>
  );
}

/**
 * The plan as the furnished top view from the rendered 360° tour, with clickable rooms and their names and sizes
 * (sizes from the layout, as in the room table).
 */
function PhotoPlan({ layout, names, showSizes, selected, onSelect, photo }: Omit<PlanGroupProps, 'tx'> & { photo: PlanPhoto }) {
  const rooms = layout.rooms.filter((r) => !r.partOf && photo.rooms[r.id]);
  return (
    <svg className="plan-svg plan-photo" viewBox={`-0.1 -0.1 ${photo.w + 1.2} ${photo.h + 0.2}`} role="img">
      <image href={photo.src} x={0} y={0} width={photo.w} height={photo.h} preserveAspectRatio="none" />
      {rooms.map((r) => {
        const [x, z, w, d] = photo.rooms[r.id];
        return (
          <rect
            key={r.id}
            className={`plan-photo-room${selected === r.id ? ' is-selected' : ''}${onSelect ? ' is-clickable' : ''}`}
            x={x}
            y={z}
            width={w}
            height={d}
            rx={0.06}
            onClick={onSelect ? () => onSelect(r.id) : undefined}
          />
        );
      })}
      {names &&
        rooms.map((r) => {
          const [x, z, w, d] = photo.rooms[r.id];
          const name = names[r.id];
          const roomy = showSizes && w >= 2 && d >= 2;
          const size = roomy ? (hasParts(layout, r) ? `${m(roomArea(r, layout))} m²` : `${m(r.w)} × ${m(r.d)} m · ${m(roomArea(r, layout))} m²`) : '';
          const fs = Math.min(0.26, (w - 0.2) / (name.length * 0.56));
          const bw = Math.max(name.length * fs * 0.56, size.length * 0.2 * 0.5) + 0.36;
          const bh = roomy ? 0.78 : fs + 0.26;
          const cx = x + w / 2;
          const cy = z + d / 2;
          return (
            <g key={r.id} className="plan-label plan-photo-label">
              <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={bh / 2 > 0.3 ? 0.18 : bh / 2} />
              <text x={cx} y={roomy ? cy - 0.06 : cy + fs * 0.36} className="plan-name" style={{ fontSize: `${fs.toFixed(3)}px` }}>
                {name}
              </text>
              {roomy && (
                <text x={cx} y={cy + 0.26} className="plan-size" style={{ fontSize: '0.2px' }}>
                  {size}
                </text>
              )}
            </g>
          );
        })}
      <NorthArrow x={photo.w + 0.6} />
    </svg>
  );
}
