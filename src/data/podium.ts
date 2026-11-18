import { bounds, inPolygon, type Pt } from '@/lib/geometry';
import { PLATE, siteTower, towerPlate } from './building';
import site from './site.json';
import type { FurnitureItem, TowerId } from './types';

// Block A, the podium: shops and services on floors 1-3 and the playground on its roof (floor 4),
// and the basement car park under the whole complex (B1, kept here as floor 0). Traced from the architect's floor plans against the column grid (axes X1-X7, Y1-Y12), so walls
// are accurate to roughly half a metre. Room numbers, names and areas are the architect's room
// schedules; spaces without a number on the plans (lift and stair cores, corridors) have no area.
// Outlines are in site-plan metres (u east, v north), the same frame as site.json and the 3D model.

export type PodiumSpaceType =
  | 'hall' | 'supermarket' | 'retail' | 'storage' | 'stairs' | 'lifts' | 'escalators' | 'vestibule'
  | 'staff' | 'office' | 'toilets' | 'corridor' | 'covered' | 'playground' | 'tower'
  // the technical floor on the tower roofs (roof.ts)
  | 'technical' | 'roof'
  // the basement (B1)
  | 'parking' | 'ramp' | 'lobby';

export interface PodiumSpace {
  id: string;
  /** Room number on the plans. */
  no?: string;
  type: PodiumSpaceType;
  /** From the architect's room schedule, m². */
  area?: number;
  outline: Pt[];
  /** For type 'tower': the tower standing on the roof (floor 4). */
  tower?: TowerId;
  /** For stairs: the wall with the door, and whether the flight going up is on the west side. */
  door?: 'N' | 'S' | 'E' | 'W';
  flip?: boolean;
  /** For lifts: the wall their doors are in, on floors where they stop. */
  doors?: 'E' | 'W';
  /** For ramps: the way they go up, from this floor to ground level. */
  rise?: 'N' | 'S' | 'E' | 'W';
  /** For car parks: the parking spaces marked on the floor, as drawn on the plans. */
  stalls?: Pt[][];
}

/** Playground furniture on the roof, from the 4th-floor plan. */
export type Decor =
  | { kind: 'pavilion'; c: Pt; r: number }
  | { kind: 'pad'; c: Pt; rx: number; ry: number; tone: 'blue' | 'red' }
  | { kind: 'climber'; path: Pt[]; w: number };

export interface PodiumFloor {
  /** 1-4 on the podium, 0 for the basement (B1); the tower roofs (roof.ts) use the same shape as
   *  floor 17. */
  floor: number;
  /** Bottom and top of the storey, m above the 1st-floor slab (sections). Floor 4 is the open
   *  roof, so its top is the parapet. */
  z0: number;
  z1: number;
  /** Height of the storey below, for stairs going down, when it isn't the podium floor below. */
  below?: number;
  outline: Pt[];
  spaces: PodiumSpace[];
  /** Total of the floor's room schedule, m². */
  total?: number;
  decor?: Decor[];
  /** Furniture in site-plan metres (x = u east, z = v north); rot 0 faces south. */
  furniture?: FurnitureItem[];
}

// ---- axes of the drawings (site.json grid; X7 is one 7.2 m bay east of X6)
const [X1, X2, X3, X4, X5, X6] = site.grid.u;
const X7 = X6 + 7.2;
const V = site.grid.v;
const [Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8, Y9, Y10, Y11, Y12] = V;
/** 1st-floor shopfront line under tower C, 2.4 m north of axis Y2 (1st-floor plan). South of
 *  it the ground floor is an open, covered walkway. Same value as RECESS in build-model.py. */
const GROUND_SOUTH = Y2 + 2.4;

const box = (u0: number, u1: number, v0: number, v1: number): Pt[] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const B = siteTower('B');
const C = siteTower('C');

