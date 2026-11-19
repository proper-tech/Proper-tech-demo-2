'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Lightformer, OrbitControls, Sky, useGLTF } from '@react-three/drei';
import { DoubleSide, Euler, ExtrudeGeometry, MathUtils, Object3D, Path, Shape, type Mesh, type PerspectiveCamera, type Texture } from 'three';
import type { Rect } from '@/data/building';
import {
  blockDFrame,
  blockDOutline,
  D_BEAM,
  D_COLUMN,
  D_COLUMNS,
  D_INSIDE,
  D_SLAB,
  type FacadeOpening,
  type FacadeSide,
  type Partition,
  type WalkData,
} from '@/data/blockD';
import { defaultFinish } from '@/data/finishes';
import { listedSpaces, type PodiumFloor, type PodiumSpace, type PodiumSpaceType, type RampSpec } from '@/data/podium';
import type { FurnitureItem } from '@/data/types';
import { bounds, inPolygon, polygonCentre, type Pt } from '@/lib/geometry';
import type { WalkGrid } from '@/lib/walk';
import { Lifts, Rail, Stairs, stairOpening, type StairSpec } from './Cores';
import { fixPeople } from './people';
import { Furniture } from './Furniture';
import { PART_T, capturePoints, partitionRuns, walkGridFor } from './walkGrid';
import { Projector, type Anchor, type LabelLayer } from './Projector';
import { concrete, epoxy, grooves, hazard, paint, scaled, shutter, sign, tiles } from './surfaces';
import { woodTexture } from './textures';

// A floor of block D as it would look built, at the sizes of the architect's drawings (sheets 30-39):
// 0.5 m outside walls with the windows, doors and garage doors of the elevations at their measured
// sizes and heights, 0.45 m columns on the 6 m grid, the 0.25 m slab above with 0.4 × 0.3 m beams on
// the grid lines, strip lights and sprinkler pipes, painted parking spaces 2.45 × 5.0 m, the ramps
// with their upstands and the concrete parapet round the opening, an inspection pit cut into the
// floor, and the rest of the complex outside the windows. Two ways to look at it:
//  - 'orbit': from above, walls cut away at 2.4 m, rooms you can point at (like the podium floors);
//  - 'walk' (the 360° view): from fixed spots at eye height, like a 360° camera tour. Drag to look
//    all round; click a ring on the floor, anywhere on the floor or a spot on the small plan to go
//    straight there.
// Block metres throughout (u east from axis X1, v north from axis Y1), placed as scene x = u, z = -v.

export type DView = 'orbit' | 'walk';

export interface WalkHud {
  /** Called every frame with the visitor's position and heading (radians, 0 = north, clockwise). */
  pose: (u: number, v: number, heading: number) => void;
  /** The room the visitor is in, when it changes. */
  room: (id: string | null) => void;
  /** The tour's spots, for the small plan. */
  points?: (pts: Pt[]) => void;
  /** Gives the page a way to send the visitor to the spot nearest a point (block metres). */
  bindJump?: (jump: (p: Pt) => void) => void;
}

interface Props {
  floor: PodiumFloor;
  /** Floors below and above, for the stairs and for what shows through the openings over the ramps. */
  lower?: PodiumFloor;
  upper?: PodiumFloor;
  walk: WalkData;
  view: DView;
  /** Floor name painted on the columns: B1, 1, 2, 3. */
  label: string;
  layer: LabelLayer;
  hovered: string | null;
  onHover: (id: string | null) => void;
  hud?: WalkHud;
}

const CUT = 2.4;
const EYE = 1.62;
const HALF_COL = D_COLUMN / 2;

const noRay = () => null;
/** A site-plan box -> scene rectangle. */
const rectOf = (pts: Pt[]): Rect => {
  const b = bounds(pts);
  return { x: b.u0, z: -b.v1, w: b.u1 - b.u0, d: b.v1 - b.v0 };
};
const rectBox = (u0: number, u1: number, v0: number, v1: number): Rect => ({ x: u0, z: -v1, w: u1 - u0, d: v1 - v0 });
const PARKING = new Set<PodiumSpaceType>(['parking']);

// ---------------------------------------------------------------- materials

type Surface = { map: () => Texture; size: number; color: string; rough: number; metal?: number };
const FLOOR: Partial<Record<PodiumSpaceType, Surface>> = {
  parking: { map: epoxy, size: 4, color: '#A9B0B6', rough: 0.45 },
  ramp: { map: concrete, size: 3, color: '#B5B9BD', rough: 0.8 },
  storage: { map: concrete, size: 3, color: '#C4C7C9', rough: 0.8 },
  workshop: { map: epoxy, size: 4, color: '#8E9E94', rough: 0.35 },
  parts: { map: tiles, size: 1.2, color: '#ECE6DA', rough: 0.3 },
  waiting: { map: tiles, size: 1.2, color: '#E3DDD2', rough: 0.3 },
  vestibule: { map: tiles, size: 1.2, color: '#D9D3C8', rough: 0.3 },
  toilets: { map: tiles, size: 0.6, color: '#F1F2F2', rough: 0.25 },
  changing: { map: tiles, size: 1.2, color: '#E2E4E6', rough: 0.35 },
  office: { map: woodTexture, size: 2, color: '#C9A47E', rough: 0.55 },
};

function useTex(f: () => Texture, size: number) {
  return useMemo(() => scaled(f(), size), [f, size]);
}

/** Painted wall material: white with a light roller texture. */
function WallMat({ color = '#EEEFEC' }: { color?: string }) {
  const map = useTex(paint, 2);
  return <meshStandardMaterial color={color} map={map} roughness={0.9} />;
}

const FRAME = <meshStandardMaterial color="#3A4048" roughness={0.4} metalness={0.5} />;

// ---------------------------------------------------------------- geometry helpers

/** An outline (site-plan points) extruded upwards from y, with rectangular holes (scene rects). */
function Slab({ pts, y, h, holes, children, shadow = true }: { pts: Pt[]; y: number; h: number; holes?: Rect[]; children: ReactNode; shadow?: boolean }) {
  const geometry = useMemo(() => {
    const s = new Shape();
    pts.forEach(([u, v], i) => (i ? s.lineTo(u, v) : s.moveTo(u, v)));
    for (const r of holes ?? []) {
      const p = new Path();
      p.moveTo(r.x, -r.z);
      p.lineTo(r.x + r.w, -r.z);
      p.lineTo(r.x + r.w, -(r.z + r.d));
      p.lineTo(r.x, -(r.z + r.d));
      p.closePath();
      s.holes.push(p);
    }
    return new ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  }, [pts, h, holes]);
  return (
    <mesh geometry={geometry} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow={shadow} raycast={noRay}>
      {children}
    </mesh>
  );
}

/** A box from u0..u1, v0..v1, y0..y1 (block metres). */
function B({ u0, u1, v0, v1, y0, y1, children, shadow = true }: { u0: number; u1: number; v0: number; v1: number; y0: number; y1: number; children: ReactNode; shadow?: boolean }) {
  if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3 || y1 - y0 < 1e-3) return null;
  return (
    <mesh position={[(u0 + u1) / 2, (y0 + y1) / 2, -(v0 + v1) / 2]} castShadow={shadow} receiveShadow raycast={noRay}>
      <boxGeometry args={[u1 - u0, y1 - y0, v1 - v0]} />
      {children}
    </mesh>
  );
}

