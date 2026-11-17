import { PLATE } from './building';
import type { Facing, Layout, LayoutId, Room } from './types';

// The six apartments of a tower floor, from the architect's typical floor plan ("5-16-р давхрын
// байгуулалт", drawn for blocks B and C). Every room is a rectangle traced on the wall
// centrelines, so sizes are good to about 0.2 m; the areas are the room schedule's. A, B and C
// are traced; F, E and D are their mirror images across the core, as on the drawing. The 3D
// model, the 2D plans and the 360° tour are all generated from this file.
//
// While tracing, coordinates are floor-plate metres (x east from grid X2, z south from grid Y4,
// see PLATE). place() then moves every apartment to its own (0, 0) and keeps where it sits in `at`.

/** Room height for drawing only: the drawings give 3.0 m floor to floor, no ceiling height. */
const H = 2.7;

type Draft = Omit<Layout, 'w' | 'd' | 'at'>;

/** A room from its two corners on the plate. */
const r = (id: string, type: Room['type'], [x0, z0, x1, z1]: number[], extra: Partial<Room> = {}): Room => ({
  id,
  type,
  x: x0,
  z: z0,
  w: +(x1 - x0).toFixed(2),
  d: +(z1 - z0).toFixed(2),
  h: H,
  ...extra,
});

// "A" айл, north-west corner. Rooms A1-A6 on the drawing.
const A: Draft = {
  id: 'A',
  bedrooms: 2,
  area: 67.9,
  facing: 'NW',
  rooms: [
    r('living', 'living', [-1.8, 3.3, 7.2, 7.2], { area: 32.0 }),
    r('bedroom1', 'bedroom', [-0.2, 0, 3.6, 3.3], { n: 1, area: 11.4 }),
    r('bedroom2', 'bedroom', [3.6, 0, 7.2, 3.3], { n: 2, area: 11.1 }),
    r('bathroom', 'bathroom', [3.6, 7.2, 5.6, 10.1], { area: 4.5, wet: true }),
    r('hall', 'hall', [5.6, 7.2, 8.5, 10.1], { area: 5.8 }),
    r('balcony', 'balcony', [-1.8, 0, -0.2, 3.3], { area: 3.2 }),
  ],
  openings: [
    { kind: 'entry', axis: 'z', x: 8.5, z: 8.65, width: 0.9 },
    { kind: 'opening', axis: 'x', x: 6.35, z: 7.2, width: 1.3 },
    { kind: 'door', axis: 'z', x: 5.6, z: 8.4, width: 0.7 },
    { kind: 'door', axis: 'x', x: 3.0, z: 3.3, width: 0.8 },
    { kind: 'door', axis: 'x', x: 4.2, z: 3.3, width: 0.8 },
    { kind: 'door', axis: 'z', x: -0.2, z: 2.4, width: 0.8 },
    { kind: 'window', axis: 'z', x: -0.2, z: 1.1, width: 1.2 },
    { kind: 'window', axis: 'x', x: 1.7, z: 0, width: 1.8 },
    { kind: 'window', axis: 'x', x: 5.4, z: 0, width: 1.5 },
    { kind: 'window', axis: 'z', x: -1.8, z: 5.25, width: 2.6 },
    { kind: 'window', axis: 'x', x: -1.0, z: 0, width: 1.2 },
    { kind: 'window', axis: 'z', x: -1.8, z: 1.65, width: 2.6 },
  ],
  furniture: [
    // living room: sofa facing the TV wall, dining table, L-shaped kitchen against the core
    { type: 'tvUnit', x: 0.5, z: 3.55 },
    { type: 'rug', x: 0.5, z: 5.3 },
    { type: 'coffeeTable', x: 0.5, z: 5.5 },
    { type: 'sofa', x: 0.5, z: 6.75, rot: 2, w: 2.4 },
    { type: 'plant', x: -1.4, z: 3.75 },
    { type: 'diningTable', x: 4.0, z: 6.2, rot: 1 },
    { type: 'counter', x: 5.7, z: 3.6, w: 1.4 },
    { type: 'fridge', x: 6.85, z: 3.65, rot: 3 },
    { type: 'counter', x: 6.9, z: 5.1, rot: 3, w: 2.2 },
    // bedrooms
    { type: 'bed', x: 1.7, z: 1.2 },
    { type: 'nightstand', x: 0.6, z: 0.3 },
    { type: 'nightstand', x: 2.8, z: 0.3 },
    { type: 'wardrobe', x: 0.85, z: 3.0, rot: 2, w: 1.6 },
    { type: 'singleBed', x: 6.6, z: 1.2 },
    { type: 'desk', x: 3.95, z: 1.1, rot: 1 },
    { type: 'wardrobe', x: 5.9, z: 3.0, rot: 2, w: 1.4 },
    // bathroom, hall, balcony
    { type: 'toilet', x: 4.55, z: 7.5 },
    { type: 'vanity', x: 3.9, z: 8.5, rot: 1 },
    { type: 'bathtub', x: 4.5, z: 9.7 },
    { type: 'wardrobe', x: 7.05, z: 9.8, rot: 2, w: 2.4 },
    { type: 'plant', x: -1.3, z: 0.6 },
  ],
};