// ---- outline of the whole podium: the site plan's podium (between the towers, with the rounded
// west end) joined with the podium floors under each tower
const P = site.podium as Pt[];
const uniq = (pts: Pt[]) => pts.filter((p, i) => pts.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);
/** Rounded west end, north to south: (-12.0, 24.2) ... (-11.2, -9.6). */
const lobe = uniq(P.filter(([u]) => u < B.u0 - 0.01));
/** East edge of the middle part, south to north. */
const east = uniq(P.filter(([u]) => u > C.u1 + 0.01)).sort((a, b) => a[1] - b[1]);
const outlineTo = (south: number): Pt[] => [
  [C.u1, south], [C.u1, east[0][1]], ...east, [B.u1, B.v0], [B.u1, B.v1], [B.u0, B.v1], [B.u0, lobe[0][1]],
  ...lobe, [C.u0, C.v1], [C.u0, south],
];
/** Counter-clockwise outline of the podium on floors 2 and 3 (and the roof level). */
export const podiumOutline = outlineTo(C.v0);
/** The roof playground: the podium between the towers. */
export const terraceOutline = uniq(P);

/** A tower's outline with its rounded (glazed) corners, as on the roof plan and in the 3D model
 *  (radius PLATE.corner); each corner is a quarter circle in 6 straight steps. */
export const towerOutline = (t: { u0: number; u1: number; v0: number; v1: number }, r = PLATE.corner): Pt[] =>
  // corner centres counter-clockwise from the south-east, each with the angle its arc starts at
  ([[t.u1 - r, t.v0 + r, -90], [t.u1 - r, t.v1 - r, 0], [t.u0 + r, t.v1 - r, 90], [t.u0 + r, t.v0 + r, 180]] as const).flatMap(([cu, cv, a0]) =>
    Array.from({ length: 7 }, (_, k): Pt => {
      const a = ((a0 + 15 * k) * Math.PI) / 180;
      return [cu + r * Math.cos(a), cv + r * Math.sin(a)];
    }),
  );

// cores that run through floors 1-3. stairs-c and lifts-c are tower C's core (stair 602, lifts) on
// its way down, stairs-b and lifts-b tower B's, mirrored like it. Door sides aren't on the podium
// plans: stairs open off their landing end, and the tower lifts only open on floor 1, where their
// entrance lobbies are.
const westStairs: PodiumSpace = { id: 'stairs-w', type: 'stairs', door: 'S', outline: box(X2 + 0.8, X3 - 0.5, Y11 - 4.2, Y11 - 0.1) };
const liftsB: PodiumSpace = { id: 'lifts-b', type: 'lifts', outline: box(X5 + 2.1, X5 + 4.1, Y12 - 4.6, Y12 - 0.4) };
const coreUpper = (toilets: [string, number, string, number]): PodiumSpace[] => [
  westStairs,
  liftsB,
  { id: 'stairs-b', type: 'stairs', door: 'W', flip: true, outline: box(X5 + 4.1, X6, Y11, Y12) },
  { id: 'stairs-c', type: 'stairs', door: 'S', outline: box(X4, X4 + 2.6, Y3, Y4 - 0.3) },
  { id: 'lifts-c', type: 'lifts', outline: box(X4 + 2.6, X4 + 4.8, Y4 - 4.0, Y4 - 0.3) },
  { id: toilets[0], no: toilets[0], type: 'toilets', area: toilets[1], outline: box(X4 + 4.8, X5, Y4 - 4.0, Y4 - 0.3) },
  { id: toilets[2], no: toilets[2], type: 'toilets', area: toilets[3], outline: box(X4 + 2.6, X5, Y3, Y4 - 4.0) },
  { id: 'escalators', type: 'escalators', outline: box(X4 + 3.2, X5 - 1.0, Y6, Y9 - 0.9) },
];

/** 102, the supermarket on floor 1. */
const shop: Pt[] = [
  [X3, Y11], [X4, Y11], [X4, Y12 - 4.4], [X5, Y12 - 4.4], [X5, Y11], [X6, Y11], [X6, Y12], [X7, Y12], [X7, Y5],
  [X4 - 0.1, Y5], [X4 - 0.1, Y3 + 1.7], [X2, Y3 + 1.7], [X2, Y7], [X5, Y7], [X5, Y9 + 3.1], [X3, Y9 + 3.1],
];

