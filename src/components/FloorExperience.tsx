'use client';

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FLOOR_MAX, FLOOR_MIN, PLATE, coreOf, getFloor, type Rect } from '@/data/building';
import { flatColors, layouts } from '@/data/layouts';
import { ROOF_FLOOR } from '@/data/roof';
import type { Layout, LayoutId, TowerId } from '@/data/types';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { m } from '@/lib/geometry';
import { PlanGroup } from './Plan2D';

const FloorScene = dynamic(() => import('./three/FloorScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

/** Where an apartment's name goes: the middle of its living room, in plate metres. */
function labelAt(layout: Layout): [number, number] {
  const r = layout.rooms.find((room) => room.type === 'living')!;
  return [layout.at[0] + r.x + r.w / 2, layout.at[1] + r.z + r.d / 2];
}

/** The apartment's colour as a CSS variable, for its tag, list entry and 2D plan. */
const flat = (id: LayoutId) => ({ '--flat': flatColors[id] }) as CSSProperties;

const PlanRect =({ r, className }: { r: Rect; className: string }) => <rect className={className} x={r.x} y={r.z} width={r.w} height={r.d} />;

export function FloorExperience({ tower, floor }: { tower: TowerId; floor: number }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [hovered, setHovered] = useState<string | null>(null);
  const summary = getFloor(tower, floor)!;
  const core = coreOf(tower);
  const layer = useRef<HTMLDivElement>(null);
  const open = (id: string) => router.push(`/${locale}/apartments/${id}`);

  const tags = useMemo(() => {
    const out: Record<string, { title: string; detail: string }> = {};
    for (const u of summary.units) {
      const layout = layouts[u.layout];
      out[u.id] = {
        title: u.id,
        detail: u.status === 'available' ? `${t.beds[layout.bedrooms as 1 | 2 | 3]}, ${m(layout.area)} m²` : t.status[u.status],
      };
    }
    return out;
  }, [summary, t]);

  return (
    <div className="floor">
      <section className="floor-stage">
        <div className={view === '2d' ? 'stage-canvas is-hidden' : 'stage-canvas'}>
          <FloorScene tower={tower} units={summary.units} layer={layer} hovered={hovered} onHover={setHovered} onOpen={open} />
          <div className="label-layer" ref={layer}>
            {summary.units.map((u) => (
              <div key={u.id} className={`unit-tag status-${u.status}${hovered === u.id ? ' is-hovered' : ''}`} style={flat(u.layout)} data-anchor={`unit:${u.id}`}>
                <b>{tags[u.id].title}</b>
                <span>{tags[u.id].detail}</span>
              </div>
            ))}
          </div>
        </div>
        {view === '2d' && (
          <div className="floor-plan">
            {/* SVG units are plate metres, north at the top */}
            <svg
              className="plan-svg"
              viewBox={`${PLATE.x0 - 0.6} ${PLATE.z0 - 0.6} ${PLATE.x1 - PLATE.x0 + 1.2} ${PLATE.z1 - PLATE.z0 + 1.2}`}
              role="img"
            >
              {core.corridor.map((r, i) => (
                <PlanRect key={i} r={r} className="plan-corridor" />
              ))}
              <PlanRect r={core.stairs} className="plan-core" />
              <PlanRect r={core.lifts} className="plan-core" />
              {(
                [
                  [core.corridor[2], t.floor.corridor],
                  [core.stairs, t.podium.space.stairs],
                  [core.lifts, t.podium.space.lifts],
                ] as const
              ).map(([r, name]) => (
                <text key={name} className="plan-name" x={r.x + r.w / 2} y={r.z + r.d / 2}>
                  {name}
                </text>
              ))}
              {summary.units.map((u) => {
                const layout = layouts[u.layout];
                const available = u.status === 'available';
                const [cx, cy] = labelAt(layout);
                return (
                  <g
                    key={u.id}
                    className={`plan-unit${available ? ' is-available' : ''}${hovered === u.id ? ' is-hovered' : ''}`}
                    style={flat(u.layout)}
                    onMouseEnter={() => setHovered(u.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={available ? () => open(u.id) : undefined}
                  >
                    <PlanGroup layout={layout} tx={{ ox: layout.at[0], sx: 1, oz: layout.at[1], sz: 1 }} muted={!available} />
                    <text className="plan-unit-id" x={cx} y={cy}>
                      {u.id}
                    </text>
                    <text className="plan-size" x={cx} y={cy + 0.6}>
                      {tags[u.id].detail}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        <div className="apt-head">
          <Link className="back" href={`/${locale}#floors`}>
            {t.floor.back}
          </Link>
          <h1>{fmt(t.floor.title, { t: tower, n: floor })}</h1>
          <p>{summary.available > 0 ? t.floor.lead : t.floor.leadNone}</p>
          <div className="segmented" role="group">
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
              {t.floor.view3d}
            </button>
            <button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>
              {t.floor.view2d}
            </button>
          </div>
        </div>
        {view === '3d' && <p className="stage-hint">{t.floor.hint}</p>}
      </section>

      <aside className="apt-panel">
        <ul className="unit-list">
          {summary.units.map((u) => {
            const layout = layouts[u.layout];
            const available = u.status === 'available';
            const body = (
              <>
                <span className="unit-id is-flat" style={flat(u.layout)}>
                  {u.id}
                </span>
                <span className="unit-info">
                  <b>{t.beds[layout.bedrooms as 1 | 2 | 3]}</b>
                  {m(layout.area)} m², {t.facing[layout.facing].toLowerCase()}
                </span>
                <span className={`status status-${u.status}`}>{t.status[u.status]}</span>
                {available && <span className="unit-open">{t.floor.open}</span>}
              </>
            );
            return (
              <li
                key={u.id}
                className={hovered === u.id ? 'is-hovered' : undefined}
                onMouseEnter={() => setHovered(u.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {available ? (
                  <Link href={`/${locale}/apartments/${u.id}`} aria-label={fmt(t.floor.apartmentN, { id: u.id })}>
                    {body}
                  </Link>
                ) : (
                  <div className="is-off">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <nav className="apt-nav">
          {floor > FLOOR_MIN ? (
            <Link href={`/${locale}/floors/${tower}/${floor - 1}`}>
              <span>{t.floor.prev}</span>
              {floor - 1}
            </Link>
          ) : (
            <span />
          )}
          {floor < FLOOR_MAX ? (
            <Link href={`/${locale}/floors/${tower}/${floor + 1}`}>
              <span>{t.floor.next}</span>
              {floor + 1}
            </Link>
          ) : (
            <Link href={`/${locale}/floors/${tower}/${ROOF_FLOOR}`}>
              <span>{t.floor.next}</span>
              {t.roof.name}
            </Link>
          )}
        </nav>
      </aside>
    </div>
  );
}
