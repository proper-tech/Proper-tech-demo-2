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
 *  x runs east, z runs south (north is at the top of every plan). */
export interface Room {
  id: string;
  type: RoomType;
  /** Number shown after the name when a layout has several rooms of one type ("Bedroom 2"). */
  n?: number;
  /** Area from the architect's room schedule. Left out on the pieces an L-shaped room is cut
   *  into (the kitchen end of a living room, say): their area is counted in that room's. */
  area?: number;
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
  /** Optional equirectangular 360° photo (path under /public). When set, the 360° view
   *  shows the photo instead of the 3D model for this room. */
  panorama?: string;
}

export interface Opening {
  kind: 'door' | 'entry' | 'opening' | 'window';
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
  | 'shoeCabinet'
  // shops and service rooms on the podium
  | 'gondola'
  | 'checkout'
  | 'chiller'
  | 'rack'
  | 'bench';

export interface FurnitureItem {
  type: FurnitureType;
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Quarter turns. 0 faces the window wall (+z), 1 faces +x, 2 faces the entrance, 3 faces -x. */
  rot?: 0 | 1 | 2 | 3;
  /** Width override for pieces that come in several lengths. */
  w?: number;
}

/** The six apartments of a tower floor, lettered as on the architect's plan. */
export type LayoutId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Which sides the windows face. */
export type Facing = 'NW' | 'W' | 'SW' | 'SE' | 'E' | 'NE';

export interface Layout {
  id: LayoutId;
  bedrooms: number;
  /** Total from the room schedule. */
  area: number;
  facing: Facing;
  /** Where the apartment's (0, 0) sits on the floor plate (see PLATE in building.ts). */
  at: [number, number];
  w: number;
  d: number;
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
}

export type TowerId = 'B' | 'C';
/** A block in the architect's key: A the podium, B and C the apartment towers. */
export type BlockId = 'A' | TowerId;

export type UnitStatus = 'available' | 'reserved' | 'sold';

export interface Unit {
  id: string;
  tower: TowerId;
  floor: number;
  layout: LayoutId;
  status: UnitStatus;
}

export interface Finish {
  floor: string;
  wall: string;
  fabric: string;
  wood: string;
  cabinet: string;
}
