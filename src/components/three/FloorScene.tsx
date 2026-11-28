'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ExtrudeGeometry, MathUtils, Path, PlaneGeometry, Shape, TextureLoader, Vector3, type PerspectiveCamera } from 'three';
import { FLOOR_HEIGHT, FLOOR_MIN, PLATE, PODIUM_FLOORS, type CoreSpace, type Rect } from '@/data/building';
import { defaultFinish } from '@/data/finishes';
import { flatColors, layouts } from '@/data/layouts';
import { windowPoints } from '@/data/windowPoints';
import { getPodiumFloor } from '@/data/podium';
import type { Layout, Unit } from '@/data/types';
import { maxCeiling } from '@/lib/geometry';
import { ApartmentModel } from './ApartmentModel';
import { SafeCanvas } from './SafeCanvas';
import { PhotoApartment } from './PhotoApartment';
import { photoModels } from '@/data/photoModels';
import { Lights } from './ApartmentScene';
import { stoneTexture } from './textures';
import { Lifts, Stairs, stairOpening, type StairSpec } from './Cores';
import { Projector, type Anchor, type LabelLayer } from './Projector';
import { ARRIVE_KEY, FLOOR_FOV, FLOOR_VIEW, fitScale } from '@/lib/arrive';

interface Props {
  units: Unit[];
  core: CoreSpace[];
  /** Element that holds the apartment tags (see Projector). */
  layer: LabelLayer;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
  /** Called once the plan pictures are in, the shaders compiled and the first frames drawn. */
  onReady?: () => void;
  /** The page's compass, turned to match the camera (CompassNeedle). */
  compass?: React.RefObject<HTMLElement | null>;
  /** An apartment being opened: the camera flies down onto it (EnterUnit), then onEntered. */
  entering?: string | null;
  onEntered?: () => void;
}

// Floor-plate coordinates (X east, Y north, see layouts.ts) -> scene: x east, z south,
// centred on the plate.
const CX = (PLATE.x0 + PLATE.x1) / 2;
const CY = (PLATE.y0 + PLATE.y1) / 2;
const sx = (X: number) => X - CX;
const sz = (Y: number) => CY - Y;
/** A core space as a scene rectangle. */
const sceneRect = (c: CoreSpace): Rect => ({ x: sx(c.x0), z: sz(c.y1), w: c.x1 - c.x0, d: c.y1 - c.y0 });

/** Core walls stand as high as the apartments' cut walls, so the floor reads as one plan. */
const WALL_H = 1.25;
/** C and D are mirror images that meet on the plate's mirror line; their pictures stop there. */
const MIRROR_X = 10.8;
const PHOTO_CLIP: Partial<Record<string, [number, number]>> = { C: [-99, MIRROR_X], D: [MIRROR_X, 99] };
/** The party wall between C and D on the mirror line (plate metres: west, south, east, north). Each picture's own
 *  side wall lies past the line and is cut away with it, so it is drawn here, as thick as the facade walls. */
const PARTY_WALL = [MIRROR_X - 0.175, 0.193, MIRROR_X + 0.175, 9.864] as const;
/** The podium's top storey, under the first apartment floor (sections). */
const PODIUM_TOP = getPodiumFloor(PODIUM_FLOORS)!;

/** Where an apartment's own coordinates start on the plate (its north-west corner). */
export function unitPlacement(layout: Layout): [number, number, number] {
  return [sx(layout.origin[0]), 0, sz(layout.origin[1])];
}

import { unitCentre } from '@/lib/unitCentre';
export { unitCentre };

function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number) {
  const s = new Shape();
  s.moveTo(x0 + r, y0);
  s.lineTo(x1 - r, y0);
  s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

/** The floor slab, with the opening the stair's flight down passes through. */
function Slab({ hole }: { hole: Rect | null }) {
  const geometry = useMemo(() => {
    // Built in scene x / -z so it can be laid flat with a -90° turn about x.
    const shape = roundedRect(sx(PLATE.x0), -sz(PLATE.y0), sx(PLATE.x1), -sz(PLATE.y1), PLATE.corner);
    if (hole) {
      const p = new Path();
      p.moveTo(hole.x, -hole.z);
      p.lineTo(hole.x + hole.w, -hole.z);
      p.lineTo(hole.x + hole.w, -(hole.z + hole.d));
      p.lineTo(hole.x, -(hole.z + hole.d));
      p.closePath();
      shape.holes.push(p);
    }
    return new ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  }, [hole]);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
      <meshStandardMaterial color="#C5CDD6" />
    </mesh>
  );
}

