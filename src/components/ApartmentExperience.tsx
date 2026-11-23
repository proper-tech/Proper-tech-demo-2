'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { availableUnits } from '@/data/building';
import { defaultFinish, finishKeys, finishOptions } from '@/data/finishes';
import { layouts } from '@/data/layouts';
import type { Finish, Unit } from '@/data/types';
import { fmt, roomName } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import { doorLinks, hasParts, layoutArea, listedRooms, m, roomArea } from '@/lib/geometry';
import { ApartmentPlan } from './Plan2D';
import { fitTourFrame } from './tourFrame';
import type { RoomLabel } from './three/ApartmentScene';
import { tourStops } from '@/data/tourStops';
import { sceneYaw, stopLocal, tourView, type Flight } from './three/flight';
import type { PerspectiveCamera } from 'three';

/** What the tour page offers its parent (interior/tools/add_tour_bridge.py). */
interface TourBridge {
  go: (room: string, yaw?: number, pitch?: number, fov?: number) => void;
  state: () => { room: string; yaw: number; pitch: number; fov: number };
  heading: (room: string) => number;
  shown: ((room: string, quality: number) => void) | null;
}
const bridgeOf = (frame: HTMLIFrameElement | null) =>
  ((frame?.contentWindow as (Window & { sebotseTour?: TourBridge }) | null)?.sebotseTour ?? null);

