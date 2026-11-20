// The tour's viewpoints and state, kept apart from Tour.tsx so pages can use them without loading three.js.
// Scene coordinates: x = u, y = up, z = -v (site plan, metres).

export type Tour =
  | { kind: "overview" }
  | { kind: "spot"; id: SpotId };

export type SpotId =
  | "plaza"
  | "mainRoad"
  | "parking"
  | "eastStreet"
  | "playground"
  | "towerRoof"
  | "playground-swing"
  | "roofBridge"
  | "roofExit";

/** An eye-level viewpoint: where you stand (u, v, ground height) and the point you first look at. */
export type SpotDef = {
  id: SpotId;
  at: [number, number, number];
  look: [number, number, number];
};

/** Viewpoints around the whole complex (home page). */
export const SPOTS: SpotDef[] = [
  { id: "plaza", at: [-23, 35, 0.15], look: [-5, 18, 5] }, // entrance plaza, from the sidewalk corner
  { id: "mainRoad", at: [2, 62, 0.15], look: [2, 18, 14] }, // far sidewalk across the main road
  { id: "parking", at: [-25, -14, 0.0], look: [-8, -4, 4] }, // parking aisle, west side
  { id: "eastStreet", at: [38, -6, 0.1], look: [4, -4, 12] }, // across the east street
  { id: "playground", at: [3, 6.5, 11.71], look: [-5, 2, 13.5] }, // block A roof playground
  { id: "playground-swing", at: [-8, 9, 11.71], look: [-13, 18, 12.6] }, // block A roof, facing the swings
  { id: "towerRoof", at: [15, 13, 51.6], look: [-2, -24, 48] }, // roof of block B (viewing deck), towards block C
];

/** Viewpoints on the roof playground of block A (podium floor 4). */
export const ROOF_SPOTS: SpotDef[] = [
  { id: "playground", at: [3, 6.5, 11.71], look: [-5, 2, 13.5] }, // by the pavilion
  { id: "roofBridge", at: [13, -6.5, 11.71], look: [7, 1, 12.6] }, // the climbing bridge
  { id: "playground-swing", at: [-8, 9, 11.71], look: [-13, 18, 12.6] }, // facing the swings
  { id: "roofExit", at: [0, -5.5, 11.71], look: [-2, 10, 13] }, // from the stair exit by block C
];

