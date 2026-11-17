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

export const roomEye = (r: Room): [number, number] => r.eye ?? [r.x + r.w / 2, r.z + r.d / 2];
export const maxCeiling = (l: Layout) => Math.max(...l.rooms.map((r) => r.h));

export const m = (n: number) => n.toFixed(1);

/** A point on the site plan: [u, v] in metres (u east, v north). */
export type Pt = [number, number];

/** Grows a counter-clockwise polygon outwards by d metres (negative d shrinks it). Corners are
 *  mitred; fine for the building outlines here, not for very sharp spikes. */
export function offsetPolygon(pts: Pt[], d: number): Pt[] {
  const n = pts.length;
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];              // outward for a counter-clockwise outline
  };
  return pts.map((p, i) => {
    const n1 = normal(pts[(i - 1 + n) % n], p);
    const n2 = normal(p, pts[(i + 1) % n]);
    const mx = n1[0] + n2[0], my = n1[1] + n2[1], ml = Math.hypot(mx, my) || 1;
    const k = d / Math.max((mx / ml) * n1[0] + (my / ml) * n1[1], 0.35);
    return [p[0] + (mx / ml) * k, p[1] + (my / ml) * k];
  });
}

/** Centre of a polygon (area-weighted, so L-shaped rooms get a sensible label spot). */
export function polygonCentre(pts: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  });
  return a ? [cx / (3 * a), cy / (3 * a)] : pts[0];
}

/** Is p inside the polygon? (Even-odd rule.) */
export function inPolygon([x, y]: Pt, pts: Pt[]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) hit = !hit;
  }
  return hit;
}

export function bounds(pts: Pt[]) {
  const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}
