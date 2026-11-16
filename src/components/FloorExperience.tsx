'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FLOOR_MAX, FLOOR_MIN, PLATE, getFloor } from '@/data/building';
import { layouts } from '@/data/layouts';
import type { TowerId, Unit } from '@/data/types';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { layoutArea, m } from '@/lib/geometry';
import { PlanGroup, type PlanTx } from './Plan2D';

const FloorScene = dynamic(() => import('./three/FloorScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

/** Same placement as the 3D floor, seen from above with the north side at the top. */
function planTx(unit: Unit): PlanTx {
  const w = layouts[unit.layout].w;
  const half = PLATE.w / 2;
  return unit.side === 'N'
    ? { ox: half - unit.x0, sx: -1, oz: 8, sz: -1 }
    : { ox: half - unit.x0 - w, sx: 1, oz: 8 + PLATE.corridor, sz: 1 };
}

export function FloorExperience({ tower, floor }: { tower: TowerId; floor: number }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [hovered, setHovered] = useState<string | null>(null);
  const summary = getFloor(tower, floor)!;
  const layer = useRef<HTMLDivElement>(null);
  const open = (id: string) => router.push(`/${locale}/apartments/${id}`);

  const tags = useMemo(() => {
    const out: Record<string, { title: string; detail: string }> = {};
    for (const u of summary.units) {
      const layout = layouts[u.layout];
      out[u.id] = {
        title: u.id,
        detail: u.status === 'available' ? `${t.beds[layout.bedrooms as 1 | 2 | 3]}, ${m(layoutArea(layout))} m²` : t.status[u.status],
      };
    }
    return out;
  }, [summary, t]);

  return (
    <div className="floor">
      <section className="floor-stage">
        <div className={view === '2d' ? 'stage-canvas is-hidden' : 'stage-canvas'}>
          <FloorScene units={summary.units} layer={layer} hovered={hovered} onHover={setHovered} onOpen={open} />
          <div className="label-layer" ref={layer}>
            {summary.units.map((u) => (
              <div key={u.id} className={`unit-tag status-${u.status}${hovered === u.id ? ' is-hovered' : ''}`} data-anchor={`unit:${u.id}`}>
                <b>{tags[u.id].title}</b>
                <span>{tags[u.id].detail}</span>
              </div>
            ))}
          </div>
        </div>
        {view === '2d' && (
          <div className="floor-plan">
            <svg className="plan-svg" viewBox={`-0.5 -0.5 ${PLATE.w + 1} ${PLATE.d + 1}`} role="img">
              <rect className="plan-corridor" x={0} y={8} width={PLATE.w} height={PLATE.corridor} />
              <text className="plan-name" x={PLATE.w / 2} y={9.1}>
                {t.floor.corridor}
              </text>
              {summary.units.map((u) => {
                const layout = layouts[u.layout];
                const tx = planTx(u);
                const available = u.status === 'available';
                const cx = tx.ox + tx.sx * (layout.w / 2);
                const cy = tx.oz + tx.sz * (layout.d / 2);
                return (
                  <g
                    key={u.id}
                    className={`plan-unit${available ? ' is-available' : ''}${hovered === u.id ? ' is-hovered' : ''}`}
                    onMouseEnter={() => setHovered(u.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={available ? () => open(u.id) : undefined}
                  >
                    <PlanGroup layout={layout} tx={tx} muted={!available} />
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
                <span className="unit-id">{u.id}</span>
                <span className="unit-info">
                  <b>{t.beds[layout.bedrooms as 1 | 2 | 3]}</b>
                  {m(layoutArea(layout))} m², {t.facing[u.side].toLowerCase()}
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
            <span />
          )}
        </nav>
      </aside>
    </div>
  );
}
