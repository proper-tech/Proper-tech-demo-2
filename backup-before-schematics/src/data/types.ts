export type RoomType =
  | 'living'
  | 'kitchen'
  | 'bedroom'
  | 'master'
  | 'bathroom'
  | 'hall'
  | 'corridor'
  | 'storage'
  | 'closet';

/** A rectangular room. All measurements are in metres, in the apartment's own coordinates:
 *  x runs along the facade, z runs from the entrance wall (z = 0) to the window wall. */
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
  | 'shoeCabinet';

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

export type LayoutId = 'A' | 'B' | 'C';

export interface Layout {
  id: LayoutId;
  bedrooms: number;
  w: number;
  d: number;
  rooms: Room[];
  openings: Opening[];
  furniture: FurnitureItem[];
}

export type TowerId = 'A' | 'B';

export type UnitStatus = 'available' | 'reserved' | 'sold';

export interface Unit {
  id: string;
  tower: TowerId;
  floor: number;
  pos: 1 | 2 | 3 | 4;
  layout: LayoutId;
  status: UnitStatus;
  /** Which side of the building the windows face. */
  side: 'N' | 'S';
  /** Left edge of the apartment on the floor plate. */
  x0: number;
}

export interface Finish {
  floor: string;
  wall: string;
  fabric: string;
  wood: string;
  cabinet: string;
}
