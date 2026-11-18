'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { RoomLabel } from './three/ApartmentScene';

const ApartmentScene = dynamic(() => import('./three/ApartmentScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

type Mode = 'model' | 'plan' | 'tour';

export function ApartmentExperience({ unit }: { unit: Unit }) {
  const { locale, t } = useI18n();
  const layout = layouts[unit.layout];
  const [mode, setMode] = useState<Mode>('model');
  const [roomId, setRoomId] = useState('living');
  // Rendered photo tour (only some layouts have one): the stop being viewed, or null for the
  // 3D model's own room view (rooms without a photo, such as the balcony).
  const stops = layout.photoTour;
  const [stopId, setStopId] = useState<string | null>(stops ? 'living' : null);
  const stop = stops?.find((s) => s.id === stopId) ?? null;
  const goStop = (id: string) => {
    const s = stops?.find((x) => x.id === id);
    if (!s) return;
    setStopId(s.id);
    setRoomId(s.room);
  };
  /** Picking a room: go to its first photo stop when it has one. */
  const pickRoom = (id: string) => {
    const owner = layout.rooms.find((r) => r.id === id)?.partOf ?? id;
    setRoomId(owner);
    if (stops) setStopId(stops.find((s) => s.room === owner)?.id ?? null);
  };
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
  const selectRoom = pickRoom;
  const names = useMemo(() => Object.fromEntries(Object.entries(labels).map(([id, l]) => [id, l.name])), [labels]);

  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const layer = useRef<HTMLDivElement>(null);
  const doors = useMemo(() => doorLinks(layout, room.id), [layout, room.id]);
  const index = availableUnits.findIndex((u) => u.id === unit.id);
  const prev = availableUnits[(index - 1 + availableUnits.length) % availableUnits.length];
  const next = availableUnits[(index + 1) % availableUnits.length];
  const suffix = mode === 'tour' ? '?view=tour' : '';
  const modes: [Mode, string][] = [
    ['model', t.apt.modeModel],
    ['plan', t.apt.modePlan],
    ['tour', t.apt.modeTour],
  ];

  return (
    <div className="apt">
      <section className="apt-stage">
        {/* The canvas stays mounted while the 2D plan is shown, so switching back is instant. */}
        <div className={mode === 'plan' ? 'stage-canvas is-hidden' : 'stage-canvas'}>
          <ApartmentScene
            layout={layout}
            finish={finish}
            mode={mode === 'tour' ? 'tour' : 'model'}
            roomId={room.id}
            layer={layer}
            onSelectRoom={selectRoom}
            stop={stop}
          />
          <div className="label-layer" ref={layer}>
            {mode === 'tour' && stop
              ? stop.links.map((l) => {
                  const to = stops!.find((x) => x.id === l.to)!;
                  return (
                    <button key={l.to} type="button" className="hotspot" data-anchor={`stop:${l.to}`} onClick={() => goStop(l.to)}>
                      {roomName(t, { ...to, id: to.id, x: 0, z: 0, w: 0, d: 0, h: 0 })}
                    </button>
                  );
                })
              : mode === 'tour'
              ? doors.map((door) => (
                  <button key={door.to.id} type="button" className="hotspot" data-anchor={`door:${door.to.id}`} onClick={() => pickRoom(door.to.id)}>
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
        {mode === 'plan' && (
          <div className="apt-plan">
            <ApartmentPlan layout={layout} names={names} showSizes selected={room.id} onSelect={selectRoom} />
          </div>
        )}

        <div className="apt-head">
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
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'tour' && (
          <div className="tour-bar">
            <p className="tour-room">
              <b>{labels[room.id].name}</b>
              {hasParts(layout, room) ? '' : `${m(room.w)} × ${m(room.d)} m, `}
              {labels[room.id].area}, {t.apt.colCeiling.toLowerCase()} {m(room.h)} m
            </p>
            <div className="tour-rooms">
              {stops
                ? [
                    ...stops.map((s) => (
                      <button key={s.id} type="button" aria-pressed={s.id === stopId} onClick={() => goStop(s.id)}>
                        {roomName(t, { ...s, x: 0, z: 0, w: 0, d: 0, h: 0 })}
                      </button>
                    )),
                    // rooms without a photo stay reachable in the 3D view
                    ...rooms
                      .filter((r) => !stops.some((s) => s.room === r.id))
                      .map((r) => (
                        <button key={r.id} type="button" aria-pressed={!stop && r.id === room.id} onClick={() => pickRoom(r.id)}>
                          {labels[r.id].name}
                        </button>
                      )),
                  ]
                : rooms.map((r) => (
                    <button key={r.id} type="button" aria-pressed={r.id === room.id} onClick={() => setRoomId(r.id)}>
                      {labels[r.id].name}
                    </button>
                  ))}
            </div>
          </div>
        )}
        {mode !== 'plan' && (
          <p className="stage-hint">
            {mode === 'tour' ? t.apt.hintTour : t.apt.hintModel}
            {mode === 'tour' && stop && <span className="tour-note">{t.apt.photoNote}</span>}
          </p>
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
                    <button type="button" aria-pressed={r.id === room.id} onClick={() => pickRoom(r.id)}>
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
            <button type="button" className="button" onClick={() => setMode('tour')}>
              {fmt(t.apt.openTour, { room: labels[room.id].name })}
            </button>
          )}
        </section>

        <section>
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
