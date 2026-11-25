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
import { hasParts, layoutArea, listedRooms, m, roomArea } from '@/lib/geometry';
import { ApartmentPlan } from './Plan2D';
import { UnitActions } from './UnitActions';
import { fitTourFrame } from './tourFrame';
import type { RoomLabel } from './three/ApartmentScene';

const ApartmentScene = dynamic(() => import('./three/ApartmentScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

/** The 360° tour is the rendered one in public/tour/<plan>/index.html (a self-contained file per plan, A to F),
 *  keyed by plan letter, so A4 (plan A on floor 4) opens plan A's tour. */
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
  // ...and the address bar follows the view, so a shared link opens where the buyer was looking
  const pick = (next: Mode) => {
    setMode(next);
    const url = new URL(location.href);
    if (next === 'model') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    history.replaceState(history.state, '', url);
  };

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
  const index = availableUnits.findIndex((u) => u.id === unit.id);
  const prev = availableUnits[(index - 1 + availableUnits.length) % availableUnits.length];
  const next = availableUnits[(index + 1) % availableUnits.length];
  const suffix = mode === 'tour' ? '?view=tour' : '';
  const photoTour = mode === 'tour';
  const modes: [Mode, string][] = [
    ['model', t.apt.modeModel],
    ['plan', t.apt.modePlan],
    ['tour', t.apt.modeTour],
  ];

  return (
    <div className="apt">
      <section className="apt-stage">
        {/* The canvas stays mounted while the 2D plan is shown, so switching back is instant. */}
        <div className={mode === 'model' ? 'stage-canvas' : 'stage-canvas is-hidden'}>
          <ApartmentScene layout={layout} finish={finish} roomId={room.id} layer={layer} onSelectRoom={selectRoom} />
          <div className="label-layer" ref={layer}>
            {rooms.map((r) => (
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
            // tower and floor pick the drone's real view through the windows (public/views/manifest.json)
            src={`/tour/${layout.plan}/index.html?tower=${unit.tower}&floor=${unit.floor}`}
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
              <button key={id} type="button" aria-pressed={mode === id} onClick={() => pick(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'model' && <p className="stage-hint">{t.apt.hintModel}</p>}
      </section>

      <aside className="apt-panel">
        <UnitActions subject={fmt(t.apt.title, { id: unit.id })} />
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
            <button type="button" className="button" onClick={() => pick('tour')}>
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
