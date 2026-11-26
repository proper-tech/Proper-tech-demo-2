'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MathUtils } from 'three';
import { FLOOR_MAX, FLOOR_MIN, getFloor, towers } from '@/data/building';
import type { TowerId, Unit } from '@/data/types';
import { facingHeading, heightGap, liftOf, lookBand, PHOTO_SEASON, SEASONS, shotOf, sphereFor, spheresFor, srcFor, type Season } from '@/data/views';
import { facesWindow, isDown, nearestPhoto, photoGap, photosFor, type ViewPhoto } from '@/data/photos';
import { windowKinds, windowTaken, windowView } from '@/data/windowViews';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import type { Look } from './three/WindowSphere';

const WindowSphere = dynamic(() => import('./three/WindowSphere'), { ssr: false });

const FOV = 70;
const FOV_MIN = 30;
const FOV_MAX = 90;
const PITCH_MAX = 70;
const wrap = (d: number) => ((d % 360) + 360) % 360;
/** The shortest turn from a to b, in degrees (-180..180). */
const turn = (a: number, b: number) => ((b - a + 540) % 360) - 180;

// The window-view page. It opens on the Window view: one plain picture per apartment, looking straight out along
// its windows, for the chosen floor and season (public/views/window, made from the drone's frames). The 360° view
// is the drone's sphere for a tower and floor, turned to face the chosen apartment's windows. The floors run top to bottom like the lift panel; a floor the drone did not photograph shows the
// nearest photograph moved to its height, and says so. The season switch swaps in the photograph's AI-made
// spring, summer and autumn versions. The panel lists the drone's single photographs, which open large over the
// 360° view. The state travels in the address (?tower=&floor=&apt=&season=&view=sphere) so a view can be shared.
export function WindowViews() {
  const { locale, t } = useI18n();
  const v = t.views;
  const [tower, setTower] = useState<TowerId>('B');
  const [floor, setFloor] = useState(FLOOR_MAX);
  const [pos, setPos] = useState<Unit['pos']>(4);
  const [season, setSeason] = useState<Season>(PHOTO_SEASON);
  const [ready, setReady] = useState(false);
  const [heading, setHeading] = useState(0);
  const [rotate, setRotate] = useState(false);
  const [mode, setMode] = useState<'window' | 'sphere'>('window');
  const [windowReady, setWindowReady] = useState(false);
  // a photograph chosen from the list or with the arrows; turning the view by hand goes back to the nearest one
  const [pick, setPick] = useState<string | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const look = useRef<Look>({ heading: 0, pitch: -6, fov: FOV });
  const aim = useRef<number | null>(null);
  // the address is read once before it is written, or the first write (the defaults) would replace it
  const [fromUrl, setFromUrl] = useState(false);

  const summary = getFloor(tower, floor);
  const unit = summary?.units.find((u) => u.pos === pos) ?? summary?.units[0];
  const sphere = sphereFor(tower, floor);
  // the floor list marks what the view shown has at each floor: the Window view's photographs differ by facing
  const sphereKinds = useMemo(() => new Map(spheresFor(tower).map((s) => [s.floor, s.kind])), [tower]);
  const shot = sphere ? shotOf(sphere) : null;
  const kinds = mode === 'window' && unit ? windowKinds(unit.facing) : sphereKinds;
  // the 360° view stays inside the band the drone photographed (no drawn street or building tops); read by the
  // frame loop below
  const band = useRef<{ top: number; bottom: number } | null>(null);
  band.current = lookBand(sphere);
  const inWindow = mode === 'window';
  // read by the pointer handlers, which are set up once: the window picture does not turn
  const windowRef = useRef(inWindow);
  windowRef.current = inWindow;
  const win = unit ? windowView(unit.facing, floor) : null;
  const winSrc = win ? (win.seasons[season] ?? win.seasons[PHOTO_SEASON] ?? null) : null;
  useEffect(() => setWindowReady(false), [winSrc]);
  const photos = useMemo(() => photosFor(floor), [floor]);
  const shown: ViewPhoto | null = mode === 'sphere' ? (photos.find((p) => p.src === pick) ?? null) : null;
  const floorsDown = useMemo(() => Array.from({ length: FLOOR_MAX - FLOOR_MIN + 1 }, (_, i) => FLOOR_MAX - i), []);

  // the address in, once, then out on every change (replaceState: no history entry per click)
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const tw = q.get('tower');
    const fl = Number(q.get('floor'));
    const ap = Number(q.get('apt'));
    const se = q.get('season');
    // links from when the page had a flat panorama (view=pano or photo) open the 360° view
    if (['sphere', 'pano', 'photo'].includes(q.get('view') ?? '')) setMode('sphere');
    if (tw && (towers as string[]).includes(tw)) setTower(tw as TowerId);
    if (fl >= FLOOR_MIN && fl <= FLOOR_MAX) setFloor(fl);
    if (ap >= 1 && ap <= 6) setPos(ap as Unit['pos']);
    if (se && (SEASONS as readonly string[]).includes(se)) setSeason(se as Season);
    setFromUrl(true);
  }, []);
  useEffect(() => {
    // the photograph's season is the default and stays out of the address
    const se = season === PHOTO_SEASON ? '' : `&season=${season}`;
    const vw = mode === 'sphere' ? '&view=sphere' : '';
    if (fromUrl) history.replaceState(history.state, '', `?tower=${tower}&floor=${floor}&apt=${pos}${se}${vw}`);
  }, [fromUrl, tower, floor, pos, season, mode]);

  // every floor opens facing north, the compass's zero, at the horizon; choosing an apartment (below) turns the
  // view to its windows
  useEffect(() => {
    aim.current = null;
    look.current.heading = 0;
    look.current.pitch = 0;
    setPick(null);
  }, [tower, floor]);

  // the Window view always looks the way the apartment's windows face, so the compass shows it
  const facing = unit?.facing;
  useEffect(() => {
    if (inWindow && facing) aim.current = facingHeading(facing);
  }, [inWindow, facing, tower, floor]);

  // dragging, the wheel and pinching
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ptrs = new Map<number, [number, number]>();
    let pinch = 0;
    const down = (e: PointerEvent) => {
      if (windowRef.current) return;
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      aim.current = null;
      setRotate(false);
      setPick(null);
    };
    const move = (e: PointerEvent) => {
      const last = ptrs.get(e.pointerId);
      if (!last) return;
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      const L = look.current;
      if (ptrs.size === 1) {
        // degrees per pixel, so the picture stays under the finger
        const k = L.fov / el.clientHeight;
        L.heading = wrap(L.heading - (e.clientX - last[0]) * k);
        L.pitch = MathUtils.clamp(L.pitch + (e.clientY - last[1]) * k, -PITCH_MAX, PITCH_MAX);
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) L.fov = MathUtils.clamp((L.fov * pinch) / d, FOV_MIN, FOV_MAX);
        pinch = d;
      }
    };
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (windowRef.current) return;
      e.preventDefault();
      look.current.fov = MathUtils.clamp(look.current.fov + e.deltaY * 0.04, FOV_MIN, FOV_MAX);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  const zoom = (d: number) => (look.current.fov = MathUtils.clamp(look.current.fov + d, FOV_MIN, FOV_MAX));
  // the next or previous photograph round the circle (level ones only), turning the view with it
  const level = useMemo(() => photos.filter((p) => !isDown(p)), [photos]);
  const stepPhoto = (d: number) => {
    if (!level.length) return;
    const cur = shown && !isDown(shown) ? shown : nearestPhoto(level, look.current.heading);
    const i = cur ? level.indexOf(cur) : 0;
    const next = level[(i + d + level.length) % level.length];
    setPick(next.src);
    aim.current = next.heading;
    setRotate(false);
  };
  const photoKeys = useRef<((d: number) => void) | null>(null);
  // in the Window view the side arrows go to the next apartment round the floor
  const stepUnit = (d: number) => {
    const list = summary?.units ?? [];
    if (!list.length || !unit) return;
    setPos(list[(list.indexOf(unit) + d + list.length) % list.length].pos);
  };
  photoKeys.current = shown ? stepPhoto : inWindow ? stepUnit : null;
  const choosePhoto = (p: ViewPhoto) => {
    setMode('sphere');
    setPick(p.src);
    aim.current = p.heading;
    setRotate(false);
  };

  const stepFloor = useCallback((d: number) => setFloor((f) => MathUtils.clamp(f + d, FLOOR_MIN, FLOOR_MAX)), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      const L = look.current;
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && photoKeys.current) {
        photoKeys.current(e.key === 'ArrowLeft' ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowLeft') L.heading = wrap(L.heading - 5);
      else if (e.key === 'ArrowRight') L.heading = wrap(L.heading + 5);
      else if (e.key === 'ArrowUp') stepFloor(1);
      else if (e.key === 'ArrowDown') stepFloor(-1);
      else if (e.key === '+' || e.key === '=') zoom(-10);
      else if (e.key === '-') zoom(10);
      else return;
      aim.current = null;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [stepFloor]);

  // easing towards a chosen heading, turning by itself, and the compass readout
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const L = look.current;
      if (L.fov < FOV_MIN) L.fov = FOV_MIN;
      const B = band.current;
      if (B) {
        // the view's height (the camera's field of view is vertical) fits the band, and its middle stays where
        // the top and bottom edges are both inside it
        L.fov = Math.min(L.fov, B.top - B.bottom);
        L.pitch = MathUtils.clamp(L.pitch, B.bottom + L.fov / 2, B.top - L.fov / 2);
      }
      if (aim.current !== null) {
        const d = turn(L.heading, aim.current);
        if (still || Math.abs(d) < 0.3) {
          L.heading = aim.current;
          aim.current = null;
        } else L.heading = wrap(L.heading + d * Math.min(1, dt * 6));
      } else if (rotate) L.heading = wrap(L.heading + dt * 8);
      setHeading((old) => (Math.abs(turn(old, L.heading)) > 0.5 ? L.heading : old));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rotate]);

  const fullscreen = () => {
    const el = stage.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  // "2026.11.25 12:04", straight from the record (local time): Intl would differ between server and browser
  const fmtWhen = (taken: string | null) => (taken ? taken.slice(0, 16).replace('T', ' ').replaceAll('-', '.') : '');
  const when = shot ? fmtWhen(shot.taken) : null;
  const gap = sphere ? heightGap(floor, sphere) : 0;
  const derived = sphere?.kind === 'derived' && sphere.floor === floor && sphere.from != null;
  // metres the photograph was moved to reach this floor (positive: it was taken lower down)
  const lift = derived ? liftOf(sphere) : 0;
  const generated = season !== PHOTO_SEASON && !!sphere?.seasons[season];
  const points = t.sun.points; // N, NE, E, SE, S, SW, W, NW
  const pointOf = (h: number) => points[Math.round(wrap(h) / 45) % 8];
  const photoWhen = shown ? shown.taken.slice(0, 16).replace('T', ' ').replaceAll('-', '.') : '';
  const photoOff = shown ? photoGap(shown, floor) : 0;
  const windowHeading = unit ? facingHeading(unit.facing) : null;
  // metres the Window view was moved from its photograph to this floor's eye level (positive: raised)
  const winLift = win?.kind === 'derived' && win.from != null ? win.height - (windowView(win.facing, win.from)?.height ?? win.height) : 0;
  const cardinal = points[Math.round(heading / 45) % 8];
  const dirs = [0, 90, 180, 270] as const;

  return (
    <div className="wv">
      <section className="wv-stage-wrap" aria-label={v.title}>
        <div className="wv-stage" ref={stage}>
          {inWindow ? (
            winSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={winSrc}
                className="wv-window-view"
                src={winSrc}
                alt={unit ? fmt(v.windowAlt, { id: unit.id, n: floor, dir: pointOf(facingHeading(unit.facing)) }) : ''}
                draggable={false}
                onLoad={() => setWindowReady(true)}
              />
            ) : (
              <p className="wv-none">{v.none}</p>
            )
          ) : sphere ? (
            <WindowSphere src={srcFor(sphere, season)} yaw={sphere.yaw} look={look} onReady={setReady} />
          ) : (
            <p className="wv-none">{v.none}</p>
          )}
          {shown && (
            // the plain photograph over the sphere: dragging still turns the view, and the nearest photograph follows
            // eslint-disable-next-line @next/next/no-img-element
            <img key={shown.src} className="wv-photo" src={shown.src} alt={fmt(v.photoAlt, { n: floor, dir: pointOf(shown.heading) })} draggable={false} />
          )}
        </div>
        {shown && level.length > 1 && (
          <>
            <button type="button" className="ptour-tool wv-step wv-step-prev" onClick={() => stepPhoto(-1)} aria-label={v.prevPhoto} title={v.prevPhoto}>
              ‹
            </button>
            <button type="button" className="ptour-tool wv-step wv-step-next" onClick={() => stepPhoto(1)} aria-label={v.nextPhoto} title={v.nextPhoto}>
              ›
            </button>
          </>
        )}

        <div className="wv-caption">
          <b>{fmt(v.floorView, { t: tower, n: floor })}</b>
          {shown && (
            <>
              <span>
                {fmt(v.taken, { when: photoWhen })} · {fmt(v.height, { m: shown.height.toFixed(0) })} ·{' '}
                {fmt(v.photoLooking, { dir: pointOf(shown.heading), deg: Math.round(shown.heading) })}
              </span>
              {shown.floor !== floor && (
                <span className="wv-note">
                  {fmt(photoOff > 0 ? v.photoHigher : v.photoLower, { n: floor, m: shown.floor, d: Math.abs(photoOff).toFixed(0) })}
                </span>
              )}
              {season !== PHOTO_SEASON && <span className="wv-note">{v.photoSeason}</span>}
            </>
          )}
          {inWindow && win && unit && (
            <>
              <span>
                {season !== PHOTO_SEASON
                  ? fmt(v.seasonAi, { season: v.seasons[season], when: fmtWhen(windowTaken(win)) })
                  : fmt(v.taken, { when: fmtWhen(windowTaken(win)) })}{' '}
                · {fmt(v.height, { m: win.height.toFixed(0) })} ·{' '}
                {fmt(v.photoLooking, { dir: pointOf(facingHeading(unit.facing)), deg: Math.round(facingHeading(unit.facing)) })}
              </span>
              {win.kind === 'derived' && win.from != null && (
                <span className="wv-note">
                  {fmt(winLift >= 0 ? v.derivedRaised : v.derivedLowered, { n: floor, m: win.from, d: Math.abs(winLift).toFixed(0) })}
                </span>
              )}
            </>
          )}
          {sphere && !shown && !inWindow && (
            <span>
              {generated ? fmt(v.seasonAi, { season: v.seasons[season], when: when ?? '' }) : fmt(v.taken, { when: when ?? '' })}
              {shot?.height != null && ` · ${fmt(v.height, { m: shot.height.toFixed(0) })}`}
            </span>
          )}
          {derived && !shown && !inWindow && (
            <span className="wv-note">
              {fmt(lift >= 0 ? v.derivedRaised : v.derivedLowered, { n: floor, m: sphere.from!, d: Math.abs(lift).toFixed(0) })}
            </span>
          )}
          {sphere && !shown && !inWindow && sphere.floor !== floor && (
            <span className="wv-note">
              {fmt(gap > 0 ? v.nearestAbove : v.nearestBelow, { n: floor, m: sphere.floor, d: Math.abs(gap).toFixed(0) })}
            </span>
          )}
        </div>

        <div className="ptour-tools wv-tools">
          <div className="wv-mode" role="group" aria-label={v.viewMode}>
            <button
              type="button"
              className="ptour-tool"
              aria-pressed={mode === 'window'}
              onClick={() => {
                setMode('window');
                setPick(null);
                setRotate(false);
              }}
            >
              {v.modeWindow}
            </button>
            <button
              type="button"
              className="ptour-tool"
              aria-pressed={mode === 'sphere'}
              onClick={() => {
                setMode('sphere');
                setPick(null);
              }}
            >
              {v.modeSphere}
            </button>
          </div>
          <button type="button" className="ptour-tool" onClick={() => zoom(10)} disabled={!!shown || inWindow} aria-label={v.zoomOut} title={v.zoomOut}>
            −
          </button>
          <button type="button" className="ptour-tool" onClick={() => zoom(-10)} disabled={!!shown || inWindow} aria-label={v.zoomIn} title={v.zoomIn}>
            +
          </button>
          <button type="button" className="ptour-tool" aria-pressed={rotate} disabled={inWindow} onClick={() => {
              setRotate((r) => !r);
              setPick(null);
            }}>
            ↻ {v.rotate}
          </button>
          <button type="button" className="ptour-tool" onClick={fullscreen} aria-label={v.fullscreen} title={v.fullscreen}>
            ⛶
          </button>
        </div>

        <div className="wv-bottom">
          <div className="wv-lift" role="group" aria-label={v.floor}>
            <button type="button" className="ptour-tool" onClick={() => stepFloor(1)} disabled={floor >= FLOOR_MAX} aria-label={v.up}>
              ▲
            </button>
            <span>{floor}</span>
            <button type="button" className="ptour-tool" onClick={() => stepFloor(-1)} disabled={floor <= FLOOR_MIN} aria-label={v.down}>
              ▼
            </button>
          </div>
          <div className="wv-dirs" role="group" aria-label={v.look} hidden={inWindow}>
            {dirs.map((d, i) => (
              <button
                key={d}
                type="button"
                className="ptour-tool"
                aria-pressed={Math.abs(turn(heading, d)) < 22.5}
                onClick={() => {
                  aim.current = d;
                  setRotate(false);
                  setPick(null);
                }}
              >
                {v.dirs[i]}
              </button>
            ))}
          </div>
          <div className="wv-compass" aria-label={`${Math.round(heading)}° ${cardinal}`}>
            <div className="wv-rose" style={{ transform: `rotate(${-heading}deg)` }}>
              {(['N', 'E', 'S', 'W'] as const).map((k, i) => (
                <b key={k} className={`wv-rose-${k}`}>
                  {points[i * 2]}
                </b>
              ))}
              {unit && <i className="wv-window" style={{ transform: `rotate(${facingHeading(unit.facing)}deg)` }} title={t.facing[unit.facing]} />}
            </div>
            <span className="wv-needle" />
            <small>
              {Math.round(heading)}° {cardinal}
            </small>
          </div>
        </div>
        <p className="ptour-help wv-help">{inWindow ? v.windowHelp : v.help}</p>
        {(inWindow ? !!winSrc && !windowReady : sphere && !ready) && <p className="ptour-loading">{v.loading}</p>}
      </section>

      <aside className="wv-panel">
        <h1>{v.title}</h1>
        <p className="wv-lead">{v.lead}</p>

        <div className="wv-field">
          <span>{v.tower}</span>
          <div className="wv-seg" role="group" aria-label={v.tower}>
            {towers.map((tw) => (
              <button key={tw} type="button" aria-pressed={tw === tower} onClick={() => setTower(tw)}>
                {fmt(v.towerN, { t: tw })}
              </button>
            ))}
          </div>
        </div>

        <div className="wv-field">
          <span>{v.season}</span>
          <div className="wv-seg wv-seasons" role="group" aria-label={v.season}>
            {SEASONS.map((se) => (
              <button key={se} type="button" aria-pressed={se === season} onClick={() => setSeason(se)}>
                {v.seasons[se]}
              </button>
            ))}
          </div>
        </div>

        <div className="wv-field">
          <span>{v.floor}</span>
          <ol className="wv-floors">
            {floorsDown.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  aria-pressed={n === floor}
                  onClick={() => setFloor(n)}
                  title={kinds.get(n) === 'photo' ? v.hasPhoto : kinds.get(n) === 'derived' ? v.derivedKey : undefined}
                >
                  {n}
                  {kinds.get(n) === 'photo' && <i aria-label={v.hasPhoto} />}
                  {kinds.get(n) === 'derived' && <i className="wv-est" aria-label={v.derivedKey} />}
                </button>
              </li>
            ))}
          </ol>
          <small className="wv-key">
            <i /> {v.hasPhoto}
          </small>
          <small className="wv-key">
            <i className="wv-est" /> {v.derivedKey}
          </small>
        </div>

        <div className="wv-field">
          <span>{v.apartments}</span>
          <ul className="wv-units">
            {summary?.units.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  aria-pressed={u.pos === unit?.pos}
                  onClick={() => {
                    setPos(u.pos);
                    aim.current = facingHeading(u.facing);
                    setRotate(false);
                    setPick(null);
                  }}
                >
                  <b>{u.id}</b>
                  <span>{t.facing[u.facing]}</span>
                </button>
              </li>
            ))}
          </ul>
          {unit && (
            <Link className="pill pill-primary wv-open" href={`/${locale}/apartments/${unit.id}`}>
              {fmt(v.openApt, { id: unit.id })}
            </Link>
          )}
        </div>

        {photos.length > 0 && (
          <div className="wv-field">
            <span>{v.photos}</span>
            <small className="wv-key">{v.photosLead}</small>
            <ul className="wv-photos">
              {photos.map((p) => {
                const faces = windowHeading != null && !isDown(p) && facesWindow(p, windowHeading);
                return (
                  <li key={p.src}>
                    <button
                      type="button"
                      aria-pressed={p === shown}
                      className={faces ? 'wv-faces' : undefined}
                      onClick={() => choosePhoto(p)}
                      title={faces && unit ? fmt(v.facesWindows, { id: unit.id }) : undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.thumb} alt="" loading="lazy" width={160} height={90} />
                      <span>
                        {isDown(p) ? v.photoDown : `${pointOf(p.heading)} ${Math.round(p.heading)}°`}
                        {p.floor !== floor && <em>{fmt(v.photoFloor, { n: p.floor })}</em>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {unit && (
              <small className="wv-key">
                <i className="wv-faces-key" /> {fmt(v.facesWindows, { id: unit.id })}
              </small>
            )}
          </div>
        )}

        <div className="wv-notes">
          {tower !== 'B' && <p>{v.towerNote}</p>}
          <p>{inWindow ? v.windowNote : v.filled}</p>
          <p>{v.seasonNote}</p>
        </div>
      </aside>
    </div>
  );
}
