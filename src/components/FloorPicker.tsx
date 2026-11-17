'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { floors, towers } from '@/data/building';
import { layouts } from '@/data/layouts';
import type { TowerId } from '@/data/types';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';
import type { FloorKey } from './three/BuildingScene';

const BuildingScene = dynamic(() => import('./three/BuildingScene'), {
  ssr: false,
  loading: () => <div className="stage-loading" />,
});

// Buttons are laid out like a lift panel: highest floor at the top, two per row.
const panelOrder = (a: number, b: number) => Math.floor((b - 1) / 2) - Math.floor((a - 1) / 2) || a - b;

export function FloorPicker({ children }: { children: ReactNode }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const layer = useRef<HTMLDivElement>(null);
  const [tower, setTower] = useState<TowerId>(towers[0]);
  const [hovered, setHovered] = useState<FloorKey | null>(null);
  const [touched, setTouched] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

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
  const isHovered = (floor: number) => hovered?.tower === tower && hovered.floor === floor;
  const hover = (floor: number | null) => setHovered(floor === null ? null : { tower, floor });

  return (
    <div className="picker" id="floors">
      <div className="picker-side">
        {children}
        <div className="lift">
          <div className="segmented" role="group">
            {towers.map((id) => (
              <button key={id} type="button" aria-pressed={tower === id} onClick={() => setTower(id)}>
                {fmt(t.home.towerN, { t: id })}
              </button>
            ))}
          </div>
          <div className="lift-display" aria-live="polite">
            <span className="lift-number">{current ? current.floor : '–'}</span>
            <span className="lift-text">
              {current ? (
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
          autoRotate={!touched && !reducedMotion && hovered === null}
          layer={layer}
        />
        <div className="label-layer" ref={layer}>
          {towers.map((id) => (
            <div key={id} className={`tower-tag${tower === id ? ' is-selected' : ''}`} data-anchor={`tower:${id}`}>
              {fmt(t.home.towerN, { t: id })}
            </div>
          ))}
        </div>
        <p className="stage-hint">{t.home.towerHint}</p>
      </div>
    </div>
  );
}
