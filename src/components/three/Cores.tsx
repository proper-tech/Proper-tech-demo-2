'use client';

import { Quaternion, Vector3 } from 'three';
import type { Rect } from '@/data/building';

// Stairs, lifts and escalators for the floor views (tower floors and podium floors), drawn from
// their plan rectangles. Scene metres: x east, z south, y up from this floor's level. A Rect is
// { x, z } at its north-west corner and { w, d } to the east and south.

export type Side = 'N' | 'S' | 'E' | 'W';

const WALL = '#F4F5F7';
const SHAFT = '#AEB8C3';
const CONCRETE = '#CBD2D9';
const STEEL = '#A8B1BA';
const DARK = '#5B6672';
const GLASS = '#BFD9E6';

export function Box({ r, y = 0, h, color, opacity }: { r: Rect; y?: number; h: number; color: string; opacity?: number }) {
  return (
    <mesh position={[r.x + r.w / 2, y + h / 2, r.z + r.d / 2]}>
      <boxGeometry args={[r.w, h, r.d]} />
      <meshStandardMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} depthWrite={opacity === undefined} />
    </mesh>
  );
}

type V3 = [number, number, number];
const FORWARD = new Vector3(0, 0, 1);

/** A bar of the given cross-section from a to b: handrails, glass balustrades, escalator trusses. */
function Beam({ a, b, w, h, color, opacity }: { a: V3; b: V3; w: number; h: number; color: string; opacity?: number }) {
  const start = new Vector3(...a);
  const along = new Vector3(...b).sub(start);
  const length = along.length();
  const middle = start.clone().addScaledVector(along, 0.5);
  const turn = new Quaternion().setFromUnitVectors(FORWARD, along.normalize());
  return (
    <mesh position={middle} quaternion={turn}>
      <boxGeometry args={[w, h, length]} />
      <meshStandardMaterial color={color} transparent={opacity !== undefined} opacity={opacity ?? 1} depthWrite={opacity === undefined} />
    </mesh>
  );
}

interface WallsProps {
  r: Rect;
  h: number;
  /** A gap in one wall, centred at `at` (x along a north or south wall, z along an east or west one). */
  door?: { side: Side; at: number; w: number };
  t?: number;
  color?: string;
  /** Dark line on top, like the walls of the apartments. */
  cap?: boolean;
}

