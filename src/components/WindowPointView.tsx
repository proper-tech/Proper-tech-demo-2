'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Unit } from '@/data/types';
import { PHOTO_SEASON, SEASONS, type Season } from '@/data/views';
import { windowTaken, windowView } from '@/data/windowViews';
import type { WindowPoint } from '@/data/windowPoints';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

const fmtWhen = (taken: string | null) => (taken ? taken.slice(0, 16).replace('T', ' ').replaceAll('-', '.') : '');

/**
 * A window point's view, opened from the floor plan: the window view for the apartment's floor and the way those
 * windows face (public/views/window), with its season switch, and a link on to the window-view page. A modal
 * dialog, so the page behind waits and Esc closes it; a click on the dimmed page behind closes it too.
 */
export function WindowPointView({ unit, point, onClose }: { unit: Unit; point: WindowPoint; onClose: () => void }) {
  const { locale, t } = useI18n();
  const v = t.views;
  const [season, setSeason] = useState<Season>(PHOTO_SEASON);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const win = windowView(point.facing, unit.floor);
  const src = win ? (win.seasons[season] ?? win.seasons[PHOTO_SEASON] ?? null) : null;
  useEffect(() => setLoaded(false), [src]);
  const dir = t.floor.looking[point.facing];
  // the same room name twice (two bedrooms) once
  const rooms = [...new Set(point.rooms.map((r) => t.rooms[r.type]))].join(', ');
  const when = win ? fmtWhen(windowTaken(win)) : '';
  // metres an estimated view was moved from its photograph to this floor's eye level (positive: raised)
  const lift = win?.kind === 'derived' && win.from != null ? win.height - (windowView(point.facing, win.from)?.height ?? win.height) : 0;
  const title = fmt(t.floor.windowTitle, { id: unit.id, dir });

  return (
    <dialog
      ref={dialog}
      className="wp-dialog"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && dialog.current.close()}
    >
      <div className="wp-body">
        <div className="wp-head">
          <h2>{title}</h2>
          <button type="button" className="wp-close" onClick={() => dialog.current?.close()} aria-label={t.floor.close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className={loaded ? 'wp-picture is-loaded' : 'wp-picture'}>
          {src && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={fmt(v.windowAlt, { id: unit.id, n: unit.floor, dir })} onLoad={() => setLoaded(true)} draggable={false} />
          )}
        </div>
        <p className="wp-rooms">{fmt(t.floor.windowRooms, { rooms })}</p>
        <div className="wv-seg wv-seasons wp-seasons" role="group" aria-label={v.season}>
          {SEASONS.map((se) => (
            <button key={se} type="button" aria-pressed={se === season} onClick={() => setSeason(se)}>
              {v.seasons[se]}
            </button>
          ))}
        </div>
        {win && (
          <p className="wp-note">
            {season !== PHOTO_SEASON ? fmt(v.seasonAi, { season: v.seasons[season], when }) : fmt(v.taken, { when })}
            {win.kind === 'derived' && win.from != null && (
              <> {fmt(lift >= 0 ? v.derivedRaised : v.derivedLowered, { n: unit.floor, m: win.from, d: Math.abs(lift).toFixed(0) })}</>
            )}
          </p>
        )}
        <Link className="wp-more" href={`/${locale}/views?tower=${unit.tower}&floor=${unit.floor}&apt=${unit.pos}`}>
          {t.floor.windowMore}
        </Link>
      </div>
    </dialog>
  );
}
