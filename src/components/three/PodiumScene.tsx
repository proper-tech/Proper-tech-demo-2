'use client';

import { Suspense, useCallback, useMemo, type ReactNode } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { ExtrudeGeometry, Group, Path, Shape, Vector3, type Mesh } from 'three';
import { SkeletonUtils } from 'three-stdlib';
import type { Rect } from '@/data/building';
import { defaultFinish } from '@/data/finishes';
import { getPodiumFloor, listedSpaces, type Decor, type PodiumFloor, type PodiumSpace, type PodiumSpaceType } from '@/data/podium';
import { bounds, inPolygon, offsetPolygon, polygonCentre, type Pt } from '@/lib/geometry';
import { Lights } from './ApartmentScene';
import { Escalators, Lifts, Stairs, escalatorVoid, stairOpening, type EscalatorRun, type StairSpec } from './Cores';
import { Furniture } from './Furniture';
import { Projector, type Anchor, type LabelLayer } from './Projector';
import { CameraRig, ROOF_SPOTS, type Pt3, type Tour } from './Tour';

// One podium floor (block A) in 3D: every space is a coloured floor tile, small rooms get
// cut-away walls, stairs, lifts and escalators are modelled (three/Cores.tsx), the towers on the
// roof are solid blocks. Site-plan (u, v) is centred on the floor and mapped to the scene as
// x = u, z = -v, like the building scene.

interface Props {
  floor: PodiumFloor;
  /** Element that holds the space tags (see Projector). */
  layer: LabelLayer;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onOpen: (space: PodiumSpace) => void;
  /** 360° view of the roof playground (floor 4 only): overview or an eye-level viewpoint. */
  tour?: Tour;
}

const COLOR: Record<PodiumSpaceType, string> = {
  hall: '#EADFD0',
  supermarket: '#F2EAD0',
  retail: '#E3EAF2',
  storage: '#DDE2E8',
  stairs: '#B4BEC9',
  lifts: '#97A3B0',
  escalators: '#7F8B98',
  vestibule: '#DDE9E1',
  staff: '#E1E5EC',
  office: '#E1E5EC',
  toilets: '#D3E3EC',
  corridor: '#EEF1F4',
  covered: '#D7DDE3',
  playground: '#BFD7AE',
  tower: '#EEF0F1',
  technical: '#DDE2E8',
  roof: '#D5DBE1',
  parking: '#D3D8DE',
  ramp: '#BCC4CD',
  lobby: '#DDE9E1',
};
/** The towers on the roof stand as solid blocks of this height (m). */
const SOLID: Partial<Record<PodiumSpaceType, number>> = { tower: 4.5 };
/** Rooms with walls around them, cut away at this height like the apartment floors. */
const WALLS: Partial<Record<PodiumSpaceType, number>> = { hall: 2.4, storage: 2.4, staff: 2.4, office: 2.4, toilets: 2.4, vestibule: 2.4, technical: 2.4, lobby: 2.4 };
/** Spaces modelled in detail instead of a floor tile; cut at the same height as the walls. */
const CORES = new Set<PodiumSpaceType>(['stairs', 'lifts', 'escalators']);
const CUT = 2.4;
/** Big spaces that other rooms sit on: drawn lower so the rooms on top never flicker. */
const BACKGROUND = new Set<PodiumSpaceType>(['retail', 'supermarket', 'playground', 'roof', 'parking']);
const HOVER = '#BCD3F7';
const noRay = () => null;

type Frame = (p: Pt) => [number, number];

interface PrismProps {
  pts: Pt[];
  at: Frame;
  y?: number;
  h: number;
  color: string;
  opacity?: number;
  /** Openings cut through it, as scene rectangles (stair flights and escalators going down). */
  holes?: Rect[];
  /** Pointer handlers; without them the prism ignores the pointer. */
  events?: {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
    onPointerOut: () => void;
    onClick: (e: ThreeEvent<MouseEvent>) => void;
  };
}

