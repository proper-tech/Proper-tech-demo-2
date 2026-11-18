import type { Pt } from '@/lib/geometry';
import type { PodiumFloor, PodiumSpace } from './podium';
import site from './site.json';
import type { FurnitureItem } from './types';

// Block D, the service and parking building ("Сервисийн барилга"), from the architect's schematic
// design, sheets 30-39: basement plan (30), floor plans 1-3 (31-33), sections 1-1 and 2-2 (34, 35)
// and the four elevations (36-39).
//
//  - Column grid 5 × 6 m (axes Y1-Y6, 30 m, south to north) by 3 × 6 m (axes X1-X4, 18 m, west to
//    east). The outside of the walls is 0.45 m outside the outer grid lines: 30.9 × 18.9 m, which is
//    the annex footprint in site.json (from the DWG).
//  - Levels (sections): basement B1 -3.3, floor 1 ±0.0, floor 2 +4.5, floor 3 +7.8, roof +10.8
//    (storeys 3.3, 4.5, 3.3 and 3.0 m). The parapet stands about 0.9 m above the roof (elevations).
//  - Stair and lift core outside the east wall at the north end (X4, Y4-Y6), its east face glazed
//    over the stair.
//  - Car ramp along the east bay (X3-X4): floor 1 -> 2 rises southwards from 2.2 m inside the north
//    wall to axis Y3, floor 2 -> 3 rises from axis Y5 to Y3 above it (section 1-1). Floors 2 and 3
//    are open over the ramps between Y3 and Y5 (rooms 24 and 34).
//
// Plans are in block metres: u = x east from axis X1, v = y north from axis Y1. The rooms follow the
// grid lines; the small rooms on floor 1 (06-11) are measured off the plan and are accurate to
// about 0.2 m. Room numbers, names and areas are the architect's room schedules (areas net of walls,
// so a little smaller than the outlines). Cars, lifts and racks are fit-out for scale: the bays and
// lifts are where the plans draw them, the shop and store shelving is a plausible layout.

/** Storey heights from the sections (m). */
export const D_LEVELS = { B1: -3.3, L1: 0, L2: 4.5, L3: 7.8, roof: 10.8 } as const;
/** Top of the parapet, from the elevations (not dimensioned on the drawings). */
export const D_PARAPET = D_LEVELS.roof + 0.9;
/** Outside of the walls, outside the outer grid lines (site.json annex: 30.9 × 18.9 m). */
const WALL = 0.45;
/** The stair core's outer east wall and its south wall (floor plans). */
const CORE_E = 21.2;
const CORE_S = 19.6;
/** Between the lift shaft (north) and the stair (south). */
const LIFT_S = 27.75;

