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
  const photoTour = mode === 'tour' && layout.id === 'D';
  const modes: [Mode, string][] = [
    ['model', t.apt.modeModel],
    ['plan', t.apt.modePlan],
    ['tour', t.apt.modeTour],
  ];

  return (
    <div className="apt">
      <section className="apt-stage">
        {/* The canvas stays mounted while the 2D plan is shown, so switching back is instant. */}
        <div className={mode === 'plan' || photoTour ? 'stage-canvas is-hidden' : 'stage-canvas'}>
          <ApartmentScene
            layout={layout}
            finish={finish}
            mode={mode === 'tour' ? 'tour' : 'model'}
            roomId={room.id}
            layer={layer}
            onSelectRoom={selectRoom}
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
        {photoTour && (
          <iframe
            className="apt-tour-frame"
            src="/tour/index.html"
            title={t.apt.modeTour}
            allow="fullscreen"
            onLoad={(e) => fitTourFrame(e.currentTarget)}
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
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
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
        {mode !== 'plan' && !photoTour && <p className="stage-hint">{mode === 'tour' ? t.apt.hintTour : t.apt.hintModel}</p>}
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
                    <button type="button" aria-pressed={r.id === room.id} onClick={() => setRoomId(r.id)}>
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
function fitTourFrame(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc || doc.getElementById('apt-embed-style')) return;
  const style = doc.createElement('style');
  style.id = 'apt-embed-style';
  style.textContent = `
    #panoBack, .tour-heading { display: none !important; }
    .tour-header { justify-content: flex-end; }
    .tour-intro { top: 224px !important; }
    #tourDesignPanel { top: 310px !important; max-height: calc(100dvh - 480px) !important; }
  `;
  doc.head.appendChild(style);
}
