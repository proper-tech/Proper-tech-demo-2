import type { LayoutId, TowerId, Unit, UnitStatus } from './types';
import site from './site.json';

// The complex: two towers on a shared podium, plus an annex. The footprints come from the
// architect's site plan (see site.json and scripts/extract-site.py).
//
// STILL PLACEHOLDERS, because the site plan does not contain them:
//  - the number of storeys (estimated from the renders),
//  - the apartments on each floor (four mock layouts along a corridor, see layouts.ts),
//  - which apartments are sold (`statusOf`). Replace it with your sales system.

export const towers: TowerId[] = ['A', 'B'];
export const towerFootprint = {
  w: +(site.towers[0].u1 - site.towers[0].u0).toFixed(1),
  d: +(site.towers[0].v1 - site.towers[0].v0).toFixed(1),
};

export const PODIUM_FLOORS = 3; // ASSUMED from the renders
export const FLOOR_MIN = PODIUM_FLOORS + 1;
export const FLOOR_MAX = 16; // ASSUMED from the renders
export const FLOOR_HEIGHT = 3.1;
export const PODIUM_HEIGHT = 13.2;

/** Mock floor plate used by the floor-plan page: four apartments along a 2 m corridor. */
export const PLATE = { w: 20, d: 18, corridor: 2 };

const SLOTS: { pos: Unit['pos']; layout: LayoutId; side: Unit['side']; x0: number }[] = [
  { pos: 1, layout: 'C', side: 'N', x0: -10 },
  { pos: 2, layout: 'A', side: 'N', x0: 4 },
  { pos: 3, layout: 'B', side: 'S', x0: -10 },
  { pos: 4, layout: 'B', side: 'S', x0: 0 },
];

const SOLD_OUT_FLOORS: Record<TowerId, number[]> = { A: [5, 9, 14], B: [4, 8, 11] };

function statusOf(tower: TowerId, floor: number, pos: number): UnitStatus {
  const k = floor + (tower === 'B' ? 5 : 0);
  const h = (k * 7 + pos * 13 + k * pos * 3) % 10;
  if (SOLD_OUT_FLOORS[tower].includes(floor)) return h < 3 ? 'reserved' : 'sold';
  if (pos === (k % 4) + 1) return 'available';
  return h < 5 ? 'available' : h < 7 ? 'reserved' : 'sold';
}

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
    const list = SLOTS.map((slot) => ({
      id: `${tower}${floor}${String(slot.pos).padStart(2, '0')}`,
      tower,
      floor,
      status: statusOf(tower, floor, slot.pos),
      ...slot,
    }));
    units.push(...list);
    floors.push({ tower, floor, units: list, available: list.filter((u) => u.status === 'available').length });
  }
}

export const getUnit = (id: string) => units.find((u) => u.id === id);
export const getFloor = (tower: string, floor: number) => floors.find((f) => f.tower === tower && f.floor === floor);
export const availableUnits = units.filter((u) => u.status === 'available');
