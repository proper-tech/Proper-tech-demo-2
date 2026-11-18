import type { Pt } from './geometry';

// Where a visitor can walk on a floor, for the walk-through (DFloorScene): a grid of 0.15 m cells
// over the floor, each free or blocked, with everything grown by the visitor's radius so the
// centre of the visitor can go anywhere that is free. Paths are found on the grid (A*) and then
// straightened, so a click on the far side of a doorway walks through the doorway.

const CELL = 0.15;
const RADIUS = 0.3;

export interface WalkGrid {
  free: (p: Pt) => boolean;
  /** The free point nearest to p, within 1.5 m, or null. */
  nearestFree: (p: Pt) => Pt | null;
  /** A walkable path from a to b (b moved to the nearest free point), or null when none. */
  path: (a: Pt, b: Pt) => Pt[] | null;
  /** Can you see (and walk straight) from a to b? */
  clear: (a: Pt, b: Pt) => boolean;
}

/** Something in the way: a wall from a to b of thickness t, or a box. */
export type Obstacle = { a: Pt; b: Pt; t: number } | { u0: number; u1: number; v0: number; v1: number };

export function buildGrid(area: { u0: number; u1: number; v0: number; v1: number }, obstacles: Obstacle[]): WalkGrid {
  const nx = Math.ceil((area.u1 - area.u0) / CELL);
  const ny = Math.ceil((area.v1 - area.v0) / CELL);
  const blocked = new Uint8Array(nx * ny);
  const centre = (i: number, j: number): Pt => [area.u0 + (i + 0.5) * CELL, area.v0 + (j + 0.5) * CELL];
  const cellOf = ([u, v]: Pt): [number, number] => [Math.floor((u - area.u0) / CELL), Math.floor((v - area.v0) / CELL)];

  // keep a margin of RADIUS round the area itself
  const margin = Math.ceil(RADIUS / CELL);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i < margin || j < margin || i >= nx - margin || j >= ny - margin) blocked[j * nx + i] = 1;

  for (const o of obstacles) {
    if ('a' in o) {
      const r = o.t / 2 + RADIUS;
      const [i0, j0] = cellOf([Math.min(o.a[0], o.b[0]) - r, Math.min(o.a[1], o.b[1]) - r]);
      const [i1, j1] = cellOf([Math.max(o.a[0], o.b[0]) + r, Math.max(o.a[1], o.b[1]) + r]);
      const [dx, dy] = [o.b[0] - o.a[0], o.b[1] - o.a[1]];
      const len2 = dx * dx + dy * dy || 1;
      for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
          const [u, v] = centre(i, j);
          const k = Math.max(0, Math.min(1, ((u - o.a[0]) * dx + (v - o.a[1]) * dy) / len2));
          if (Math.hypot(u - (o.a[0] + k * dx), v - (o.a[1] + k * dy)) < r) blocked[j * nx + i] = 1;
        }
      }
    } else {
      const [i0, j0] = cellOf([o.u0 - RADIUS, o.v0 - RADIUS]);
      const [i1, j1] = cellOf([o.u1 + RADIUS, o.v1 + RADIUS]);
      for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
          // round the corners of the grown box
          const [u, v] = centre(i, j);
          const du = Math.max(o.u0 - u, 0, u - o.u1);
          const dv = Math.max(o.v0 - v, 0, v - o.v1);
          if (Math.hypot(du, dv) < RADIUS) blocked[j * nx + i] = 1;
        }
      }
    }
  }

  const freeCell = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && !blocked[j * nx + i];
  const free = (p: Pt) => freeCell(...cellOf(p));

  const nearestFree = (p: Pt): Pt | null => {
    if (free(p)) return p;
    const [ci, cj] = cellOf(p);
    const reach = Math.ceil(1.5 / CELL);
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let j = cj - reach; j <= cj + reach; j++) {
      for (let i = ci - reach; i <= ci + reach; i++) {
        if (!freeCell(i, j)) continue;
        const c = centre(i, j);
        const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
        if (d < bestD) [best, bestD] = [c, d];
      }
    }
    return best;
  };

  /** Is the straight line from a to b free all the way? */
  const clear = (a: Pt, b: Pt) => {
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 2));
    for (let k = 0; k <= steps; k++) {
      const t = k / Math.max(steps, 1);
      if (!free([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
    }
    return true;
  };

  const path = (a: Pt, b0: Pt): Pt[] | null => {
    const b = nearestFree(b0);
    const start = nearestFree(a);
    if (!b || !start) return null;
    if (clear(start, b)) return [b];
    const [si, sj] = cellOf(start);
    const [gi, gj] = cellOf(b);
    const goal = gj * nx + gi;
    const came = new Int32Array(nx * ny).fill(-1);
    const cost = new Float64Array(nx * ny).fill(Infinity);
    const done = new Uint8Array(nx * ny);
    // a binary heap of [priority, cell]
    const heap: [number, number][] = [];
    const push = (f: number, c: number) => {
      heap.push([f, c]);
      for (let k = heap.length - 1; k > 0; ) {
        const parent = (k - 1) >> 1;
        if (heap[parent][0] <= heap[k][0]) break;
        [heap[parent], heap[k]] = [heap[k], heap[parent]];
        k = parent;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ; ) {
          const [l, r] = [2 * k + 1, 2 * k + 2];
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    const h = (i: number, j: number) => Math.hypot(i - gi, j - gj);
    const s = sj * nx + si;
    cost[s] = 0;
    push(h(si, sj), s);
    while (heap.length) {
      const [, c] = pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === goal) break;
      const [ci, cj] = [c % nx, Math.floor(c / nx)];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const [i, j] = [ci + di, cj + dj];
        if (!freeCell(i, j)) continue;
        // no cutting corners past a blocked cell
        if (di && dj && (!freeCell(ci + di, cj) || !freeCell(ci, cj + dj))) continue;
        const n = j * nx + i;
        if (done[n]) continue;
        const g = cost[c] + (di && dj ? Math.SQRT2 : 1);
        if (g < cost[n]) {
          cost[n] = g;
          came[n] = c;
          push(g + h(i, j), n);
        }
      }
    }
    if (came[goal] < 0) return null;
    const cells: Pt[] = [];
    for (let c = goal; c !== s && c >= 0; c = came[c]) cells.push(centre(c % nx, Math.floor(c / nx)));
    cells.reverse();
    cells[cells.length - 1] = b;
    // straighten: from each point, jump to the furthest point still in plain sight
    const out: Pt[] = [];
    let from = start;
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) {
        if (clear(from, cells[m])) {
          far = m;
          break;
        }
      }
      out.push(cells[far]);
      from = cells[far];
      k = far + 1;
    }
    return out;
  };

  return { free, nearestFree, path, clear };
}
