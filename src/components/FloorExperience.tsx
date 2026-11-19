'use client';

import { Fragment, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FLOOR_MAX, FLOOR_MIN, PLATE, coreFor, getFloor, type CoreSpace } from '@/data/building';
import { flatColors, layouts } from '@/data/layouts';
import { ROOF_FLOOR } from '@/data/roof';
import type { Layout, PlanId, TowerId } from '@/data/types';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { layoutArea, m } from '@/lib/geometry';
import { PlanGroup, type PlanTx } from './Plan2D';
import { photoModels } from '@/data/photoModels';
import { unitCentre } from './three/FloorScene';

const FloorScene = dynamic(() => import('./three/FloorScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

// The 2D floor plan: floor-plate coordinates (X east, Y north) -> SVG, north at the top.
const PX = (X: number) => X - PLATE.x0;
const PY = (Y: number) => PLATE.y1 - Y;
const PLAN_W = PLATE.x1 - PLATE.x0;
const PLAN_H = PLATE.y1 - PLATE.y0;

/** C and D are mirror images that meet on the plate's mirror line; their pictures stop there. */
const MIRROR_X = 10.8;

/** A core space in the 2D floor plan, drawn like the architect's plan: stone floor, lift cars, stair treads. */
function CorePlan({ space: c, label }: { space: CoreSpace; label: string | null }) {
  const x = PX(c.x0);
  const y = PY(c.y1);
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let body: ReactNode;
  if (c.id === 'corridor') body = <rect className="plan-corridor" x={x} y={y} width={w} height={h} fill="url(#plan-stone)" />;
  else if (c.id === 'shafts' || c.id === 'trash') body = <rect className="plan-core" x={x} y={y} width={w} height={h} fill="url(#plan-hatch)" />;
  else if (c.id === 'lifts') {
    // cars about 1.9 m apart, doors to the south onto the lobby
    const n = Math.max(1, Math.round(w / 1.9));
    const step = w / n;
    body = (
      <g>
        <rect className="plan-corridor" x={x} y={y} width={w} height={h} fill="url(#plan-stone)" />
        {Array.from({ length: n }, (_, i) => {
          const sx0 = x + i * step + 0.15;
          const sw = step - 0.3;
          const sy0 = y + 0.15;
          const sh = h - 0.75;
          return (
            <g key={i} className="plan-lift">
              <rect x={sx0} y={sy0} width={sw} height={sh} />
              <path d={`M${sx0 + 0.2} ${sy0 + 0.2} L${sx0 + sw - 0.2} ${sy0 + sh - 0.2} M${sx0 + sw - 0.2} ${sy0 + 0.2} L${sx0 + 0.2} ${sy0 + sh - 0.2}`} />
              <line className="plan-lift-door" x1={sx0 + sw / 2 - 0.5} y1={sy0 + sh} x2={sx0 + sw / 2 + 0.5} y2={sy0 + sh} />
            </g>
          );
        })}
      </g>
    );
  } else if (c.id === 'stair') {
    // two flights side by side, half landing to the north
    const tread = 0.28;
    const top = y + 1.3;
    const bottom = y + h - 1.2;
    const lines: number[] = [];
    for (let ty = top; ty <= bottom + 1e-6; ty += tread) lines.push(ty);
    body = (
      <g className="plan-stair">
        <rect x={x} y={y} width={w} height={h} />
        {lines.map((ty) => (
          <line key={ty} x1={x + 0.12} y1={ty} x2={x + w - 0.12} y2={ty} />
        ))}
        <line className="plan-stair-well" x1={cx} y1={top} x2={cx} y2={bottom} />
        <path className="plan-stair-arrow" d={`M${x + w * 0.75} ${bottom} V${top + 0.3} M${x + w * 0.75 - 0.18} ${top + 0.55} L${x + w * 0.75} ${top + 0.3} L${x + w * 0.75 + 0.18} ${top + 0.55}`} />
      </g>
    );
  } else body = <rect className="plan-core" x={x} y={y} width={w} height={h} />;
  return (
    <g>
      {body}
      {label && (
        <text
          className="plan-name plan-core-name"
          x={cx}
          y={c.id === 'lifts' ? y + h - 0.25 : cy + 0.1}
          transform={c.id === 'stair' ? `rotate(-90 ${cx} ${cy})` : undefined}
        >
          {label}
        </text>
      )}
    </g>
  );
}

const planTx = (layout: Layout): PlanTx => ({ ox: PX(layout.origin[0]), sx: 1, oz: PY(layout.origin[1]), sz: 1 });

/** The apartment's colour as a CSS variable, for its tag, list entry and 2D plan. */
const flat = (plan: PlanId) => ({ '--flat': flatColors[plan] }) as CSSProperties;

export function FloorExperience({ tower, floor }: { tower: TowerId; floor: number }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<'3d' | '2d'>('3d');
  const [hovered, setHovered] = useState<string | null>(null);
  const summary = getFloor(tower, floor)!;
  const core = coreFor(tower, floor);
  // block B, floor 4: the homeowners' association room takes apartment 02's place (floor-4 plan),
  // so it is listed there under that number instead of leaving a gap
  const hoa = core.some((c) => c.id === 'hoa') ? `${tower}${floor}02` : null;
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
          <FloorScene units={summary.units} core={core} layer={layer} hovered={hovered} onHover={setHovered} onOpen={open} />
          <div className="label-layer" ref={layer}>
            {summary.units.map((u) => (
              <div key={u.id} className={`unit-tag status-${u.status}${hovered === u.id ? ' is-hovered' : ''}`} style={flat(u.plan)} data-anchor={`unit:${u.id}`}>
                <b>{tags[u.id].title}</b>
                <span>{tags[u.id].detail}</span>
              </div>
            ))}
            {hoa && (
              <div className={`unit-tag${hovered === 'hoa' ? ' is-hovered' : ''}`} data-anchor="core:hoa">
                <b>{hoa}</b>
                <span>{t.floor.core.hoa}</span>
              </div>
            )}
          </div>
        </div>
        {view === '2d' && (
          <div className="floor-plan">
            <svg className="plan-svg" viewBox={`-0.6 -0.6 ${PLAN_W + 1.2} ${PLAN_H + 1.2}`} role="img">
              <rect className="plan-slab" x={0} y={0} width={PLAN_W} height={PLAN_H} rx={PLATE.corner} />
              {PLATE.grid.x.map((X) => (
                <line key={`gx${X}`} className="plan-grid" x1={PX(X)} y1={-0.5} x2={PX(X)} y2={PLAN_H + 0.5} />
              ))}
              {PLATE.grid.y.map((Y) => (
                <line key={`gy${Y}`} className="plan-grid" x1={-0.5} y1={PY(Y)} x2={PLAN_W + 0.5} y2={PY(Y)} />
              ))}
              <defs>
                {/* 60 cm stone tiles (corridor, lift lobby) and hatching (service shafts) */}
                <pattern id="plan-stone" width={0.6} height={0.6} patternUnits="userSpaceOnUse">
                  <rect width={0.6} height={0.6} fill="#ebe6dd" />
                  <path d="M0 0 H0.6 M0 0 V0.6" stroke="#cfc6b8" strokeWidth={0.025} />
                </pattern>
                <pattern id="plan-hatch" width={0.3} height={0.3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width={0.3} height={0.3} fill="#e7e5e0" />
                  <path d="M0 0 V0.3" stroke="#a9a59c" strokeWidth={0.04} />
                </pattern>
                <clipPath id="plan-west-of-mirror">
                  <rect x={-1} y={-1} width={PX(MIRROR_X) + 1} height={PLAN_H + 2} />
                </clipPath>
                <clipPath id="plan-east-of-mirror">
                  <rect x={PX(MIRROR_X)} y={-1} width={PLAN_W} height={PLAN_H + 2} />
                </clipPath>
              </defs>
              {core.map((c) => (
                <CorePlan key={c.id} space={c} label={c.id === 'shafts' ? null : t.floor.core[c.id]} />
              ))}
              {summary.units.map((u) => {
                const layout = layouts[u.layout];
                const tx = planTx(layout);
                const available = u.status === 'available';
                // for-sale apartments: the furnished top view of the 360° tour
                const photo = available ? photoModels[layout.plan] : undefined;
                const [X, Y] = unitCentre(layout);
                const cx = PX(X);
                const cy = PY(Y);
                return (
                  <g
                    key={u.id}
                    className={`plan-unit${available ? ' is-available' : ''}${hovered === u.id ? ' is-hovered' : ''}`}
                    style={flat(u.plan)}
                    onMouseEnter={() => setHovered(u.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={available ? () => open(u.id) : undefined}
                  >
                    {photo ? (
                      <>
                        <image
                          clipPath={u.plan === 'C' ? 'url(#plan-west-of-mirror)' : u.plan === 'D' ? 'url(#plan-east-of-mirror)' : undefined}
                          href={photo.image.src}
                          x={PX(photo.image.rect[0])}
                          y={PY(photo.image.rect[3])}
                          width={photo.image.rect[2] - photo.image.rect[0]}
                          height={photo.image.rect[3] - photo.image.rect[1]}
                          preserveAspectRatio="none"
                        />
                        {Object.entries(photo.rooms).map(([id, r]) => (
                          <rect key={id} className="plan-photo-unit-room" x={PX(r[0])} y={PY(r[3])} width={r[2] - r[0]} height={r[3] - r[1]} />
                        ))}
                      </>
                    ) : (
                      <PlanGroup layout={layout} tx={tx} muted={!available} />
                    )}
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
                <span className="unit-id is-flat" style={flat(u.plan)}>
                  {u.id}
                </span>
                <span className="unit-info">
                  <b>{t.beds[layout.bedrooms as 1 | 2 | 3]}</b>
                  {fmt(t.apt.planN, { p: u.plan })}, {m(layoutArea(layout))} m², {t.facing[u.facing].toLowerCase()}
                </span>
                <span className={`status status-${u.status}`}>{t.status[u.status]}</span>
                {available && <span className="unit-open">{t.floor.open}</span>}
              </>
            );
            return (
              <Fragment key={u.id}>
                <li
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
                {hoa && u.pos === 1 && (
                  <li className={hovered === 'hoa' ? 'is-hovered' : undefined} onMouseEnter={() => setHovered('hoa')} onMouseLeave={() => setHovered(null)}>
                    <div className="is-off">
                      <span className="unit-id">{hoa}</span>
                      <span className="unit-info">
                        <b>{t.floor.core.hoa}</b>
                        {t.floor.hoaNote}
                      </span>
                    </div>
                  </li>
                )}
              </Fragment>
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
