import type { Facing, LayoutId, PlanId, TowerId, Unit, UnitStatus } from './types';

// The complex, from the architect's schematic design ("СЭВОЦЗ" ХХК-ийн үйлчилгээ, орон сууцны
// цогцолбор, Уран проект ХХК, 2026):
//  - Block A: three-storey podium (shops and services), playground on its roof at floor 4.
//  - Blocks B and C: the two 16-storey residential towers. Floors 1-3 are part of the podium,
//    floors 4-16 have apartments, with a technical floor on top. 155 apartments in all.
//  - Block D: three-storey service building with heated parking on floors 2 and 3.
//  - One basement level under A, B, C and D with heated parking.
//
// STILL A PLACEHOLDER, because the drawings do not contain it: which apartments are sold
// (`statusOf`). Replace it with your sales system.

/** In the order the floor picker shows them. */
export const towers: TowerId[] = ['B', 'C'];

/** Which footprint in site.json is which tower. Block B is the northern tower. */
export const towerSiteIndex: Record<TowerId, number> = { B: 1, C: 0 };

// Levels from sections 1-1 and 2-2 (m above floor 1).
export const PODIUM_FLOORS = 3;
export const FLOOR_MIN = PODIUM_FLOORS + 1;
export const FLOOR_MAX = 16;
export const FLOOR_HEIGHT = 3.0;
/** Level of floor 4, the first apartment floor and the podium roof. */
export const PODIUM_HEIGHT = 11.7;
/** Level of the roof over the technical floor. */
export const ROOF_LEVEL = 54.7;
export const floorLevel = (floor: number) => PODIUM_HEIGHT + (floor - FLOOR_MIN) * FLOOR_HEIGHT;

/** Figures from the capacity table on the general plan (sheet 7). */
export const capacity = {
  blocks: 4,
  apartments: 155,
  footprint: 1983.9,
  publicArea: 4872,
  heatedParking: 94,
  outdoorParking: 27,
  accessibleParking: 5,
};

/**
 * The tower floor plate, in the coordinates of layouts.ts: X east from grid line X2, Y north
 * from grid line Y1, in metres. The column grid is 21.6 × 21.0 m; the corner rooms and the
 * balconies reach about 2 m past the outer columns on the east and west sides.
 */
export const PLATE = {
  x0: -2.05,
  x1: 23.65,
  y0: -0.15,
  y1: 21.2,
  /** Rounded corners of the slab. */
  corner: 2.2,
  grid: { x: [0, 7.2, 14.4, 21.6], y: [0, 7.2, 13.8, 21.0] },
};

export interface CoreSpace {
  id: 'corridor' | 'stair' | 'lifts' | 'shafts' | 'hoa' | 'trash';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Lift and stair core, the same on every floor. */
export const core: CoreSpace[] = [
  { id: 'corridor', x0: 9.0, x1: 12.6, y0: 7.15, y1: 17.55 },
  { id: 'stair', x0: 7.1, x1: 9.0, y0: 14.05, y1: 20.9 },
  { id: 'lifts', x0: 9.3, x1: 12.3, y0: 17.75, y1: 20.9 },
  { id: 'shafts', x0: 12.6, x1: 14.5, y0: 14.05, y1: 17.55 },
];

/** Floor 4 of Block B: the homeowners' association room (403-406) replaces apartment B. */
const hoa: CoreSpace = { id: 'hoa', x0: -1.75, x1: 7.33, y0: 7.15, y1: 13.55 };

export const coreFor = (tower: TowerId, floor: number): CoreSpace[] =>
  tower === 'B' && floor === FLOOR_MIN ? [...core, hoa] : core;

const POSITIONS: { pos: Unit['pos']; plan: PlanId; facing: Facing }[] = [
  { pos: 1, plan: 'A', facing: 'NW' },
  { pos: 2, plan: 'B', facing: 'W' },
  { pos: 3, plan: 'C', facing: 'SW' },
  { pos: 4, plan: 'D', facing: 'SE' },
  { pos: 5, plan: 'E', facing: 'E' },
  { pos: 6, plan: 'F', facing: 'NE' },
];

/** Which apartments a floor has, per the floor 4 and floors 5-16 plans (sheets 17-20). */
function plansOn(tower: TowerId, floor: number): { plan: PlanId; layout: LayoutId }[] {
  return POSITIONS.flatMap(({ plan }) => {
    if (tower === 'B' && floor === FLOOR_MIN) {
      if (plan === 'B') return [];
      if (plan === 'A') return [{ plan, layout: 'A4' as LayoutId }];
    }
    return [{ plan, layout: plan as LayoutId }];
  });
}

// PLACEHOLDER sales status, so the site has something to show.
const SOLD_OUT_FLOORS: Record<TowerId, number[]> = { B: [5, 9, 14], C: [4, 8, 11] };

function statusOf(tower: TowerId, floor: number, pos: number): UnitStatus {
  const k = floor + (tower === 'C' ? 5 : 0);
  const h = (k * 7 + pos * 13 + k * pos * 3) % 10;
  if (SOLD_OUT_FLOORS[tower].includes(floor)) return h < 3 ? 'reserved' : 'sold';
  if (pos === (k % 6) + 1) return 'available';
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
    const list: Unit[] = plansOn(tower, floor).map(({ plan, layout }) => {
      const slot = POSITIONS.find((p) => p.plan === plan)!;
      return {
        id: `${tower}${floor}${String(slot.pos).padStart(2, '0')}`,
        tower,
        floor,
        pos: slot.pos,
        plan,
        layout,
        facing: slot.facing,
        status: statusOf(tower, floor, slot.pos),
      };
    });
    units.push(...list);
    floors.push({ tower, floor, units: list, available: list.filter((u) => u.status === 'available').length });
  }
}

export const getUnit = (id: string) => units.find((u) => u.id === id);
export const getFloor = (tower: string, floor: number) => floors.find((f) => f.tower === tower && f.floor === floor);
export const availableUnits = units.filter((u) => u.status === 'available');