// "B" айл, west side. B1 includes the entrance hall and the kitchen.
const B: Draft = {
  id: 'B',
  bedrooms: 1,
  area: 50.3,
  facing: 'W',
  rooms: [
    r('living', 'living', [-1.8, 10.1, 6.9, 13.9], { area: 33.6 }),
    r('bedroom', 'bedroom', [-0.2, 7.2, 3.6, 10.1], { area: 9.7 }),
    r('bathroom', 'bathroom', [6.9, 11.5, 9.2, 13.9], { area: 4.0, wet: true }),
    r('hall', 'hall', [6.9, 10.1, 8.5, 11.5]),
    r('balcony', 'balcony', [-1.8, 7.2, -0.2, 10.1], { area: 3.0 }),
  ],
  openings: [
    { kind: 'entry', axis: 'z', x: 8.5, z: 10.8, width: 0.9 },
    { kind: 'opening', axis: 'z', x: 6.9, z: 10.75, width: 1.1 },
    { kind: 'door', axis: 'x', x: 7.7, z: 11.5, width: 0.7 },
    { kind: 'door', axis: 'x', x: 3.1, z: 10.1, width: 0.8 },
    { kind: 'door', axis: 'z', x: -0.2, z: 9.2, width: 0.8 },
    { kind: 'window', axis: 'z', x: -0.2, z: 8.0, width: 1.2 },
    { kind: 'window', axis: 'z', x: -1.8, z: 12.0, width: 2.6 },
    { kind: 'window', axis: 'z', x: -1.8, z: 8.65, width: 2.4 },
  ],
  furniture: [
    { type: 'sofa', x: 0.1, z: 10.55, w: 2.4 },
    { type: 'rug', x: 0.1, z: 11.6 },
    { type: 'coffeeTable', x: 0.1, z: 11.7 },
    { type: 'tvUnit', x: 0.1, z: 13.65, rot: 2 },
    { type: 'plant', x: -1.4, z: 13.5 },
    { type: 'diningTable', x: 2.9, z: 12.9, rot: 1 },
    { type: 'fridge', x: 4.3, z: 13.55, rot: 2 },
    { type: 'counter', x: 5.3, z: 13.6, rot: 2, w: 1.4 },
    { type: 'counter', x: 6.6, z: 12.5, rot: 3, w: 2.2 },
    { type: 'bed', x: 1.6, z: 8.3 },
    { type: 'nightstand', x: 0.5, z: 7.45 },
    { type: 'wardrobe', x: 3.3, z: 8.6, rot: 3, w: 2.2 },
    { type: 'toilet', x: 8.9, z: 12.15, rot: 3 },
    { type: 'vanity', x: 7.15, z: 12.7, rot: 1 },
    { type: 'shower', x: 8.7, z: 13.4 },
    { type: 'plant', x: -1.3, z: 7.7 },
  ],
};