const floorOne: PodiumSpace[] = [
  {
    id: '101', no: '101', type: 'hall', area: 275.2,
    outline: [[X3, lobe[0][1]], ...lobe.filter(([, v]) => v > Y7), [lobe[lobe.length - 1][0], Y7], [X5, Y7], [X5, Y9 + 3.1], [X3, Y9 + 3.1]],
  },
  { id: '102', no: '102', type: 'supermarket', area: 860.5, outline: shop },
  { id: '103', no: '103', type: 'hall', area: 38.0, outline: box(X4, X5, Y12 - 4.4, Y12) },
  { id: 'lobby-b', type: 'corridor', outline: [[X5, Y11], [X5 + 4.1, Y11], [X5 + 4.1, Y12 - 4.6], [X5 + 2.1, Y12 - 4.6], [X5 + 2.1, Y12], [X5, Y12]] },
  { ...liftsB, doors: 'W' },
  { id: '104', no: '104', type: 'stairs', area: 17.2, door: 'W', flip: true, outline: box(X5 + 4.1, X6, Y11, Y12) },
  westStairs,
  { id: 'escalators', type: 'escalators', outline: box(X4 + 3.3, X5 - 0.7, Y7 - 0.4, Y8 + 0.5) },
  { id: '105', no: '105', type: 'storage', area: 41.0, outline: box(X2, X4 - 0.1, GROUND_SOUTH + 0.1, Y3 + 1.7) },
  { id: '106', no: '106', type: 'stairs', area: 17.2, door: 'E', outline: box(X4 + 0.3, X4 + 2.7, Y3 + 0.9, Y4) },
  { id: '107', no: '107', type: 'vestibule', area: 6.1, outline: box(X4 + 0.3, X4 + 2.7, GROUND_SOUTH + 1.4, Y3 + 0.4) },
  { id: 'lifts-c', type: 'lifts', doors: 'E', outline: box(X4 + 2.9, X4 + 5.0, Y4 - 4.0, Y4) },
  {
    id: '108', no: '108', type: 'hall', area: 32.8,
    outline: [[X4 + 2.9, Y4 - 4.0], [X4 + 5.0, Y4 - 4.0], [X4 + 5.0, Y4], [X5, Y4], [X5, GROUND_SOUTH + 1.4], [X4 + 2.9, GROUND_SOUTH + 1.4]],
  },
  { id: '109', no: '109', type: 'storage', area: 31.5, outline: box(X5 + 0.2, X6 + 0.3, GROUND_SOUTH + 0.4, Y3 + 0.4) },
  { id: '110', no: '110', type: 'staff', area: 12.7, outline: box(X5 + 1.9, X6 + 0.3, Y3 + 0.9, Y3 + 2.8) },
  // The schedule prints "Аклын өрөө"; read as "Ажлын өрөө" (office): it has a desk on the plan.
  { id: '111', no: '111', type: 'office', area: 12.7, outline: box(X5 + 1.9, X6 + 0.3, Y3 + 2.8, Y4 - 2.5) },
  { id: 'corridor-wc', type: 'corridor', outline: box(X5 + 1.9, X6 + 0.3, Y4 - 2.5, Y4 - 1.4) },
  { id: '112', no: '112', type: 'toilets', area: 7.3, outline: box(X5 + 4.7, X6 + 0.3, Y4 - 1.4, Y5) },
  { id: '113', no: '113', type: 'toilets', area: 7.2, outline: box(X5 + 1.9, X5 + 4.7, Y4 - 1.4, Y5) },
  { id: 'corridor', type: 'corridor', outline: [[X4 - 0.1, Y5], [X5 + 1.9, Y5], [X5 + 1.9, GROUND_SOUTH + 0.4], [X5, GROUND_SOUTH + 0.4], [X5, Y4], [X4 - 0.1, Y4]] },
  { id: 'covered', type: 'covered', outline: box(C.u0, C.u1, C.v0, GROUND_SOUTH) },
];

// ---- floor 1 fit-out. The plans show few fittings, so this is a plausible one: shelving,
// checkouts and chillers in the supermarket, racks in the stores, table and lockers for the staff,
// desks in the office, WCs and basins, mailboxes and benches in the lobbies, seats in the hall.

/** Double-sided 6 m shelving units in rows 3 m apart, wherever one fits inside the shop with
 *  1.8 m to walk round it and 1.5 m clear of everything in `keepOut`. */
