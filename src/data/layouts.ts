import type { FurnitureItem, FurnitureType, Layout, LayoutId, Opening, PlanId, Room, RoomType } from './types';

// The apartments of the typical floor (floors 5 to 16), traced from the architect's schematic
// design ("СЭВОЦЗ" ХХК-ийн үйлчилгээ, орон сууцны цогцолбор, Уран проект ХХК, 2026, sheets 17-20).
//
// Everything below is written in floor-plate coordinates, so it can be checked against the
// drawing: X runs east from grid line X2, Y runs north from grid line Y1, in metres. Grid lines
// X2 / X4 / X5 / X6 are at 0 / 7.2 / 14.4 / 21.6, Y1 / Y2 / Y3 / Y4 at 0 / 7.2 / 13.8 / 21.0.
//
// Each room is a rectangle sized so its area matches the architect's room schedule. Rooms that
// are not rectangles on the drawing (the living room of plan C wraps round its entrance hall) are
// split into rectangles joined with `partOf`. Apartments D, E and F are mirror images of C, B
// and A about the middle of the plate (X = 10.8).
//
// Ceiling heights are not in the schematic design. The storey height is 3.0 m (sections 1-1 and
// 2-2), so the clear heights here are estimates.

const H = 2.7; // living rooms, bedrooms, balconies
const H_SERVICE = 2.6; // halls
const H_WET = 2.5; // bathrooms (suspended ceiling)

/** The plate is symmetric about X = 10.8: plans D, E, F mirror C, B, A. */
const MIRROR = 21.6;

type Face = 'S' | 'E' | 'N' | 'W';

interface RoomSpec {
  id: string;
  type: RoomType;
  n?: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  h: number;
  wet?: boolean;
  partOf?: string;
  eye?: [number, number];
}

interface OpeningSpec {
  kind: Opening['kind'];
  /** 'x': a wall running east-west (constant Y). 'z': a wall running north-south (constant X). */
  axis: 'x' | 'z';
  x: number;
  y: number;
  width: number;
}

interface FurnitureSpec {
  type: FurnitureType;
  x: number;
  y: number;
  face?: Face;
  w?: number;
}

interface Spec {
  id: LayoutId;
  plan: PlanId;
  bedrooms: number;
  bathrooms: number;
  area: number;
  rooms: RoomSpec[];
  openings: OpeningSpec[];
  furniture: FurnitureSpec[];
}

const ROT: Record<Face, 0 | 1 | 2 | 3> = { S: 0, E: 1, N: 2, W: 3 };
const FLIP: Record<Face, Face> = { S: 'S', N: 'N', E: 'W', W: 'E' };

/** Plate coordinates -> the apartment's own coordinates (x east, z south from its north-west corner). */
function build(spec: Spec): Layout {
  const X0 = Math.min(...spec.rooms.map((r) => r.x0));
  const X1 = Math.max(...spec.rooms.map((r) => r.x1));
  const Y0 = Math.min(...spec.rooms.map((r) => r.y0));
  const Y1 = Math.max(...spec.rooms.map((r) => r.y1));
  const lx = (x: number) => +(x - X0).toFixed(3);
  const lz = (y: number) => +(Y1 - y).toFixed(3);

  const rooms: Room[] = spec.rooms.map((r) => ({
    id: r.id,
    type: r.type,
    ...(r.n ? { n: r.n } : {}),
    x: lx(r.x0),
    z: lz(r.y1),
    w: +(r.x1 - r.x0).toFixed(3),
    d: +(r.y1 - r.y0).toFixed(3),
    h: r.h,
    ...(r.wet ? { wet: true } : {}),
    ...(r.partOf ? { partOf: r.partOf } : {}),
    ...(r.eye ? { eye: [lx(r.eye[0]), lz(r.eye[1])] as [number, number] } : {}),
  }));
  const openings: Opening[] = spec.openings.map((o) => ({ kind: o.kind, axis: o.axis, x: lx(o.x), z: lz(o.y), width: o.width }));
  const furniture: FurnitureItem[] = spec.furniture.map((f) => ({
    type: f.type,
    x: lx(f.x),
    z: lz(f.y),
    rot: ROT[f.face ?? 'S'],
    ...(f.w ? { w: f.w } : {}),
  }));

  return {
    id: spec.id,
    plan: spec.plan,
    bedrooms: spec.bedrooms,
    bathrooms: spec.bathrooms,
    area: spec.area,
    w: +(X1 - X0).toFixed(3),
    d: +(Y1 - Y0).toFixed(3),
    origin: [X0, Y1],
    rooms,
    openings,
    furniture,
  };
}

