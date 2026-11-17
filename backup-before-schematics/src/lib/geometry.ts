import type { Layout, Opening, Room } from '@/data/types';

export interface Segment {
  from: number;
  to: number;
  kind: 'solid' | Opening['kind'];
}

export interface Edge {
  /** Where the edge starts, in apartment coordinates. */
  start: [number, number];
  /** Rotation about the vertical axis that points local +x along the edge and local +z into the room. */
  rotY: number;
  length: number;
  segments: Segment[];
  /** Distance along the edge -> apartment coordinates. */
  at: (s: number) => [number, number];
}

const EPS = 1e-3;

/** The four walls of a room, each split into solid pieces, doors and windows. */
export function roomEdges(room: Room, openings: Opening[]): Edge[] {
  const { x, z, w, d } = room;
  const defs: {
    axis: 'x' | 'z';
    value: number;
    start: [number, number];
    rotY: number;
    length: number;
    toS: (o: Opening) => number;
    at: (s: number) => [number, number];
  }[] = [
    { axis: 'x', value: z, start: [x, z], rotY: 0, length: w, toS: (o) => o.x - x, at: (s) => [x + s, z] },
    { axis: 'x', value: z + d, start: [x + w, z + d], rotY: Math.PI, length: w, toS: (o) => x + w - o.x, at: (s) => [x + w - s, z + d] },
    { axis: 'z', value: x, start: [x, z + d], rotY: Math.PI / 2, length: d, toS: (o) => z + d - o.z, at: (s) => [x, z + d - s] },
    { axis: 'z', value: x + w, start: [x + w, z], rotY: -Math.PI / 2, length: d, toS: (o) => o.z - z, at: (s) => [x + w, z + s] },
  ];

  return defs.map((def) => {
    const cuts = openings
      .filter((o) => o.axis === def.axis && Math.abs((def.axis === 'x' ? o.z : o.x) - def.value) < EPS)
      .map((o) => ({ c: def.toS(o), o }))
      .filter(({ c }) => c > EPS && c < def.length - EPS)
      .sort((a, b) => a.c - b.c);

    const segments: Segment[] = [];
    let cursor = 0;
    for (const { c, o } of cuts) {
      const from = Math.max(0, c - o.width / 2);
      const to = Math.min(def.length, c + o.width / 2);
      if (from > cursor + EPS) segments.push({ from: cursor, to: from, kind: 'solid' });
      segments.push({ from, to, kind: o.kind });
      cursor = to;
    }
    if (cursor < def.length - EPS) segments.push({ from: cursor, to: def.length, kind: 'solid' });

    return { start: def.start, rotY: def.rotY, length: def.length, segments, at: def.at };
  });
}

export function roomAt(layout: Layout, x: number, z: number): Room | undefined {
  return layout.rooms.find((r) => x > r.x && x < r.x + r.w && z > r.z && z < r.z + r.d);
}

export interface DoorLink {
  opening: Opening;
  /** The other room this door leads to. */
  to: Room;
}

/** Doors and openings that lead out of a room, used for the walk-through hotspots. */
export function doorLinks(layout: Layout, roomId: string): DoorLink[] {
  const links: DoorLink[] = [];
  for (const o of layout.openings) {
    if (o.kind === 'window' || o.kind === 'entry') continue;
    const a = o.axis === 'x' ? roomAt(layout, o.x, o.z - 0.05) : roomAt(layout, o.x - 0.05, o.z);
    const b = o.axis === 'x' ? roomAt(layout, o.x, o.z + 0.05) : roomAt(layout, o.x + 0.05, o.z);
    if (!a || !b) continue;
    if (a.id === roomId) links.push({ opening: o, to: b });
    else if (b.id === roomId) links.push({ opening: o, to: a });
  }
  return links;
}

export const roomArea = (r: Room) => r.w * r.d;
export const layoutArea = (l: Layout) => l.rooms.reduce((sum, r) => sum + roomArea(r), 0);
export const roomEye = (r: Room): [number, number] => r.eye ?? [r.x + r.w / 2, r.z + r.d / 2];
export const maxCeiling = (l: Layout) => Math.max(...l.rooms.map((r) => r.h));

export const m = (n: number) => n.toFixed(1);