function shelving(keepOut: Pt[][]): FurnitureItem[] {
  const b = bounds(shop);
  const clear = keepOut.map(bounds);
  const items: FurnitureItem[] = [];
  for (let u = b.u0 + 2.8; u < b.u1; u += 3) {
    for (let v = b.v0 + 2.3; v + 6 < b.v1; v += 8) {
      const [u0, u1, v0, v1] = [u - 2.3, u + 2.3, v - 1.8, v + 7.8];
      const probe: Pt[] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, (v0 + v1) / 2], [u1, (v0 + v1) / 2], [u, v0], [u, v1]];
      if (!probe.every((p) => inPolygon(p, shop))) continue;
      if (clear.some((o) => o.u0 - 1.5 < u + 0.5 && u - 0.5 < o.u1 + 1.5 && o.v0 - 1.5 < v + 6 && v < o.v1 + 1.5)) continue;
      items.push({ type: 'gondola', x: u, z: v + 3, rot: 1 });
    }
  }
  return items;
}

function furnish(spaces: PodiumSpace[]): FurnitureItem[] {
  // three tills by the shop's exit into hall 101, chillers along its east wall
  const tills: FurnitureItem[] = [-10, -8.4, -6.8].map((u) => ({ type: 'checkout', x: u, z: Y7 - 2.5 }));
  const chillers: FurnitureItem[] = Array.from({ length: 15 }, (_, k) => ({ type: 'chiller', x: X7 - 0.45, z: Y5 + 2.75 + k * 2.5, rot: 3 }));
  const others = spaces.filter((s) => s.type !== 'supermarket' && s.type !== 'covered').map((s) => s.outline);
  const keepOut = [...others, box(-10.7, -6.1, Y7 - 3.6, Y7 - 1.4), box(X7 - 1, X7, Y5, Y12)];
  const racks = (us: number[], north: number, south: number): FurnitureItem[] =>
    us.flatMap((u) => [
      { type: 'rack', x: u, z: north },
      { type: 'rack', x: u, z: south, rot: 2 },
    ]);
  return [
    ...shelving(keepOut),
    ...tills,
    ...chillers,
    // 101, entrance hall
    { type: 'bench', x: -14.5, z: 19.5, rot: 1 },
    { type: 'bench', x: -9.5, z: 9.8 },
    { type: 'bench', x: -9.5, z: 6.8, rot: 2 },
    ...([[-16.6, 19.5], [-12.4, 22.6], [-11.2, 8.3], [-7.8, 8.3], [-4.6, 12.8], [2.8, 12.8]] as Pt[]).map(([x, z]): FurnitureItem => ({ type: 'plant', x, z })),
    // 103 and 108, the tower lobbies; lobby-b
    { type: 'shelf', x: X4 + 0.2, z: Y12 - 2.2, rot: 1, w: 1.8 },
    { type: 'bench', x: 0, z: Y12 - 4.06, rot: 2 },
    { type: 'plant', x: X5 - 0.4, z: Y12 - 0.4 },
    { type: 'plant', x: X4 + 0.4, z: Y12 - 4.0 },
    { type: 'shelf', x: X5 - 0.2, z: -16.5, rot: 3, w: 1.8 },
    { type: 'bench', x: X4 + 3.17, z: -18.0, rot: 1 },
    { type: 'plant', x: X5 - 0.4, z: GROUND_SOUTH + 1.8 },
    { type: 'plant', x: X5 + 0.4, z: Y12 - 0.4 },
    // 105 and 109, stores
    ...racks([-10.0, -7.6, -5.2], Y3 + 1.34, GROUND_SOUTH + 0.44),
    ...racks([6.4, 8.8], Y3 + 0.04, GROUND_SOUTH + 0.74), // clear of the corridor that overlaps 109's west end
    // 110, staff room: table, kitchenette, lockers
    { type: 'diningTable', x: 6.9, z: Y3 + 1.85, w: 1.6 },
    { type: 'counter', x: X5 + 2.2, z: Y3 + 1.85, rot: 1, w: 1.6 },
    { type: 'wardrobe', x: X6, z: Y3 + 1.85, rot: 3, w: 1.6 },
    // 111, office
    { type: 'desk', x: 6.4, z: Y4 - 2.81 },
    { type: 'desk', x: 8.2, z: Y4 - 2.81 },
    { type: 'shelf', x: X6 + 0.1, z: Y4 - 3.45, rot: 3, w: 1.4 },
    // 112 and 113, toilets: two WCs and a basin each
    ...[5.8, 7.1, 8.6, 9.9].map((x): FurnitureItem => ({ type: 'toilet', x, z: Y5 - 0.31 })),
    { type: 'vanity', x: X5 + 2.14, z: Y4 - 0.51, rot: 1 },
    { type: 'vanity', x: X6 + 0.07, z: Y4 - 0.51, rot: 3 },
  ];
}

