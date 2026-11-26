'use client';

import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { floors, towers, type FloorSummary } from '@/data/building';
import { blockDFloors, blockDLabel } from '@/data/blockD';
import { layouts } from '@/data/layouts';
import { floorName, podiumFloors } from '@/data/podium';
import { ROOF_FLOOR } from '@/data/roof';
import type { BlockId } from '@/data/types';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import type { FloorKey } from './three/BuildingScene';
import type { Tour } from './three/spots';
import { TourBar } from './TourBar';
import { SunPanel } from './SunPanel';
import { DEFAULT_SUN, type SunSettings } from './three/sunSettings';
import { preloadFloor3D } from './three/preload';
import { floorStageRect, liftsOut } from '@/lib/arrive';
import { bedroomOptions, filterQuery, isFiltered, matches, NO_FILTER, type UnitFilter } from '@/lib/unitFilter';

const BuildingScene = dynamic(() => import('./three/BuildingScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

// Buttons are laid out like a lift panel: highest floor at the top, two per row.
const panelOrder = (a: number, b: number) => Math.floor((b - 1) / 2) - Math.floor((a - 1) / 2) || a - b;
/** The basement car park, floor 0 of the podium: every tab has a button for it, as the tower lifts
 *  go down to it too. */
const BASEMENT: FloorKey = { tower: 'A', floor: 0 };
/** The 3D view's slide to the floor page's place during a lift-out: done well within it (LIFT_TIME, 1.6 s). */
const SLIDE = ['top', 'left', 'width', 'height'].map((p) => `${p} 0.9s cubic-bezier(0.22, 1, 0.36, 1)`).join(', ');

export function FloorPicker({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const layer = useRef<HTMLDivElement>(null);
  const [tower, setTower] = useState<BlockId>('B');
  const [hovered, setHovered] = useState<FloorKey | null>(null);
  const [touched, setTouched] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [tour, setTour] = useState<Tour>({ kind: 'overview' });
  // a picked floor: the 3D view zooms in to it, then the floor page opens
  const [zoom, setZoom] = useState<{ key: FloorKey; href: string } | null>(null);
  // a tower floor lifts out of its tower (BuildingScene's LiftOut): meanwhile the 3D view slides from
  // its place here to where the floor page's 3D view will be, so that page can take over from its last
  // frame; the rest of the page fades to the background behind it
  const lifting = zoom !== null && liftsOut(zoom.key.tower, zoom.key.floor);
  const [slide, setSlide] = useState<React.CSSProperties | null>(null);
  const open = (key: FloorKey, href: string) => {
    // the floor's 3D view downloads during the zoom animation
    preloadFloor3D(key.tower);
    if (zoom) return;
    if (reducedMotion || !ready || tour.kind !== 'overview') {
      router.push(href);
      return;
    }
    router.prefetch(href);
    setHovered(key);
    setZoom({ key, href });
    if (liftsOut(key.tower, key.floor) && stage.current) {
      // pinned where it is now, then (next frame) eased to the floor page's place; the canvas follows
      const r = stage.current.getBoundingClientRect();
      const at = (b: { top: number; left: number; width: number; height: number }): React.CSSProperties => ({
        position: 'fixed',
        top: b.top,
        left: b.left,
        width: b.width,
        height: b.height,
        zIndex: 26,
      });
      setSlide(at(r));
      requestAnimationFrame(() => requestAnimationFrame(() => setSlide({ ...at(floorStageRect()), transition: SLIDE })));
    }
  };
  /** Lift buttons are links; a plain click zooms first instead of jumping straight there. */
  const onLiftClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const m = a.getAttribute('href')?.match(/\/floors\/([A-D])\/([^/?#]+)/);
    if (!m) return;
    // stop the link's own navigation too: this runs in the capture phase, before Link's handler
    e.preventDefault();
    e.stopPropagation();
    const floor = m[2] === 'B1' ? 0 : Number(m[2]);
    open({ tower: m[1] as BlockId, floor }, a.getAttribute('href')!);
  };
  const [sun, setSun] = useState<SunSettings>(DEFAULT_SUN);
  // the 3D view stays under a loader until its models are in and drawn (see BuildingScene)
  const [ready, setReady] = useState(false);
  // The 3D view (three.js and about 10 MB of models) starts loading only when the picker comes
  // within a screen of the viewport, so the rest of the page doesn't wait for it.
  const stage = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = stage.current;
    if (!el || near) return;
    if (!('IntersectionObserver' in window)) return setNear(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '100% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  // while the picker is out of sight the 3D view stops drawing, so scrolling the page stays smooth
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = stage.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => setOnScreen(entries[entries.length - 1].isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const [progress, setProgress] = useState(0);
  // full screen for the 3D view: the browser's own where it has one, else the stage fills the window
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!full || document.fullscreenElement) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', esc);
    document.documentElement.classList.add('has-full-stage');
    return () => {
      window.removeEventListener('keydown', esc);
      document.documentElement.classList.remove('has-full-stage');
    };
  }, [full]);
  const toggleFull = () => {
    const el = stage.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (!full && el.requestFullscreen) el.requestFullscreen().catch(() => setFull(true));
    else setFull(!full);
  };
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // the finder (bedrooms, sunlight): narrows every count below and goes along to the floor page in its link
  const [filter, setFilter] = useState<UnitFilter>(NO_FILTER);
  const filtered = isFiltered(filter);
  const q = filterQuery(filter);
  const forSale = (f: FloorSummary) => (filtered ? f.units.filter((u) => u.status === 'available' && matches(u, filter)).length : f.available);
  const forSaleText = (f: FloorSummary) => (filtered ? fmt(t.find.matchN, { n: forSale(f) }) : fmt(t.home.forSaleN, { n: f.available }));
  const panel = floors.filter((f) => f.tower === tower).sort((a, b) => panelOrder(a.floor, b.floor));
  // the figures over the lift panel: the picked tower's, or the whole complex's for the podium and block D
  const statFloors = tower === 'B' || tower === 'C' ? floors.filter((f) => f.tower === tower) : floors;
  const stats = {
    units: statFloors.reduce((n, f) => n + forSale(f), 0),
    floors: statFloors.filter((f) => forSale(f) > 0).length,
    layouts: new Set(statFloors.flatMap((f) => f.units.filter((u) => u.status === 'available' && matches(u, filter)).map((u) => layouts[u.layout].plan))).size,
  };
  const current = hovered && floors.find((f) => f.tower === hovered.tower && f.floor === hovered.floor);
  const types = current
    ? [...new Set(current.units.filter((u) => u.status === 'available' && matches(u, filter)).map((u) => layouts[u.layout].bedrooms))]
        .sort()
        .map((n) => t.beds[n as 1 | 2 | 3])
        .join(', ')
    : '';
  // the podium (block A): floors 1-3 and the roof playground, always open, nothing for sale
  const podiumPanel = podiumFloors.filter((f) => f.floor > 0).sort((a, b) => panelOrder(a.floor, b.floor));
  const podiumFloor = hovered?.tower === 'A' ? (hovered.floor as 0 | 1 | 2 | 3 | 4) : null;
  // block D, the service and parking building: its own basement (B1) and floors 1-3, two to a row
  const dPanel = [2, 3, 0, 1].filter((n) => blockDFloors.some((f) => f.floor === n));
  const dFloor = hovered?.tower === 'D' ? (hovered.floor as 0 | 1 | 2 | 3) : null;
  // the technical floor on a tower's roof, floor 17: always open, nothing for sale
  const roofTower = hovered && hovered.tower !== 'A' && hovered.tower !== 'D' && hovered.floor === ROOF_FLOOR ? hovered.tower : null;
  const isHovered = (floor: number) => hovered?.tower === tower && hovered.floor === floor;
  const hover = (floor: number | null) => setHovered(floor === null ? null : { tower, floor });

  return (
    <div className="picker" id="floors">
      <div className="picker-side">
        {children}
        <dl className="picker-stats">
          <div>
            <dt>{t.home.statUnits}</dt>
            <dd>{stats.units}</dd>
          </div>
          <div>
            <dt>{t.home.statFloors}</dt>
            <dd>{stats.floors}</dd>
          </div>
          <div>
            <dt>{t.home.statLayouts}</dt>
            <dd>{stats.layouts}</dd>
          </div>
        </dl>
        <div className="finder" role="group" aria-label={t.find.label}>
          <div className="finder-row">
            <span className="finder-label">{t.find.beds}</span>
            <div className="chips">
              {[null, ...bedroomOptions].map((n) => (
                <button key={n ?? 'any'} type="button" aria-pressed={filter.beds === n} onClick={() => setFilter((f) => ({ ...f, beds: n }))}>
                  {n === null ? t.find.any : n}
                </button>
              ))}
            </div>
          </div>
          <div className="finder-row">
            <span className="finder-label">{t.find.sun}</span>
            <div className="chips">
              {([null, 'am', 'pm'] as const).map((v) => (
                <button key={v ?? 'any'} type="button" aria-pressed={filter.sun === v} onClick={() => setFilter((f) => ({ ...f, sun: v }))}>
                  {v === null ? t.find.any : t.find[v]}
                </button>
              ))}
            </div>
          </div>
          {filtered && stats.units === 0 && <p className="finder-none">{t.find.none}</p>}
        </div>
        <div className="lift">
          <div className="segmented" role="group">
            {(['A', ...towers, 'D'] as BlockId[]).map((id) => (
              <button key={id} type="button" aria-pressed={tower === id} onClick={() => setTower(id)}>
                {id === 'A' ? t.home.podiumTab : fmt(t.home.towerN, { t: id })}
              </button>
            ))}
          </div>
          <div className="lift-display" aria-live="polite">
            <span className="lift-number">
              {current
                ? current.floor
                : roofTower
                  ? t.roof.button
                  : dFloor !== null
                    ? blockDLabel(dFloor)
                    : podiumFloor !== null
                      ? floorName(podiumFloor)
                      : '–'}
            </span>
            <span className="lift-text">
              {dFloor !== null ? (
                <>
                  <b>{t.blockD.name}</b>
                  {t.blockD.use[dFloor]}
                </>
              ) : podiumFloor === 0 ? (
                <>
                  <b>{t.basement.name}</b>
                  {t.basement.use}
                </>
              ) : podiumFloor ? (
                <>
                  <b>{t.podium.name}</b>
                  {t.podium.use[podiumFloor]}
                </>
              ) : roofTower ? (
                <>
                  <b>
                    {fmt(t.home.towerN, { t: roofTower })}, {t.roof.name.toLowerCase()}
                  </b>
                  {t.roof.use}
                </>
              ) : current ? (
                current.available > 0 ? (
                  <>
                    <b>
                      {fmt(t.home.towerN, { t: current.tower })}, {forSaleText(current)}
                    </b>
                    {types}
                  </>
                ) : (
                  <b>
                    {fmt(t.home.towerN, { t: current.tower })}, {t.home.soldOut}
                  </b>
                )
              ) : (
                t.home.idle
              )}
            </span>
          </div>
          <ol className="lift-buttons" aria-label={t.home.panelLabel} onClickCapture={onLiftClick}>
            {tower === 'A' &&
              podiumPanel.map((f) => (
                <li key={f.floor}>
                  <Link
                    href={`/${locale}/floors/A/${f.floor}`}
                    className={isHovered(f.floor) ? 'is-hovered' : undefined}
                    aria-label={`${fmt(t.home.openFloor, { n: f.floor })}, ${t.podium.use[f.floor as 1 | 2 | 3 | 4]}`}
                    onMouseEnter={() => hover(f.floor)}
                    onMouseLeave={() => hover(null)}
                    onFocus={() => hover(f.floor)}
                    onBlur={() => hover(null)}
                  >
                    {f.floor}
                  </Link>
                </li>
              ))}
            {tower === 'D' &&
              dPanel.map((n) => (
                <li key={n}>
                  <Link
                    href={`/${locale}/floors/D/${blockDLabel(n)}`}
                    className={isHovered(n) ? 'is-hovered' : undefined}
                    aria-label={`${t.blockD.name}, ${n === 0 ? t.blockD.basementTitle : fmt(t.home.openFloor, { n })}, ${t.blockD.use[n as 0 | 1 | 2 | 3]}`}
                    onMouseEnter={() => hover(n)}
                    onMouseLeave={() => hover(null)}
                    onFocus={() => hover(n)}
                    onBlur={() => hover(null)}
                  >
                    {blockDLabel(n)}
                  </Link>
                </li>
              ))}
            {tower !== 'A' && tower !== 'D' && (
              <li className="lift-roof">
                <Link
                  href={`/${locale}/floors/${tower}/${ROOF_FLOOR}`}
                  className={isHovered(ROOF_FLOOR) ? 'is-hovered' : undefined}
                  aria-label={`${fmt(t.home.towerN, { t: tower })}, ${t.roof.name}: ${t.roof.use}`}
                  onMouseEnter={() => hover(ROOF_FLOOR)}
                  onMouseLeave={() => hover(null)}
                  onFocus={() => hover(ROOF_FLOOR)}
                  onBlur={() => hover(null)}
                >
                  {t.roof.button}
                </Link>
              </li>
            )}
            {panel.map((f) => (
              <li key={f.floor}>
                {f.available > 0 ? (
                  <Link
                    href={`/${locale}/floors/${tower}/${f.floor}${q}`}
                    className={[isHovered(f.floor) && 'is-hovered', forSale(f) === 0 && 'is-nomatch'].filter(Boolean).join(' ') || undefined}
                    aria-label={`${fmt(t.home.openFloor, { n: f.floor })}, ${forSaleText(f)}`}
                    onMouseEnter={() => hover(f.floor)}
                    onMouseLeave={() => hover(null)}
                    onFocus={() => hover(f.floor)}
                    onBlur={() => hover(null)}
                  >
                    {f.floor}
                    {forSale(f) > 0 && (
                      <i className="lift-count" aria-hidden="true">
                        {forSale(f)}
                      </i>
                    )}
                  </Link>
                ) : (
                  <span
                    className={isHovered(f.floor) ? 'is-hovered' : undefined}
                    aria-label={`${fmt(t.home.floorN, { n: f.floor })}, ${t.home.soldOut}`}
                    onMouseEnter={() => hover(f.floor)}
                    onMouseLeave={() => hover(null)}
                  >
                    {f.floor}
                  </span>
                )}
              </li>
            ))}
            {/* block D has its own basement, on its own panel */}
            {tower !== 'D' && (
            <li className="lift-basement">
              <Link
                href={`/${locale}/floors/A/${floorName(0)}`}
                className={podiumFloor === 0 ? 'is-hovered' : undefined}
                aria-label={`${t.basement.name}: ${t.basement.use}`}
                onMouseEnter={() => setHovered(BASEMENT)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(BASEMENT)}
                onBlur={() => setHovered(null)}
              >
                {floorName(0)}
              </Link>
            </li>
            )}
          </ol>
          <p className="lift-legend" aria-hidden="true">
            <span className="is-lit">{t.home.legendForSale}</span>
            <span>{t.home.soldOut}</span>
          </p>
        </div>
      </div>

      {lifting && <div className="lift-backdrop" />}
      <div
        ref={stage}
        className={`tower${zoom ? ' is-zooming' : ''}${lifting ? ' is-lifting' : ''}${full ? ' is-full' : ''}`}
        style={slide ?? undefined}
        onPointerDown={() => setTouched(true)}
      >
        {near && (
          <BuildingScene
            floors={floors}
            hovered={hovered}
            onHover={(key) => {
              // pointing at a floor starts fetching its 3D view
              if (key) preloadFloor3D(key.tower);
              setHovered(key);
              if (key) setTower(key.tower);
            }}
            onOpen={(key) =>
              open(key, `/${locale}/floors/${key.tower}/${key.tower === 'A' || key.tower === 'D' ? (key.floor === 0 ? 'B1' : key.floor) : `${key.floor}${key.floor === ROOF_FLOOR ? '' : q}`}`)
            }
            autoRotate={ready && !touched && !reducedMotion && hovered === null && !zoom}
            zoomTo={zoom?.key ?? null}
            onZoomed={() => zoom && router.push(zoom.href)}
            layer={layer}
            tour={tour}
            sun={sun}
            onReady={onReady}
            onProgress={setProgress}
            active={onScreen}
          />
        )}
        <div className={`label-layer${tour.kind === 'spot' ? ' is-hidden' : ''}`} ref={layer}>
          {(['A', ...towers, 'D'] as BlockId[]).map((id) => (
            <div key={id} className={`tower-tag${tower === id ? ' is-selected' : ''}`} data-anchor={`tower:${id}`}>
              {fmt(t.home.towerN, { t: id })}
            </div>
          ))}
          {/* the pointed floor, pinned to it in the 3D view */}
          {hovered && hovered.floor > 0 && !zoom && (
            <div className={`floor-hover-tag${current && current.available > 0 ? ' is-for-sale' : ''}`} data-anchor="hover">
              <strong>
                {hovered.tower === 'A' || hovered.tower === 'D'
                  ? `${fmt(t.home.towerN, { t: hovered.tower })} · ${fmt(t.home.floorN, { n: hovered.floor })}`
                  : hovered.floor === ROOF_FLOOR
                    ? fmt(t.home.towerN, { t: hovered.tower })
                    : fmt(t.home.floorN, { n: hovered.floor })}
              </strong>
              {current && <span>{current.available > 0 ? forSaleText(current) : t.home.soldOut}</span>}
            </div>
          )}
        </div>
        <TourBar tour={tour} setTour={setTour} />
        <SunPanel setSun={setSun} />
        <button type="button" className="stage-full" onClick={toggleFull} aria-pressed={full} aria-label={full ? t.home.exitFullscreen : t.home.fullscreen} title={full ? t.home.exitFullscreen : t.home.fullscreen}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
        <div className={`stage-loader${ready ? ' is-done' : ''}`} role="status" aria-live="polite" aria-hidden={ready}>
          <div className="stage-loader-box">
            <span className="stage-loader-spinner" aria-hidden="true" />
            <p>{t.home.loading3d}</p>
            <div className="stage-loader-bar" aria-hidden="true">
              <span style={{ width: `${ready ? 100 : Math.min(96, Math.round(progress * 0.9 + 4))}%` }} />
            </div>
          </div>
        </div>
        {/* the city round the complex is OpenStreetMap data (city.glb): the ODbL licence needs this credit */}
        <p className="stage-hint">
          {tour.kind === 'spot' ? t.tour.lookHint : t.home.towerHint}
          <br />© OpenStreetMap contributors
        </p>
      </div>
    </div>
  );
}