/** An outline extruded upwards: floor tiles, cores, the slab. */
function Prism({ pts, at, y = 0, h, color, opacity = 1, holes, events }: PrismProps) {
  const geometry = useMemo(() => {
    const s = new Shape();
    pts.forEach((p, i) => {
      const [x, z] = at(p);
      if (i) s.lineTo(x, z);
      else s.moveTo(x, z);
    });
    // the shape is drawn with y = north and laid flat below, so scene z = -y
    for (const r of holes ?? []) {
      const hole = new Path();
      hole.moveTo(r.x, -r.z);
      hole.lineTo(r.x + r.w, -r.z);
      hole.lineTo(r.x + r.w, -(r.z + r.d));
      hole.lineTo(r.x, -(r.z + r.d));
      hole.closePath();
      s.holes.push(hole);
    }
    return new ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  }, [pts, at, h, holes]);

  return (
    <mesh geometry={geometry} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} {...(events ?? { raycast: noRay })}>
      <meshStandardMaterial color={color} roughness={0.85} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;

/** Thin walls along a closed outline, standing on `y`; sides matching a `gaps` segment are left open. */
function Walls({ pts, at, y = 0, h, color, opacity = 1, gaps }: { pts: Pt[]; at: Frame; y?: number; h: number; color: string; opacity?: number; gaps?: [Pt, Pt][] }) {
  return (
    <>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        if (gaps?.some(([a, b]) => (near(p, a) && near(q, b)) || (near(p, b) && near(q, a)))) return null;
        const [ax, ay] = at(p);
        const [bx, by] = at(q);
        const length = Math.hypot(bx - ax, by - ay);
        if (length < 0.05) return null;
        return (
          <mesh key={i} position={[(ax + bx) / 2, y + h / 2, -(ay + by) / 2]} rotation={[0, Math.atan2(by - ay, bx - ax), 0]} raycast={noRay}>
            <boxGeometry args={[length + 0.12, h, 0.12]} />
            <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} />
          </mesh>
        );
      })}
    </>
  );
}

function SpaceMesh({ space, at, holes, hovered, onHover, onOpen }: { space: PodiumSpace; at: Frame; holes?: Rect[]; hovered: boolean } & Pick<Props, 'onHover' | 'onOpen'>) {
  const walls = WALLS[space.type];
  return (
    <>
      <Prism
        pts={space.outline}
        at={at}
        holes={holes}
        h={SOLID[space.type] ?? (BACKGROUND.has(space.type) ? 0.03 : 0.06)}
        color={hovered ? HOVER : COLOR[space.type]}
        events={{
          onPointerOver: (e) => {
            e.stopPropagation();
            onHover(space.id);
          },
          onPointerOut: () => onHover(null),
          onClick: (e) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            onOpen(space);
          },
        }}
      />
      {walls && <Walls pts={space.outline} at={at} h={walls} color="#F4F5F7" />}
    </>
  );
}

/** The side of a ramp it starts from on this floor: the one opposite the way it goes up. */
function rampMouth(s: PodiumSpace): [Pt, Pt] {
  const o = bounds(s.outline);
  const sides: Record<NonNullable<PodiumSpace['rise']>, [Pt, Pt]> = {
    N: [[o.u0, o.v0], [o.u1, o.v0]],
    S: [[o.u0, o.v1], [o.u1, o.v1]],
    E: [[o.u0, o.v0], [o.u0, o.v1]],
    W: [[o.u1, o.v0], [o.u1, o.v1]],
  };
  return sides[s.rise ?? 'N'];
}

/** A ramp: a slab rising from this floor up `rise` metres along its length, with low walls along
 *  both sides. Built along local +z, then turned to face the way it goes up. */
function RampMesh({ space, r, rise, hovered, onHover, onOpen }: { space: PodiumSpace; r: Rect; rise: number; hovered: boolean } & Pick<Props, 'onHover' | 'onOpen'>) {
  const ns = space.rise === 'N' || space.rise === 'S';
  const [len, width] = ns ? [r.d, r.w] : [r.w, r.d];
  const slope = Math.hypot(len, rise);
  const yaw = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 }[space.rise ?? 'N'];
  return (
    <group position={[r.x + r.w / 2, rise / 2, r.z + r.d / 2]} rotation={[0, yaw, 0]}>
      <group
        rotation={[-Math.atan2(rise, len), 0, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(space.id);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          if (e.delta > 4) return;
          e.stopPropagation();
          onOpen(space);
        }}
      >
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[width, 0.2, slope]} />
          <meshStandardMaterial color={hovered ? HOVER : COLOR.ramp} roughness={0.85} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[(side * width) / 2, 0.5, 0]} raycast={noRay}>
            <boxGeometry args={[0.15, 1, slope]} />
            <meshStandardMaterial color="#B9C1CA" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** The roof playground as modelled in Blender from the drawing (sheet 17): paving, planting and
 *  shrubs, rubber surfacing, climbing bridge, spring riders, swings, pavilion, lamps, benches and
 *  people. It ships inside block A's model (public/models/blocks/A.glb, objects named RG_*), in
 *  site-plan coordinates (x = u, y = height, z = -v), so it is shifted onto this floor's frame. */