function mirror(spec: Spec, id: LayoutId, plan: PlanId): Spec {
  const fx = (x: number) => +(MIRROR - x).toFixed(3);
  return {
    ...spec,
    id,
    plan,
    rooms: spec.rooms.map((r) => ({ ...r, x0: fx(r.x1), x1: fx(r.x0), ...(r.eye ? { eye: [fx(r.eye[0]), r.eye[1]] as [number, number] } : {}) })),
    openings: spec.openings.map((o) => ({ ...o, x: fx(o.x) })),
    furniture: spec.furniture.map((f) => ({ ...f, x: fx(f.x), face: FLIP[f.face ?? 'S'] })),
  };
}

const win = (axis: 'x' | 'z', x: number, y: number, width: number): OpeningSpec => ({ kind: 'window', axis, x, y, width });
const door = (axis: 'x' | 'z', x: number, y: number, width = 0.8): OpeningSpec => ({ kind: 'door', axis, x, y, width });

// Plan A: two bedrooms, 67.9 m². North-west corner, entered from the lift lobby.
// Schedule: A1 living 32.0, A2 hall 5.8, A3 bathroom 4.5, A4 bedroom 11.1, A5 bedroom 11.4, A6 balcony 3.2.
const A: Spec = {
  id: 'A',
  plan: 'A',
  bedrooms: 2,
  bathrooms: 1,
  area: 67.9,
  rooms: [
    { id: 'living', type: 'living', x0: -1.75, x1: 7.02, y0: 14.05, y1: 17.7, h: H, eye: [3.6, 16.2] },
    { id: 'hall', type: 'hall', x0: 5.6, x1: 9.0, y0: 12.34, y1: 14.05, h: H_SERVICE, eye: [7.4, 13.2] },
    { id: 'bathroom', type: 'bathroom', x0: 3.5, x1: 5.6, y0: 11.91, y1: 14.05, h: H_WET, wet: true, eye: [4.6, 13.1] },
    { id: 'bedroom1', type: 'bedroom', n: 1, x0: -0.45, x1: 3.1, y0: 17.7, y1: 20.9, h: H, eye: [2.6, 18.5] },
    { id: 'bedroom2', type: 'bedroom', n: 2, x0: 3.1, x1: 6.57, y0: 17.7, y1: 20.9, h: H, eye: [4.5, 18.6] },
    { id: 'balcony', type: 'balcony', x0: -1.75, x1: -0.45, y0: 18.45, y1: 20.9, h: H, wet: true },
  ],
  openings: [
    { kind: 'entry', axis: 'z', x: 9.0, y: 13.2, width: 0.95 },
    door('x', 6.3, 14.05, 0.9),
    door('z', 5.6, 13.3, 0.7),
    door('x', 2.4, 17.7),
    door('x', 3.75, 17.7),
    door('z', -0.45, 19.1),
    win('x', 1.3, 20.9, 1.6),
    win('x', 4.85, 20.9, 1.6),
    win('x', -1.1, 20.9, 0.9),
    win('z', -1.75, 19.7, 1.6),
    win('z', -1.75, 15.9, 2.2),
  ],
  furniture: [
    { type: 'bed', x: 1.35, y: 19.85 },
    { type: 'nightstand', x: 0.27, y: 20.65 },
    { type: 'nightstand', x: 2.43, y: 20.65 },
    { type: 'wardrobe', x: 1.0, y: 18.0, face: 'N', w: 1.8 },
    { type: 'singleBed', x: 6.0, y: 19.85 },
    { type: 'desk', x: 3.9, y: 20.55 },
    { type: 'wardrobe', x: 5.2, y: 18.0, face: 'N', w: 1.4 },
    { type: 'counter', x: 5.65, y: 17.39, w: 2.4 },
    { type: 'fridge', x: 6.69, y: 16.55, face: 'W' },
    { type: 'diningTable', x: 3.4, y: 15.6 },
    { type: 'sofa', x: -0.1, y: 14.55, face: 'N', w: 2.2 },
    { type: 'rug', x: -0.1, y: 15.75 },
    { type: 'coffeeTable', x: -0.1, y: 15.65 },
    { type: 'tvUnit', x: -0.1, y: 17.45 },
    { type: 'plant', x: -1.45, y: 14.35 },
    { type: 'shoeCabinet', x: 7.9, y: 12.52, face: 'N' },
    { type: 'bathtub', x: 4.4, y: 12.3, face: 'N' },
    { type: 'toilet', x: 3.8, y: 13.7 },
    { type: 'vanity', x: 4.85, y: 13.79 },
  ],
};

