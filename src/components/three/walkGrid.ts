import { D_COLUMNS, D_INSIDE, type Partition, type WalkData } from '@/data/blockD';
import type { PodiumFloor } from '@/data/podium';
import type { FurnitureItem } from '@/data/types';
import { bounds, type Pt } from '@/lib/geometry';
import { buildGrid, type Obstacle, type WalkGrid } from '@/lib/walk';

// Where a visitor can walk on a floor of block D: columns, inside walls (less their doorways),
// furniture and cars, the openings over the ramps, and the low end of a ramp leaving the floor.
// The outside walls are the edge of the grid (D_INSIDE).

/** Thickness of the inside walls. */
export const PART_T = 0.12;

/** Pieces of a partition between its doorways, as [from, to] along it. */
export function partitionRuns(p: Partition): { runs: [number, number][]; doors: [number, number][] } {
  const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
  const doors = (p.doors ?? []).map((d): [number, number] => [d.at - d.w / 2, d.at + d.w / 2]).sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  let c = 0;
  for (const [d0, d1] of doors) {
    runs.push([c, d0]);
    c = d1;
  }
  runs.push([c, len]);
  return { runs: runs.filter(([a, b]) => b - a > 0.01), doors };
}

/** Footprint of a piece of furniture, half sizes along its own x and z. */
export function footprint(f: FurnitureItem): [number, number] {
  switch (f.type) {
    case 'car': return [0.9, 2.2];
    case 'carLift': return [1.62, 2.55];
    case 'pit': return [0.68, 2.34];
    case 'workbench': return [(f.w ?? 2) / 2, 0.42];
    case 'toolChest': return [0.38, 0.27];
    case 'tyres': return [(f.w ?? 2) / 2, 0.33];
    case 'drum': return [0.3, 0.3];
    case 'extinguisher': return [0.1, 0.15];
    case 'rack': return [(f.w ?? 2) / 2, 0.32];
    case 'gondola': return [(f.w ?? 6) / 2, 0.5];
    case 'counter': return [(f.w ?? 2) / 2, 0.33];
    case 'desk': return [(f.w ?? 1.2) / 2, 0.7];
    case 'shelf': return [(f.w ?? 1.2) / 2, 0.22];
    case 'bench': return [(f.w ?? 1.8) / 2, 0.25];
    case 'wardrobe': return [(f.w ?? 1.8) / 2, 0.3];
    case 'toilet': return [0.2, 0.35];
    default: return [0.3, 0.3];
  }
}

export function walkGridFor(floor: PodiumFloor, walk: WalkData): WalkGrid {
  const obstacles: Obstacle[] = [];
  for (const [u, v] of D_COLUMNS) obstacles.push({ u0: u - 0.25, u1: u + 0.25, v0: v - 0.25, v1: v + 0.25 });
  for (const p of walk.partitions) {
    const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
    const pt = (s: number): Pt => [p.a[0] + ((p.b[0] - p.a[0]) * s) / len, p.a[1] + ((p.b[1] - p.a[1]) * s) / len];
    for (const [s0, s1] of partitionRuns(p).runs) obstacles.push({ a: pt(s0), b: pt(s1), t: PART_T });
  }
  for (const f of floor.furniture ?? []) {
    const [hx, hz] = footprint(f);
    const [a, b] = f.rot === 1 || f.rot === 3 ? [hz, hx] : [hx, hz];
    obstacles.push({ u0: f.x - a, u1: f.x + a, v0: f.z - b, v1: f.z + b });
  }
  for (const s of floor.spaces.filter((s) => s.void)) {
    const b = bounds(s.outline);
    obstacles.push({ u0: b.u0, u1: b.u1, v0: b.v0, v1: b.v1 });
  }
  // a ramp leaving this floor is in the way until it is high enough to walk under
  for (const r of floor.ramps ?? []) {
    if (r.y0 < 0) continue;
    const t = Math.min(1, Math.max(0, (2.4 - r.y0) / r.rise));
    const v = r.low + (r.high - r.low) * t;
    obstacles.push({ u0: r.u0 - 0.1, u1: r.u1 + 0.1, v0: Math.min(r.low, v), v1: Math.max(r.low, v) });
  }
  return buildGrid(D_INSIDE, obstacles);
}


/** The spots a 360° camera would stand on: every 2.5 m over the floor where there is room to stand,
 *  plus one in the middle of every room (so even a small room has one), none closer than 1.6 m to
 *  another. Like the capture points of a 360° tour, the visitor jumps from one to the next. */
export function capturePoints(floor: PodiumFloor, grid: WalkGrid): Pt[] {
  const pts: Pt[] = [];
  const add = (p: Pt | null, min = 1.6) => {
    if (p && grid.free(p) && !pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < min)) pts.push(p);
  };
  // rooms first, so their centres win over the lattice
  for (const s of floor.spaces) {
    if (s.void || s.type === 'stairs' || s.type === 'lifts') continue;
    const b = bounds(s.outline);
    const c: Pt = [(b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2];
    add(grid.nearestFree(c), 1.2);
  }
  for (let u = 1.25; u < 18; u += 2.5) for (let v = 1.25; v < 30; v += 2.5) add([u, v]);
  return pts;
}