/** The stair and lifts are modelled in detail (three/Cores.tsx); the rest of the core is blocks. */
const CORE_LOOK: Record<Exclude<CoreSpace['id'], 'stair' | 'lifts'>, { h: number; color: string }> = {
  corridor: { h: 0, color: '#DDE2E7' },
  shafts: { h: 1.25, color: '#EDEBE6' },
  hoa: { h: 1.25, color: '#EDEBE6' },
  trash: { h: 1.25, color: '#EDEBE6' },
  hall: { h: 0, color: '#DDE2E7' },
  steps: { h: 0, color: '#DDE2E7' },
  exit: { h: 0, color: '#DDE2E7' },
  room: { h: 1.25, color: '#EDEBE6' },
};

/** Floor 4's double doors out to the roof playground: a glass pane in an amber frame, in the facade. */
function ExitDoor({ door }: { door: NonNullable<CoreSpace['door']> }) {
  const len = door.b - door.a;
  const mid = (door.a + door.b) / 2;
  const west = door.side === 'W';
  const [x, z] = west ? [sx(PLATE.x0 + 0.15), sz(mid)] : [sx(mid), sz(PLATE.y1 - 0.1)];
  // [along the wall, through it] -> box size in x and z
  const size = (along: number, across: number, h: number): [number, number, number] => (west ? [across, h, along] : [along, h, across]);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={size(len + 0.1, 0.12, 2.1)} />
        <meshStandardMaterial color="#F2B632" />
      </mesh>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={size(len - 0.2, 0.16, 1.9)} />
        <meshStandardMaterial color="#9FC3D9" />
      </mesh>
    </group>
  );
}

function CoreBlock({ space }: { space: CoreSpace }) {
  if (space.id === 'stair' || space.id === 'lifts') return null;
  const look = CORE_LOOK[space.id];
  const w = space.x1 - space.x0;
  const d = space.y1 - space.y0;
  const x = sx((space.x0 + space.x1) / 2);
  const z = sz((space.y0 + space.y1) / 2);
  if (look.h === 0) {
    return <StoneFloor x={x} z={z} w={w} d={d} />;
  }
  return (
    <group>
      <mesh position={[x, look.h / 2, z]}>
        <boxGeometry args={[w - 0.1, look.h, d - 0.1]} />
        <meshStandardMaterial color={look.color} />
      </mesh>
      <mesh position={[x, look.h + 0.025, z]}>
        <boxGeometry args={[w - 0.1, 0.05, d - 0.1]} />
        <meshStandardMaterial color="#14233B" />
      </mesh>
    </group>
  );
}

/** Corridor and lift lobby floor: large stone tiles at their real size. */
function StoneFloor({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(w, d);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 2.4, (uv.getY(i) * d) / 2.4);
    return g;
  }, [w, d]);
  return (
    <mesh geometry={geometry} position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial map={stoneTexture()} roughness={0.55} />
    </mesh>
  );
}

/** Turns the page's compass (an element outside the canvas) so its N points north on screen. North is
 *  -z in the scene (z runs south), so facing north the needle points straight up. */
function CompassNeedle({ el }: { el: React.RefObject<HTMLElement | null> }) {
  const camera = useThree((s) => s.camera);
  const look = useMemo(() => new Vector3(), []);
  const last = useRef<number | null>(null);
  useFrame(() => {
    if (!el.current) return;
    camera.getWorldDirection(look);
    // looking straight down there is no forward on the ground: use the camera's up instead
    if (look.x * look.x + look.z * look.z < 1e-4) look.copy(camera.up).applyQuaternion(camera.quaternion);
    const heading = Math.atan2(look.x, -look.z); // 0 facing north, +90° facing east
    const deg = Math.round(-MathUtils.radToDeg(heading));
    if (deg !== last.current) {
      last.current = deg;
      el.current.style.setProperty('--heading', `${deg}deg`);
    }
  });
  return null;
}