// Plan A on floor 4 of Block B: the homeowners' association room takes the place of plan B,
// and the hall is longer. Schedule: A2 hall 7.5, apartment 69.6 m².
const A4: Spec = {
  ...A,
  id: 'A4',
  area: 69.6,
  rooms: A.rooms.map((r) => (r.id === 'hall' ? { ...r, y0: 11.84 } : r)),
  furniture: A.furniture.map((f) => (f.type === 'shoeCabinet' ? { ...f, y: 12.02 } : f)),
};

// Plan B: one bedroom, 50.3 m². West side, between A and C.
// Schedule: B1 living 33.6, B2 bedroom 9.7, B3 bathroom 4.0, B4 balcony 3.0.
const B: Spec = {
  id: 'B',
  plan: 'B',
  bedrooms: 1,
  bathrooms: 1,
  area: 50.3,
  rooms: [
    { id: 'living', type: 'living', x0: -1.75, x1: 7.33, y0: 7.15, y1: 10.85, h: H, eye: [3.4, 9.6] },
    { id: 'bedroom', type: 'bedroom', x0: -0.45, x1: 3.14, y0: 10.85, y1: 13.55, h: H, eye: [2.7, 11.5] },
    { id: 'bathroom', type: 'bathroom', x0: 7.33, x1: 9.0, y0: 7.15, y1: 9.55, h: H_WET, wet: true, eye: [8.1, 8.6] },
    { id: 'balcony', type: 'balcony', x0: -1.75, x1: -0.45, y0: 10.85, y1: 13.16, h: H, wet: true },
  ],
  openings: [
    { kind: 'entry', axis: 'z', x: 7.33, y: 10.2, width: 0.95 },
    door('z', 7.33, 8.4, 0.7),
    door('x', 2.55, 10.85),
    door('z', -0.45, 12.7),
    win('z', -0.45, 11.55, 1.0),
    win('z', -1.75, 12.0, 1.8),
    win('z', -1.75, 9.0, 2.2),
  ],
  furniture: [
    { type: 'bed', x: 1.35, y: 12.5 },
    { type: 'nightstand', x: 0.27, y: 13.3 },
    { type: 'nightstand', x: 2.43, y: 13.3 },
    { type: 'wardrobe', x: 2.84, y: 12.3, face: 'W', w: 1.4 },
    { type: 'sofa', x: -0.3, y: 10.38, w: 2.2 },
    { type: 'rug', x: -0.3, y: 9.2 },
    { type: 'coffeeTable', x: -0.3, y: 9.3 },
    { type: 'tvUnit', x: -0.3, y: 7.37, face: 'N' },
    { type: 'diningTable', x: 3.4, y: 9.0 },
    { type: 'counter', x: 5.6, y: 7.46, face: 'N', w: 2.4 },
    { type: 'fridge', x: 7.06, y: 7.48, face: 'N' },
    { type: 'plant', x: -1.45, y: 7.45 },
    { type: 'shower', x: 8.55, y: 7.6 },
    { type: 'toilet', x: 7.7, y: 9.2 },
    { type: 'vanity', x: 8.55, y: 9.3 },
  ],
};

