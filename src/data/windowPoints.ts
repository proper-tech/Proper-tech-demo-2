import { PLATE } from './building';
import type { Facing, Layout, Room } from './types';

/**
 * The window points on a floor plan: one per apartment and direction its windows look, each with the window view
 * (public/views/window) for that direction. The plate's walls run north-south and east-west on the plan; the views
 * were made for the plan headings NE, E, SE, SW, W and NW (views.ts), so an east or west wall gets E or W, and a
 * north or south wall gets the corner view of its half of the tower: north walls west of the middle look NW, east
 * of it NE, and south walls SW and SE. Windows that share a view share a point, set on the widest of them.
 */
export interface WindowPoint {
  facing: Facing;
  /** Which wall of the tower the point's windows are in, on the plan (north up). */
  side: 'N' | 'E' | 'S' | 'W';
  /** The rooms with windows this way, largest window first. */
  rooms: Room[];
  /** The middle of the widest of those windows' rooms, in plate coordinates (X east, Y north, m). */
  X: number;
  Y: number;
}

const MID_X = (PLATE.x0 + PLATE.x1) / 2;
const MID_Y = (PLATE.y0 + PLATE.y1) / 2;

const facingOf = (side: WindowPoint['side'], X: number): Facing =>
  side === 'E' ? 'E' : side === 'W' ? 'W' : side === 'N' ? (X < MID_X ? 'NW' : 'NE') : X < MID_X ? 'SW' : 'SE';

/** The room a window opens from: the one whose edge it sits on (between a room and its balcony, the room). */
function roomAt(layout: Layout, x: number, z: number): Room | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  const within = (v: number, lo: number, hi: number) => v > lo - 0.05 && v < hi + 0.05;
  const onEdge = (r: Room) =>
    (within(x, r.x, r.x + r.w) && (near(z, r.z) || near(z, r.z + r.d))) || (within(z, r.z, r.z + r.d) && (near(x, r.x) || near(x, r.x + r.w)));
  return layout.rooms.find((r) => onEdge(r) && r.type !== 'balcony') ?? layout.rooms.find(onEdge);
}

export function windowPoints(layout: Layout): WindowPoint[] {
  // first the windows of each room in each wall, then those grouped by the view they share
  const walls = new Map<string, { room: Room; side: WindowPoint['side']; facing: Facing; X: number; Y: number; width: number; n: number }>();
  for (const o of layout.openings) {
    if (o.kind !== 'window') continue;
    const X = layout.origin[0] + o.x;
    const Y = layout.origin[1] - o.z;
    // a wall along x faces north or south, one along z east or west: whichever way is out of the tower
    const side: WindowPoint['side'] = o.axis === 'x' ? (Y > MID_Y ? 'N' : 'S') : X > MID_X ? 'E' : 'W';
    const room = roomAt(layout, o.x, o.z);
    if (!room) continue;
    const key = `${room.id}-${side}`;
    const w = walls.get(key) ?? { room, side, facing: facingOf(side, X), X: 0, Y: 0, width: 0, n: 0 };
    w.X += X;
    w.Y += Y;
    w.n += 1;
    w.width += o.width;
    walls.set(key, w);
  }
  const byFacing = new Map<Facing, (typeof walls extends Map<string, infer V> ? V : never)[]>();
  for (const w of walls.values()) byFacing.set(w.facing, [...(byFacing.get(w.facing) ?? []), w]);
  return [...byFacing.entries()].map(([facing, ws]) => {
    ws.sort((a, b) => b.width - a.width);
    const main = ws[0];
    const rooms = ws.map((w) => w.room).filter((r, i, all) => all.findIndex((s) => s.id === r.id) === i);
    return { facing, side: main.side, rooms, X: main.X / main.n, Y: main.Y / main.n };
  });
}
