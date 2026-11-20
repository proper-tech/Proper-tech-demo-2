'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FLOOR_MAX, FLOOR_MIN } from '@/data/building';
import { blockDFloors, blockDLabel, blockDOutline, blockDWalk, getBlockDFloor } from '@/data/blockD';
import { blockDTours } from '@/data/blockDTour';
import { floorName, getPodiumFloor, listedSpaces, podiumFloors, type Decor, type PodiumFloor, type PodiumSpace } from '@/data/podium';
import { getRoofFloor } from '@/data/roof';
import type { TowerId } from '@/data/types';
import { fmt, type Dict } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { bounds, m, polygonCentre, type Pt } from '@/lib/geometry';
import { ROOF_SPOTS, type Tour } from './three/spots';
import { TourBar } from './TourBar';
import { fitTourFrame } from './tourFrame';

const PodiumScene = dynamic(() => import('./three/PodiumScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});
const DFloorScene = dynamic(() => import('./three/DFloorScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});
const PanoTour = dynamic(() => import('./PanoTour'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

// A podium floor (block A): the same page as a tower floor (3D or 2D plan, list beside it),
// with shops, halls and cores instead of apartments. Nothing here is for sale; the towers on
// the roof (floor 4) link to their first apartment floor. Given a tower, the same page shows
// that tower's roof, the technical floor (roof.ts). Given block D, a floor of the service and
// parking building (blockD.ts), with its car ramps; floor 0 is its basement.

const path = (pts: Pt[]) => pts.map(([u, v], i) => `${i ? 'L' : 'M'}${u} ${-v}`).join(' ') + ' Z';
const spaceName = (t: Dict, s: PodiumSpace) => (s.tower ? fmt(t.home.towerN, { t: s.tower }) : t.podium.space[s.type]);

/** Number, name and area at the middle of a space; just the number when the space is small. */
function PlanLabel({ space, name, k = 1 }: { space: PodiumSpace; name: string; k?: number }) {
  const [u, v] = polygonCentre(space.outline);
  const b = bounds(space.outline);
  const w = b.u1 - b.u0;
  const big = w > 6 && b.v1 - b.v0 > 4;
  const size = (big ? Math.min(1.5, w / 9) : Math.min(0.9, w / 3.2)) * k;
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

/** Level of a floor as the drawings write it: +4.5, ±0.0, -3.3. */
const level = (z: number) => (Math.abs(z) < 0.005 ? '±0.0' : `${z > 0 ? '+' : '−'}${Math.abs(z).toFixed(1)}`);

/** Gaps in the outside wall and arrows up the ramps that leave this floor, on the 2D plan. */
function PlanAccess({ pf }: { pf: PodiumFloor }) {
  const b = bounds(pf.outline);
  return (
    <>
      {pf.openings?.map((o, i) => {
        const along = o.side === 'N' || o.side === 'S';
        const c = o.side === 'N' ? b.v1 : o.side === 'S' ? b.v0 : o.side === 'E' ? b.u1 : b.u0;
        const [x1, y1, x2, y2] = along ? [o.from, -c, o.to, -c] : [c, -o.from, c, -o.to];
        return <line key={i} className="plan-gap" x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {pf.ramps
        ?.filter((r) => r.y0 === 0)
        .map((r, i) => {
          const u = (r.u0 + r.u1) / 2;
          const dir = Math.sign(r.high - r.low);
          return (
            <g key={i} className="plan-ramp">
              <line x1={u} y1={-(r.low + dir * 0.6)} x2={u} y2={-(r.high - dir * 1.2)} />
              <path d={`M${u - 0.7} ${-(r.high - dir * 1.9)} L${u} ${-(r.high - dir * 0.6)} L${u + 0.7} ${-(r.high - dir * 1.9)}`} />
            </g>
          );
        })}
    </>
  );
}

/** Podium floors with a rendered 360° tour (public/tour/<id>/index.html, made by interior/tools/make_tour_a1.py). */
const PHOTO_TOURS: Partial<Record<number, string>> = { 1: 'A1' };

export function PodiumFloorExperience({ floor, tower, block }: { floor: number; tower?: TowerId; block?: 'D' }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [view, setView] = useState<'3d' | 'walk' | '2d' | 'photo'>('3d');
  const [room, setRoom] = useState<string | null>(null);
  const [spots, setSpots] = useState<Pt[]>([]);
  const dot = useRef<SVGGElement>(null);
  const jumpTo = useRef<((p: Pt) => void) | null>(null);
  const hud = useMemo(
    () => ({
      pose: (u: number, v: number, heading: number) =>
        dot.current?.setAttribute('transform', `translate(${u.toFixed(2)} ${(-v).toFixed(2)}) rotate(${((heading * 180) / Math.PI).toFixed(1)})`),
      room: setRoom,
      points: (pts: Pt[]) => setSpots((old) => (old.length === pts.length && old.every((p, i) => p === pts[i]) ? old : pts)),
      bindJump: (f: (p: Pt) => void) => {
        jumpTo.current = f;
      },
    }),
    [],
  );
  /** A click on the small plan: go to the spot nearest to it. */
  const mapClick = (ev: MouseEvent<SVGSVGElement>) => {
    const svg = ev.currentTarget;
    const m = svg.getScreenCTM();
    if (!m) return;
    const q = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    jumpTo.current?.([q.x, -q.y]);
  };
  // ?view=360 opens a block D floor straight in the 360° view (the floor buttons in it use this)
  // ?at=u,v&look=u,v starts it at a given spot (block metres), so a view can be shared as a link
  const [spot, setSpot] = useState<{ start: [number, number]; look: [number, number] } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get('view');
    if (block === 'D' && (v === '360' || v === 'walk')) setView('walk');
    if (!block && !tower && PHOTO_TOURS[floor] && (v === '360' || v === 'tour')) setView('photo');
    const pair = (k: string) => {
      const n = (q.get(k) ?? '').split(',').map(Number);
      return n.length === 2 && n.every(Number.isFinite) ? (n as [number, number]) : null;
    };
    const [at, look] = [pair('at'), pair('look')];
    if (at && look) setSpot({ start: at, look });
  }, [block, tower, floor]);
  const [hovered, setHovered] = useState<string | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const isD = block === 'D';
  // block D floors rendered in Blender: a 360° tour of photos and the furnished top view
  const pano = isD ? blockDTours[floor] : undefined;
  const dTour = !!pano && view === 'walk';
  const [tour, setTour] = useState<Tour>({ kind: 'overview' });
  const pf = tower ? getRoofFloor(tower) : isD ? getBlockDFloor(floor)! : getPodiumFloor(floor)!;
  const lower = isD ? getBlockDFloor(floor - 1) : undefined;
  // the roof playground (floor 4) has a 360° view you can walk through
  const walkable = !tower && !isD && pf.spaces.some((s) => s.type === 'playground');
  const walking = tour.kind === 'spot';
  // a rendered 360° tour of the floor (public/tour/<id>/index.html), when there is one
  const photoTour = !tower && !isD ? PHOTO_TOURS[floor] : undefined;
  const photo = view === 'photo' && !!photoTour;
  const listed = listedSpaces(pf);
  const towerHref = (s: PodiumSpace) => `/${locale}/floors/${s.tower}/${FLOOR_MIN}`;
  const open = (s: PodiumSpace) => s.tower && router.push(towerHref(s));
  const detail = (s: PodiumSpace) =>
    s.tower
      ? t.podium.towerApartments
      : s.type === 'playground'
        ? t.podium.playgroundFacts
        : s.type === 'ramp'
          ? t.podium.rampUp
          : [s.area !== undefined && `${m(s.area)} m²`, s.stalls && fmt(t.podium.stallsN, { n: s.stalls.length })].filter(Boolean).join(', ');
  // every space always shows its number; big spaces, car parks, the towers and the space pointed
  // at also show name and area (small rooms would cover each other otherwise)
  const full = (s: PodiumSpace) => s.tower || (s.area ?? 0) >= 100 || !!s.stalls || s.type === 'playground' || hovered === s.id;

  // fit the plan to everything drawn, including the covered walkway outside the 1st-floor walls
  const b = bounds([...pf.outline, ...pf.spaces.flatMap((s) => s.outline)]);
  const list = isD ? blockDFloors : podiumFloors;
  const [first, last] = [list[0].floor, list[list.length - 1].floor];
  const key = isD ? 'D' : 'A';
  // B1 for a basement, in links and on buttons
  const label = floorName;
  const basement = !tower && !isD && floor === 0;
  const title = tower
    ? fmt(t.roof.title, { t: tower })
    : isD
      ? floor === 0
        ? t.blockD.basementTitle
        : fmt(t.blockD.title, { n: floor })
      : basement
        ? t.basement.title
        : fmt(t.podium.title, { n: floor });
  const lead = tower
    ? t.roof.lead
    : isD
      ? t.blockD.lead[pf.floor as 0 | 1 | 2 | 3]
      : basement
        ? t.basement.lead
        : t.podium.lead[pf.floor as 1 | 2 | 3 | 4];

  return (
    <div className="floor">
      <section className={dTour ? 'floor-stage is-tour' : isD && view === 'walk' ? 'floor-stage is-walk' : 'floor-stage'}>
        {pano && dTour && <PanoTour tour={pano} floorLabel={blockDLabel(floor)} />}
        <div className={view === '2d' || photo || dTour ? 'stage-canvas is-hidden' : 'stage-canvas'}>
          {isD ? (
            view !== '2d' &&
            !dTour && (
              <DFloorScene
                key={view}
                floor={pf}
                lower={lower}
                upper={getBlockDFloor(floor + 1)}
                walk={spot ? { ...blockDWalk[floor], ...spot } : blockDWalk[floor]}
                view={view === 'walk' ? 'walk' : 'orbit'}
                label={blockDLabel(floor)}
                layer={layer}
                hovered={hovered}
                onHover={setHovered}
                hud={hud}
                photo={pano?.top}
              />
            )
          ) : (
            <PodiumScene
              floor={pf}
              layer={layer}
              hovered={walking ? null : hovered}
              onHover={(id) => !walking && setHovered(id)}
              onOpen={(s) => !walking && open(s)}
              tour={walkable ? tour : undefined}
            />
          )}
          <div className={`label-layer${walking || view === 'walk' ? ' is-hidden' : ''}`} ref={layer}>
            {listed.map((s) => (
              <div
                key={s.id}
                className={`unit-tag podium-tag${s.tower ? ' status-available' : ''}${hovered === s.id ? ' is-hovered' : ''}${full(s) ? '' : ' is-compact'}`}
                data-anchor={`space:${s.id}`}
              >
                <b>{s.no ?? spaceName(t, s)}</b>
                {full(s) && <span>{s.no ? [spaceName(t, s), detail(s)].filter(Boolean).join(', ') : detail(s)}</span>}
              </div>
            ))}
          </div>
        </div>
        {view === '2d' && (
          <div className="floor-plan">
            <svg className={pano ? 'plan-svg has-photo' : 'plan-svg'} viewBox={`${b.u0 - 2} ${-b.v1 - 2} ${b.u1 - b.u0 + 4} ${b.v1 - b.v0 + 4}`} role="img">
              <path className="podium-slab" d={path(pf.outline)} />
              {pano && (
                <image
                  href={pano.top.src}
                  x={pano.top.rect[0]}
                  y={-pano.top.rect[3]}
                  width={pano.top.rect[2] - pano.top.rect[0]}
                  height={pano.top.rect[3] - pano.top.rect[1]}
                  preserveAspectRatio="none"
                />
              )}
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
              {pf.spaces
                .flatMap((s) => s.stalls ?? [])
                .map((stall, i) => (
                  <path key={`stall-${i}`} className="podium-stall" d={path(stall)} />
                ))}
              {pf.decor?.map((d, i) => <PlanDecor key={i} d={d} />)}
              <PlanAccess pf={pf} />
              {listed.map((s) => (
                <PlanLabel key={s.id} space={s} name={spaceName(t, s)} k={isD ? 0.55 : 1} />
              ))}
            </svg>
          </div>
        )}

        {photo && (
          <iframe className="apt-tour-frame" src={`/tour/${photoTour}/index.html`} title={t.apt.modeTour} allow="fullscreen" onLoad={(e) => fitTourFrame(e.currentTarget)} />
        )}
        <div className={photo ? 'apt-head is-over-photo' : 'apt-head'}>
          <Link className="back" href={`/${locale}#floors`}>
            {t.floor.back}
          </Link>
          <h1>{title}</h1>
          <p>{lead}</p>
          <div className="segmented" role="group">
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
              {t.floor.view3d}
            </button>
            {photoTour && (
              <button type="button" aria-pressed={view === 'photo'} onClick={() => setView('photo')}>
                {t.apt.modeTour}
              </button>
            )}
            {isD && (
              <button type="button" aria-pressed={view === 'walk'} onClick={() => setView('walk')}>
                {t.blockD.walk}
              </button>
            )}
            <button
              type="button"
              aria-pressed={view === '2d'}
              onClick={() => {
                setView('2d');
                setTour({ kind: 'overview' });
              }}
            >
              {t.floor.view2d}
            </button>
          </div>
        </div>
        {view === '3d' && walkable && <TourBar tour={tour} setTour={setTour} spots={ROOF_SPOTS} label={t.tour.label} />}
        {view === '3d' && <p className="stage-hint">{walking ? t.tour.lookHint : t.podium.hint}</p>}
        {isD && view === 'walk' && !dTour && (
          <>
            <div className="walk-hud">
              <div className="walk-room" aria-live="polite">
                <span>{t.blockD.youAreIn}</span>
                <b>{room ? [pf.spaces.find((s) => s.id === room)?.no, spaceName(t, pf.spaces.find((s) => s.id === room)!)].filter(Boolean).join(' · ') : t.blockD.outsideRooms}</b>
              </div>
              <div className="walk-floors">
                {getBlockDFloor(floor + 1) && (
                  <Link href={`/${locale}/floors/D/${floorName(floor + 1)}?view=360`}>↑ {fmt(t.blockD.toFloor, { n: blockDLabel(floor + 1) })}</Link>
                )}
                {getBlockDFloor(floor - 1) && (
                  <Link href={`/${locale}/floors/D/${floorName(floor - 1)}?view=360`}>↓ {fmt(t.blockD.toFloor, { n: blockDLabel(floor - 1) })}</Link>
                )}
              </div>
            </div>
            <svg className="walk-map" viewBox="-1.2 -31.2 23.6 32.6" role="img" aria-label={t.blockD.mapLabel} onClick={mapClick}>
              <path className="podium-slab" d={path(blockDOutline)} />
              {pf.spaces.map((s) => (
                <path key={s.id} className={`podium-space podium-${s.type}${s.id === room ? ' is-here' : ''}`} d={path(s.outline)} />
              ))}
              {spots.map(([u, v]) => (
                <circle key={`${u},${v}`} className="walk-spot" cx={u} cy={-v} r="0.45" />
              ))}
              <g ref={dot}>
                <path className="walk-cone" d="M0 0 L-2.2 -4.2 A4.8 4.8 0 0 1 2.2 -4.2 Z" />
                <circle className="walk-dot" r="0.75" />
              </g>
            </svg>
            <p className="stage-hint">{t.blockD.walkHint}</p>
          </>
        )}
      </section>

      <aside className="apt-panel">
        <ul className="unit-list">
          {listed.map((s) => {
            const body = (
              <>
                <span className="unit-id">{s.no ?? s.tower ?? '↑'}</span>
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
        {isD && (
          <p className="podium-total">
            {fmt(t.blockD.level, { z: level(pf.z0), h: (pf.z1 - pf.z0).toFixed(1) })}
            <br />
            {t.blockD.size}
          </p>
        )}
        <p className="podium-note">{t.podium.source}</p>
        <nav className="apt-nav">
          {tower ? (
            <Link href={`/${locale}/floors/${tower}/${FLOOR_MAX}`}>
              <span>{t.floor.prev}</span>
              {FLOOR_MAX}
            </Link>
          ) : floor > first ? (
            <Link href={`/${locale}/floors/${key}/${label(floor - 1)}`}>
              <span>{t.floor.prev}</span>
              {label(floor - 1)}
            </Link>
          ) : (
            <span />
          )}
          {!tower && floor < last ? (
            <Link href={`/${locale}/floors/${key}/${label(floor + 1)}`}>
              <span>{t.floor.next}</span>
              {label(floor + 1)}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </aside>
    </div>
  );
}