// ---- the basement (B1), 3.9 m below floor 1 (section 1-1). The car park under blocks A-C is
// traced from its own plan ("Зоорийн давхрын байгуулалт") and room schedule, block D's garage and
// the driveway to it from the combined basement plan. Each crossed box on the plans is one or two
// 2.5 x 5 m parking spaces. The two plans place block D about 1.4 m apart; it follows site.json's
// annex here. The plans stop where the ramps leave the building, so each ramp is drawn reaching
// ground level at that point, steeper than it will be built.

/** n parking spaces side by side filling a box, stacked along v (cars facing east or west) or
 *  along u (cars facing north or south). `rect` makes the box, in the site frame or block D's. */
const stalls = (u0: number, u1: number, v0: number, v1: number, n: number, along: 'u' | 'v' = 'v', rect = box): Pt[][] =>
  Array.from({ length: n }, (_, i) => {
    const [a, b] = along === 'v' ? [v0, v1] : [u0, u1];
    const [s0, s1] = [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n];
    return along === 'v' ? rect(u0, u1, s0, s1) : rect(s0, s1, v0, v1);
  });
/** Two parking spaces facing east or west, centred on the bay between two grid lines. */
const pair = (u0: number, u1: number, va: number, vb: number) => stalls(u0, u1, (va + vb) / 2 - 2.55, (va + vb) / 2 + 2.55, 2);
/** Spine of the double row of parking down the middle of the car park. */
const ISLAND = X4 + 3.7;

const carPark: Pt[][] = [
  // west row, cars facing east
  ...[[Y9, Y10], [Y7, Y8], [Y6, Y7], [Y5, Y6], [Y3, Y4]].flatMap(([a, b]) => pair(X1 + 1.25, X1 + 6.25, a, b)),
  // east row, cars facing west, starting just south of room 04
  ...stalls(X6 + 1.2, X6 + 6.2, Y10 + 0.4, Y10 + 3.4, 1),
  ...[[Y9, Y10], [Y7, Y8], [Y6, Y7]].flatMap(([a, b]) => pair(X6 + 1.2, X6 + 6.2, a, b)),
  // the double row down the middle, with one space across its north end
  ...stalls(ISLAND - 2.6, ISLAND + 2.4, Y9 - 1.1, Y9 + 1.5, 1),
  ...[[Y7, Y8], [Y6, Y7], [Y5, Y6], [Y2, Y3]].flatMap(([a, b]) => [...pair(ISLAND - 5, ISLAND, a, b), ...pair(ISLAND, ISLAND + 5, a, b)]),
  // cars facing south beside tower B's core; the northern pair parks behind the next one
  ...stalls(X4 + 1, X4 + 6.05, Y11 + 0.6, Y12 - 1.25, 2, 'u'),
  ...stalls(X4 + 1, X4 + 6.05, Y11 - 5.95, Y11 - 0.75, 2, 'u'),
  ...stalls(X5 + 2.95, X5 + 5.55, Y11 - 5.95, Y11 - 0.75, 1, 'u'),
  // two along the south wall
  ...stalls(X2 + 1.55, X2 + 6.55, Y1 + 0.3, Y1 + 3.1, 1),
  ...stalls(X4 + 1.4, X4 + 6.4, Y1 + 0.3, Y1 + 3.1, 1),
];

