import type { Pt } from '@/lib/geometry';

/**
 * Rendered 360° tours and furnished top views of block D's floors, made in Blender from the block D data
 * (interior/tools/build_blockd.py, interior/render_panos.py, interior/render_top.py).
 *
 * Block metres as everywhere in block D: u east from axis X1, v north from axis Y1. Panoramas are
 * equirectangular with east in the middle of the picture (the panorama camera of render_panos.py).
 */
export interface PanoStop {
  id: string;
  /** Where the camera stood, block metres. */
  at: Pt;
  /** Which way the view turns on arrival: compass degrees, 0 north, 90 east. */
  heading: number;
  /** The room it is in (space id of blockD.ts). */
  room: string;
}

/** A way on from a stop: the ring shows at `point` (block metres and height above the floor), a doorway or the next stop. */
export interface PanoLink {
  to: string;
  point: [number, number, number];
}

export interface PanoTourData {
  /** Folder of the pictures: <base>/<stop>.jpg (4096 x 2048) and <base>/<stop>-lo.jpg (1280 x 640). */
  base: string;
  stops: PanoStop[];
  links: Record<string, PanoLink[]>;
  /** The furnished top view (cut at 2.4 m) and the rectangle it covers: [u0, v0, u1, v1]. */
  top: { src: string; rect: [number, number, number, number] };
  /** Camera height above the floor. */
  eye: number;
}

const door = (u: number, v: number): [number, number, number] => [u, v, 1.1];
const spot = (u: number, v: number): [number, number, number] => [u, v, 0.15];

export const blockDTours: Partial<Record<number, PanoTourData>> = {
  1: {
    base: '/tour-d/1',
    eye: 1.55,
    top: { src: '/tour-d/1/top.webp', rect: [-0.6, -0.6, 21.4, 30.6] },
    stops: [
      { id: 'entry', at: [16.0, 2.75], heading: 290, room: '01' },
      { id: 'aisle', at: [10.6, 3.7], heading: 270, room: '01' },
      { id: 'counter', at: [14.6, 9.4], heading: 215, room: '01' },
      { id: 'shop_west', at: [3.4, 8.4], heading: 100, room: '01' },
      { id: 'office', at: [3.0, 3.4], heading: 180, room: '02' },
      { id: 'waiting', at: [13.5, 13.2], heading: 20, room: '06' },
      { id: 'workshop', at: [9.7, 13.6], heading: 340, room: '05' },
      { id: 'pit', at: [7.5, 16.6], heading: 270, room: '05' },
      { id: 'lifts', at: [7.6, 23.7], heading: 250, room: '05' },
    ],
    links: {
      entry: [
        { to: 'aisle', point: spot(10.6, 3.7) },
        { to: 'counter', point: spot(14.6, 9.4) },
      ],
      aisle: [
        { to: 'entry', point: spot(16.0, 2.75) },
        { to: 'counter', point: spot(14.6, 9.4) },
        { to: 'shop_west', point: spot(5.6, 8.9) },
        { to: 'office', point: door(6.0, 2.75) },
      ],
      counter: [
        { to: 'entry', point: spot(16.0, 2.75) },
        { to: 'aisle', point: spot(10.6, 3.7) },
        { to: 'shop_west', point: spot(3.4, 8.4) },
        { to: 'workshop', point: door(9.75, 12.0) },
        { to: 'waiting', point: door(17.4, 12.0) },
      ],
      shop_west: [
        { to: 'aisle', point: spot(10.6, 3.7) },
        { to: 'counter', point: spot(14.6, 9.4) },
        { to: 'office', point: door(6.0, 2.75) },
        { to: 'workshop', point: door(9.75, 12.0) },
      ],
      office: [{ to: 'shop_west', point: door(6.0, 2.75) }],
      waiting: [
        { to: 'counter', point: door(16.65, 13.2) },
        { to: 'workshop', point: door(12.0, 12.85) },
      ],
      workshop: [
        { to: 'counter', point: door(9.75, 12.0) },
        { to: 'waiting', point: door(12.0, 12.85) },
        { to: 'pit', point: spot(7.5, 16.6) },
        { to: 'lifts', point: spot(7.6, 23.7) },
      ],
      pit: [
        { to: 'workshop', point: spot(9.7, 13.6) },
        { to: 'lifts', point: spot(7.6, 23.7) },
      ],
      lifts: [
        { to: 'pit', point: spot(7.5, 16.6) },
        { to: 'workshop', point: spot(9.7, 13.6) },
      ],
    },
  },
};
