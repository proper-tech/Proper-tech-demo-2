import type { LayoutId, TowerId, Unit } from './types';
import site from './site.json';

// The complex, in the architect's block key: A the podium (shops and services on floors 1-3, a
// playground on its roof), B and C the apartment towers (floors 4-16; B on the main road, to the
// north), D the annex. Footprints come from the site plan (site.json, scripts/extract-site.py);
// storeys and heights from the architect's sections; the apartments from the typical floor plan
// (layouts.ts). That plan covers floors 5-16; floor 4 has no drawing yet and uses it too.
//
// STILL A PLACEHOLDER: availability. Every apartment is for sale until a sales list is connected.

export const towers: TowerId[] = ['B', 'C'];
/** A tower's rectangle on the site plan: the grid plus 0.5 m, the podium floors under the tower.
 *  site.json lists the towers south to north, so C comes first and B second. */
export const siteTower = (tower: TowerId) => site.towers[tower === 'B' ? 1 : 0];
/** The apartment floors (4-16), which overhang the podium: on the typical floor plan and section
 *  1-1 their outer walls stand about 1.9 m beyond the end grid lines east and west, and 0.3 m
 *  north and south. Keep in step with plate() in scripts/build-model.py. */
export function towerPlate(tower: TowerId) {
  const t = siteTower(tower);
  return { u0: t.u0 - 1.4, u1: t.u1 + 1.4, v0: t.v0 + 0.2, v1: t.v1 - 0.2 };
}
const plateC = towerPlate('C');
export const towerFootprint = { w: +(plateC.u1 - plateC.u0).toFixed(1), d: +(plateC.v1 - plateC.v0).toFixed(1) };

export const PODIUM_FLOORS = 3;
export const FLOOR_MIN = PODIUM_FLOORS + 1;
export const FLOOR_MAX = 16;
/** Apartment floor to floor, from the sections. Keep in step with scripts/build-model.py. */
export const FLOOR_HEIGHT = 3.0;
/** Top of the podium (block A): 1st floor 4.5 m, 2nd and 3rd 3.6 m. */
export const PODIUM_HEIGHT = 11.7;

/** The tower floor plate in metres, as traced from the typical floor plan: x east from grid X2,
 *  z south from grid Y4, outer walls on their centrelines (the corners are rounded on the
 *  drawing). The plan is symmetrical about x = axis, half way between grids X4 and X5. */
export const PLATE = { x0: -1.8, x1: 23.4, z0: 0, z1: 21, axis: 10.8 };

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Stair 602 (west), two lifts, and corridor 601 that every front door opens onto. */
const CORE = {
  stairs: { x: 7.2, z: 0, w: 2.7, d: 7.2 },
  lifts: { x: 9.9, z: 0, w: 2.4, d: 4.5 },
  corridor: [
    { x: 12.3, z: 0, w: 2.1, d: 4.5 },
    { x: 9.9, z: 4.5, w: 4.5, d: 2.7 },
    { x: 8.5, z: 7.2, w: 4.6, d: 4.3 },
  ],
};
const flip = (r: Rect): Rect => ({ ...r, x: +(2 * PLATE.axis - r.x - r.w).toFixed(2) });

/** The plan is drawn for tower C. On the roof plan tower B's stair and lifts are the mirror
 *  image (stair to the east), so B gets the mirrored core; the apartments are symmetrical anyway. */
export const coreOf = (tower: TowerId) =>
  tower === 'C' ? CORE : { stairs: flip(CORE.stairs), lifts: flip(CORE.lifts), corridor: CORE.corridor.map(flip) };

const FLATS: LayoutId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export interface FloorSummary {
  tower: TowerId;
  floor: number;
  units: Unit[];
  available: number;
}

export const units: Unit[] = [];
export const floors: FloorSummary[] = [];
for (const tower of towers) {
  for (let floor = FLOOR_MIN; floor <= FLOOR_MAX; floor++) {
    // apartment ids: tower, floor, letter on the plan ("C12D")
    const list: Unit[] = FLATS.map((layout) => ({ id: `${tower}${floor}${layout}`, tower, floor, layout, status: 'available' }));
    units.push(...list);
    floors.push({ tower, floor, units: list, available: list.filter((u) => u.status === 'available').length });
  }
}

export const getUnit = (id: string) => units.find((u) => u.id === id);
export const getFloor = (tower: string, floor: number) => floors.find((f) => f.tower === tower && f.floor === floor);
export const availableUnits = units.filter((u) => u.status === 'available');