// Block D's own frame: x east and y south from the outer north-west corner of its walls, along
// them (it is turned about 2.5 degrees from the main grid). Its grid is 3 x 5 bays of 6 m.
const [dNE, dNW, dSW] = site.annex as Pt[];
const DW = Math.hypot(dNE[0] - dNW[0], dNE[1] - dNW[1]);
const DL = Math.hypot(dSW[0] - dNW[0], dSW[1] - dNW[1]);
const inD = (x: number, y: number): Pt => [
  dNW[0] + (x / DW) * (dNE[0] - dNW[0]) + (y / DL) * (dSW[0] - dNW[0]),
  dNW[1] + (x / DW) * (dNE[1] - dNW[1]) + (y / DL) * (dSW[1] - dNW[1]),
];
const boxD = (x0: number, x1: number, y0: number, y1: number): Pt[] => [inD(x0, y0), inD(x1, y0), inD(x1, y1), inD(x0, y1)];
/** Block D's stair core stands out this far past the garage's east wall, and this far south. */
const [D_CORE_W, D_CORE_L] = [2.9, 10.5];

/** Two rows of parking along the side walls, a pair in every 6 m bay. */
const garageD: Pt[][] = [0, 1, 2, 3, 4].flatMap((k) => {
  const c = 3.45 + 6 * k;
  const east = k ? stalls(12.7, 17.65, c - 2.65, c + 2.65, 2, 'v', boxD) : stalls(12.7, 17.65, 0.85, 3.35, 1, 'v', boxD);
  return [...stalls(0.9, 6.2, c - 2.65, c + 2.65, 2, 'v', boxD), ...east];
});

/** The whole basement: the car park, the driveway south and block D's garage with its stair core.
 *  The two ramps start at gaps in it, on axis X2 and on axis Y5. */
const basementOutline: Pt[] = [
  [X1, Y11], [X4, Y11], [X4, Y12], [X7, Y12], [X7, Y5], [X6, Y5], [X6, Y1],
  inD(12.45, 0), inD(DW + D_CORE_W, 0), inD(DW + D_CORE_W, D_CORE_L), inD(DW, D_CORE_L), inD(DW, DL), inD(0, DL), inD(0, 0), inD(6.45, 0),
  [X5 + 1.5, Y1], [X2, Y1], [X2, Y3 - 4.9], [X2, Y3], [X1, Y3],
];

const basement: PodiumSpace[] = [
  {
    id: '01', no: '01', type: 'parking', area: 1538.6, stalls: carPark,
    outline: [[X1, Y11], [X4, Y11], [X4, Y12], [X7, Y12], [X7, Y5], [X6, Y5], [X6, Y1], [X2, Y1], [X2, Y3], [X1, Y3]],
  },
  { id: '02', no: '02', type: 'technical', area: 84.0, outline: box(X1, X4, Y10, Y11) },
  // tower B's core, below the floor-1 lobby: the same lifts and stair
  { id: '03', no: '03', type: 'lobby', area: 20.8, outline: [[X5, Y11], [X5 + 4.1, Y11], [X5 + 4.1, Y12 - 4.6], [X5 + 2.1, Y12 - 4.6], [X5 + 2.1, Y12], [X5, Y12]] },
  { ...liftsB, doors: 'W' },
  { id: 'stairs-b', type: 'stairs', door: 'W', flip: true, outline: box(X5 + 4.1, X6, Y11, Y12) },
  { id: '04', no: '04', type: 'technical', area: 65.3, outline: box(X6, X7, Y11 - 2.7, Y12) },
  // tower C's core: the lifts and their lobby 05, stair 07, and a lobby off the car park on the west
  { id: 'lifts-c', type: 'lifts', doors: 'E', outline: box(X4 + 2.9, X4 + 5.0, Y4 - 4.0, Y4) },
  { id: '05', no: '05', type: 'lobby', area: 21.2, outline: [[X4 + 2.9, Y4 - 4.0], [X4 + 5.0, Y4 - 4.0], [X4 + 5.0, Y4], [X5, Y4], [X5, Y3], [X4 + 2.9, Y3]] },
  { id: '07', no: '07', type: 'stairs', area: 17.1, door: 'E', outline: box(X4 + 0.3, X4 + 2.9, Y3, Y4) },
  { id: 'vestibule-c', type: 'vestibule', outline: box(X3, X4 + 0.3, Y3, Y4) },
  { id: 'ramp-w', type: 'ramp', rise: 'W', outline: box(X1 - 1.9, X2, Y3 - 4.9, Y3) },
  { id: 'ramp-e', type: 'ramp', rise: 'S', outline: box(X6, X7, Y3 - 3.6, Y5) },
  { id: 'driveway', type: 'parking', outline: [[X5 + 1.5, Y1], [X6, Y1], inD(12.45, 0), inD(6.45, 0)] },
  // block D's garage (no area on the schedule, which covers blocks A-C) and its stair core
  { id: 'garage-d', no: 'D', type: 'parking', stalls: garageD, outline: boxD(0, DW, 0, DL) },
  { id: 'lobby-d', type: 'lobby', outline: boxD(DW - 0.45, DW + D_CORE_W, 0, 4.4) },
  { id: '15', no: '15', type: 'stairs', door: 'N', outline: boxD(DW - 0.45, DW + D_CORE_W, 4.4, D_CORE_L) },
];