/** The four walls round a rectangle. */
function Walls({ r, h, door, t = 0.12, color = WALL, cap }: WallsProps) {
  const sides: [Side, number, number][] = [
    ['N', r.x, r.x + r.w],
    ['S', r.x, r.x + r.w],
    ['W', r.z, r.z + r.d],
    ['E', r.z, r.z + r.d],
  ];
  const pieces = sides.flatMap(([side, from, to]) => {
    const runs: [number, number][] = door?.side === side ? [[from, door.at - door.w / 2], [door.at + door.w / 2, to]] : [[from, to]];
    return runs
      .filter(([a, b]) => b - a > 0.02)
      .map(([a, b]): Rect => {
        if (side === 'N' || side === 'S') return { x: a, z: (side === 'N' ? r.z : r.z + r.d) - t / 2, w: b - a, d: t };
        return { x: (side === 'W' ? r.x : r.x + r.w) - t / 2, z: a, w: t, d: b - a };
      });
  });
  return (
    <>
      {pieces.map((p, i) => (
        <group key={i}>
          <Box r={p} h={h} color={color} />
          {cap && <Box r={p} y={h} h={0.05} color="#14233B" />}
        </group>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- stairs

export interface StairSpec {
  r: Rect;
  /** Height of this storey: the flight going up climbs half of it, to the half landing. */
  storey: number;
  /** Height of the storey below, for the flight going down; 0 when there is none. */
  below: number;
  /** The wall with the door. The floor landing is at the door end, the half landing at the far end. */
  door: Side;
  /** Puts the flight going up on the west (or north) side instead of the east (or south). */
  flip?: boolean;
  /** End of the floor landing, when the door is in a long wall (by default the south or east
   *  end; a door in a short wall puts the landing at the door end). */
  landing?: Side;
  /** The top floor of the stair: no flight going up, only the one down. */
  top?: boolean;
  /** Where the door is along its wall, in scene metres (z on an east or west wall, x on a north or
   *  south one), when the drawings put it somewhere other than the middle of the floor landing. */
  doorAt?: number;
}

const RISER = 0.15;
const TREAD = 0.28;
const HALF = 1.3; // depth of the half landing
const EDGE = 0.15; // flights stand this far off the side walls
const WELL = 0.1; // gap between the two flights

/** Plan of a stair: two flights side by side along its long side. `a` runs across it, `s` along
 *  it from the half landing's wall; pt() turns (a, s, height) into scene coordinates. */
function stairPlan({ r, storey, below, door, flip, landing }: StairSpec) {
  const ns = r.d >= r.w;
  const L = ns ? r.d : r.w;
  const A = ns ? r.w : r.d;
  // floor landing at the north (west) end: half landing at the other end
  const reverse = (landing ?? door) === (ns ? 'N' : 'W');
  const pt = (a: number, s: number, y: number): V3 => {
    const p = flip ? A - a : a;
    const q = reverse ? L - s : s;
    return ns ? [r.x + p, y, r.z + q] : [r.x + q, y, r.z + p];
  };
  const rect = (a0: number, a1: number, s0: number, s1: number): Rect => {
    const [x0, , z0] = pt(a0, s0, 0);
    const [x1, , z1] = pt(a1, s1, 0);
    return { x: Math.min(x0, x1), z: Math.min(z0, z1), w: Math.abs(x1 - x0), d: Math.abs(z1 - z0) };
  };
  const fw = (A - 2 * EDGE - WELL) / 2;
  const n = Math.max(1, Math.round(storey / 2 / RISER));
  const tread = Math.min(TREAD, (L - HALF - 1) / n);
  const end = HALF + n * tread; // where the flights meet the floor landing
  const m = below > 0 ? Math.max(1, Math.round(below / 2 / RISER)) : 0;
  return { ns, L, A, pt, rect, n, tread, end, m, down: [EDGE, EDGE + fw], up: [EDGE + fw + WELL, A - EDGE] };
}

/** The hole the flight going down needs in this floor's slab. */
export function stairOpening(spec: StairSpec): Rect | null {
  const p = stairPlan(spec);
  return p.m ? p.rect(p.down[0], p.down[1], HALF, p.end) : null;
}

export function Stairs({ wallH, cap, ...spec }: StairSpec & { wallH: number; cap?: boolean }) {
  const { r, storey, below, door } = spec;
  const p = stairPlan(spec);
  const rise = storey / 2 / p.n;
  const drop = p.m ? below / 2 / p.m : 0;
  const downTread = (p.end - HALF) / Math.max(p.m, 1);
  // the door sits beside the floor landing in a long wall, or in the middle of a short one
  const long = p.ns ? door === 'E' || door === 'W' : door === 'N' || door === 'S';
  const landing = p.pt(0, (p.end + p.L) / 2, 0);
  const at = spec.doorAt ?? (long ? (p.ns ? landing[2] : landing[0]) : door === 'N' || door === 'S' ? r.x + r.w / 2 : r.z + r.d / 2);
  const [u0, u1] = p.up;
  const [d0, d1] = p.down;

  return (
    <>
      <Box r={p.rect(0, p.A, p.end, p.L)} h={0.02} color="#DDE2E7" />
      <Walls r={r} h={wallH} cap={cap} door={{ side: door, at, w: 1.0 }} />
      {spec.top ? (
        // the top floor: floor where the flight up would be, and a rail along the well
        <>
          <Box r={p.rect(u0, u1, HALF, p.end)} h={0.02} color="#DDE2E7" />
          <Beam a={p.pt(u0 - 0.02, p.end, 0.95)} b={p.pt(u0 - 0.02, HALF, 0.95)} w={0.05} h={0.05} color={DARK} />
        </>
      ) : (
        <>
          {/* going up: steps stacked on the slab, then the half landing */}
          {Array.from({ length: p.n }, (_, i) => (
            <Box key={`u${i}`} r={p.rect(u0, u1, p.end - (i + 1) * p.tread, p.end - i * p.tread)} h={(i + 1) * rise} color={CONCRETE} />
          ))}
          <Box r={p.rect(EDGE, p.A - EDGE, 0.1, HALF)} y={storey / 2 - 0.15} h={0.15} color={CONCRETE} />
        </>
      )}
      {/* going down through the slab opening, to the half landing of the storey below */}
      {Array.from({ length: Math.max(p.m - 1, 0) }, (_, i) => (
        <Box key={`d${i}`} r={p.rect(d0, d1, p.end - (i + 1) * downTread, p.end - i * downTread)} y={-below / 2} h={(p.m - i - 1) * drop} color={CONCRETE} />
      ))}
      {/* handrails along the well between the flights */}
      {!spec.top && <Beam a={p.pt(u0 + 0.03, p.end, 0.9)} b={p.pt(u0 + 0.03, HALF, storey / 2 + 0.9)} w={0.05} h={0.05} color={DARK} />}
      {p.m > 0 && <Beam a={p.pt(d1 - 0.03, p.end, 0.9)} b={p.pt(d1 - 0.03, HALF, 0.9 - below / 2)} w={0.05} h={0.05} color={DARK} />}
    </>
  );
}

// ---------------------------------------------------------------- lifts

/** Lift shafts in a row, a car in each. Where the lifts stop on this floor, `doors` names the
 *  wall their steel doors are in (with a frame and a call button), and the cars line up along
 *  it; elsewhere they line up along the long side. */
export function Lifts({ r, doors, wallH, cap, color = SHAFT }: { r: Rect; doors?: Side; wallH: number; cap?: boolean; color?: string }) {
  const alongX = doors ? doors === 'N' || doors === 'S' : r.w > r.d;
  const len = alongX ? r.w : r.d;
  const n = Math.max(1, Math.round(len / 1.9));
  const step = len / n;
  // doors and cars are cut with the walls where the walls are cut low (the floor plan)
  const dh = Math.min(2.1, wallH);
  const fh = Math.min(2.25, wallH);
  // the door wall's line, and which way is out of the shaft (towards the lobby)
  const wall = doors === 'E' ? r.x + r.w : doors === 'W' ? r.x : doors === 'S' ? r.z + r.d : r.z;
  const out = doors === 'E' || doors === 'S' ? 1 : -1;
  /** A piece along the door wall: a0..a1 along it, o0..o1 out from it. */
  const piece = (a0: number, a1: number, o0: number, o1: number): Rect => {
    const [c0, c1] = [wall + out * o0, wall + out * o1].sort((p, q) => p - q);
    return alongX ? { x: a0, w: a1 - a0, z: c0, d: c1 - c0 } : { x: c0, w: c1 - c0, z: a0, d: a1 - a0 };
  };
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (alongX ? r.x : r.z) + i * step;
        const shaft: Rect = alongX ? { x: a, z: r.z, w: step, d: r.d } : { x: r.x, z: a, w: r.w, d: step };
        const car: Rect = { x: shaft.x + 0.2, z: shaft.z + 0.2, w: shaft.w - 0.4, d: shaft.d - 0.4 };
        const c = a + step / 2;
        const g = Math.min(1.1, step - 0.4); // door opening
        return (
          <group key={i}>
            <Walls r={shaft} h={wallH} t={0.2} color={color} cap={cap} door={doors && { side: doors, at: c, w: g }} />
            <Box r={car} h={0.04} color="#C9CED3" />
            <Walls r={car} h={Math.min(2.2, wallH - 0.05)} t={0.05} color="#DDE2E7" door={doors && { side: doors, at: c, w: step - 0.42 }} />
            {doors && (
              <>
                {/* closed doors, two leaves, in a dark frame */}
                <Box r={piece(c - g / 2 + 0.05, c - 0.01, -0.04, 0.04)} h={dh} color={STEEL} />
                <Box r={piece(c + 0.01, c + g / 2 - 0.05, -0.04, 0.04)} h={dh} color={STEEL} />
                <Box r={piece(c - g / 2 - 0.09, c - g / 2, -0.08, 0.08)} h={fh} color={DARK} />
                <Box r={piece(c + g / 2, c + g / 2 + 0.09, -0.08, 0.08)} h={fh} color={DARK} />
                {wallH > 2.2 && <Box r={piece(c - g / 2 - 0.09, c + g / 2 + 0.09, -0.08, 0.08)} y={2.15} h={0.1} color={DARK} />}
                <Box r={piece(c + g / 2 + 0.12, c + g / 2 + 0.22, 0.1, 0.14)} y={1.0} h={0.18} color={DARK} />
              </>
            )}
          </group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- escalators

/** A pair of escalators side by side (one up, one down), rising southwards at 30°. */
export interface EscalatorRun {
  /** West and east edges of the pair. */
  x0: number;
  x1: number;
  /** North edge of the lower landing. */
  z: number;
  /** Height of the lower landing above this floor: 0 for a pair leaving this floor, minus the
   *  storey height for one arriving from the floor below. */
  y0: number;
  rise: number;
}

const LAND = 1.2;
const PITCH = Math.tan(Math.PI / 6);

/** Where a pair arriving from the floor below passes through this floor's slab. */
export const escalatorVoid = (e: EscalatorRun): Rect => ({ x: e.x0, z: e.z + LAND, w: e.x1 - e.x0, d: e.rise / PITCH });

/** Anything above `cut` is left off, like the walls of the cut-away floor. */
export function Escalators({ run: e, cut }: { run: EscalatorRun; cut: number }) {
  const zA = e.z + LAND;
  const top = e.y0 + e.rise;
  const reach = Math.min(top, cut);
  const zB = zA + (reach - e.y0) / PITCH;
  const whole = top <= cut;
  const ew = (e.x1 - e.x0 - 0.6) / 2;
  const hole = escalatorVoid(e);

  return (
    <>
      {[e.x0 + 0.2, e.x0 + 0.4 + ew].map((x) => {
        const xc = x + ew / 2;
        const landings: [number, number][] = whole ? [[e.z, e.y0], [zB, top]] : [[e.z, e.y0]];
        return (
          <group key={x}>
            {/* truss and steps, with flat landings at the ends */}
            <Beam a={[xc, e.y0 - 0.45, zA]} b={[xc, reach - 0.45, zB]} w={ew} h={0.9} color={STEEL} />
            <Beam a={[xc, e.y0 + 0.01, zA]} b={[xc, reach + 0.01, zB]} w={ew - 0.2} h={0.02} color="#2B2F36" />
            {landings.map(([z, y]) => (
              <group key={z}>
                <Box r={{ x, z, w: ew, d: LAND }} y={y - 0.9} h={0.9} color={STEEL} />
                <Box r={{ x: x + 0.1, z, w: ew - 0.2, d: LAND }} y={y} h={0.02} color="#8A929B" />
              </group>
            ))}
            {/* glass balustrades with black handrails on both sides */}
            {[x + 0.05, x + ew - 0.05].map((bx) => (
              <group key={bx}>
                <Beam a={[bx, e.y0 + 0.5, zA]} b={[bx, reach + 0.5, zB]} w={0.03} h={0.9} color={GLASS} opacity={0.45} />
                <Beam a={[bx, e.y0 + 0.97, zA]} b={[bx, reach + 0.97, zB]} w={0.08} h={0.05} color="#1B1D21" />
                {landings.map(([z, y]) => (
                  <group key={z}>
                    <Box r={{ x: bx - 0.015, z: z + (z === e.z ? 0.3 : 0), w: 0.03, d: LAND - 0.3 }} y={y + 0.05} h={0.9} color={GLASS} opacity={0.45} />
                    <Box r={{ x: bx - 0.04, z: z + (z === e.z ? 0.3 : 0), w: 0.08, d: LAND - 0.3 }} y={y + 0.95} h={0.05} color="#1B1D21" />
                  </group>
                ))}
              </group>
            ))}
          </group>
        );
      })}
      {/* a pair coming up from below: glass balustrade along the opening in this floor */}
      {e.y0 < 0 &&
        [hole.x - 0.02, hole.x + hole.w - 0.02].map((x) => (
          <group key={x}>
            <Box r={{ x, z: hole.z, w: 0.04, d: hole.d }} h={1.0} color={GLASS} opacity={0.4} />
            <Box r={{ x: x - 0.02, z: hole.z, w: 0.08, d: hole.d }} y={1.0} h={0.05} color={DARK} />
          </group>
        ))}
    </>
  );
}

// ---------------------------------------------------------------- car ramps

/** A straight car ramp running north-south: concrete deck with kerbs and yellow edge lines. */
export interface RampRun {
  /** West and east edges. */
  x0: number;
  x1: number;
  /** Scene z of its foot and of its top end. */
  zLow: number;
  zHigh: number;
  /** Height of the foot above this floor: 0 for a ramp leaving this floor, minus the storey
   *  height for one arriving from the floor below. */
  y0: number;
  rise: number;
}

/** Anything above `cut` is left off, like the walls of the cut-away floor. */
export function Ramp({ run: e, cut }: { run: RampRun; cut: number }) {
  const t = e.y0 + e.rise <= cut ? 1 : Math.max(0, (cut - e.y0) / e.rise);
  const zEnd = e.zLow + (e.zHigh - e.zLow) * t;
  const yEnd = e.y0 + e.rise * t;
  const xc = (e.x0 + e.x1) / 2;
  const w = e.x1 - e.x0;
  return (
    <>
      <Beam a={[xc, e.y0 - 0.15, e.zLow]} b={[xc, yEnd - 0.15, zEnd]} w={w} h={0.3} color="#9AA3AD" />
      {[e.x0 + 0.1, e.x1 - 0.1].map((x) => (
        <group key={x}>
          <Beam a={[x, e.y0 + 0.15, e.zLow]} b={[x, yEnd + 0.15, zEnd]} w={0.2} h={0.3} color={CONCRETE} />
          <Beam a={[x + (x < xc ? 0.25 : -0.25), e.y0 + 0.01, e.zLow]} b={[x + (x < xc ? 0.25 : -0.25), yEnd + 0.01, zEnd]} w={0.1} h={0.02} color="#E8B931" />
        </group>
      ))}
    </>
  );
}

/** A steel rail along one edge of an opening in the floor. */
export function Rail({ a, b }: { a: [number, number]; b: [number, number] }) {
  return (
    <>
      <Beam a={[a[0], 1.0, a[1]]} b={[b[0], 1.0, b[1]]} w={0.06} h={0.06} color={DARK} />
      <Beam a={[a[0], 0.5, a[1]]} b={[b[0], 0.5, b[1]]} w={0.04} h={0.04} color={STEEL} />
      <Beam a={[a[0], 0.05, a[1]]} b={[b[0], 0.05, b[1]]} w={0.1} h={0.1} color={STEEL} />
    </>
  );
}