// Plan C: two bedrooms and two bathrooms, 85.1 m². South-west corner.
// Schedule: C1 living (with the entrance hall) 41.2, C2 shower room 3.4, C3 bedroom 15.7,
// C4 bedroom 17.3, C5 bathroom 4.5, C6 balcony 3.0.
const C: Spec = {
  id: 'C',
  plan: 'C',
  bedrooms: 2,
  bathrooms: 2,
  area: 85.1,
  rooms: [
    { id: 'living', type: 'living', x0: 5.449, x1: 10.8, y0: 0.15, y1: 7.15, h: H, eye: [8.0, 3.9] },
    { id: 'livingHall', type: 'hall', partOf: 'living', x0: 2.553, x1: 5.449, y0: 3.13, y1: 4.422, h: H_SERVICE },
    { id: 'bathroom1', type: 'bathroom', n: 1, x0: 2.553, x1: 4.203, y0: 4.422, y1: 7.15, h: H_WET, wet: true, eye: [3.4, 5.4] },
    { id: 'bathroom2', type: 'bathroom', n: 2, x0: 4.203, x1: 5.449, y0: 4.422, y1: 7.15, h: H_WET, wet: true, eye: [4.8, 5.2] },
    { id: 'bedroom1', type: 'bedroom', n: 1, x0: -1.75, x1: 2.553, y0: 3.13, y1: 7.15, h: H, eye: [1.4, 4.2] },
    { id: 'bedroom2', type: 'bedroom', n: 2, x0: -0.35, x1: 4.918, y0: 0.15, y1: 3.13, h: H, eye: [3.6, 2.2] },
    { id: 'balcony', type: 'balcony', x0: -1.75, x1: -0.35, y0: 0.15, y1: 2.293, h: H, wet: true },
  ],
  openings: [
    { kind: 'entry', axis: 'x', x: 10.0, y: 7.15, width: 0.95 },
    { kind: 'open', axis: 'z', x: 5.449, y: 3.776, width: 1.292 },
    door('z', 2.553, 3.78),
    door('x', 3.3, 4.422, 0.7),
    door('x', 4.83, 4.422, 0.65),
    door('x', 4.2, 3.13),
    door('z', -0.35, 1.85),
    win('x', 7.1, 0.15, 2.4),
    win('x', 9.6, 0.15, 1.6),
    win('x', 2.1, 0.15, 1.8),
    win('z', -1.75, 5.2, 1.8),
    win('x', -1.05, 0.15, 0.9),
    win('z', -1.75, 1.2, 1.4),
  ],
  furniture: [
    { type: 'bed', x: 0.4, y: 6.1 },
    { type: 'nightstand', x: -0.66, y: 6.9 },
    { type: 'nightstand', x: 1.46, y: 6.9 },
    { type: 'wardrobe', x: 0.4, y: 3.42, face: 'N', w: 2.0 },
    { type: 'bed', x: 1.6, y: 2.1 },
    { type: 'nightstand', x: 0.35, y: 2.9 },
    { type: 'desk', x: 3.9, y: 0.46, face: 'N' },
    { type: 'wardrobe', x: -0.06, y: 0.8, face: 'E', w: 1.0 },
    { type: 'bathtub', x: 3.378, y: 6.75, face: 'N' },
    { type: 'toilet', x: 2.88, y: 5.0, face: 'E' },
    { type: 'vanity', x: 3.95, y: 5.6, face: 'W' },
    { type: 'shower', x: 4.83, y: 6.65 },
    { type: 'toilet', x: 5.15, y: 5.3, face: 'W' },
    { type: 'counter', x: 6.85, y: 6.85, w: 2.4 },
    { type: 'fridge', x: 8.45, y: 6.82 },
    { type: 'diningTable', x: 6.75, y: 2.3, face: 'E' },
    { type: 'sofa', x: 8.55, y: 2.3, face: 'E', w: 2.2 },
    { type: 'rug', x: 9.6, y: 2.3, face: 'E' },
    { type: 'coffeeTable', x: 9.6, y: 2.3, face: 'E' },
    { type: 'tvUnit', x: 10.58, y: 2.3, face: 'W' },
    { type: 'armchair', x: 9.6, y: 3.75 },
    { type: 'shelf', x: 10.6, y: 5.2, face: 'W' },
    { type: 'plant', x: 10.45, y: 0.5 },
  ],
};

export const layouts: Record<LayoutId, Layout> = {
  A: build(A),
  A4: build(A4),
  B: build(B),
  C: build(C),
  D: build(mirror(C, 'D', 'D')),
  E: build(mirror(B, 'E', 'E')),
  F: build(mirror(A, 'F', 'F')),
};

/** The three apartment types, by the plans that share them. */
export const apartmentTypes: { plans: PlanId[]; layout: LayoutId }[] = [
  { plans: ['B', 'E'], layout: 'B' },
  { plans: ['A', 'F'], layout: 'A' },
  { plans: ['C', 'D'], layout: 'C' },
];