const box = (u0: number, u1: number, v0: number, v1: number): Pt[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

/** Main block, outside of its walls. */
export const blockDMain = box(-WALL, 18 + WALL, -WALL, 30 + WALL);
/** Counter-clockwise outline of every floor: the main block with the core on its east side. */
export const blockDOutline: Pt[] = [
  [-WALL, -WALL], [18 + WALL, -WALL], [18 + WALL, CORE_S], [CORE_E, CORE_S], [CORE_E, 30 + WALL], [-WALL, 30 + WALL],
];

// ---- block metres -> site plan. The annex corners in site.json are the outside of the main block's
// walls; the block stands about 2.5° off the site plan's axes.
const A = site.annex as Pt[];
const by = (f: (p: Pt) => number, max: boolean) => A.reduce((a, b) => ((max ? f(b) > f(a) : f(b) < f(a)) ? b : a));
const SW = by(([u, v]) => u + v, false);
const SE = by(([u, v]) => u - v, true);
const NW = by(([u, v]) => u - v, false);
const unit = (a: Pt, b: Pt): Pt => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
const EAST = unit(SW, SE);
const NORTH = unit(SW, NW);
/** Axis X1 / Y1 on the site plan. */
const ORIGIN: Pt = [SW[0] + WALL * (EAST[0] + NORTH[0]), SW[1] + WALL * (EAST[1] + NORTH[1])];
/** Block metres -> site plan metres (u east, v north), the frame of site.json and the 3D model. */
export const blockDToSite = ([x, y]: Pt): Pt => [ORIGIN[0] + x * EAST[0] + y * NORTH[0], ORIGIN[1] + x * EAST[1] + y * NORTH[1]];
/** The block's frame on the site plan: where axes X1 and Y1 cross, and the direction of the X axes
 *  (radians from site east), to place the rest of the complex round the 360° view. */
export const blockDFrame = { origin: ORIGIN, angle: Math.atan2(EAST[1], EAST[0]) };
/** Size of the annex footprint in site.json, to check against the drawings (30.9 × 18.9 m). */
export const annexSize = { ew: Math.hypot(SE[0] - SW[0], SE[1] - SW[1]), ns: Math.hypot(NW[0] - SW[0], NW[1] - SW[1]) };

// ---- the core, the same on every floor
const STAIR = box(18 + WALL, CORE_E, CORE_S, LIFT_S);
const LIFT = box(18 + WALL, CORE_E, LIFT_S, 30 + WALL);
/** The stairs' floor landing is at the north end, by the lift, with the door in a long wall:
 *  the outside door on the east on floor 1, the doors into the building on the west elsewhere. */
const stairs = (no: string, area: number, door: 'E' | 'W', doorAt: number, top = false): PodiumSpace => ({
  id: no, no, type: 'stairs', area, door, doorAt, landing: 'N', top, outline: STAIR,
});
const lift: PodiumSpace = { id: 'lift', type: 'lifts', doors: 'S', outline: LIFT };

// ---- the ramps: [south end, north end] of each run along the east bay (X3-X4), from section 1-1
/** Floor 1 -> 2: from 2.2 m inside the north wall (Y6) up to axis Y3. */
const RAMP_1 = { u0: 12.25, u1: 17.75, low: 27.8, high: 12.3, rise: D_LEVELS.L2 - D_LEVELS.L1 };
/** Floor 2 -> 3: from axis Y5 up to Y3, above the first. */
const RAMP_2 = { u0: 12.25, u1: 17.75, low: 24.0, high: 12.3, rise: D_LEVELS.L3 - D_LEVELS.L2 };
/** The opening in floors 2 and 3 over the ramps, between Y3 and Y5. */
const VOID = box(12, 18, 12, 24);

// ---- parking: each bay on the plans is two cars side by side, each space 2.45 × 5.0 m
/** Two cars in a bay at (u, v), noses pointing `rot` (1 east, 2 north, 3 west). */
const bay = (u: number, v: number, rot: 1 | 2 | 3, one = false): FurnitureItem[] => {
  const across = one ? [0] : [-1.225, 1.225];
  return across.map((d) => (rot === 2 ? { type: 'car', x: u + d, z: v, rot } : { type: 'car', x: u, z: v + d, rot }));
};
/** Bays along the west wall (X1-X2), one per grid bay, centres from the plans. */
const westRow = (vs: number[]) => vs.flatMap((v) => bay(3.0, v, 1));
/** Bays at the south end (Y1-Y2), cars nosing north into the aisle. */
const southRow = [...bay(8.85, 3.05, 2), ...bay(15.1, 3.05, 2)];

/** Floor 1: car parts shop, car repair, the bottom of the ramp, staff rooms. */
const floorOne: PodiumSpace[] = [
  { id: '01', no: '01', type: 'parts', area: 172, outline: [[6, 0], [18, 0], [18, 12], [0, 12], [0, 6], [6, 6]] },
  { id: '02', no: '02', type: 'office', area: 33, outline: box(0, 6, 0, 6) },
  { id: '03', no: '03', type: 'ramp', area: 42, outline: box(12, 18, 22.66, 30) },
  { id: '04', no: '04', type: 'storage', area: 26, outline: box(12, 18, 18.24, 22.66) },
  { id: '05', no: '05', type: 'workshop', area: 213, outline: box(0, 12, 12, 30) },
  { id: '06', no: '06', type: 'waiting', area: 12, outline: box(12, 16.65, 12, 14.08) },
  { id: '07', no: '07', type: 'toilets', area: 2, outline: box(14.44, 16.56, 14.08, 15.15) },
  {
    id: '08', no: '08', type: 'changing', area: 14,
    outline: [[12, 14.08], [14.44, 14.08], [14.44, 16.57], [16.56, 16.57], [16.56, 15.33], [18, 15.33], [18, 18.24], [12, 18.24]],
  },
  { id: '09', no: '09', type: 'toilets', area: 2, outline: box(14.44, 16.56, 15.15, 16.57) },
  // the stair's outside door, in its glazed east face (elevation 1)
  stairs('10', 22, 'E', 25.25),
  lift,
  { id: '11', no: '11', type: 'vestibule', area: 5, outline: box(16.65, 18, 12, 15.33) },
];

const floorOneFurniture: FurnitureItem[] = [
  // 05, measured off the plan: two two-post lifts, 5.0 × 3.2 m (one raised with a car on it, one
  // down), and an inspection pit 1.16 × 4.57 m with a car standing over it
  { type: 'carLift', x: 4.07, z: 26.68, rot: 1, w: 1.6 },
  { type: 'carLift', x: 4.07, z: 20.65, rot: 1, w: 0 },
  { type: 'pit', x: 3.65, z: 14.66, rot: 1 },
  { type: 'car', x: 4.78, z: 14.66, rot: 1 },
  // fit-out along the walls of 05: workbench and tool chests, tyres, oil drums
  { type: 'workbench', x: 11.6, z: 22.5, rot: 3, w: 2.4 },
  { type: 'toolChest', x: 11.6, z: 24.4, rot: 3 },
  { type: 'toolChest', x: 11.6, z: 20.8, rot: 3 },
  { type: 'tyres', x: 11.55, z: 27.6, rot: 3, w: 3 },
  { type: 'drum', x: 0.5, z: 23.6 },
  { type: 'drum', x: 0.5, z: 22.9 },
  { type: 'workbench', x: 0.45, z: 17.4, rot: 1, w: 2.4 },
  { type: 'toolChest', x: 0.5, z: 19.3, rot: 1 },
  // 01: shelving units in rows, stocked on both sides, the sales counter by the entrance
  ...[2.4, 5.0, 7.6].flatMap((v) => [
    { type: 'gondola', x: 8.4, z: v, w: 3.6 } as FurnitureItem,
    { type: 'gondola', x: 12.8, z: v, w: 3.6 } as FurnitureItem,
  ]),
  { type: 'rack', x: 1.4, z: 9.6, w: 2.4 },
  { type: 'rack', x: 4.2, z: 9.6, w: 2.4 },
  { type: 'counter', x: 16.4, z: 6.6, rot: 3, w: 2.4 },
  // 02, as drawn: two pairs of desks back to back, a cupboard on the north wall and one on the east
  ...[4.55, 1.75].flatMap((u): FurnitureItem[] => [
    { type: 'desk', x: u, z: 1.75, rot: 2, w: 1.8 },
    { type: 'desk', x: u, z: 0.85, w: 1.8 },
  ]),
  { type: 'shelf', x: 2.95, z: 5.75, rot: 2, w: 3.9 },
  { type: 'shelf', x: 5.75, z: 4.5, rot: 3, w: 1.8 },
  // 04: racks along the north and south walls and a long one down the middle
  { type: 'rack', x: 15.0, z: 22.3, w: 5.2 },
  { type: 'rack', x: 15.0, z: 18.6, rot: 2, w: 5.2 },
  { type: 'rack', x: 15.4, z: 20.4, w: 3.4 },
  // 06: seats for customers; 08: lockers and two benches, as drawn; 07, 09: a WC and basin each
  { type: 'bench', x: 14.3, z: 13.75, w: 2.4 },
  { type: 'wardrobe', x: 13.05, z: 17.88, rot: 2, w: 1.7 },
  { type: 'bench', x: 13.1, z: 15.7, w: 1.8 },
  { type: 'bench', x: 13.1, z: 14.65, w: 1.8 },
  { type: 'toilet', x: 16.2, z: 15.9, rot: 3 },
  { type: 'vanity', x: 15.3, z: 16.35 },
  { type: 'toilet', x: 16.2, z: 14.6, rot: 3 },
  { type: 'vanity', x: 15.3, z: 14.35, rot: 2 },
  { type: 'extinguisher', x: 11.85, z: 25.5, rot: 3 },
  { type: 'extinguisher', x: 0.2, z: 10.5, rot: 1 },
];

export const blockDFloors: PodiumFloor[] = [
  {
    floor: 0,
    z0: D_LEVELS.B1,
    z1: D_LEVELS.L1,
    below: 0,
    outline: blockDOutline,
    total: 544,
    spaces: [
      { id: '1', no: '1', type: 'parking', area: 520, outline: box(0, 18, 0, 30) },
      // the stair and lift together are room 15 on the basement schedule
      stairs('15', 24, 'W', 25.1),
      lift,
    ],
    // the basement joins the main car park under the complex through the north wall (X2-X3)
    furniture: [
      ...bay(14.85, 28.3, 3, true),
      ...[20.9, 14.9, 8.9, 3.1].flatMap((v) => bay(14.85, v, 3)),
      ...westRow([27.0, 20.9, 14.9, 8.9, 3.1]),
    ],
    openings: [{ side: 'N', from: 5.8, to: 11.7 }],
  },
  {
    floor: 1,
    z0: D_LEVELS.L1,
    z1: D_LEVELS.L2,
    below: D_LEVELS.L1 - D_LEVELS.B1,
    outline: blockDOutline,
    total: 542,
    spaces: floorOne,
    furniture: floorOneFurniture,
    ramps: [{ ...RAMP_1, y0: 0 }],
    openings: [
      // garage doors in the north wall: into the ramp and into the repair shop (elevation 2)
      { side: 'N', from: 12.5, to: 17.5 },
      { side: 'N', from: 6.6, to: 11.6 },
    ],
  },
  {
    floor: 2,
    z0: D_LEVELS.L2,
    z1: D_LEVELS.L3,
    outline: blockDOutline,
    total: 549,
    spaces: [
      { id: '21', no: '21', type: 'parking', area: 425, outline: [[6, 0], [18, 0], [18, 12], [12, 12], [12, 24], [18, 24], [18, 30], [0, 30], [0, 6], [6, 6]] },
      { id: '22', no: '22', type: 'storage', area: 33, outline: box(0, 6, 0, 6) },
      stairs('23', 22, 'W', 26.7),
      lift,
      // open over the ramps; the ramp up starts at its north edge, the one from below arrives at the south
      { id: '24', no: '24', type: 'ramp', area: 69, void: true, parapet: ['W'], outline: VOID },
    ],
    furniture: [...westRow([27.0, 20.8, 14.85, 8.9]), ...southRow],
    ramps: [
      { ...RAMP_1, y0: D_LEVELS.L1 - D_LEVELS.L2 },
      { ...RAMP_2, y0: 0 },
    ],
  },
  {
    floor: 3,
    z0: D_LEVELS.L3,
    z1: D_LEVELS.roof,
    outline: blockDOutline,
    total: 546,
    spaces: [
      { id: '31', no: '31', type: 'parking', area: 425, outline: [[6, 0], [18, 0], [18, 12], [12, 12], [12, 24], [18, 24], [18, 30], [0, 30], [0, 6], [6, 6]] },
      { id: '32', no: '32', type: 'storage', area: 33, outline: box(0, 6, 0, 6) },
      // the stair ends here: it only goes down
      stairs('33', 20, 'W', 26.2, true),
      lift,
      { id: '34', no: '34', type: 'ramp', area: 68, void: true, parapet: ['W'], rails: ['N'], outline: VOID },
    ],
    // the pair at the north end, beside the opening (3rd-floor plan)
    furniture: [...westRow([27.0, 20.8, 14.85, 8.9]), ...southRow, ...bay(14.0, 26.95, 3)],
    ramps: [{ ...RAMP_2, y0: D_LEVELS.L2 - D_LEVELS.L3 }],
  },
];

export const getBlockDFloor = (floor: number) => blockDFloors.find((f) => f.floor === floor);

// ---------------------------------------------------------------- for the walk-through (DFloorScene)

/** Inside face of the outside walls of the main block. The walls are 0.5 m thick, 0.45 m of it
 *  outside the grid lines (floor plans; it also gives room 05 its scheduled 213 m²). */
export const D_INSIDE = { u0: 0.05, u1: 17.95, v0: 0.05, v1: 29.95 };
/** Slab thickness, and how far the beams on the grid lines hang below it (sections 1-1, 2-2). */
export const D_SLAB = 0.25;
export const D_BEAM = { w: 0.4, below: 0.3 };
/** Columns on every crossing of the grid: 0.45 m square on the plans. */
export const D_COLUMN = 0.45;
/** Columns on every crossing of the grid (floor plans). */
export const D_COLUMNS: Pt[] = [0, 6, 12, 18].flatMap((u) => [0, 6, 12, 18, 24, 30].map((v): Pt => [u, v]));

export type FacadeSide = 'N' | 'S' | 'E' | 'W';

/** An opening in an outside wall, `from`-`to` along it (u on the north and south walls, v on the
 *  east and west), `z0`-`z1` above the floor. From the elevations (sheets 36-39) and the floor plans. */
export interface FacadeOpening {
  side: FacadeSide;
  from: number;
  to: number;
  z0: number;
  z1: number;
  kind: 'window' | 'garage' | 'door' | 'glassDoor' | 'doorway' | 'open';
}

/** An inside wall from `a` to `b`, with doorways centred `at` metres from `a`. */
export interface Partition {
  a: Pt;
  b: Pt;
  doors?: { at: number; w: number }[];
}

export interface WalkData {
  facade: FacadeOpening[];
  partitions: Partition[];
  /** Where the 360° view starts, and the point it looks at. */
  start: Pt;
  look: Pt;
  /** Driving direction painted on the aisle (plans): centre, and heading (0 north, clockwise). */
  arrows?: { c: Pt; dir: number }[];
}

/** Strip windows on floors 2 and 3, one in the middle of each bay, 3.93 m wide (elevations 1-3,
 *  section 1-1): east, north and south. */
const strips = (z0: number, z1: number): FacadeOpening[] =>
  (['E', 'N', 'S'] as const).flatMap((side) =>
    [3, 9, 15].map((c): FacadeOpening => ({ side, from: c - 1.965, to: c + 1.965, z0, z1, kind: 'window' })),
  );

/** The store in the south-west corner (02, 22, 32): walls on axes X2 and Y2, door in the east wall. */
const cornerRoom: Partition[] = [
  { a: [6, 0.05], b: [6, 6], doors: [{ at: 2.7, w: 0.9 }] },
  { a: [0.05, 6], b: [6, 6] },
];

/** Walls and openings per floor. The small rooms on floor 1 (06-11) and their doors are measured
 *  off the plan; where the plan shows no door, one is placed where the room meets the corridor. */
export const blockDWalk: Record<number, WalkData> = {
  0: {
    facade: [{ side: 'N', from: 5.8, to: 11.7, z0: 0, z1: 2.6, kind: 'open' }],
    partitions: [],
    start: [9, 27],
    look: [9, 4],
    // in from the main car park, south down the aisle (basement plan)
    arrows: [{ c: [9, 22], dir: Math.PI }, { c: [9, 12], dir: Math.PI }],
  },
  1: {
    // measured off elevations 1-3 and the 1st-floor plan
    facade: [
      // east: the shop front, 4.1 m high, with the customers' door; the door into vestibule 11
      { side: 'E', from: 0.12, to: 2.3, z0: 0, z1: 4.1, kind: 'window' },
      { side: 'E', from: 2.3, to: 3.3, z0: 0, z1: 2.35, kind: 'glassDoor' },
      { side: 'E', from: 2.3, to: 3.3, z0: 2.45, z1: 4.1, kind: 'window' },
      { side: 'E', from: 3.3, to: 12.7, z0: 0, z1: 4.1, kind: 'window' },
      { side: 'E', from: 12.7, to: 13.9, z0: 0, z1: 2.35, kind: 'door' },
      { side: 'E', from: 13.9, to: 17.75, z0: 0, z1: 4.1, kind: 'window' },
      // north: garage doors into the ramp and into the repair shop, two windows into 05
      { side: 'N', from: 12.45, to: 17.45, z0: 0, z1: 3.5, kind: 'garage' },
      { side: 'N', from: 6.4, to: 11.5, z0: 0, z1: 3.5, kind: 'garage' },
      { side: 'N', from: 0.74, to: 2.56, z0: 0.95, z1: 2.58, kind: 'window' },
      { side: 'N', from: 3.36, to: 5.15, z0: 0.95, z1: 2.58, kind: 'window' },
      // south: office windows, high windows into the shop
      { side: 'S', from: 0.86, to: 2.6, z0: 0.88, z1: 2.5, kind: 'window' },
      { side: 'S', from: 3.42, to: 5.19, z0: 0.88, z1: 2.5, kind: 'window' },
      { side: 'S', from: 7.01, to: 10.99, z0: 3.37, z1: 4.0, kind: 'window' },
      { side: 'S', from: 13.0, to: 16.95, z0: 3.37, z1: 4.0, kind: 'window' },
    ],
    partitions: [
      // office 02, its door 2.7 m from the south wall
      ...cornerRoom,
      // repair shop 05 and the shop 01, on axis Y3, door at u = 9.8
      { a: [0.05, 12], b: [12, 12], doors: [{ at: 9.75, w: 1.0 }] },
      // repair shop 05 and the rooms east of it, on axis X3: doors into 06, 08 and 04
      { a: [12, 12], b: [12, 29.95], doors: [{ at: 0.85, w: 0.9 }, { at: 4.4, w: 0.9 }, { at: 7.1, w: 0.9 }] },
      // the shop 01 and vestibule 11, door at u = 17.4
      { a: [12, 12], b: [17.95, 12], doors: [{ at: 5.4, w: 0.9 }] },
      { a: [12, 14.08], b: [16.65, 14.08], doors: [{ at: 1.2, w: 0.9 }] },
      // vestibule 11 and the waiting room 06, door at v = 13.2
      { a: [16.65, 12], b: [16.65, 15.33], doors: [{ at: 1.2, w: 0.8 }] },
      { a: [16.56, 15.33], b: [17.95, 15.33], doors: [{ at: 0.8, w: 0.8 }] },
      // toilets 07 and 09
      { a: [14.44, 14.08], b: [14.44, 16.57], doors: [{ at: 0.55, w: 0.6 }, { at: 1.8, w: 0.6 }] },
      { a: [16.56, 15.33], b: [16.56, 16.57] },
      { a: [14.44, 15.15], b: [16.56, 15.15] },
      { a: [14.44, 16.57], b: [16.56, 16.57] },
      // store 04, under the ramp, and the ramp 03
      { a: [12, 18.24], b: [17.95, 18.24] },
      { a: [12, 22.66], b: [17.95, 22.66] },
    ],
    start: [16.2, 1.0],
    look: [6.5, 10.5],
  },
  // round the opening, north along the aisle, then up the ramp from its north end (2nd-floor plan)
  2: { facade: strips(1.97, 2.6), partitions: cornerRoom, start: [9, 27], look: [9, 4], arrows: [{ c: [8.8, 9], dir: 0 }, { c: [8.8, 19], dir: 0 }] },
  3: { facade: strips(1.7, 2.35), partitions: cornerRoom, start: [9, 27], look: [9, 4] },
};
/** Floor numbers as the lift panel and the page show them: the basement is B1. */
export const blockDLabel = (floor: number) => (floor === 0 ? 'B1' : String(floor));