/** Seconds the camera takes to fly down onto an opened apartment. */
const ENTER_TIME = 0.8;

/**
 * An apartment opened from the floor: the camera dives straight down into its living room, where the
 * apartment page's 360° tour opens, ending just over the cut walls; then the page changes. The stage
 * dips to the page background meanwhile (FloorExperience, .is-entering), and the apartment page holds
 * that colour until the tour's first panorama is up (ApartmentExperience, .apt-cover).
 */
function EnterUnit({ unit, onDone }: { unit: Unit; onDone: () => void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; enabled: boolean } | null;
  const run = useRef<{ p0: Vector3; t0: Vector3; p1: Vector3; t1: Vector3; f0: number; k: number; done: boolean } | null>(null);
  useEffect(() => {
    const [X, Y] = unitCentre(layouts[unit.layout]);
    const t1 = new Vector3(sx(X), 0.4, sz(Y));
    // a little south of straight down, as the floor view looks, so the dive keeps its heading
    const p1 = t1.clone().add(new Vector3(0, 3.4, 1.1));
    run.current = { p0: camera.position.clone(), t0: controls ? controls.target.clone() : new Vector3(), p1, t1, f0: camera.fov, k: 0, done: false };
    if (controls) controls.enabled = false;
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [unit, camera, controls]);
  useFrame((_, dt) => {
    const r = run.current;
    if (!r || r.done) return;
    r.k = Math.min(1, r.k + Math.min(dt, 0.05) / ENTER_TIME);
    const e = r.k * r.k * (3 - 2 * r.k);
    const target = r.t0.clone().lerp(r.t1, e);
    camera.position.lerpVectors(r.p0, r.p1, e);
    camera.lookAt(target);
    if (controls) controls.target.copy(target);
    camera.fov = MathUtils.lerp(r.f0, 50, e);
    camera.updateProjectionMatrix();
    if (r.k >= 1) {
      r.done = true;
      onDone();
    }
  });
  return null;
}

/** Looks down steeply so the floor reads like the plan, and steps back on narrow (phone) screens
 *  so the whole floor plate fits across. */
function FitCamera({ hold }: { hold: boolean }) {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  const arrive = useRef<{ from: Vector3; to: Vector3; k: number } | null>(null);
  useEffect(() => {
    const k = fitScale(aspect);
    const to = new Vector3(...FLOOR_VIEW).multiplyScalar(k);
    // just zoomed in from the building (BuildingScene's ZoomIn): come down from the side the zoom came from
    let from: Vector3 | null = null;
    try {
      const a = JSON.parse(sessionStorage.getItem(ARRIVE_KEY) ?? 'null') as { x: number; z: number; at: number; inside?: boolean; lift?: boolean } | null;
      sessionStorage.removeItem(ARRIVE_KEY);
      // came in through the glass: start just inside that facade at eye height, then rise over the plan;
      // lifted out of the tower (LiftOut): the building view already ended at this very view
      if (a && !a.lift && Date.now() - a.at < 8000) from = a.inside ? new Vector3(a.x * 11, 1.7, a.z * 9) : new Vector3(a.x * 30 * k, 4, a.z * 30 * k);
    } catch {
      // no storage: plain view
    }
    if (from && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      arrive.current = { from, to, k: 0 };
      camera.position.copy(from);
    } else camera.position.copy(to);
    camera.lookAt(0, 0, 0);
  }, [camera, aspect]);
  useFrame((_, dt) => {
    const a = arrive.current;
    if (!a || hold) return;
    a.k = Math.min(1, a.k + dt / 1.6);
    const e = 1 - (1 - a.k) ** 3;
    // swing up over the floor on an arc rather than a straight line
    const p = new Vector3().lerpVectors(a.from, a.to, e);
    p.setLength(MathUtils.lerp(a.from.length(), a.to.length(), e));
    camera.position.copy(p);
    camera.lookAt(0, 0, 0);
    if (a.k >= 1) arrive.current = null;
  });
  return null;
}

function UnitOnFloor({ unit, hovered, onHover, onOpen }: { unit: Unit; hovered: boolean; onHover: Props['onHover']; onOpen: Props['onOpen'] }) {
  const layout = layouts[unit.layout];
  // the rendered interior where the plan has one (the furnished top view of the 360° tour)
  const photo = photoModels[layout.plan];

  return (
    <group
      position={unitPlacement(layout)}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(unit.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        onOpen(unit.id);
      }}
    >
      {photo ? (
        <PhotoApartment
          layout={layout}
          model={photo}
          tint={hovered ? '#2F6FDE' : undefined}
          clipX={PHOTO_CLIP[unit.plan]}
          lift={'ABCDEF'.indexOf(unit.plan) * 0.006}
        />
      ) : (
        <>
          {/* furnished like the apartment page, the floor painted in the apartment's own colour */}
          <ApartmentModel layout={layout} finish={defaultFinish} floorColor={flatColors[unit.plan]} />
          {/* tint room by room: the apartments interlock, so their bounding boxes overlap */}
          {hovered &&
            layout.rooms.map((r) => (
              <mesh key={r.id} position={[r.x + r.w / 2, 0.03, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[r.w, r.d]} />
                <meshBasicMaterial color="#2F6FDE" transparent opacity={0.4} depthWrite={false} />
              </mesh>
            ))}
        </>
      )}
    </group>
  );
}

/** The wall between C and D (PARTY_WALL): white sides and the dark cap the apartments' cut walls have. */
function PartyWall() {
  const [w, s, e, n] = PARTY_WALL;
  return (
    <mesh position={[sx((w + e) / 2), WALL_H / 2, sz((s + n) / 2)]}>
      <boxGeometry args={[e - w, WALL_H, n - s]} />
      <meshStandardMaterial attach="material-0" color="#F7F6F2" roughness={0.95} />
      <meshStandardMaterial attach="material-1" color="#F7F6F2" roughness={0.95} />
      <meshStandardMaterial attach="material-2" color="#14233B" roughness={0.9} />
      <meshStandardMaterial attach="material-3" color="#F7F6F2" roughness={0.95} />
      <meshStandardMaterial attach="material-4" color="#F7F6F2" roughness={0.95} />
      <meshStandardMaterial attach="material-5" color="#F7F6F2" roughness={0.95} />
    </mesh>
  );
}

/** The furnished plan pictures (PhotoApartment); asked for as soon as this module loads. */
const PLAN_PICTURES = Object.values(photoModels).flatMap((m) => (m ? [m.image.src] : []));
useLoader.preload(TextureLoader, PLAN_PICTURES);

/**
 * Waits for the plan pictures (the same cached textures PhotoApartment uses), compiles every
 * material's shaders, lets two frames draw, then reports ready, so the page can swap its 2D plan
 * for a finished 3D view instead of one that pops in and stutters.
 */
function WhenReady({ onReady }: { onReady?: () => void }) {
  useLoader(TextureLoader, PLAN_PICTURES);
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    (async () => {
      try {
        await gl.compileAsync(scene, camera);
      } catch {
        // older drivers: the frames below compile instead
      }
      let n = 0;
      const step = () => {
        if (cancelled) return;
        if (++n < 3) frame = requestAnimationFrame(step);
        else onReady?.();
      };
      frame = requestAnimationFrame(step);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

export default function FloorScene({ units, core, layer, hovered, onHover, onOpen, onReady, compass, entering, onEntered }: Props) {
  const enteringUnit = entering ? units.find((u) => u.id === entering) : undefined;
  // the camera's rise out of the facade waits until the view is ready, so it is seen, not missed
  const [ready, setReady] = useState(false);
  const whenReady = useCallback(() => {
    setReady(true);
    onReady?.();
  }, [onReady]);
  const anchors = useMemo<Anchor[]>(
    () => [
      ...units.map((u): Anchor => {
        const layout = layouts[u.layout];
        const [X, Y] = unitCentre(layout);
        return { id: `unit:${u.id}`, position: [sx(X), maxCeiling(layout) + 0.6, sz(Y)] };
      }),
      // the window points (FloorExperience): half a metre out from the facade, at window height, so a point stands
      // in front of its windows from whichever side the camera looks
      ...units.flatMap((u) =>
        windowPoints(layouts[u.layout]).map((p): Anchor => {
          const out = { N: [0, 0.5], S: [0, -0.5], E: [0.5, 0], W: [-0.5, 0] }[p.side];
          return { id: `win:${u.id}:${p.facing}`, position: [sx(p.X + out[0]), 1.4, sz(p.Y + out[1])] };
        }),
      ),
      // the homeowners' association room (block B, floor 4), where apartment 02 would be
      ...core
        .filter((c) => c.id === 'hoa')
        .map((c): Anchor => ({ id: 'core:hoa', position: [sx((c.x0 + c.x1) / 2), CORE_LOOK.hoa.h + 0.6, sz((c.y0 + c.y1) / 2)] })),
      // floor 4: the door out to the roof playground
      ...core.flatMap((c): Anchor[] => {
        if (!c.door) return [];
        const mid = (c.door.a + c.door.b) / 2;
        return [{ id: 'core:exit', position: c.door.side === 'W' ? [sx(PLATE.x0), 2.6, sz(mid)] : [sx(mid), 2.6, sz(PLATE.y1)] }];
      }),
    ],
    [units, core],
  );

  return (
    <SafeCanvas flat dpr={[1, 2]} camera={{ fov: FLOOR_FOV, near: 1, far: 400, position: [...FLOOR_VIEW] }}>
      <Lights />
      <FitCamera hold={!ready} />
      {compass && <CompassNeedle el={compass} />}
      <Suspense fallback={null}>
        <WhenReady onReady={whenReady} />
      </Suspense>
      <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} minDistance={18} maxDistance={80} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2.3} />
      <FloorModel units={units} core={core} hovered={hovered} onHover={onHover} onOpen={onOpen} />
      {enteringUnit && <EnterUnit unit={enteringUnit} onDone={() => onEntered?.()} />}
      <Projector anchors={anchors} layer={layer} />
    </SafeCanvas>
  );
}

/**
 * A floor as the floor page shows it: slab, core, the doors out to the roof playground, stair, lifts
 * and the apartments, centred on the plate (x east, z south). The building view lifts the same model
 * out of its tower when a floor is picked (BuildingScene's LiftOut).
 */
export function FloorModel({ units, core, hovered = null, onHover = () => {}, onOpen = () => {} }: Pick<Props, 'units' | 'core'> & Partial<Pick<Props, 'hovered' | 'onHover' | 'onOpen'>>) {
  // The stair: the flight on the east side goes up, the door opens east onto the lift lobby, the
  // flight down goes to the floor below (on floor 4 that is the podium's top storey). The lifts
  // open south onto the corridor.
  const floor = units[0]?.floor ?? FLOOR_MIN;
  const stairSpace = core.find((c) => c.id === 'stair');
  const liftSpace = core.find((c) => c.id === 'lifts');
  const stair = useMemo<StairSpec | null>(
    () =>
      stairSpace
        ? {
            r: sceneRect(stairSpace),
            storey: FLOOR_HEIGHT,
            below: floor === FLOOR_MIN ? PODIUM_TOP.z1 - PODIUM_TOP.z0 : FLOOR_HEIGHT,
            door: 'E',
          }
        : null,
    [stairSpace, floor],
  );
  const hole = useMemo(() => (stair ? stairOpening(stair) : null), [stair]);
  return (
    <>
      <Slab hole={hole} />
      {core.map((space, i) => (
        <CoreBlock key={`${space.id}${i}`} space={space} />
      ))}
      {core.map((space, i) => space.door && <ExitDoor key={`door${i}`} door={space.door} />)}
      {stair && <Stairs {...stair} wallH={WALL_H} cap />}
      {liftSpace && <Lifts r={sceneRect(liftSpace)} doors="S" wallH={WALL_H} cap color="#EDEBE6" />}
      {units.some((u) => u.plan === 'C') && units.some((u) => u.plan === 'D') && <PartyWall />}
      {units.map((unit) => (
        <UnitOnFloor key={unit.id} unit={unit} hovered={hovered === unit.id} onHover={onHover} onOpen={onOpen} />
      ))}
    </>
  );
}