/** A flat sign facing the way `rot` turns +z (0 south, 1 east, 2 north, 3 west). */
function Plate({ u, v, y, size, map, rot, glow = false }: { u: number; v: number; y: number; size: [number, number]; map: Texture; rot: number; glow?: boolean }) {
  return (
    <mesh position={[u, y, -v]} rotation={[0, (rot * Math.PI) / 2, 0]} raycast={noRay}>
      <planeGeometry args={size} />
      {glow ? (
        <meshStandardMaterial map={map} emissive="#FFFFFF" emissiveMap={map} emissiveIntensity={0.9} transparent toneMapped={false} />
      ) : (
        <meshStandardMaterial map={map} transparent roughness={0.5} />
      )}
    </mesh>
  );
}

// ---------------------------------------------------------------- outside walls

/** The outside walls of the main block, 0.5 m thick, inside face 0.05 m inside the grid lines.
 *  Along each side `s` runs u on N and S, v on E and W; `n0..n1` is the wall's thickness across it.
 *  North of v = 19.6 the east wall is the shared wall with the stair and lift core. */
const SIDES: Record<FacadeSide, { s0: number; s1: number; n0: number; n1: number }> = {
  S: { s0: -0.45, s1: 18.45, n0: -0.45, n1: D_INSIDE.v0 },
  N: { s0: -0.45, s1: 18.45, n0: D_INSIDE.v1, n1: 30.45 },
  W: { s0: D_INSIDE.v0, s1: D_INSIDE.v1, n0: -0.45, n1: D_INSIDE.u0 },
  E: { s0: D_INSIDE.v0, s1: D_INSIDE.v1, n0: D_INSIDE.u1, n1: 18.39 },
};

function sideBox(side: FacadeSide, s0: number, s1: number, n0: number, n1: number) {
  return side === 'N' || side === 'S' ? { u0: s0, u1: s1, v0: n0, v1: n1 } : { u0: n0, u1: n1, v0: s0, v1: s1 };
}

/** Glass in an opening: a pane in the middle of the wall, a frame round it and mullions about every
 *  1.5 m (the elevations' panel width). */
function Glazing({ side, o, z1, n0, n1, door }: { side: FacadeSide; o: FacadeOpening; z1: number; n0: number; n1: number; door?: boolean }) {
  const mid = (n0 + n1) / 2;
  const n = door ? 1 : Math.max(1, Math.round((o.to - o.from) / 1.5));
  const b = sideBox(side, o.from, o.to, mid, mid);
  return (
    <group>
      <mesh
        position={[(b.u0 + b.u1) / 2, (o.z0 + z1) / 2, -(b.v0 + b.v1) / 2]}
        rotation={[0, side === 'N' || side === 'S' ? 0 : Math.PI / 2, 0]}
        raycast={noRay}
      >
        <planeGeometry args={[o.to - o.from, z1 - o.z0]} />
        <meshPhysicalMaterial color="#A9C6D9" roughness={0.04} metalness={0.1} transparent opacity={0.22} side={DoubleSide} depthWrite={false} />
      </mesh>
      {Array.from({ length: n + 1 }, (_, k) => {
        const s = o.from + ((o.to - o.from) * k) / n;
        return (
          <B key={k} {...sideBox(side, s - 0.03, s + 0.03, mid - 0.07, mid + 0.07)} y0={o.z0} y1={z1}>
            {FRAME}
          </B>
        );
      })}
      {[o.z0, z1 - 0.06].map((y) => (
        <B key={y} {...sideBox(side, o.from, o.to, mid - 0.07, mid + 0.07)} y0={y} y1={y + 0.06}>
          {FRAME}
        </B>
      ))}
      {door &&
        // push bar across the glass door
        [mid - 0.1, mid + 0.1].map((m) => (
          <B key={m} {...sideBox(side, o.from + 0.15, o.to - 0.15, m - 0.02, m + 0.02)} y0={1.0} y1={1.05}>
            <meshStandardMaterial color="#C9CED4" metalness={0.8} roughness={0.25} />
          </B>
        ))}
    </group>
  );
}