const BLOCK_A_URL = '/models/blocks/A.glb';
const DRACO_URL = '/draco/';

function RoofGarden({ cu, cv, z0 }: { cu: number; cv: number; z0: number }) {
  const { scene } = useGLTF(BLOCK_A_URL, DRACO_URL);
  const garden = useMemo(() => {
    const g = new Group();
    for (const o of scene.children) if (o.name.startsWith('RG_')) g.add(SkeletonUtils.clone(o));
    g.traverse((o) => {
      const m = o as Mesh & { isSkinnedMesh?: boolean };
      if (!m.isMesh) return;
      m.raycast = noRay; // the floor tile underneath keeps the hover and the click
      if (m.isSkinnedMesh) m.frustumCulled = false;
    });
    return g;
  }, [scene]);
  // lifted onto the playground's floor tile (3 cm) so the paving is not hidden under it
  return <primitive object={garden} position={[-cu, -z0 + 0.03, cv]} />;
}

/** Simple playground furniture on the roof (floor 4), shown while the detailed model loads. */
function DecorMesh({ d, at }: { d: Decor; at: Frame }) {
  if (d.kind === 'pad') {
    const [x, y] = at(d.c);
    return (
      <mesh position={[x, 0.1, -y]} scale={[d.rx, 1, d.ry]} raycast={noRay}>
        <cylinderGeometry args={[1, 1, 0.05, 32]} />
        <meshStandardMaterial color={d.tone === 'blue' ? '#5B9BD8' : '#E07A5F'} />
      </mesh>
    );
  }
  if (d.kind === 'pavilion') {
    const [x, y] = at(d.c);
    return (
      <group position={[x, 0, -y]}>
        {Array.from({ length: 6 }, (_, k) => {
          const a = (Math.PI / 3) * k + Math.PI / 6;
          return (
            <mesh key={k} position={[Math.cos(a) * d.r * 0.85, 1.4, -Math.sin(a) * d.r * 0.85]} raycast={noRay}>
              <boxGeometry args={[0.18, 2.8, 0.18]} />
              <meshStandardMaterial color="#9C6B3F" />
            </mesh>
          );
        })}
        <mesh position={[0, 2.9, 0]} raycast={noRay}>
          <cylinderGeometry args={[d.r, d.r, 0.25, 6]} />
          <meshStandardMaterial color="#C8A27A" />
        </mesh>
        <mesh position={[0, 0.1, 0]} raycast={noRay}>
          <cylinderGeometry args={[d.r * 0.95, d.r * 0.95, 0.1, 6]} />
          <meshStandardMaterial color="#D9B98F" />
        </mesh>
      </group>
    );
  }
  // climbing frame: soft surfacing under a timber beam on posts, following the curve on the plan
  return (
    <>
      {d.path.slice(1).map((q, i) => {
        const [ax, ay] = at(d.path[i]);
        const [bx, by] = at(q);
        const length = Math.hypot(bx - ax, by - ay);
        return (
          <group key={i} position={[(ax + bx) / 2, 0, -(ay + by) / 2]} rotation={[0, Math.atan2(by - ay, bx - ax), 0]}>
            <mesh position={[0, 0.09, 0]} raycast={noRay}>
              <boxGeometry args={[length + 0.6, 0.05, d.w]} />
              <meshStandardMaterial color="#E07A5F" />
            </mesh>
            <mesh position={[0, 1.5, 0]} raycast={noRay}>
              <boxGeometry args={[length, 0.14, 0.9]} />
              <meshStandardMaterial color="#8A5A3B" />
            </mesh>
            <mesh position={[-length / 2, 0.75, 0]} raycast={noRay}>
              <boxGeometry args={[0.14, 1.5, 0.9]} />
              <meshStandardMaterial color="#8A5A3B" />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

/** A stair, lift or escalator space in detail. Its pointer events and hover tint stand in for the
 *  floor tile the other spaces get. */
function CoreMesh({ space, r, hovered, onHover, onOpen, children }: { space: PodiumSpace; r: Rect; hovered: boolean; children: ReactNode } & Pick<Props, 'onHover' | 'onOpen'>) {
  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(space.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        onOpen(space);
      }}
    >
      {children}
      {hovered && (
        <mesh position={[r.x + r.w / 2, 0.06, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRay}>
          <planeGeometry args={[r.w, r.d]} />
          <meshBasicMaterial color="#2F6FDE" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export default function PodiumScene({ floor, layer, hovered, onHover, onOpen, tour = { kind: 'overview' } }: Props) {
  const b = bounds(floor.outline);
  const cu = (b.u0 + b.u1) / 2;
  const cv = (b.v0 + b.v1) / 2;
  const at = useCallback((p: Pt): [number, number] => [p[0] - cu, p[1] - cv], [cu, cv]);
  /** Site-plan outline -> scene rectangle round it. */
  const rectOf = useCallback(
    (pts: Pt[]): Rect => {
      const o = bounds(pts);
      return { x: o.u0 - cu, z: -(o.v1 - cv), w: o.u1 - o.u0, d: o.v1 - o.v0 };
    },
    [cu, cv],
  );
  const terrace = floor.spaces.find((s) => s.type === 'playground');
  const planting = useMemo(() => (terrace ? offsetPolygon(terrace.outline, -1.6) : null), [terrace]);
  const isRoof = floor.spaces.some((s) => s.type === 'roof');
  // the camera stands back in proportion to the floor: the whole podium, or one tower roof
  const k = Math.max(0.4, Math.max(b.u1 - b.u0, b.v1 - b.v0) / 63);
  // the roof playground can be walked through at eye level (Tour.tsx); site plan -> this floor
  const frame = useCallback(([u, v, h]: Pt3) => new Vector3(u - cu, h - floor.z0 + 0.03, -(v - cv)), [cu, cv, floor.z0]);
  const home = useMemo(() => ({ position: new Vector3(48 * k, 70 * k, 62 * k), target: new Vector3(0, 0, 0), fov: 38, near: 0.5 }), [k]);

  // Stairs climb half this storey to their half landing and go down half the one below. The
  // escalators rise southwards: the pair up from this floor (floors 1 and 2) is cut at the wall
  // height, the pair up from the floor below arrives through an opening in this floor.
  const cores = useMemo(() => {
    const storey = floor.z1 - floor.z0;
    const lower = getPodiumFloor(floor.floor - 1);
    const below = floor.below ?? (lower ? lower.z1 - lower.z0 : 0);
    // a flight goes down only where the floor below has a stair too (the west stair stops at floor 1)
    const continues = (s: PodiumSpace) => !lower || lower.spaces.some((l) => l.type === 'stairs' && inPolygon(polygonCentre(s.outline), l.outline));
    const stairs = floor.spaces
      .filter((s) => s.type === 'stairs')
      .map((s) => ({ space: s, spec: { r: rectOf(s.outline), storey, below: continues(s) ? below : 0, door: s.door ?? 'S', flip: s.flip } satisfies StairSpec }));
    const runs: EscalatorRun[] = [];
    const own = floor.spaces.find((s) => s.type === 'escalators');
    if (own && floor.floor < 3) {
      const r = rectOf(own.outline);
      runs.push({ x0: r.x, x1: r.x + r.w, z: r.z, y0: 0, rise: storey });
    }
    const from = lower?.spaces.find((s) => s.type === 'escalators');
    if (lower && from && lower.floor < 3) {
      const r = rectOf(from.outline);
      runs.push({ x0: r.x, x1: r.x + r.w, z: r.z, y0: -below, rise: below });
    }
    const holes = [...stairs.map((s) => stairOpening(s.spec)), ...runs.filter((e) => e.y0 < 0).map(escalatorVoid)].filter((h): h is Rect => !!h);
    return { stairs, own, runs, holes };
  }, [floor, rectOf]);
  /** The openings that fall inside a space, to cut out of its floor tile too. */
  const holesIn = (s: PodiumSpace) => cores.holes.filter((h) => inPolygon([h.x + h.w / 2 + cu, cv - (h.z + h.d / 2)], s.outline));
  const furniture = useMemo(() => floor.furniture?.map((f) => ({ ...f, x: f.x - cu, z: cv - f.z })) ?? [], [floor, cu, cv]);

  const anchors = useMemo<Anchor[]>(
    () =>
      listedSpaces(floor).map((s) => {
        const [x, y] = at(polygonCentre(s.outline));
        return { id: `space:${s.id}`, position: [x, (SOLID[s.type] ?? WALLS[s.type] ?? (CORES.has(s.type) ? CUT : 0.5)) + 1.2, -y] };
      }),
    [floor, at],
  );

  return (
    <Canvas flat dpr={[1, 2]} camera={{ fov: 38, near: 0.5, far: 600, position: [48 * k, 70 * k, 62 * k] }}>
      <Lights />
      {terrace ? (
        <CameraRig
          tour={tour}
          autoRotate={false}
          targetY={0}
          spots={ROOF_SPOTS}
          frame={frame}
          home={home}
          overview={{ enableZoom: true, minDistance: 12, maxDistance: 170, minPolarAngle: 0.1, maxPolarAngle: Math.PI / 2.3 }}
        />
      ) : (
        <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} minDistance={12} maxDistance={170} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2.3} />
      )}

      <Prism pts={floor.outline} at={at} y={-0.3} h={0.3} color="#C5CDD6" holes={cores.holes} />
      {floor.spaces.map((s) =>
        CORES.has(s.type) ? null : s.type === 'ramp' ? (
          // up to ground level: the top of this storey
          <RampMesh key={s.id} space={s} r={rectOf(s.outline)} rise={floor.z1 - floor.z0} hovered={hovered === s.id} onHover={onHover} onOpen={onOpen} />
        ) : (
          <SpaceMesh key={s.id} space={s} at={at} holes={holesIn(s)} hovered={hovered === s.id} onHover={onHover} onOpen={onOpen} />
        ),
      )}
      {/* parking spaces: white lines painted on the car park floor */}
      {floor.spaces
        .flatMap((s) => s.stalls ?? [])
        .map((stall, i) => (
          <Walls key={`stall-${i}`} pts={stall} at={at} y={0.03} h={0.01} color="#FFFFFF" />
        ))}
      {cores.stairs.map(({ space, spec }) => (
        <CoreMesh key={space.id} space={space} r={spec.r} hovered={hovered === space.id} onHover={onHover} onOpen={onOpen}>
          <Stairs {...spec} wallH={CUT} />
        </CoreMesh>
      ))}
      {floor.spaces
        .filter((s) => s.type === 'lifts')
        .map((s) => (
          <CoreMesh key={s.id} space={s} r={rectOf(s.outline)} hovered={hovered === s.id} onHover={onHover} onOpen={onOpen}>
            <Lifts r={rectOf(s.outline)} doors={s.doors} wallH={CUT} />
          </CoreMesh>
        ))}
      {cores.own && (
        <CoreMesh space={cores.own} r={rectOf(cores.own.outline)} hovered={hovered === cores.own.id} onHover={onHover} onOpen={onOpen}>
          {cores.runs.map((run, i) => (
            <Escalators key={i} run={run} cut={CUT} />
          ))}
        </CoreMesh>
      )}
      <Furniture items={furniture} finish={defaultFinish} />

      {terrace && planting ? (
        <>
          {/* the parapet, and a blue tint over the playground when it is pointed at */}
          <Walls pts={terrace.outline} at={at} h={1.1} color="#F4F5F7" />
          {hovered === terrace.id && <Prism pts={planting} at={at} y={0.45} h={0.02} color="#2F6FDE" opacity={0.25} />}
        </>
      ) : isRoof ? (
        // the parapet round the tower roof
        <Walls pts={floor.outline} at={at} h={1.2} color="#F4F5F7" />
      ) : floor.floor === 0 ? (
        // the basement's concrete walls, open where the ramps start
        <Walls pts={floor.outline} at={at} h={1.2} color="#B9C1CA" gaps={floor.spaces.filter((s) => s.type === 'ramp').map(rampMouth)} />
      ) : (
        // the facade, cut away low so the rooms stay visible
        <Walls pts={floor.outline} at={at} h={1.2} color="#8FB0C8" opacity={0.45} />
      )}
      {/* the towers standing on the roof: white tops, blue glazing on their sides as in the renders */}
      {floor.spaces
        .filter((s) => s.type === 'tower')
        .map((s) => (
          <Walls key={`glass-${s.id}`} pts={offsetPolygon(s.outline, 0.04)} at={at} h={(SOLID.tower ?? 4.5) - 0.25} color="#4A78B0" opacity={0.92} />
        ))}
      {terrace ? (
        <Suspense fallback={floor.decor?.map((d, i) => <DecorMesh key={i} d={d} at={at} />)}>
          <RoofGarden cu={cu} cv={cv} z0={floor.z0} />
        </Suspense>
      ) : (
        floor.decor?.map((d, i) => <DecorMesh key={i} d={d} at={at} />)
      )}

      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}