// "C" айл, south-west corner. C1 is L-shaped, so it is drawn as the living room plus the
// kitchen, the entrance hall from the core and the corridor to the bedrooms.
const C: Draft = {
  id: 'C',
  bedrooms: 2,
  area: 85.1,
  facing: 'SW',
  rooms: [
    r('living', 'living', [5.25, 16.6, 10.8, 21.0], { area: 41.2 }),
    r('kitchen', 'kitchen', [6.3, 13.9, 10.8, 16.6]),
    r('bedroom1', 'bedroom', [-1.8, 13.9, 2.65, 18.0], { n: 1, area: 17.3 }),
    r('bedroom2', 'bedroom', [-0.2, 18.0, 5.25, 21.0], { n: 2, area: 15.7 }),
    r('bathroom1', 'bathroom', [2.65, 13.9, 4.55, 16.6], { n: 1, area: 4.5, wet: true }),
    r('bathroom2', 'bathroom', [4.55, 13.9, 6.3, 16.6], { n: 2, area: 3.4, wet: true }),
    r('hall', 'hall', [9.2, 11.5, 10.8, 13.9]),
    r('corridor', 'corridor', [2.65, 16.6, 5.25, 18.0]),
    r('balcony', 'balcony', [-1.8, 18.0, -0.2, 21.0], { area: 3.0 }),
  ],
  openings: [
    { kind: 'entry', axis: 'x', x: 10.1, z: 11.5, width: 0.9 },
    { kind: 'opening', axis: 'x', x: 10.15, z: 13.9, width: 1.2 },
    { kind: 'opening', axis: 'x', x: 8.55, z: 16.6, width: 4.3 },
    { kind: 'opening', axis: 'z', x: 5.25, z: 17.3, width: 1.2 },
    { kind: 'door', axis: 'x', x: 5.8, z: 16.6, width: 0.7 },
    { kind: 'door', axis: 'x', x: 3.6, z: 16.6, width: 0.7 },
    { kind: 'door', axis: 'z', x: 2.65, z: 17.3, width: 0.8 },
    { kind: 'door', axis: 'x', x: 4.5, z: 18.0, width: 0.8 },
    { kind: 'door', axis: 'z', x: -0.2, z: 19.0, width: 0.8 },
    { kind: 'window', axis: 'z', x: -0.2, z: 20.2, width: 1.0 },
    { kind: 'window', axis: 'z', x: -1.8, z: 15.95, width: 2.4 },
    { kind: 'window', axis: 'x', x: 2.5, z: 21.0, width: 2.0 },
    { kind: 'window', axis: 'x', x: 8.0, z: 21.0, width: 3.6 },
    { kind: 'window', axis: 'z', x: -1.8, z: 19.5, width: 2.4 },
    { kind: 'window', axis: 'x', x: -1.0, z: 21.0, width: 1.2 },
  ],
  furniture: [
    { type: 'wardrobe', x: 9.5, z: 12.7, rot: 1, w: 2.0 },
    // kitchen along two walls, living room facing a TV on the party wall
    { type: 'counter', x: 6.6, z: 15.25, rot: 1, w: 2.4 },
    { type: 'fridge', x: 7.2, z: 14.25 },
    { type: 'counter', x: 8.4, z: 14.2, w: 1.8 },
    { type: 'armchair', x: 9.4, z: 17.5 },
    { type: 'rug', x: 9.2, z: 19.6, rot: 1 },
    { type: 'sofa', x: 8.2, z: 19.6, rot: 1, w: 2.4 },
    { type: 'coffeeTable', x: 9.3, z: 19.6, rot: 1 },
    { type: 'tvUnit', x: 10.55, z: 19.6, rot: 3 },
    { type: 'diningTable', x: 6.5, z: 19.2, rot: 1, w: 1.6 },
    { type: 'plant', x: 5.65, z: 20.6 },
    // bedrooms
    { type: 'bed', x: 0.7, z: 15.0 },
    { type: 'nightstand', x: -0.4, z: 14.15 },
    { type: 'nightstand', x: 1.8, z: 14.15 },
    { type: 'wardrobe', x: 0.2, z: 17.7, rot: 2, w: 2.8 },
    { type: 'wardrobe', x: 0.85, z: 18.3, w: 1.4 },
    { type: 'singleBed', x: 2.1, z: 19.2 },
    { type: 'desk', x: 4.95, z: 20.3, rot: 3 },
    // bathrooms
    { type: 'bathtub', x: 3.6, z: 14.3 },
    { type: 'vanity', x: 4.3, z: 15.1, rot: 3 },
    { type: 'toilet', x: 4.25, z: 16.05, rot: 3 },
    { type: 'shower', x: 5.0, z: 14.4 },
    { type: 'toilet', x: 4.85, z: 16.0, rot: 1 },
    { type: 'vanity', x: 6.05, z: 15.0, rot: 3 },
    { type: 'plant', x: -1.3, z: 20.4 },
  ],
};