function FacadeWall({ side, openings, h, dado }: { side: FacadeSide; openings: FacadeOpening[]; h: number; dado: boolean }) {
  const { s0, s1, n0, n1 } = SIDES[side];
  const mine = openings.filter((o) => o.side === side).sort((a, b) => a.from - b.from || a.z0 - b.z0);
  const shut = useTex(shutter, 0.6);
  // runs of wall between the openings, and the wall above and below each (an opening can be split in
  // two heights, like the glass door with glazing over it)
  const spans: { from: number; to: number; parts: FacadeOpening[] }[] = [];
  for (const o of mine) {
    const last = spans[spans.length - 1];
    if (last && Math.abs(last.from - o.from) < 1e-3 && Math.abs(last.to - o.to) < 1e-3) last.parts.push(o);
    else spans.push({ from: o.from, to: o.to, parts: [o] });
  }
  const pieces: { s0: number; s1: number; y0: number; y1: number }[] = [];
  let cursor = s0;
  for (const sp of spans) {
    pieces.push({ s0: cursor, s1: sp.from, y0: 0, y1: h });
    const zs = sp.parts.flatMap((o) => [o.z0, o.z1]).sort((a, b) => a - b);
    let y = 0;
    for (const o of [...sp.parts].sort((a, b) => a.z0 - b.z0)) {
      pieces.push({ s0: sp.from, s1: sp.to, y0: y, y1: Math.min(o.z0, h) });
      y = Math.min(o.z1, h);
    }
    pieces.push({ s0: sp.from, s1: sp.to, y0: Math.min(zs[zs.length - 1], h), y1: h });
    cursor = sp.to;
  }
  pieces.push({ s0: cursor, s1, y0: 0, y1: h });
  // the inside face, for the painted band along the parking floors and the window sills
  const inner = side === 'S' || side === 'W' ? n1 : n0;
  const into = side === 'S' || side === 'W' ? 1 : -1;
  const face = (d0: number, d1: number) => [Math.min(inner + into * d0, inner + into * d1), Math.max(inner + into * d0, inner + into * d1)] as const;
  const bandFree = (a: number, b: number) => !mine.some((o) => o.z0 < 1.1 && o.from < b && o.to > a);

  return (
    <>
      {pieces.map((p, i) => (
        <B key={i} {...sideBox(side, p.s0, p.s1, n0, n1)} y0={p.y0} y1={p.y1}>
          <WallMat />
        </B>
      ))}
      {dado &&
        pieces
          .filter((p) => p.y0 === 0 && p.y1 > 1.1 && bandFree(p.s0, p.s1))
          .map((p, i) => (
            <group key={`d${i}`}>
              <B {...sideBox(side, p.s0, p.s1, ...face(0, 0.01))} y0={0} y1={1.0} shadow={false}>
                <meshStandardMaterial color="#6F8178" roughness={0.6} />
              </B>
              <B {...sideBox(side, p.s0, p.s1, ...face(0, 0.012))} y0={1.0} y1={1.1} shadow={false}>
                <meshStandardMaterial color="#E8B931" roughness={0.6} />
              </B>
            </group>
          ))}
      {mine.map((o, i) => {
        const z1 = Math.min(o.z1, h);
        if (z1 <= o.z0 || o.kind === 'open') return null;
        const mid = (n0 + n1) / 2;
        if (o.kind === 'garage') {
          // sectional door with its guide rails
          return (
            <group key={`o${i}`}>
              <B {...sideBox(side, o.from, o.to, mid - 0.04, mid + 0.04)} y0={o.z0} y1={z1}>
                <meshStandardMaterial map={shut} color="#C9CED4" roughness={0.45} metalness={0.4} />
              </B>
              {[o.from, o.to].map((s) => (
                <B key={s} {...sideBox(side, s - 0.06, s + 0.06, ...face(0.0, 0.12))} y0={0} y1={z1 + 0.3}>
                  {FRAME}
                </B>
              ))}
              <B {...sideBox(side, o.from + 0.3, o.to - 0.3, ...face(0.0, 0.5))} y0={z1 + 0.05} y1={z1 + 0.45}>
                {FRAME}
              </B>
            </group>
          );
        }
        if (o.kind === 'door') {
          // solid door (orange on elevation 1) with its frame and a handle
          return (
            <group key={`o${i}`}>
              <B {...sideBox(side, o.from + 0.05, o.to - 0.05, mid - 0.03, mid + 0.03)} y0={0} y1={z1 - 0.05}>
                <meshStandardMaterial color="#D26A2E" roughness={0.5} />
              </B>
              <B {...sideBox(side, o.from + 0.12, o.from + 0.28, ...face(-0.25 - 0.04, -0.25 + 0.06))} y0={1.02} y1={1.06}>
                <meshStandardMaterial color="#C9CED4" metalness={0.8} roughness={0.25} />
              </B>
              {[o.from, o.to - 0.05].map((s) => (
                <B key={s} {...sideBox(side, s, s + 0.05, mid - 0.06, mid + 0.06)} y0={0} y1={z1}>
                  {FRAME}
                </B>
              ))}
            </group>
          );
        }
        if (o.kind === 'doorway') {
          return (
            <group key={`o${i}`}>
              {[o.from, o.to - 0.05].map((s) => (
                <B key={s} {...sideBox(side, s, s + 0.05, n0, n1)} y0={0} y1={z1}>
                  <meshStandardMaterial color="#5B6672" roughness={0.5} />
                </B>
              ))}
            </group>
          );
        }
        return (
          <group key={`o${i}`}>
            <Glazing side={side} o={o} z1={z1} n0={n0} n1={n1} door={o.kind === 'glassDoor'} />
            {/* sill on the inside of windows above the floor */}
            {o.kind === 'window' && o.z0 > 0.3 && (
              <B {...sideBox(side, o.from - 0.03, o.to + 0.03, ...face(-0.02, 0.06))} y0={o.z0 - 0.04} y1={o.z0}>
                <meshStandardMaterial color="#F4F4F2" roughness={0.4} />
              </B>
            )}
          </group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- inside walls

/** Height of the underside of a ramp leaving this floor above (u, v), or Infinity. */
function rampUnderside(ramps: RampSpec[] | undefined, u: number, v: number) {
  let h = Infinity;
  for (const r of ramps ?? []) {
    if (r.y0 < 0 || u < r.u0 - 0.2 || u > r.u1 + 0.2) continue;
    const t = (r.low - v) / (r.low - r.high);
    if (t < 0 || t > 1) continue;
    h = Math.min(h, r.y0 + r.rise * t - 0.25);
  }
  return h;
}

function PartitionWall({ p, h, ramps, leaves }: { p: Partition; h: number; ramps?: RampSpec[]; leaves: boolean }) {
  const len = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
  const dir: Pt = [(p.b[0] - p.a[0]) / len, (p.b[1] - p.a[1]) / len];
  const pt = (s: number): Pt => [p.a[0] + dir[0] * s, p.a[1] + dir[1] * s];
  const { runs, doors } = partitionRuns(p);
  const angle = Math.atan2(dir[1], dir[0]);
  // stepped in 0.5 m pieces, so the wall stops under a ramp passing over it
  const pieces: { s0: number; s1: number; y0: number; y1: number }[] = [];
  const top = (s: number) => Math.min(h, rampUnderside(ramps, ...pt(s)));
  for (const [r0, r1] of runs) {
    for (let s = r0; s < r1 - 1e-3; s += 0.5) {
      const e = Math.min(r1, s + 0.5);
      const y1 = Math.min(top(s), top(e), top((s + e) / 2));
      if (y1 > 0.05) pieces.push({ s0: s, s1: e, y0: 0, y1 });
    }
  }
  for (const [d0, d1] of doors) {
    const y1 = Math.min(top(d0), top(d1));
    if (y1 > 2.15) pieces.push({ s0: d0, s1: d1, y0: 2.1, y1 });
  }
  return (
    <>
      {pieces.map((q, i) => {
        const [u, v] = pt((q.s0 + q.s1) / 2);
        return (
          <mesh key={i} position={[u, (q.y0 + q.y1) / 2, -v]} rotation={[0, angle, 0]} castShadow receiveShadow raycast={noRay}>
            <boxGeometry args={[q.s1 - q.s0 + (q.y0 === 0 ? 0.001 : 0), q.y1 - q.y0, PART_T]} />
            <WallMat color="#F1F1EE" />
          </mesh>
        );
      })}
      {doors.map(([d0, d1], i) => {
        const [hu, hv] = pt(d0);
        const w = d1 - d0;
        return (
          <group key={i}>
            {/* frame */}
            {[d0, d1].map((s) => {
              const [u, v] = pt(s);
              return (
                <mesh key={s} position={[u, 1.05, -v]} rotation={[0, angle, 0]} raycast={noRay}>
                  <boxGeometry args={[0.06, 2.1, PART_T + 0.04]} />
                  <meshStandardMaterial color="#5B6672" roughness={0.5} />
                </mesh>
              );
            })}
            {/* the door leaf, standing open against the wall at right angles */}
            {leaves && (
              <group position={[hu, 0, -hv]} rotation={[0, angle + Math.PI / 2, 0]}>
                <mesh position={[w / 2 - 0.02, 1.03, 0.04]} castShadow raycast={noRay}>
                  <boxGeometry args={[w - 0.06, 2.04, 0.04]} />
                  <meshStandardMaterial color="#E3DED4" roughness={0.6} />
                </mesh>
                <mesh position={[w - 0.12, 1.0, 0.09]} raycast={noRay}>
                  <boxGeometry args={[0.12, 0.025, 0.04]} />
                  <meshStandardMaterial color="#C9CED4" metalness={0.8} roughness={0.25} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- structure, services, markings

function Columns({ h, parking, label, voids }: { h: number; parking: boolean; label: string; voids: Rect[] }) {
  const stripes = useTex(hazard, 0.4);
  const plate = useMemo(() => sign(label), [label]);
  const near = (u: number, v: number) => voids.some((r) => u >= r.x - 0.3 && u <= r.x + r.w + 0.3 && -v >= r.z - 0.3 && -v <= r.z + r.d + 0.3);
  return (
    <>
      {D_COLUMNS.map(([u, v]) => {
        const inside = u > 0.1 && u < 17.9 && v > 0.1 && v < 29.9;
        return (
          <group key={`${u},${v}`}>
            <B u0={u - HALF_COL} u1={u + HALF_COL} v0={v - HALF_COL} v1={v + HALF_COL} y0={0} y1={h}>
              <WallMat color="#E9EAE7" />
            </B>
            {parking && inside && (
              <B u0={u - HALF_COL - 0.01} u1={u + HALF_COL + 0.01} v0={v - HALF_COL - 0.01} v1={v + HALF_COL + 0.01} y0={0} y1={Math.min(0.9, h)} shadow={false}>
                <meshStandardMaterial map={stripes} roughness={0.6} />
              </B>
            )}
            {/* the floor's name on the free-standing columns, both faces along the aisle */}
            {parking && inside && h > 2 && !near(u, v) &&
              [1, -1].map((side) => (
                <Plate key={side} u={u + side * (HALF_COL + 0.012)} v={v} y={1.75} size={[0.4, 0.4]} map={plate} rot={side} />
              ))}
          </group>
        );
      })}
    </>
  );
}

/** The slab above: 0.25 m thick with 0.4 × 0.3 m beams under it on every grid line (sections), strip
 *  lights between the beams, sprinkler mains and, on the taller parking floors, a ventilation duct. */
function Ceiling({ h, holes, upper, duct }: { h: number; holes: Rect[]; upper?: number; duct: boolean }) {
  const conc = useTex(concrete, 3);
  const under = h - D_SLAB;
  const beamBottom = under - D_BEAM.below;
  const inHole = (u: number, v: number, pad = 0) => holes.some((r) => u > r.x - pad && u < r.x + r.w + pad && -v > r.z - pad && -v < r.z + r.d + pad);
  const lights: Pt[] = [];
  for (const u of [3, 9, 15]) for (let v = 3; v < 30; v += 6) if (!inHole(u, v, 0.5)) lights.push([u, v]);
  // beams along every grid line, left out where they would cross an opening
  const beams: { u0: number; u1: number; v0: number; v1: number }[] = [];
  const hw = D_BEAM.w / 2;
  for (const u of [0, 6, 12, 18]) {
    for (let v = 0; v < 30; v += 6) {
      if (!inHole(u, v + 3, -0.01) || u === 0 || u === 18) beams.push({ u0: u - hw, u1: u + hw, v0: v, v1: v + 6 });
    }
  }
  for (let v = 0; v <= 30; v += 6) {
    for (const u of [0, 6, 12]) {
      if (!inHole(u + 3, v, -0.01)) beams.push({ u0: u, u1: u + 6, v0: v - hw, v1: v + hw });
    }
  }
  const clip = (b: (typeof beams)[number]) => ({
    u0: Math.max(b.u0, D_INSIDE.u0),
    u1: Math.min(b.u1, D_INSIDE.u1),
    v0: Math.max(b.v0, D_INSIDE.v0),
    v1: Math.min(b.v1, D_INSIDE.v1),
  });
  return (
    <>
      <Slab pts={blockDOutline} y={under} h={D_SLAB} holes={holes} shadow={false}>
        <meshStandardMaterial map={conc} color="#D9DBDC" roughness={0.95} />
      </Slab>
      {beams.map((b, i) => (
        <B key={i} {...clip(b)} y0={beamBottom} y1={under + 0.01} shadow={false}>
          <meshStandardMaterial map={conc} color="#D3D6D8" roughness={0.95} />
        </B>
      ))}
      {/* the slab two storeys up, seen through the opening over the ramps */}
      {upper !== undefined && holes.length > 0 && (
        <Slab pts={blockDOutline} y={h + upper - D_SLAB} h={D_SLAB} shadow={false}>
          <meshStandardMaterial map={conc} color="#CFD2D4" roughness={0.95} />
        </Slab>
      )}
      {lights.flatMap(([u, v]) =>
        [-1.2, 1.2].map((d) => (
          <group key={`${u},${v},${d}`} position={[u, under - 0.05, -(v + d)]}>
            <mesh raycast={noRay}>
              <boxGeometry args={[1.25, 0.05, 0.14]} />
              <meshStandardMaterial color="#FFFFFF" emissive="#FFF8EC" emissiveIntensity={2.2} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.03, 0]} raycast={noRay}>
              <boxGeometry args={[1.3, 0.03, 0.18]} />
              <meshStandardMaterial color="#9AA3AD" metalness={0.4} roughness={0.4} />
            </mesh>
          </group>
        )),
      )}
      {/* sprinkler mains under the beams, with a head over every light */}
      {[4.5, 13.5].map((u) => (
        <group key={u}>
          <mesh position={[u, beamBottom - 0.12, -15]} rotation={[Math.PI / 2, 0, 0]} raycast={noRay}>
            <cylinderGeometry args={[0.05, 0.05, 29.8, 10]} />
            <meshStandardMaterial color="#B03A2E" roughness={0.5} />
          </mesh>
          {[3, 9, 15, 21, 27].filter((v) => !inHole(u, v)).map((v) => (
            <mesh key={v} position={[u, beamBottom - 0.2, -v]} raycast={noRay}>
              <cylinderGeometry args={[0.03, 0.05, 0.1, 8]} />
              <meshStandardMaterial color="#C9CED4" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
      {/* round spiral ventilation duct along the west side of the aisle, hung under the beams */}
      {duct && (
        <group>
          <mesh position={[7.2, beamBottom - 0.3, -15]} rotation={[Math.PI / 2, 0, 0]} raycast={noRay}>
            <cylinderGeometry args={[0.22, 0.22, 29.4, 24]} />
            <meshStandardMaterial color="#C3C9CF" roughness={0.35} metalness={0.6} />
          </mesh>
          {[3, 9, 15, 21, 27].map((v) => (
            <mesh key={v} position={[7.2, beamBottom - 0.3, -v]} rotation={[Math.PI / 2, 0, 0]} raycast={noRay}>
              <cylinderGeometry args={[0.235, 0.235, 0.06, 24]} />
              <meshStandardMaterial color="#9AA3AD" roughness={0.4} metalness={0.6} />
            </mesh>
          ))}
        </group>
      )}
    </>
  );
}

/** Painted parking spaces, 2.45 × 5.0 m (plans), round the parked cars: side lines, a line at the
 *  back, a wheel stop and the space's number. */
function Bays({ cars, label }: { cars: FurnitureItem[]; label: string }) {
  const numbers = useMemo(() => cars.map((_, i) => sign(`${label}-${String(i + 1).padStart(2, '0')}`, '#F4F4F0', false)), [cars, label]);
  return (
    <>
      {cars.map((c, i) => {
        const along = c.rot === 1 || c.rot === 3 ? 'u' : 'v';
        const sgn = c.rot === 1 || c.rot === 2 ? 1 : -1; // the way the car faces
        const L = 5.0;
        const W = 2.45;
        const mid = along === 'u' ? c.x : c.z;
        const back = mid - sgn * (L / 2);
        const front = mid + sgn * (L / 2);
        const [a0, a1] = [Math.min(back, front), Math.max(back, front)];
        const across = along === 'u' ? c.z : c.x;
        const lines: { u0: number; u1: number; v0: number; v1: number }[] = [];
        for (const d of [-W / 2, W / 2]) {
          lines.push(along === 'u' ? { u0: a0, u1: a1, v0: across + d - 0.05, v1: across + d + 0.05 } : { u0: across + d - 0.05, u1: across + d + 0.05, v0: a0, v1: a1 });
        }
        lines.push(
          along === 'u' ? { u0: back - 0.05, u1: back + 0.05, v0: across - W / 2, v1: across + W / 2 } : { u0: across - W / 2, u1: across + W / 2, v0: back - 0.05, v1: back + 0.05 },
        );
        const stop = back + sgn * 0.45;
        const num = front - sgn * 0.55;
        const [nu, nv] = along === 'u' ? [num, across] : [across, num];
        return (
          <group key={i}>
            {lines.map((l, k) => (
              <B key={k} {...l} y0={0.005} y1={0.012} shadow={false}>
                <meshStandardMaterial color="#F4F4F0" roughness={0.6} />
              </B>
            ))}
            <B
              {...(along === 'u' ? { u0: stop - 0.08, u1: stop + 0.08, v0: across - 0.8, v1: across + 0.8 } : { u0: across - 0.8, u1: across + 0.8, v0: stop - 0.08, v1: stop + 0.08 })}
              y0={0}
              y1={0.12}
            >
              <meshStandardMaterial color="#E8B931" roughness={0.7} />
            </B>
            {/* the number, read from the aisle */}
            <mesh position={[nu, 0.014, -nv]} rotation={[-Math.PI / 2, 0, along === 'u' ? (sgn * Math.PI) / 2 : sgn > 0 ? Math.PI : 0]} raycast={noRay}>
              <planeGeometry args={[0.9, 0.9]} />
              <meshStandardMaterial map={numbers[i]} transparent roughness={0.6} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** An arrow painted on the aisle, pointing `dir` (0 north, clockwise). */
function Arrow({ c, dir }: { c: Pt; dir: number }) {
  const shape = useMemo(() => {
    const s = new Shape();
    const pts: Pt[] = [[-0.2, -1], [0.2, -1], [0.2, 0.2], [0.55, 0.2], [0, 1], [-0.55, 0.2], [-0.2, 0.2]];
    pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    return s;
  }, []);
  return (
    <mesh position={[c[0], 0.013, -c[1]]} rotation={[-Math.PI / 2, 0, -dir]} raycast={noRay}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#F4F4F0" roughness={0.6} />
    </mesh>
  );
}

/** A car ramp (block D): 0.25 m deck with grooves for grip, a 0.2 m concrete upstand 0.9 m high
 *  along both sides, and a beam under it wherever it crosses a grid line between columns. */
function RampD({ r, dy = 0, cut }: { r: RampSpec; dy?: number; cut: number }) {
  const deckMap = useMemo(() => {
    const t = grooves().clone();
    t.repeat.set((r.u1 - r.u0) / 1, Math.hypot(r.low - r.high, r.rise) / 1);
    t.needsUpdate = true;
    return t;
  }, [r]);
  const conc = useTex(concrete, 3);
  const y0 = r.y0 + dy;
  const run = r.low - r.high;
  const len = Math.hypot(run, r.rise);
  const slope = Math.atan2(r.rise, run);
  const t = y0 + r.rise <= cut ? 1 : Math.max(0, (cut - y0) / r.rise);
  if (t <= 0) return null;
  const shown = len * t;
  const midV = r.low - (run * t) / 2;
  const midY = y0 + (r.rise * t) / 2;
  const width = r.u1 - r.u0;
  // the ramp rises southwards (towards smaller v), which is +z in the scene
  const tilt = -slope;
  const beamsAt = [6, 12, 18, 24].filter((v) => v < r.low - 0.5 && v > r.high + 0.5 && (r.low - v) / run <= t);
  return (
    <group>
      <group position={[(r.u0 + r.u1) / 2, midY, -midV]} rotation={[tilt, 0, 0]}>
        <mesh position={[0, -0.125, 0]} castShadow receiveShadow raycast={noRay}>
          <boxGeometry args={[width, 0.25, shown]} />
          <meshStandardMaterial map={deckMap} color="#C2C6C9" roughness={0.85} />
        </mesh>
        {[-1, 1].map((sx) => (
          <group key={sx}>
            <mesh position={[sx * (width / 2 - 0.1), 0.45, 0]} castShadow receiveShadow raycast={noRay}>
              <boxGeometry args={[0.2, 0.9, shown]} />
              <meshStandardMaterial map={conc} color="#D2D5D7" roughness={0.9} />
            </mesh>
            <mesh position={[sx * (width / 2 - 0.205), 0.15, 0]} raycast={noRay}>
              <boxGeometry args={[0.012, 0.12, shown]} />
              <meshStandardMaterial color="#E8B931" roughness={0.6} />
            </mesh>
          </group>
        ))}
      </group>
      {beamsAt.map((v) => {
        const y = y0 + (r.rise * (r.low - v)) / run - 0.25;
        return (
          <B key={v} u0={r.u0 - 0.25} u1={r.u1 + 0.25} v0={v - 0.2} v1={v + 0.2} y0={y - 0.3} y1={y}>
            <meshStandardMaterial map={conc} color="#CBD0D3" roughness={0.9} />
          </B>
        );
      })}
    </group>
  );
}

/** The inspection pit cut into the floor: 1.4 m deep, tiled walls, steps down at one end. */
function PitWell({ r }: { r: Rect }) {
  const DEPTH = 1.4;
  const wall = useTex(tiles, 0.6);
  const along = r.w > r.d; // long side along x
  const steps = 5;
  return (
    <group>
      <mesh position={[r.x + r.w / 2, -DEPTH, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRay}>
        <planeGeometry args={[r.w, r.d]} />
        <meshStandardMaterial color="#4A5058" roughness={0.8} />
      </mesh>
      {[
        [r.x + r.w / 2, r.z, r.w, 0],
        [r.x + r.w / 2, r.z + r.d, r.w, Math.PI],
        [r.x, r.z + r.d / 2, r.d, Math.PI / 2],
        [r.x + r.w, r.z + r.d / 2, r.d, -Math.PI / 2],
      ].map(([x, z, w, rot], i) => (
        <mesh key={i} position={[x, -DEPTH / 2, z]} rotation={[0, rot, 0]} receiveShadow raycast={noRay}>
          <planeGeometry args={[w, DEPTH]} />
          <meshStandardMaterial map={wall} color="#E9ECEE" roughness={0.4} side={DoubleSide} />
        </mesh>
      ))}
      {Array.from({ length: steps }, (_, i) => {
        const tread = 0.28;
        const y = -DEPTH + ((i + 1) * DEPTH) / (steps + 1);
        const s0 = i * tread;
        return along ? (
          <mesh key={i} position={[r.x + r.w - s0 - tread / 2, (y - DEPTH) / 2, r.z + r.d / 2]} raycast={noRay}>
            <boxGeometry args={[tread, y + DEPTH, r.d - 0.02]} />
            <meshStandardMaterial color="#9AA3AD" roughness={0.8} />
          </mesh>
        ) : (
          <mesh key={i} position={[r.x + r.w / 2, (y - DEPTH) / 2, r.z + r.d - s0 - tread / 2]} raycast={noRay}>
            <boxGeometry args={[r.w - 0.02, y + DEPTH, tread]} />
            <meshStandardMaterial color="#9AA3AD" roughness={0.8} />
          </mesh>
        );
      })}
      {/* a lamp on the pit wall */}
      <mesh position={[r.x + r.w / 2, -0.5, r.z + 0.03]} raycast={noRay}>
        <boxGeometry args={[0.5, 0.08, 0.04]} />
        <meshStandardMaterial color="#FFFFFF" emissive="#FFF8EC" emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The rest of the complex (towers B and C, the podium, the parked cars), from the site model,
 *  placed round block D so it shows through the windows. Block D's own shell is left out. */
function Surroundings({ z0 }: { z0: number }) {
  // the complex model is Draco-compressed; the decoder is served from public/draco
  const { scene } = useGLTF('/models/complex.glb', '/draco/');
  const model = useMemo(() => {
    fixPeople(scene);
    const m = scene.clone(true);
    m.traverse((o) => {
      if (o.name === 'Annex' || o.name.startsWith('Annex')) o.visible = false;
      o.raycast = () => null;
    });
    return m;
  }, [scene]);
  const { origin, angle } = blockDFrame;
  return (
    <group position={[0, -z0, 0]} rotation={[0, -angle, 0]}>
      <group position={[-origin[0], 0, origin[1]]}>
        <primitive object={model} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- the 360° tour

/** Seconds a jump from one spot to the next takes. */
const JUMP = 0.6;
/** Spots further than this are not offered as places to jump to. */
const REACH = 12;
/** Rings are drawn on the floor only for spots this close, one for each way you can go, like a 360°
 *  camera tour; the rest are still reached by clicking the floor, the arrow keys or the small plan. */
const RING_REACH = 6.5;
/** Two rings closer together in direction than this (radians) show only the nearer one. */
const RING_SPREAD = 0.5;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Looking round from fixed spots, like a 360° camera tour: drag to look all round, then click a ring
 * on the floor (or anywhere on the floor, or a spot on the small plan) to go straight to that spot.
 * The arrow keys turn (left, right) and jump to the next spot ahead or behind (up, down).
 */
function TourRig({ floor, walk, grid, hud }: { floor: PodiumFloor; walk: WalkData; grid: WalkGrid; hud?: WalkHud }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  const points = useMemo(() => capturePoints(floor, grid), [floor, grid]);
  const nearest = (p: Pt, among: Pt[] = points) =>
    among.reduce((a, b) => (Math.hypot(b[0] - p[0], b[1] - p[1]) < Math.hypot(a[0] - p[0], a[1] - p[1]) ? b : a), among[0]);
  const start = useMemo(() => nearest(walk.start), [points, walk]); // eslint-disable-line react-hooks/exhaustive-deps
  const [here, setHere] = useState<Pt>(start);
  const [moving, setMoving] = useState(false);
  const pos = useRef<Pt>(start);
  const move = useRef<{ from: Pt; to: Pt; t: number } | null>(null);
  const yaw = useRef(Math.atan2(walk.look[0] - start[0], walk.look[1] - start[1]));
  const pitch = useRef(-0.05);
  const turn = useRef(0);
  const room = useRef<string | null | undefined>(undefined);
  const e = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);

  /** The spots you can see from here, within reach. */
  const visible = useMemo(
    () => points.filter((p) => p !== here && Math.hypot(p[0] - here[0], p[1] - here[1]) < REACH && grid.clear(here, p)),
    [points, here, grid],
  );

  /** The rings on the floor: the nearest visible spot in each direction, within a few metres. */
  const rings = useMemo(() => {
    const near = visible
      .map((p) => ({ p, d: Math.hypot(p[0] - here[0], p[1] - here[1]), a: Math.atan2(p[0] - here[0], p[1] - here[1]) }))
      .filter((c) => c.d < RING_REACH)
      .sort((x, y) => x.d - y.d);
    const kept: typeof near = [];
    for (const c of near) {
      const apart = (k: (typeof near)[number]) => Math.abs(MathUtils.euclideanModulo(c.a - k.a + Math.PI, 2 * Math.PI) - Math.PI);
      if (kept.every((k) => apart(k) > RING_SPREAD)) kept.push(c);
    }
    return kept.map((c) => c.p);
  }, [visible, here]);

  const jump = (to: Pt) => {
    if (move.current || to === pos.current) return;
    move.current = { from: pos.current, to, t: 0 };
    setMoving(true);
  };
  // the small plan beside the view can send the visitor to a spot too
  useEffect(() => {
    hud?.points?.(points);
    hud?.bindJump?.((p: Pt) => jump(nearest(p)));
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    camera.fov = 75;
    camera.near = 0.05;
    camera.updateProjectionMatrix();
  }, [camera]);

  useEffect(() => {
    let drag: { x: number; y: number } | null = null;
    const down = (ev: PointerEvent) => {
      drag = { x: ev.clientX, y: ev.clientY };
      dom.setPointerCapture(ev.pointerId);
    };
    const moveH = (ev: PointerEvent) => {
      if (!drag) return;
      // drag the picture round, like a 360° photo
      const k = (camera.fov / 75) * 0.0042;
      yaw.current -= (ev.clientX - drag.x) * k;
      pitch.current = MathUtils.clamp(pitch.current + (ev.clientY - drag.y) * k, -1.2, 1.2);
      drag = { x: ev.clientX, y: ev.clientY };
    };
    const up = (ev: PointerEvent) => {
      drag = null;
      if (dom.hasPointerCapture(ev.pointerId)) dom.releasePointerCapture(ev.pointerId);
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      camera.fov = MathUtils.clamp(camera.fov + ev.deltaY * 0.03, 35, 90);
      camera.updateProjectionMatrix();
    };
    const kd = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement) return;
      if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') {
        ev.preventDefault();
        turn.current = ev.code === 'ArrowLeft' ? -1 : 1;
      }
      if (ev.code === 'ArrowUp' || ev.code === 'ArrowDown' || ev.code === 'KeyW' || ev.code === 'KeyS') {
        ev.preventDefault();
        jumpAhead(ev.code === 'ArrowUp' || ev.code === 'KeyW' ? 0 : Math.PI);
      }
    };
    const ku = (ev: KeyboardEvent) => {
      if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') turn.current = 0;
    };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', moveH);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', moveH);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /** The nearest visible spot within 40° of the way you look (or of the way behind you). */
  function jumpAhead(offset: number) {
    const heading = yaw.current + offset;
    let best: Pt | null = null;
    let bestD = Infinity;
    for (const p of visible) {
      const a = Math.atan2(p[0] - here[0], p[1] - here[1]);
      const diff = Math.abs(Math.atan2(Math.sin(a - heading), Math.cos(a - heading)));
      const d = Math.hypot(p[0] - here[0], p[1] - here[1]);
      if (diff < 0.7 && d < bestD) [best, bestD] = [p, d];
    }
    if (best) jump(best);
  }

  const spaces = useMemo(
    () =>
      listedSpaces(floor)
        .filter((s) => !s.void)
        .map((s) => ({ s, b: bounds(s.outline) }))
        .sort((a, b) => (a.b.u1 - a.b.u0) * (a.b.v1 - a.b.v0) - (b.b.u1 - b.b.u0) * (b.b.v1 - b.b.v0)),
    [floor],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    yaw.current += turn.current * 1.4 * dt;
    const m = move.current;
    if (m) {
      m.t = Math.min(1, m.t + dt / JUMP);
      const k = ease(m.t);
      pos.current = [m.from[0] + (m.to[0] - m.from[0]) * k, m.from[1] + (m.to[1] - m.from[1]) * k];
      if (m.t >= 1) {
        pos.current = m.to;
        move.current = null;
        setHere(m.to);
        setMoving(false);
      }
    }
    const [u, v] = pos.current;
    camera.position.set(u, EYE, -v);
    e.set(pitch.current, -yaw.current, 0);
    camera.quaternion.setFromEuler(e);
    hud?.pose(u, v, yaw.current);
    const inside = spaces.find(({ s, b }) => u >= b.u0 && u <= b.u1 && v >= b.v0 && v <= b.v1 && inPolygon([u, v], s.outline))?.s.id ?? null;
    if (inside !== room.current) {
      room.current = inside;
      hud?.room(inside);
    }
  });

  // the cursor: a ring lying on the floor under the pointer, as in 360° tours
  const cursor = useRef<Mesh>(null);
  const [hot, setHot] = useState<number | null>(null);
  const onFloorMove = (ev: ThreeEvent<PointerEvent>) => {
    if (!cursor.current) return;
    cursor.current.visible = !moving;
    cursor.current.position.set(ev.point.x, 0.03, ev.point.z);
  };
  const onFloorClick = (ev: ThreeEvent<MouseEvent>) => {
    if (ev.delta > 5) return;
    const p: Pt = [ev.point.x, -ev.point.z];
    // the spot nearest to where you clicked, preferring one you can see
    const seen = visible.length ? nearest(p, visible) : null;
    const target = seen && Math.hypot(seen[0] - p[0], seen[1] - p[1]) < 3 ? seen : nearest(p);
    jump(target);
  };

  return (
    <>
      <mesh
        position={[9, 0.02, -15]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={onFloorMove}
        onPointerOut={() => cursor.current && (cursor.current.visible = false)}
        onClick={onFloorClick}
      >
        <planeGeometry args={[24, 36]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={cursor} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={noRay}>
        <ringGeometry args={[0.24, 0.32, 40]} />
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {/* the spots you can go to from here */}
      {!moving &&
        rings.map((p, i) => {
          const d = Math.hypot(p[0] - here[0], p[1] - here[1]);
          const fade = MathUtils.clamp(1.25 - d / RING_REACH, 0.45, 1);
          return (
            <group key={`${p[0]},${p[1]}`} position={[p[0], 0.025, -p[1]]} rotation={[-Math.PI / 2, 0, 0]}>
              <mesh
                onClick={(ev) => {
                  if (ev.delta > 5) return;
                  ev.stopPropagation();
                  jump(p);
                }}
                onPointerOver={(ev) => {
                  ev.stopPropagation();
                  setHot(i);
                }}
                onPointerOut={() => setHot(null)}
              >
                <circleGeometry args={[0.3, 32]} />
                <meshBasicMaterial color="#FFFFFF" transparent opacity={(hot === i ? 0.55 : 0.22) * fade} depthWrite={false} />
              </mesh>
              <mesh raycast={noRay}>
                <ringGeometry args={[0.26, 0.31, 40]} />
                <meshBasicMaterial color="#FFFFFF" transparent opacity={0.95 * fade} depthWrite={false} />
              </mesh>
            </group>
          );
        })}
    </>
  );
}

// ---------------------------------------------------------------- the floor

function SpaceFloor({ space, hovered, holes }: { space: PodiumSpace; hovered: boolean; holes?: Rect[] }) {
  const surf = FLOOR[space.type] ?? FLOOR.storage!;
  const map = useTex(surf.map, surf.size);
  return (
    <Slab pts={space.outline} y={0} h={0.01} holes={holes} shadow={false}>
      <meshStandardMaterial map={map} color={hovered ? '#BCD3F7' : surf.color} roughness={surf.rough} metalness={surf.metal ?? 0} />
    </Slab>
  );
}

/** Does a scene rectangle fall inside a room's outline? */
const holeIn = (r: Rect, s: PodiumSpace) => inPolygon([r.x + r.w / 2, -(r.z + r.d / 2)], s.outline);

export default function DFloorScene({ floor, lower, upper, walk, view, label, layer, hovered, onHover, hud }: Props) {
  const storey = floor.z1 - floor.z0;
  const isWalk = view === 'walk';
  const h = isWalk ? storey : Math.min(CUT, storey);
  const inner = isWalk ? storey - D_SLAB : Math.min(CUT, storey);
  const parking = floor.spaces.some((s) => PARKING.has(s.type));
  const below = floor.below ?? (lower ? lower.z1 - lower.z0 : 0);
  const grid = useMemo(() => walkGridFor(floor, walk), [floor, walk]);

  const stairs = floor.spaces.filter((s) => s.type === 'stairs');
  const specs = stairs.map(
    (s): StairSpec => ({
      r: rectOf(s.outline),
      storey,
      below,
      door: s.door ?? 'S',
      flip: s.flip,
      landing: s.landing,
      top: s.top,
      doorAt: s.doorAt !== undefined ? (s.door === 'E' || s.door === 'W' ? -s.doorAt : s.doorAt) : undefined,
    }),
  );
  // where a stair's door opens into the building, the shared wall has the doorway too
  const facade = useMemo<FacadeOpening[]>(
    () => [
      ...walk.facade,
      ...stairs
        .filter((s) => s.door === 'W' && s.doorAt !== undefined)
        .map((s): FacadeOpening => ({ side: 'E', from: s.doorAt! - 0.5, to: s.doorAt! + 0.5, z0: 0, z1: 2.1, kind: 'doorway' })),
    ],
    [walk, stairs],
  );
  const voids = floor.spaces.filter((s) => s.void).map((s) => rectOf(s.outline));
  const pits = (floor.furniture ?? [])
    .filter((f) => f.type === 'pit')
    .map((f) => {
      const [a, b] = f.rot === 1 || f.rot === 3 ? [2.285, 0.58] : [0.58, 2.285];
      return rectBox(f.x - a, f.x + a, f.z - b, f.z + b);
    });
  const holes = [...specs.map(stairOpening).filter((r): r is Rect => !!r), ...voids, ...pits];
  const ceilingHoles = (upper?.spaces ?? []).filter((s) => s.void).map((s) => rectOf(s.outline));
  const furniture = useMemo(() => (floor.furniture ?? []).map((f) => ({ ...f, z: -f.z })), [floor]);
  const cars = useMemo(() => (parking ? (floor.furniture ?? []).filter((f) => f.type === 'car') : []), [floor, parking]);
  const conc = useTex(concrete, 3);
  const lightTarget = useMemo(() => new Object3D(), []);
  const exitSign = useMemo(() => sign('EXIT', '#1E8E3E'), []);
  const fire = useMemo<FurnitureItem[]>(
    () =>
      parking
        ? [6, 18].flatMap((v) => [{ type: 'extinguisher' as const, x: 6 + HALF_COL, z: -v, rot: 1 as const }])
        : [],
    [parking],
  );

  const anchors = useMemo<Anchor[]>(
    () =>
      isWalk
        ? []
        : listedSpaces(floor).map((s) => {
            const [u, v] = polygonCentre(s.outline);
            return { id: `space:${s.id}`, position: [u, CUT + 1.0, -v] };
          }),
    [floor, isWalk],
  );

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ fov: 38, near: 0.3, far: 1200, position: [9 + 26, 36, -15 + 34] }}>
      {isWalk && floor.z0 >= 0 && <Sky distance={4500} sunPosition={[120, 60, 80]} turbidity={5} rayleigh={1.2} mieCoefficient={0.004} />}
      {isWalk && floor.z0 < 0 && <color attach="background" args={['#2A2E33']} />}
      {/* reflections for paint, glass and steel: strip lights and a bright sky, made in the scene
          (no image files) */}
      <Environment resolution={128} frames={1} environmentIntensity={0.35}>
        <color attach="background" args={['#BFC8D0']} />
        {[-12, -4, 4, 12].map((x) => (
          <Lightformer key={x} form="rect" intensity={3} position={[x, 8, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.5, 30, 1]} />
        ))}
        <Lightformer form="rect" intensity={1.5} color="#DCE8F4" position={[0, 2, -20]} scale={[40, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#F4EEE4" position={[0, 2, 20]} rotation={[0, Math.PI, 0]} scale={[40, 6, 1]} />
      </Environment>
      <ambientLight intensity={isWalk ? 0.12 : 0.25} />
      <hemisphereLight args={['#F4F7FB', '#6E747A', isWalk ? 0.55 : 0.8]} />
      {/* overhead light: soft shadows under cars and racks */}
      <directionalLight
        position={[13, 30, -9]}
        intensity={isWalk ? 1.0 : 1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-camera-near={1}
        shadow-camera-far={80}
        target={lightTarget}
      />
      <primitive object={lightTarget} position={[9, 0, -15]} />
      {isWalk && <directionalLight position={[-20, 12, 10]} intensity={0.35} />}

      {isWalk ? (
        <TourRig floor={floor} walk={walk} grid={grid} hud={hud} />
      ) : (
        <OrbitControls makeDefault target={[9, 0, -15]} enablePan={false} minDistance={10} maxDistance={110} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2.25} />
      )}

      {/* the slab under the floor (0.25 m), cut for the stairs, the opening and the pit */}
      <Slab pts={blockDOutline} y={-D_SLAB} h={D_SLAB - 0.001} holes={holes}>
        <meshStandardMaterial map={conc} color="#BFC3C6" roughness={0.9} />
      </Slab>
      {isWalk && floor.z0 >= 0 && (
        <>
          <mesh position={[9, -floor.z0 - 0.06, -15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={noRay}>
            <planeGeometry args={[600, 600]} />
            <meshStandardMaterial color="#B8BDB5" roughness={1} />
          </mesh>
          <Suspense fallback={null}>
            <Surroundings z0={floor.z0} />
          </Suspense>
        </>
      )}

      {floor.spaces
        .filter((s) => !s.void && s.type !== 'stairs' && s.type !== 'lifts')
        .map((s) => (
          <SpaceFloor key={s.id} space={s} hovered={!isWalk && hovered === s.id} holes={pits.filter((r) => holeIn(r, s))} />
        ))}
      {pits.map((r, i) => (
        <PitWell key={i} r={r} />
      ))}
      {!isWalk && <HoverTargets floor={floor} onHover={onHover} />}

      {(['S', 'N', 'W', 'E'] as FacadeSide[]).map((side) => (
        <FacadeWall key={side} side={side} openings={facade} h={h} dado={parking} />
      ))}
      {/* the opening into the main car park: the floor runs on into the dark */}
      {walk.facade
        .filter((o) => o.kind === 'open' && o.side === 'N')
        .map((o, i) => (
          <group key={i}>
            <B u0={o.from} u1={o.to} v0={30.45} v1={36} y0={-0.3} y1={0}>
              <meshStandardMaterial map={conc} color="#9EA4A9" roughness={0.9} />
            </B>
            {isWalk && (
              <B u0={o.from - 0.5} u1={o.to + 0.5} v0={36} v1={36.3} y0={-0.3} y1={storey}>
                <meshStandardMaterial color="#1E2126" roughness={1} />
              </B>
            )}
          </group>
        ))}
      {walk.partitions.map((p, i) => (
        <PartitionWall key={i} p={p} h={inner} ramps={floor.ramps} leaves={isWalk} />
      ))}
      <Columns h={inner} parking={parking} label={label} voids={voids} />
      {parking && <Bays cars={cars} label={label} />}
      {(walk.arrows ?? []).map((a, i) => (
        <Arrow key={i} c={a.c} dir={a.dir} />
      ))}
      {/* EXIT signs over the doors into the stair */}
      {isWalk &&
        stairs
          .filter((s) => s.door === 'W' && s.doorAt !== undefined)
          .map((s) => <Plate key={s.id} u={D_INSIDE.u1 - 0.02} v={s.doorAt!} y={2.35} size={[0.42, 0.42]} map={exitSign} rot={3} glow />)}

      {stairs.map((s, i) => (
        <Stairs key={s.id} {...specs[i]} wallH={inner} />
      ))}
      {floor.spaces
        .filter((s) => s.type === 'lifts')
        .map((s) => (
          <Lifts key={s.id} r={rectOf(s.outline)} doors={s.doors} wallH={inner} />
        ))}
      {(floor.ramps ?? []).map((r, i) => (
        <RampD key={i} r={r} cut={isWalk ? 99 : CUT} />
      ))}
      {/* through the opening: the ramp on up from the floor above */}
      {isWalk &&
        (upper?.ramps ?? [])
          .filter((r) => r.y0 >= 0)
          .map((r, i) => <RampD key={`u${i}`} r={r} dy={storey} cut={99} />)}
      {floor.spaces
        .filter((s) => s.void)
        .flatMap((s) => {
          const r = rectOf(s.outline);
          const ends: Record<string, [[number, number], [number, number]]> = {
            N: [[r.x, r.z], [r.x + r.w, r.z]],
            S: [[r.x, r.z + r.d], [r.x + r.w, r.z + r.d]],
            W: [[r.x, r.z], [r.x, r.z + r.d]],
            E: [[r.x + r.w, r.z], [r.x + r.w, r.z + r.d]],
          };
          const b = bounds(s.outline);
          const upstand: Record<string, { u0: number; u1: number; v0: number; v1: number }> = {
            W: { u0: b.u0 - 0.2, u1: b.u0, v0: b.v0, v1: b.v1 },
            E: { u0: b.u1, u1: b.u1 + 0.2, v0: b.v0, v1: b.v1 },
            N: { u0: b.u0, u1: b.u1, v0: b.v1, v1: b.v1 + 0.2 },
            S: { u0: b.u0, u1: b.u1, v0: b.v0 - 0.2, v1: b.v0 },
          };
          return [
            ...(s.rails ?? []).map((side) => <Rail key={`${s.id}r${side}`} a={ends[side][0]} b={ends[side][1]} />),
            // concrete parapet, 1.1 m high (hatched on the plans)
            ...(s.parapet ?? []).map((side) => (
              <B key={`${s.id}p${side}`} {...upstand[side]} y0={0} y1={1.1}>
                <meshStandardMaterial map={conc} color="#D2D5D7" roughness={0.9} />
              </B>
            )),
          ];
        })}
      <Furniture items={[...furniture, ...fire]} finish={defaultFinish} />

      {isWalk && <Ceiling h={storey} holes={ceilingHoles} upper={upper ? upper.z1 - upper.z0 : undefined} duct={parking && storey >= 3.2} />}

      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}

/** Invisible floor tiles that report which room the pointer is over (orbit view). */
function HoverTargets({ floor, onHover }: { floor: PodiumFloor; onHover: (id: string | null) => void }) {
  const items = useMemo(
    () =>
      listedSpaces(floor).map((s) => {
        const sh = new Shape();
        s.outline.forEach(([u, v], i) => (i ? sh.lineTo(u, v) : sh.moveTo(u, v)));
        return { s, g: new ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }) };
      }),
    [floor],
  );
  return (
    <>
      {items.map(({ s, g }) => (
        <mesh
          key={s.id}
          geometry={g}
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(s.id);
          }}
          onPointerOut={() => onHover(null)}
        >
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}
