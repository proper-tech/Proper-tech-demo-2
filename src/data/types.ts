export type RoomType =
  | 'living'
  | 'kitchen'
  | 'bedroom'
  | 'master'
  | 'bathroom'
  | 'hall'
  | 'corridor'
  | 'storage'
  | 'closet'
  | 'balcony';

/** A rectangular room. All measurements are in metres, in the apartment's own coordinates:
 *  x runs east, z runs south, both from the north-west corner of the apartment. */
export interface Room {
  id: string;
  type: RoomType;
  /** Number shown after the name when a layout has several rooms of one type ("Bedroom 2"). */
  n?: number;
  x: number;
  z: number;
  w: number;
  d: number;
  /** Ceiling height. */
  h: number;
  /** Where the 360° camera stands. Defaults to the middle of the room. */
  eye?: [number, number];
  /** Bathrooms get tiles instead of the selected flooring. */
  wet?: boolean;
  /** This rectangle is part of another (L-shaped) room: it is drawn, but its area is
   *  counted with that room and it is not listed on its own. Join the two with an
   *  'open' opening along the edge they share. */
  partOf?: string;
  /** Optional equirectangular 360° photo (path under /public). When set, the 360° view
   *  shows the photo instead of the 3D model for this room. */
  panorama?: string;
}

export interface Opening {
  /** 'open' is a wall left out entirely (between a room and its partOf rectangle). */
  kind: 'door' | 'entry' | 'opening' | 'window' | 'open';
  /** 'x': the wall runs along x at constant z. 'z': the wall runs along z at constant x. */
  axis: 'x' | 'z';
  /** Centre of the opening. */
  x: number;
  z: number;
  width: number;
}

export type FurnitureType =
  | 'sofa'
  | 'armchair'
  | 'coffeeTable'
  | 'tvUnit'
  | 'rug'
  | 'diningTable'
  | 'bed'
  | 'singleBed'
  | 'nightstand'
  | 'wardrobe'
  | 'desk'
  | 'counter'
  | 'fridge'
  | 'bathtub'
  | 'shower'
  | 'toilet'
  | 'vanity'
  | 'plant'
  | 'shelf'
  | 'shoeCabinet';

export interface FurnitureItem {
  type: FurnitureType;
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Quarter turns. 0 faces south (+z), 1 faces east (+x), 2 faces north, 3 faces west. */
  rot?: 0 | 1 | 2 | 3;
  /** Width override for pieces that come in several lengths. */
  w?: number;
}

/** The six apartment positions on a floor, as lettered on the architect's plans. */
export type PlanId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** A4 is plan A on floor 4 of Block B, where the hall is longer (7.5 m² instead of 5.8). */
export type LayoutId = PlanId | 'A4';

export type Facing = 'NW' | 'W' | 'SW' | 'SE' | 'E' | 'NE';

export interface Layout {
  id: LayoutId;
  /** The plan letter on the architect's drawings. */
  plan: PlanId;
  bedrooms: number;
  bathrooms: number;
  /** Apartment area from the architect's room schedule, m². */
  area: number;
  /** Size of the apartment's bounding box, m. */
  w: number;
  d: number;
  /** North-west corner of the bounding box on the floor plate (see PLATE in building.ts). */
  origin: [number, number];
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
}

/** The two residential towers, named as on the architect's drawings (Block A is the podium,
 *  Block D the service and parking building). */
export type TowerId = 'B' | 'C';

export type UnitStatus = 'available' | 'reserved' | 'sold';

export interface Unit {
  id: string;
  tower: TowerId;
  floor: number;
  pos: 1 | 2 | 3 | 4 | 5 | 6;
  plan: PlanId;
  layout: LayoutId;
  status: UnitStatus;
  /** Which way the windows face. */
  facing: Facing;
}

export interface Finish {
  floor: string;
  wall: string;
  fabric: string;
  wood: string;
  cabinet: string;
}