export const podiumFloors: PodiumFloor[] = [
  {
    floor: 0,
    z0: -3.9,
    z1: 0,
    below: 0,
    outline: basementOutline,
    spaces: basement,
  },
  {
    floor: 1,
    z0: 0,
    z1: 4.5,
    outline: outlineTo(GROUND_SOUTH),
    total: 1359.5,
    spaces: floorOne,
    furniture: furnish(floorOne),
  },
  {
    floor: 2,
    z0: 4.5,
    z1: 8.1,
    outline: podiumOutline,
    total: 1564.1,
    spaces: [{ id: '201', no: '201', type: 'retail', area: 1541.7, outline: podiumOutline }, ...coreUpper(['203', 10.4, '204', 12.0])],
  },
  {
    floor: 3,
    z0: 8.1,
    z1: 11.7,
    outline: podiumOutline,
    total: 1559.0,
    // numbered 120-122 on the 3rd-floor schedule, kept as printed
    spaces: [{ id: '120', no: '120', type: 'retail', area: 1536.7, outline: podiumOutline }, ...coreUpper(['121', 10.4, '122', 12.0])],
  },
  {
    floor: 4,
    z0: 11.7,
    z1: 12.9,
    outline: podiumOutline,
    spaces: [
      { id: '405', no: '405', type: 'playground', outline: terraceOutline },
      // the apartment floors standing on the roof, overhanging it east and west
      { id: 'tower-B', type: 'tower', tower: 'B', outline: towerOutline(towerPlate('B')) },
      { id: 'tower-C', type: 'tower', tower: 'C', outline: towerOutline(towerPlate('C')) },
    ],
    // traced from the 4th-floor plan and the landscaping drawing
    decor: [
      { kind: 'pavilion', c: [X4 + 0.5, Y7 - 1.95], r: 3.6 },
      { kind: 'climber', path: [[2.3, -3.3], [5.8, -0.2], [9.4, 3.4], [12.5, 6.9]], w: 2.8 },
      { kind: 'pad', c: [4.2, 3.6], rx: 1.9, ry: 1.9, tone: 'blue' },
      { kind: 'pad', c: [10.6, -3.9], rx: 1.9, ry: 1.9, tone: 'blue' },
      { kind: 'pad', c: [X1 + 3.7, Y11 - 3.1], rx: 1.6, ry: 1.1, tone: 'blue' },
      { kind: 'pad', c: [X1 + 6.5, Y11 - 5.5], rx: 1.6, ry: 1.1, tone: 'blue' },
      { kind: 'pad', c: [X1 + 3.7, Y11 - 7.7], rx: 1.6, ry: 1.1, tone: 'blue' },
    ],
  },
];

export const getPodiumFloor = (floor: number) => podiumFloors.find((f) => f.floor === floor);
/** Spaces listed beside the plan: numbered rooms, the towers and the ramps. */
export const listedSpaces = (f: PodiumFloor) => f.spaces.filter((s) => s.no || s.tower || s.type === 'ramp');
/** A podium floor's name on buttons and in links: B1 for the basement. */
export const floorName = (floor: number) => (floor === 0 ? 'B1' : String(floor));
