'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { clock, siteNow, sunPosition, sunTimes } from '@/lib/solar';
import type { SunSettings } from './three/sunSettings';

/** Compass point (N, NE, E, ...) nearest to a direction in degrees. */
const compass = (deg: number, points: readonly string[]) => points[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

type Mode = 'time' | 'manual';

/** Solstices and equinoxes, as month-day, for the season buttons. Spring and autumn use 22 March
 *  and 22 September, the days of the architect's sun study (Uran Project, sheet 11). */
const SEASONS = [
  ['winter', '12-21'],
  ['spring', '03-22'],
  ['summer', '06-21'],
  ['autumn', '09-22'],
] as const;

/** Clock times of the architect's sun study (sheet 11, БНбД 23-04-07 §3.2). */
const STUDY_TIMES = [9 * 60, 12 * 60, 15 * 60, 17 * 60, 21 * 60];

/** A full day plays in this many seconds. */
const DAY_SECONDS = 16;

/** Opening view: today in Ulaanbaatar at 14:00, when the towers' shadows read well. */
const START = { date: '2026-06-21', minutes: 14 * 60 };

/**
 * Sun and brightness controls over the 3D stage. "By time" puts the sun where it really is over
 * the site for a date and clock time (with sunrise, sunset and a play button that runs through
 * the day); "Manual" sets its direction and height directly.
 */
export function SunPanel({ setSun }: { setSun: (s: SunSettings) => void }) {
  const { t } = useI18n();
  const s = t.sun;
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>('time');
  const [date, setDate] = useState(START.date);
  const [minutes, setMinutes] = useState(START.minutes);
  const [manual, setManual] = useState({ azimuth: 140, elevation: 38 });
  const [brightness, setBrightness] = useState(1);
  const [playing, setPlaying] = useState(false);

  // today's date once in the browser (the server render can't know it)
  useEffect(() => {
    setDate(siteNow().date);
  }, []);

  const times = useMemo(() => sunTimes(date), [date]);
  const pos = useMemo(() => sunPosition(date, minutes), [date, minutes]);
  const azimuth = mode === 'time' ? pos.azimuth : manual.azimuth;
  const elevation = mode === 'time' ? pos.elevation : manual.elevation;

  // how far through the day: by the clock between sunrise and sunset, or (manual) by the
  // direction from east (90°) round through south to west (270°)
  const dayFraction =
    mode === 'time'
      ? times.rise !== null && times.set !== null
        ? (minutes - times.rise) / (times.set - times.rise)
        : 0.5
      : Math.min(1, Math.max(0, (manual.azimuth - 90) / 180));

  // Hand the sun to the 3D scene, skipping repeats: while playing, each frame sends it from the
  // animation loop below, so the effect has nothing new to send and doesn't set state again
  // (setting state from an effect on every frame trips React's update-loop guard).
  const sent = useRef<SunSettings | null>(null);
  const send = useCallback(
    (next: SunSettings) => {
      const prev = sent.current;
      if (
        prev &&
        prev.azimuth === next.azimuth &&
        prev.elevation === next.elevation &&
        prev.brightness === next.brightness &&
        prev.dayFraction === next.dayFraction
      )
        return;
      sent.current = next;
      setSun(next);
    },
    [setSun],
  );

  useEffect(() => {
    send({ azimuth, elevation, brightness, dayFraction });
  }, [azimuth, elevation, brightness, dayFraction, send]);

  // play: run the clock from sunrise (or where it is now) to sunset, then stop
  const minutesNow = useRef(minutes);
  minutesNow.current = minutes;
  useEffect(() => {
    if (!playing || mode !== 'time') return;
    const rise = times.rise ?? 0;
    const set = times.set ?? 1440;
    let frame = 0;
    let m = minutesNow.current < rise || minutesNow.current >= set ? rise : minutesNow.current;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      m = Math.min(set, m + ((set - rise) / DAY_SECONDS) * dt);
      const p = sunPosition(date, m);
      send({ azimuth: p.azimuth, elevation: p.elevation, brightness, dayFraction: (m - rise) / (set - rise) });
      setMinutes(m);
      if (m >= set) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, mode, times, date, brightness, send]);

  const now = () => {
    const n = siteNow();
    setMode('time');
    setDate(n.date);
    setMinutes(n.minutes);
  };

  const reset = () => {
    setPlaying(false);
    setMode('time');
    setDate(siteNow().date);
    setMinutes(START.minutes);
    setManual({ azimuth: 140, elevation: 38 });
    setBrightness(1);
  };

  const year = date.slice(0, 4);
  const below = elevation < 0;

  return (
    <div className="sun-panel">
      <button type="button" className="sun-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">☀</span> {s.label}
      </button>
      {open && (
        <div className="sun-controls">
          <div className="sun-modes" role="group">
            <button type="button" aria-pressed={mode === 'time'} onClick={() => setMode('time')}>
              {s.byTime}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'manual'}
              onClick={() => {
                setPlaying(false);
                setManual({ azimuth: Math.round(azimuth / 5) * 5 % 360, elevation: Math.max(5, Math.round(elevation)) });
                setMode('manual');
              }}
            >
              {s.manual}
            </button>
          </div>

          {mode === 'time' ? (
            <>
              <div className="sun-seasons" role="group" aria-label={s.date}>
                {SEASONS.map(([key, md]) => (
                  <button key={key} type="button" aria-pressed={date === `${year}-${md}`} onClick={() => setDate(`${year}-${md}`)}>
                    {s.seasons[key]}
                  </button>
                ))}
              </div>
              <label className="sun-date">
                <span>{s.date}</span>
                <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </label>
              <label>
                <span>
                  {s.time} <b>{clock(minutes)}</b>
                </span>
                <span className="sun-time-row">
                  <button
                    type="button"
                    className="sun-play"
                    aria-label={playing ? s.pause : s.play}
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? '❚❚' : '▶'}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1439}
                    step={5}
                    value={Math.round(minutes)}
                    onChange={(e) => {
                      setPlaying(false);
                      setMinutes(+e.target.value);
                    }}
                  />
                </span>
              </label>
              <div className="sun-study" role="group" aria-label={s.study}>
                {STUDY_TIMES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={Math.round(minutes) === m}
                    onClick={() => {
                      setPlaying(false);
                      setMinutes(m);
                    }}
                  >
                    {clock(m)}
                  </button>
                ))}
              </div>
              <p className="sun-facts">
                <span>
                  ↑ {s.sunrise} <b>{times.rise === null ? '—' : clock(times.rise)}</b>
                </span>
                <span>
                  ↓ {s.sunset} <b>{times.set === null ? '—' : clock(times.set)}</b>
                </span>
              </p>
              <p className="sun-facts">
                <span>
                  {s.direction} <b>{compass(azimuth, s.points)} · {Math.round(azimuth)}°</b>
                </span>
                <span>
                  {s.height} <b>{below ? s.night : `${Math.round(elevation)}°`}</b>
                </span>
              </p>
            </>
          ) : (
            <>
              <label>
                <span>
                  {s.direction} <b>{compass(manual.azimuth, s.points)} · {manual.azimuth}°</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={355}
                  step={5}
                  value={manual.azimuth}
                  onChange={(e) => setManual({ ...manual, azimuth: +e.target.value })}
                />
              </label>
              <label>
                <span>
                  {s.height} <b>{manual.elevation}°</b>
                </span>
                <input
                  type="range"
                  min={5}
                  max={85}
                  step={1}
                  value={manual.elevation}
                  onChange={(e) => setManual({ ...manual, elevation: +e.target.value })}
                />
              </label>
            </>
          )}

          <label>
            <span>
              {s.brightness} <b>{Math.round(brightness * 100)}%</b>
            </span>
            <input type="range" min={0.4} max={1.8} step={0.05} value={brightness} onChange={(e) => setBrightness(+e.target.value)} />
          </label>
          <div className="sun-actions">
            <button type="button" onClick={now}>
              {s.now}
            </button>
            <button type="button" onClick={reset}>
              {s.reset}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
