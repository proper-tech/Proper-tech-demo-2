'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { floors, towers } from '@/data/building';
import { layouts } from '@/data/layouts';
import { floorName, podiumFloors } from '@/data/podium';
import { ROOF_FLOOR } from '@/data/roof';
import type { BlockId } from '@/data/types';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import type { FloorKey } from './three/BuildingScene';
import type { Tour } from './three/Tour';
import { TourBar } from './TourBar';
import { SunPanel } from './SunPanel';
import { DEFAULT_SUN, type SunSettings } from './three/Sun';

const BuildingScene = dynamic(() => import('./three/BuildingScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

// Buttons are laid out like a lift panel: highest floor at the top, two per row.
const panelOrder = (a: number, b: number) => Math.floor((b - 1) / 2) - Math.floor((a - 1) / 2) || a - b;
/** The basement car park, floor 0 of the podium: every tab has a button for it, as the tower lifts
 *  go down to it too. */
const BASEMENT: FloorKey = { tower: 'A', floor: 0 };

export function FloorPicker({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const layer = useRef<HTMLDivElement>(null);
  const [tower, setTower] = useState<BlockId>('B');
  const [hovered, setHovered] = useState<FloorKey | null>(null);
  const [touched, setTouched] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [tour, setTour] = useState<Tour>({ kind: 'overview' });
  const [sun, setSun] = useState<SunSettings>(DEFAULT_SUN);
  // the 3D view stays under a loader until its models are in and drawn (see BuildingScene)
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  const panel = floors.filter((f) => f.tower === tower).sort((a, b) => panelOrder(a.floor, b.floor));
  const current = hovered && floors.find((f) => f.tower === hovered.tower && f.floor === hovered.floor);
  const types = current
    ? [...new Set(current.units.filter((u) => u.status === 'available').map((u) => layouts[u.layout].bedrooms))]
        .sort()
        .map((n) => t.beds[n as 1 | 2 | 3])
        .join(', ')
    : '';
  // the podium (block A): floors 1-3 and the roof playground, always open, nothing for sale
  const podiumPanel = podiumFloors.filter((f) => f.floor > 0).sort((a, b) => panelOrder(a.floor, b.floor));
  const podiumFloor = hovered?.tower === 'A' ? (hovered.floor as 0 | 1 | 2 | 3 | 4) : null;
  // the technical floor on a tower's roof, floor 17: always open, nothing for sale
  const roofTower = hovered && hovered.tower !== 'A' && hovered.floor === ROOF_FLOOR ? hovered.tower : null;
  const isHovered = (floor: number) => hovered?.tower === tower && hovered.floor === floor;
  const hover = (floor: number | null) => setHovered(floor === null ? null : { tower, floor });

  return (
    <div className="picker" id="floors">
      <div className="picker-side">
        {children}
        <div className="lift">
          <div className="segmented" role="group">
            {(['A', ...towers] as BlockId[]).map((id) => (
              <button key={id} type="button" aria-pressed={tower === id} onClick={() => setTower(id)}>
                {id === 'A' ? t.home.podiumTab : fmt(t.home.towerN, { t: id })}
              </button>
            ))}
          </div>
          <div className="lift-display" aria-live="polite">
            <span className="lift-number">{current ? current.floor : roofTower ? t.roof.button : podiumFloor !== null ? floorName(podiumFloor) : '–'}</span>
            <span className="lift-text">
              {podiumFloor === 0 ? (
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
                      {fmt(t.home.towerN, { t: current.tower })}, {fmt(t.home.forSaleN, { n: current.available })}
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
          <ol className="lift-buttons" aria-label={t.home.panelLabel}>
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
            {tower !== 'A' && (
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
                    href={`/${locale}/floors/${tower}/${f.floor}`}
                    className={isHovered(f.floor) ? 'is-hovered' : undefined}
                    aria-label={`${fmt(t.home.openFloor, { n: f.floor })}, ${fmt(t.home.forSaleN, { n: f.available })}`}
                    onMouseEnter={() => hover(f.floor)}
                    onMouseLeave={() => hover(null)}
                    onFocus={() => hover(f.floor)}
                    onBlur={() => hover(null)}
                  >
                    {f.floor}
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
          </ol>
        </div>
      </div>

      <div className="tower" onPointerDown={() => setTouched(true)}>
        <BuildingScene
          floors={floors}
          hovered={hovered}
          onHover={(key) => {
            setHovered(key);
            if (key) setTower(key.tower);
          }}
          onOpen={(key) => router.push(`/${locale}/floors/${key.tower}/${key.floor}`)}
          autoRotate={ready && !touched && !reducedMotion && hovered === null}
          layer={layer}
          tour={tour}
          sun={sun}
          onReady={onReady}
          onProgress={setProgress}
        />
        <div className={`label-layer${tour.kind === 'spot' ? ' is-hidden' : ''}`} ref={layer}>
          {(['A', ...towers] as BlockId[]).map((id) => (
            <div key={id} className={`tower-tag${tower === id ? ' is-selected' : ''}`} data-anchor={`tower:${id}`}>
              {fmt(t.home.towerN, { t: id })}
            </div>
          ))}
        </div>
        <TourBar tour={tour} setTour={setTour} />
        <SunPanel setSun={setSun} />
        <div className={`stage-loader${ready ? ' is-done' : ''}`} role="status" aria-live="polite" aria-hidden={ready}>
          <div className="stage-loader-box">
            <span className="stage-loader-spinner" aria-hidden="true" />
            <p>{t.home.loading3d}</p>
            <div className="stage-loader-bar" aria-hidden="true">
              <span style={{ width: `${ready ? 100 : Math.min(96, Math.round(progress * 0.9 + 4))}%` }} />
            </div>
          </div>
        </div>
        <p className="stage-hint">{tour.kind === 'spot' ? t.tour.lookHint : t.home.towerHint}</p>
      </div>
    </div>
  );
}
