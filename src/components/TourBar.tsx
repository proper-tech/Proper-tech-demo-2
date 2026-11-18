'use client';

import { useI18n } from '@/i18n/I18nProvider';
import { SPOTS, type SpotDef, type SpotId, type Tour } from './three/Tour';

/** Controls of the 360° tour, over the 3D stage: eye-level viewpoints, back. */
export function TourBar({ tour, setTour, spots = SPOTS, label }: { tour: Tour; setTour: (t: Tour) => void; spots?: SpotDef[]; label?: string }) {
  const { t } = useI18n();
  const spotIndex = tour.kind === 'spot' ? spots.findIndex((s) => s.id === tour.id) : -1;
  const go = (i: number) => setTour({ kind: 'spot', id: spots[(i + spots.length) % spots.length].id });
  return (
    <div className="tour-bar">
      <div className="tour-modes" role="group" aria-label={t.tour.label}>
        <button type="button" aria-pressed={tour.kind === 'spot'} onClick={() => (tour.kind === 'spot' ? setTour({ kind: 'overview' }) : go(0))}>
          {tour.kind === 'spot' ? t.tour.exit : label ?? t.tour.street}
        </button>
      </div>
      {tour.kind === 'spot' && (
        <div className="tour-spots">
          <button type="button" className="tour-step" aria-label={t.tour.prev} onClick={() => go(spotIndex - 1)}>
            ‹
          </button>
          {spots.map((s) => (
            <button key={s.id} type="button" aria-pressed={s.id === tour.id} onClick={() => setTour({ kind: 'spot', id: s.id })}>
              {t.tour.spots[s.id as SpotId]}
            </button>
          ))}
          <button type="button" className="tour-step" aria-label={t.tour.next} onClick={() => go(spotIndex + 1)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}