const ApartmentScene = dynamic(() => import('./three/ApartmentScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

type Mode = 'model' | 'plan' | 'tour';

/**
 * Plans with a rendered 360° tour in public/tour/<plan>/index.html (self-contained files); these replace the 3D tour.
 * Keyed by plan letter, so A4 (plan A on floor 4) opens plan A's tour.
 */
const PHOTO_TOURS: string[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export function ApartmentExperience({ unit }: { unit: Unit }) {
  const { locale, t } = useI18n();
  const layout = layouts[unit.layout];
  const [mode, setMode] = useState<Mode>('model');
  const [roomId, setRoomId] = useState('living');
  const [finish, setFinish] = useState<Finish>(defaultFinish);

  // Links such as /apartments/1203?view=tour open straight into the 360° tour.
  useEffect(() => {
    const view = new URLSearchParams(window.location.search).get('view');
    if (view === 'tour' || view === 'plan') setMode(view);
  }, []);

  const rooms = useMemo(() => listedRooms(layout), [layout]);
  const labels = useMemo(() => {
    const out: Record<string, RoomLabel> = {};
    for (const r of rooms) out[r.id] = { name: roomName(t, r), area: `${m(roomArea(r, layout))} m²` };
    return out;
  }, [layout, rooms, t]);
  // A click on a rectangle that is part of a bigger room selects that room.
  const selectRoom = (id: string) => setRoomId(layout.rooms.find((r) => r.id === id)?.partOf ?? id);
  const names = useMemo(() => Object.fromEntries(Object.entries(labels).map(([id, l]) => [id, l.name])), [labels]);

  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const layer = useRef<HTMLDivElement>(null);
  const doors = useMemo(() => doorLinks(layout, room.id), [layout, room.id]);
  const index = availableUnits.findIndex((u) => u.id === unit.id);
  const prev = availableUnits[(index - 1 + availableUnits.length) % availableUnits.length];
  const next = availableUnits[(index + 1) % availableUnits.length];
  const suffix = mode === 'tour' ? '?view=tour' : '';
  // Plan D has a rendered 360° tour (public/tour, a self-contained file); it replaces the 3D tour.
  const hasPhotoTour = PHOTO_TOURS.includes(layout.plan) && Boolean(tourStops[layout.plan]);
  const photoTour = mode === 'tour' && PHOTO_TOURS.includes(layout.plan);

  // ---- flights between the 3D model and the 360° tour
  // The tour waits in its (hidden) frame from the first moment the visitor shows interest, so a flight in never waits.
  const frame = useRef<HTMLIFrameElement>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const [frameWanted, setFrameWanted] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [tourShown, setTourShown] = useState(false);
  const shownStop = useRef<string | null>(null);
  const wantedStop = useRef<string | null>(null);
  const progress = useRef(0);
  const nextId = useRef(1);
  useEffect(() => {
    if (!hasPhotoTour) return;
    const id = window.setTimeout(() => setFrameWanted(true), 2500);
    return () => window.clearTimeout(id);
  }, [hasPhotoTour]);
  const hookBridge = useCallback(() => {
    const bridge = bridgeOf(frame.current);
    if (!bridge) return;
    bridge.shown = (stop) => {
      shownStop.current = stop;
      if (stop === wantedStop.current && progress.current >= 0.6) setTourShown(true);
    };
  }, []);
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Fly into a room and fade its 360° picture in at the same place and heading. */
  const dive = (id: string) => {
    const roomKey = layout.rooms.find((r) => r.id === id)?.partOf ?? id;
    setRoomId(roomKey);
    const stops = tourStops[layout.plan];
    const stop = stops?.rooms[roomKey] ?? 'living';
    const bridge = bridgeOf(frame.current);
    const camera = cameraRef.current;
    if (!stops || !bridge || !camera || reduced() || mode !== 'model') {
      setFrameWanted(true);
      // already in the tour (or no motion wanted): just change room, the tour fades by itself
      if (bridge && bridge.state().room !== stop) bridge.go(stop);
      setMode('tour');
      return;
    }
    const eye = stopLocal(layout, stops.stops[stop]);
    // land facing the room's best view (the heading the tour opens it with); the flight comes in from behind it
    const heading = bridge.heading(stop);
    const yaw = sceneYaw(heading);
    const view = tourView(stop);
    wantedStop.current = stop;
    shownStop.current = null;
    progress.current = 0;
    setTourShown(false);
    bridge.go(stop, heading, view.pitch, view.fov);
    setFlight({ id: nextId.current++, dir: 'in', eye, yaw, pitch: view.pitch, fov: view.fov });
  };

  /** Leave the tour: fly back out from where the tour was left. */
  const surface = (to: Mode) => {
    const bridge = bridgeOf(frame.current);
    const stops = tourStops[layout.plan];
    if (to !== 'model' || !bridge || !stops || reduced()) {
      setMode(to);
      return;
    }
    const state = bridge.state();
    const at = stops.stops[state.room] ?? stops.stops.living;
    progress.current = 0;
    setTourShown(false);
    setFlight({ id: nextId.current++, dir: 'out', eye: stopLocal(layout, at), yaw: sceneYaw(state.yaw), pitch: state.pitch, fov: state.fov });
  };

  const onFlight = useCallback(
    (id: number, p: number) => {
      progress.current = p;
      if (!flight || id !== flight.id) return;
      if (flight.dir === 'in') {
        if (p >= 0.6 && shownStop.current === wantedStop.current) setTourShown(true);
        if (p >= 1 && shownStop.current === wantedStop.current) {
          setMode('tour');
          setFlight(null);
        }
      } else if (p >= 1) {
        setMode('model');
        setFlight(null);
      }
    },
    [flight],
  );
  // a flight in that landed before the picture was ready finishes when it is
  useEffect(() => {
    if (flight?.dir === 'in' && tourShown && progress.current >= 1) {
      setMode('tour');
      setFlight(null);
    }
  }, [flight, tourShown]);

  const pickMode = (id: Mode) => {
    if (id === mode || flight) return;
    if (id === 'tour' && hasPhotoTour && mode === 'model') return dive(room.id);
    if (mode === 'tour' && hasPhotoTour) return surface(id);
    setMode(id);
  };
  const frameVisible = (photoTour && !flight) || (flight?.dir === 'in' && tourShown);
  const modes: [Mode, string][] = [
    ['model', t.apt.modeModel],
    ['plan', t.apt.modePlan],
    ['tour', t.apt.modeTour],
  ];

  return (
    <div className="apt">
      <section className="apt-stage" onPointerEnter={() => hasPhotoTour && setFrameWanted(true)}>
        {/* The canvas stays mounted while the 2D plan is shown, so switching back is instant. */}
        <div className={mode === 'plan' || (photoTour && !flight) ? 'stage-canvas is-hidden' : flight ? 'stage-canvas is-flying' : 'stage-canvas'}>
          <ApartmentScene
            layout={layout}
            finish={finish}
            mode={mode === 'tour' ? 'tour' : 'model'}
            roomId={room.id}
            layer={layer}
            onSelectRoom={hasPhotoTour ? dive : selectRoom}
            flight={flight}
            onFlight={onFlight}
            cameraRef={cameraRef}
          />
          <div className="label-layer" ref={layer}>
            {mode === 'tour'
              ? doors.map((door) => (
                  <button key={door.to.id} type="button" className="hotspot" data-anchor={`door:${door.to.id}`} onClick={() => setRoomId(door.to.id)}>
                    {labels[door.to.id].name}
                  </button>
                ))
              : rooms.map((r) => (
                  <div key={r.id} className={`room-tag${r.id === room.id ? ' is-selected' : ''}`} data-anchor={`room:${r.id}`}>
                    <b>{labels[r.id].name}</b>
                    <span>{labels[r.id].area}</span>
                  </div>
                ))}
          </div>
        </div>
        {hasPhotoTour && (frameWanted || photoTour || flight) && (
          <iframe
            ref={frame}
            className={`apt-tour-frame${frameVisible ? ' is-shown' : ' is-waiting'}${flight?.dir === 'in' ? ' is-stepping-in' : ''}`}
            // tower and floor pick the drone's real view through the windows (public/views/manifest.json)
            src={`/tour/${layout.plan}/index.html?tower=${unit.tower}&floor=${unit.floor}`}
            title={t.apt.modeTour}
            allow="fullscreen"
            aria-hidden={!frameVisible}
            tabIndex={frameVisible ? 0 : -1}
            onLoad={(e) => {
              fitTourFrame(e.currentTarget);
              hookBridge();
            }}
          />
        )}
        {mode === 'plan' && (
          <div className="apt-plan">
            <ApartmentPlan layout={layout} names={names} showSizes selected={room.id} onSelect={selectRoom} />
          </div>
        )}

        <div className={photoTour ? 'apt-head is-over-photo' : 'apt-head'}>
          <Link className="back" href={`/${locale}/floors/${unit.tower}/${unit.floor}`}>
            {fmt(t.apt.backToFloor, { t: unit.tower, n: unit.floor })}
          </Link>
          <h1>{fmt(t.apt.title, { id: unit.id })}</h1>
          <p>
            {fmt(t.apt.planN, { p: unit.plan })}, {t.beds[layout.bedrooms as 1 | 2 | 3]}
            {layout.bathrooms > 1 ? `, ${t.baths[2]}` : ''}, {m(layoutArea(layout))} m²
            <span className={`status status-${unit.status}`}>{t.status[unit.status]}</span>
          </p>
          <div className="segmented" role="group">
            {modes.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => pickMode(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'tour' && !photoTour && (
          <div className="tour-bar">
            <p className="tour-room">
              <b>{labels[room.id].name}</b>
              {hasParts(layout, room) ? '' : `${m(room.w)} × ${m(room.d)} m, `}
              {labels[room.id].area}, {t.apt.colCeiling.toLowerCase()} {m(room.h)} m
            </p>
            <div className="tour-rooms">
              {rooms.map((r) => (
                <button key={r.id} type="button" aria-pressed={r.id === room.id} onClick={() => setRoomId(r.id)}>
                  {labels[r.id].name}
                </button>
              ))}
            </div>
          </div>
        )}
        {mode !== 'plan' && !photoTour && !flight && (
          <p className="stage-hint">{mode === 'tour' ? t.apt.hintTour : hasPhotoTour ? t.apt.hintModelDive : t.apt.hintModel}</p>
        )}
      </section>

      <aside className="apt-panel">
        <section>
          <h2>{t.apt.tabRooms}</h2>
          <table className="rooms">
            <thead>
              <tr>
                <th>{t.apt.colRoom}</th>
                <th>{t.apt.colSize}</th>
                <th>{t.apt.colArea}</th>
                <th>{t.apt.colCeiling}</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className={r.id === room.id ? 'is-selected' : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      aria-pressed={r.id === room.id}
                      onClick={() => (mode === 'tour' && hasPhotoTour && !flight ? dive(r.id) : setRoomId(r.id))}
                    >
                      {labels[r.id].name}
                    </button>
                  </th>
                  <td>{hasParts(layout, r) ? '' : `${m(r.w)} × ${m(r.d)} m`}</td>
                  <td>{m(roomArea(r, layout))} m²</td>
                  <td>{m(r.h)} m</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t.apt.total}</th>
                <td />
                <td>{m(layoutArea(layout))} m²</td>
                <td />
              </tr>
            </tfoot>
          </table>
          {mode !== 'tour' && (
            <button type="button" className="button" onClick={() => pickMode('tour')}>
              {fmt(t.apt.openTour, { room: labels[room.id].name })}
            </button>
          )}
        </section>

        <section hidden={photoTour}>
          <h2>{t.apt.tabFinishes}</h2>
          {finishKeys.map((key) => {
            const current = finishOptions[key].find((o) => o.color === finish[key]);
            return (
              <fieldset key={key} className="swatches">
                <legend>
                  {t.apt.finish[key]}
                  <span>{current ? t.apt.swatch[current.id as keyof typeof t.apt.swatch] : ''}</span>
                </legend>
                {finishOptions[key].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="swatch"
                    style={{ background: o.color }}
                    aria-pressed={finish[key] === o.color}
                    aria-label={t.apt.swatch[o.id as keyof typeof t.apt.swatch]}
                    title={t.apt.swatch[o.id as keyof typeof t.apt.swatch]}
                    onClick={() => setFinish((f) => ({ ...f, [key]: o.color }))}
                  />
                ))}
              </fieldset>
            );
          })}
          <button type="button" className="text-button" onClick={() => setFinish(defaultFinish)}>
            {t.apt.reset}
          </button>
        </section>

        {availableUnits.length > 1 && (
          <nav className="apt-nav">
            <Link href={`/${locale}/apartments/${prev.id}${suffix}`}>
              <span>{t.apt.prevApt}</span>
              {prev.id}
            </Link>
            <Link href={`/${locale}/apartments/${next.id}${suffix}`}>
              <span>{t.apt.nextApt}</span>
              {next.id}
            </Link>
          </nav>
        )}
      </aside>
    </div>
  );
}

/**
 * The tour file has its own back button (to a building view of its own) and apartment heading;
 * on this page the heading and the mode switch already cover those, so hide them and move the
 * tour's room title and colour panel below this page's heading. Same origin, so this is allowed.
 */
