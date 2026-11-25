import { layouts } from '@/data/layouts';
import type { Facing, Unit } from '@/data/types';

/**
 * The home page's apartment finder: bedrooms and which side the sun comes in. It narrows the lift panel's
 * counts and travels to the floor page in the URL (?beds=2&sun=am), where the apartments that don't match
 * are dimmed, so a buyer keeps their choice from the building to the floor.
 */
export type Sun = 'am' | 'pm';
export interface UnitFilter {
  beds: number | null;
  sun: Sun | null;
}

export const NO_FILTER: UnitFilter = { beds: null, sun: null };

/** Morning sun comes in on the east faces, evening sun on the west (the towers' six positions, building.ts). */
const SIDE: Record<Facing, Sun> = { NE: 'am', E: 'am', SE: 'am', NW: 'pm', W: 'pm', SW: 'pm' };

export const isFiltered = (f: UnitFilter) => f.beds !== null || f.sun !== null;

export const matches = (u: Unit, f: UnitFilter) =>
  (f.beds === null || layouts[u.layout].bedrooms === f.beds) && (f.sun === null || SIDE[u.facing] === f.sun);

/** "?beds=2&sun=am", or "" when nothing is picked. */
export function filterQuery(f: UnitFilter): string {
  const q = new URLSearchParams();
  if (f.beds !== null) q.set('beds', String(f.beds));
  if (f.sun) q.set('sun', f.sun);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function readFilter(search: string): UnitFilter {
  const q = new URLSearchParams(search);
  const beds = Number(q.get('beds'));
  const sun = q.get('sun');
  return { beds: beds >= 1 && beds <= 3 ? beds : null, sun: sun === 'am' || sun === 'pm' ? sun : null };
}

/** The bedroom counts there are apartments for, for the finder's buttons. */
export const bedroomOptions = [...new Set(Object.values(layouts).map((l) => l.bedrooms))].sort();