/** The same apartment on the other side of the core: x flips about the plate's middle. */
function mirror(src: Draft, id: LayoutId, facing: Facing): Draft {
  const mx = (x: number) => +(2 * PLATE.axis - x).toFixed(2);
  return {
    ...src,
    id,
    facing,
    rooms: src.rooms.map((room) => ({ ...room, x: mx(room.x + room.w), eye: room.eye && [mx(room.eye[0]), room.eye[1]] })),
    openings: src.openings.map((o) => ({ ...o, x: mx(o.x) })),
    // quarter turns facing +x and -x swap; facing +z or -z stay
    furniture: src.furniture.map((f) => ({ ...f, x: mx(f.x), rot: f.rot === 1 ? 3 : f.rot === 3 ? 1 : f.rot })),
  };
}

/** Moves an apartment from plate coordinates to its own, with (0, 0) at its north-west corner. */
function place(src: Draft): Layout {
  const x0 = Math.min(...src.rooms.map((room) => room.x));
  const z0 = Math.min(...src.rooms.map((room) => room.z));
  const sx = (x: number) => +(x - x0).toFixed(2);
  const sz = (z: number) => +(z - z0).toFixed(2);
  return {
    ...src,
    at: [x0, z0],
    w: sx(Math.max(...src.rooms.map((room) => room.x + room.w))),
    d: sz(Math.max(...src.rooms.map((room) => room.z + room.d))),
    rooms: src.rooms.map((room) => ({ ...room, x: sx(room.x), z: sz(room.z), eye: room.eye && [sx(room.eye[0]), sz(room.eye[1])] })),
    openings: src.openings.map((o) => ({ ...o, x: sx(o.x), z: sz(o.z) })),
    furniture: src.furniture.map((f) => ({ ...f, x: sx(f.x), z: sz(f.z) })),
  };
}

/** Each apartment's colour on the floor pages (3D, 2D plan, tags, list), so a flat is easy to
 *  pick out and to match with its label. Neighbours around the core get far-apart hues. */
export const flatColors: Record<LayoutId, string> = {
  A: '#F4C7CF',
  B: '#F5E2A0',
  C: '#C8E3B9',
  D: '#D9CCF0',
  E: '#F7CDA8',
  F: '#BFE2E6',
};

export const layouts: Record<LayoutId, Layout> = {
  A: place(A),
  B: place(B),
  C: place(C),
  D: place(mirror(C, 'D', 'SE')),
  E: place(mirror(B, 'E', 'E')),
  F: place(mirror(A, 'F', 'NE')),
};
