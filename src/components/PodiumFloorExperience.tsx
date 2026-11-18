'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FLOOR_MAX, FLOOR_MIN } from '@/data/building';
import { getPodiumFloor, listedSpaces, podiumFloors, type Decor, type PodiumSpace } from '@/data/podium';
import { getRoofFloor } from '@/data/roof';
import type { TowerId } from '@/data/types';
import { fmt, type Dict } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { bounds, m, polygonCentre, type Pt } from '@/lib/geometry';

const PodiumScene = dynamic(() => import('./three/PodiumScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

// A podium floor (block A): the same page as a tower floor (3D or 2D plan, list beside it),
// with shops, halls and cores instead of apartments. Nothing here is for sale; the towers on
// the roof (floor 4) link to their first apartment floor. Given a tower, the same page shows
// that tower's roof, the technical floor (roof.ts).

const path = (pts: Pt[]) => pts.map(([u, v], i) => `${i ? 'L' : 'M'}${u} ${-v}`).join(' ') + ' Z';
const spaceName = (t: Dict, s: PodiumSpace) => (s.tower ? fmt(t.home.towerN, { t: s.tower }) : t.podium.space[s.type]);

/** Number, name and area at the middle of a space; just the number when the space is small. */
function PlanLabel({ space, name }: { space: PodiumSpace; name: string }) {
  const [u, v] = polygonCentre(space.outline);
  const b = bounds(space.outline);
  const w = b.u1 - b.u0;
  const big = w > 6 && b.v1 - b.v0 > 4;
  const size = big ? Math.min(1.5, w / 9) : Math.min(0.9, w / 3.2);
  const lines = big ? [space.no, name, space.area !== undefined ? `${m(space.area)} m²` : undefined].filter(Boolean) : [space.no ?? name];
  return (
    <text className="podium-label" x={u} y={-v - ((lines.length - 1) * size * 1.2) / 2} style={{ fontSize: `${size.toFixed(2)}px` }}>
      {lines.map((line, i) => (
        <tspan key={i} x={u} dy={i ? size * 1.2 : 0} className={i === 0 && space.no ? 'podium-no' : undefined}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function PlanDecor({ d }: { d: Decor }) {
  if (d.kind === 'pad') {
    return <ellipse className={`podium-pad is-${d.tone}`} cx={d.c[0]} cy={-d.c[1]} rx={d.rx} ry={d.ry} />;
  }
  if (d.kind === 'pavilion') {
    const hex: Pt[] = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      return [d.c[0] + Math.cos(a) * d.r, d.c[1] + Math.sin(a) * d.r];
    });
    return <path className="podium-pavilion" d={path(hex)} />;
  }
  return <polyline className="podium-climber" points={d.path.map(([u, v]) => `${u},${-v}`).join(' ')} style={{ strokeWidth: d.w }} />;
}

export function PodiumFloorExperience({ floor, tower }: { floor: number; tower?: TowerId }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [hovered, setHovered] = useState<string | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const pf = tower ? getRoofFloor(tower) : getPodiumFloor(floor)!;
  const listed = listedSpaces(pf);
  const towerHref = (s: PodiumSpace) => `/${locale}/floors/${s.tower}/${FLOOR_MIN}`;
  const open = (s: PodiumSpace) => s.tower && router.push(towerHref(s));
  const detail = (s: PodiumSpace) =>
    s.tower ? t.podium.towerApartments : s.area !== undefined ? `${m(s.area)} m²` : s.type === 'playground' ? t.podium.playgroundFacts : '';
  // every space always shows its number; big spaces, the towers and the space pointed at also
  // show name and area (small rooms would cover each other otherwise)
  const full = (s: PodiumSpace) => s.tower || (s.area ?? 0) >= 100 || s.type === 'playground' || hovered === s.id;

  // fit the plan to everything drawn, including the covered walkway outside the 1st-floor walls
  const b = bounds([...pf.outline, ...pf.spaces.flatMap((s) => s.outline)]);
  const last = podiumFloors[podiumFloors.length - 1].floor;

  return (
    <div className="floor">
      <section className="floor-stage">
        <div className={view === '2d' ? 'stage-canvas is-hidden' : 'stage-canvas'}>
          <PodiumScene floor={pf} layer={layer} hovered={hovered} onHover={setHovered} onOpen={open} />
          <div className="label-layer" ref={layer}>
            {listed.map((s) => (
              <div
                key={s.id}
                className={`unit-tag podium-tag${s.tower ? ' status-available' : ''}${hovered === s.id ? ' is-hovered' : ''}${full(s) ? '' : ' is-compact'}`}
                data-anchor={`space:${s.id}`}
              >
                <b>{s.no ?? spaceName(t, s)}</b>
                {full(s) && <span>{s.no ? [spaceName(t, s), s.area !== undefined ? `${m(s.area)} m²` : ''].filter(Boolean).join(', ') : detail(s)}</span>}
              </div>
            ))}
          </div>
        </div>
        {view === '2d' && (
          <div className="floor-plan">
            <svg className="plan-svg" viewBox={`${b.u0 - 2} ${-b.v1 - 2} ${b.u1 - b.u0 + 4} ${b.v1 - b.v0 + 4}`} role="img">
              <path className="podium-slab" d={path(pf.outline)} />
              {pf.spaces.map((s) => (
                <path
                  key={s.id}
                  className={`podium-space podium-${s.type}${hovered === s.id ? ' is-hovered' : ''}${s.tower ? ' is-clickable' : ''}`}
                  d={path(s.outline)}
                  onMouseEnter={() => setHovered(s.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={s.tower ? () => open(s) : undefined}
                />
              ))}
              {pf.decor?.map((d, i) => <PlanDecor key={i} d={d} />)}
              {listed.map((s) => (
                <PlanLabel key={s.id} space={s} name={spaceName(t, s)} />
              ))}
            </svg>
          </div>
        )}

        <div className="apt-head">
          <Link className="back" href={`/${locale}#floors`}>
            {t.floor.back}
          </Link>
          <h1>{tower ? fmt(t.roof.title, { t: tower }) : fmt(t.podium.title, { n: floor })}</h1>
          <p>{tower ? t.roof.lead : t.podium.lead[pf.floor as 1 | 2 | 3 | 4]}</p>
          <div className="segmented" role="group">
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
              {t.floor.view3d}
            </button>
            <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>
              {t.floor.view2d}
            </button>
          </div>
        </div>
        {view === '3d' && <p className="stage-hint">{t.podium.hint}</p>}
      </section>

      <aside className="apt-panel">
        <ul className="unit-list">
          {listed.map((s) => {
            const body = (
              <>
                <span className="unit-id">{s.no ?? s.tower}</span>
                <span className="unit-info">
                  <b>{spaceName(t, s)}</b>
                  {detail(s)}
                </span>
                {s.tower && <span className="unit-open">{fmt(t.home.openFloor, { n: FLOOR_MIN })}</span>}
              </>
            );
            return (
              <li key={s.id} className={hovered === s.id ? 'is-hovered' : undefined} onMouseEnter={() => setHovered(s.id)} onMouseLeave={() => setHovered(null)}>
                {s.tower ? <Link href={towerHref(s)}>{body}</Link> : <div className="is-static">{body}</div>}
              </li>
            );
          })}
        </ul>
        {pf.total !== undefined && (
          <p className="podium-total">
            {t.podium.total}: <b>{m(pf.total)} m²</b>
          </p>
        )}
        <p className="podium-note">{t.podium.source}</p>
        <nav className="apt-nav">
          {tower ? (
            <Link href={`/${locale}/floors/${tower}/${FLOOR_MAX}`}>
              <span>{t.floor.prev}</span>
              {FLOOR_MAX}
            </Link>
          ) : floor > 1 ? (
            <Link href={`/${locale}/floors/A/${floor - 1}`}>
              <span>{t.floor.prev}</span>
              {floor - 1}
            </Link>
          ) : (
            <span />
          )}
          {!tower && floor < last ? (
            <Link href={`/${locale}/floors/A/${floor + 1}`}>
              <span>{t.floor.next}</span>
              {floor + 1}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </aside>
    </div>
  );
}
