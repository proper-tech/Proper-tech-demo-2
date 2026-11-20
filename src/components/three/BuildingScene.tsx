'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment as Hdri, useGLTF, useProgress } from '@react-three/drei';
import { NeutralToneMapping, ExtrudeGeometry, MathUtils, Shape, Vector3, type Mesh, type MeshStandardMaterial, type PerspectiveCamera } from 'three';
import { FLOOR_HEIGHT, FLOOR_MAX, FLOOR_MIN, PODIUM_HEIGHT, ROOF_LEVEL, floorLevel, towerPlate, towers, type FloorSummary } from '@/data/building';
import { blockDFloors, blockDOutline, blockDToSite, D_PARAPET } from '@/data/blockD';
import { podiumFloors, podiumOutline, terraceOutline } from '@/data/podium';
import { ROOF_FLOOR, TECH_HEIGHT, techBlock } from '@/data/roof';
import type { BlockId, TowerId } from '@/data/types';
import { bounds, offsetPolygon } from '@/lib/geometry';
import { Projector, type Anchor, type LabelLayer } from './Projector';
import { CameraRig, type Tour } from './Tour';
import { Sun, type SunSettings } from './Sun';
import { fixPeople, usePeopleMotion } from './people';
import { ARRIVE_KEY } from '@/lib/arrive';

// The complex: a detailed model (public/models/complex.glb: towers, podium with the roof
// playground, media screen, annex) standing in the environment model
// (public/models/blocks/environment.glb: ground, roads, parking, cars, trees, people). The model is generated from the same
// site.json by scripts/build-model.py, so the two always line up.
// Site-plan coordinates (u, v) map to the scene as x = u, z = -v. Heights come from the
// architect's sections (see building.ts). complex.glb is merged from one file per block
// (public/models/blocks, see scripts/merge-blocks.py).

export interface FloorKey {
  /** 'A' is the podium; B and C are the towers; D the service and parking building. */
  tower: BlockId;
  floor: number;
}

interface Props {
  floors: FloorSummary[];
  hovered: FloorKey | null;
  onHover: (key: FloorKey | null) => void;
  onOpen: (key: FloorKey) => void;
  autoRotate: boolean;
  /** Element that holds the tower name tags (see Projector). */
  layer: LabelLayer;
  /** The 360° tour: overview orbit or an eye-level viewpoint (see Tour.tsx). */
  tour: Tour;
  /** Sun position and brightness (see Sun.tsx). */
  sun: SunSettings;
  /** Called once the models are loaded, their shaders compiled and the first frames drawn. */
  onReady?: () => void;
  /** Loading progress of the models, 0-100. */
  onProgress?: (percent: number) => void;
  /** A floor that was just picked: the camera flies in to it, then onZoomed is called. */
  zoomTo?: FloorKey | null;
  onZoomed?: () => void;
}

const MODEL_URL = '/models/complex.glb';
/** Draco decoder for the compressed models, served from public/draco. */
const DRACO_URL = '/draco/';
const TOP = PODIUM_HEIGHT + (FLOOR_MAX - FLOOR_MIN + 1) * FLOOR_HEIGHT;
/** Glazed tower corners. Same value as CHAMFER in scripts/build-model.py. */
const CHAMFER = 2.4;

type Pt = number[];

function extrude(outline: Pt[], height: number) {
  const shape = new Shape();
  outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
  return new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
}


/** Glass of block A (podium) and D, matched to the towers' glass: deeper blue, glossy, so the sky reflects. */
const GLASS: Record<string, { color: string; roughness: number }> = {
  Glass: { color: '#0E2E5E', roughness: 0.12 },
  'Glass Shopfront': { color: '#16222F', roughness: 0.06 },
};

function Model() {
  const { scene, animations } = useGLTF(MODEL_URL, DRACO_URL);
  usePeopleMotion(scene, animations);
  // The parked cars now come with the environment model, so the complex's own set is hidden.
  useMemo(() => {
    const cars = scene.getObjectByName('Cars');
    if (cars) cars.visible = false;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const g = GLASS[m.name];
        if (g && 'color' in m) {
          (m as MeshStandardMaterial).color.set(g.color);
          (m as MeshStandardMaterial).roughness = g.roughness;
          (m as MeshStandardMaterial).metalness = 0;
        }
      }
    });
    fixPeople(scene);
    // skinned people on the roof must not be culled by their rest-pose bounds
    scene.traverse((o) => {
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false;
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(MODEL_URL, DRACO_URL);

/** Facade detail of the podium (scripts/podium-detail.py): framed windows, mullions and transoms, shopfront
 *  canopies. Kept apart from complex.glb so the podium model itself is not re-exported. */
const PODIUM_DETAIL_URL = '/models/blocks/A-detail.glb';

function PodiumDetail() {
  const { scene } = useGLTF(PODIUM_DETAIL_URL, DRACO_URL);
  useMemo(() => {
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(PODIUM_DETAIL_URL, DRACO_URL);

/** Everything around the buildings, modelled in Blender (environment.blend): ground, roads,
 *  parking with cars, trees, hedges, street lights, furniture and people. Same site-plan frame
 *  as complex.glb (x = u, y = up, z = -v), so it needs no offset. Draco-compressed; the decoder
 *  is served from public/draco. */
const ENV_URL = '/models/blocks/environment.glb';

/** Ground materials that are procedural (noise / tile nodes) in Blender reach glTF without a
 *  colour, so they are given their average colour here. */
const GROUND_COLORS: Record<string, string> = {
  'Env Asphalt': '#5A5E63',
  'Env Street Asphalt': '#4A4E53',
  'Env Pavers': '#D6D3CC',
  'Env Sidewalk': '#CFCDC8',
  'Env Concrete': '#D9D6D0',
  'Env Lawn': '#7FA35A',
};

function Environment() {
  const { scene, animations } = useGLTF(ENV_URL, DRACO_URL);
  usePeopleMotion(scene, animations);
  useMemo(() => {
    fixPeople(scene);
    scene.traverse((o) => {
      // skinned people must not be culled by their rest-pose bounds
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false;
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const color = GROUND_COLORS[m.name.replace(/\.\d{3}$/, '')];
        // textured ground (photo textures, environment.blend) keeps its own colours
        if (color && 'color' in m && !(m as MeshStandardMaterial).map) (m as MeshStandardMaterial).color.set(color);
      }
    });
  }, [scene]);
  return <primitive object={scene} />;
}
// not preloaded: the street loads after the buildings are on screen (see BuildingScene)

/** Reports download progress of the models to the page's loader. */
function Progress({ onProgress }: { onProgress?: (percent: number) => void }) {
  const { progress } = useProgress();
  useEffect(() => {
    onProgress?.(progress);
  }, [progress, onProgress]);
  return null;
}

/**
 * Mounted after the models (inside the same Suspense), so it runs once they are in the scene:
 * compiles every material's shaders up front, then lets a few frames render (the first
 * shadow-map passes) before telling the page the view is ready. Without this the first seconds
 * stutter while the GPU compiles on the fly.
 */
function WhenReady({ onReady }: { onReady?: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    (async () => {
      try {
        await gl.compileAsync(scene, camera);
      } catch {
        // older drivers: fall through and let the frames below compile
      }
      let n = 0;
      const step = () => {
        if (cancelled) return;
        if (++n < 6) frame = requestAnimationFrame(step);
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

/** Rings round a floor at its slab and ceiling lines: the hovered floor's crisp outline. */
function FloorFrame({ outline, y0, y1, color }: { outline: Pt[]; y0: number; y1: number; color: string }) {
  const ring = useMemo(() => extrude(offsetPolygon(outline as [number, number][], 0.06), 0.14), [outline]);
  return (
    <>
      {[y0, y1 - 0.14].map((y) => (
        <mesh key={y} geometry={ring} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** The tower's outline (chamfered corners), a little out from the facade. */
function towerOutline(tower: TowerId, out: number): Pt[] {
  const t = towerPlate(tower);
  const [u0, u1, v0, v1, c] = [t.u0 - out, t.u1 + out, t.v0 - out, t.v1 + out, CHAMFER];
  return [
    [u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c],
    [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c],
  ];
}

/**
 * One see-through, clickable band per floor, wrapped tight round the tower in the model from slab to slab.
 * Invisible until pointed at; the hovered floor gets a light tint and a crisp frame at its slab and ceiling
 * lines (blue when it has apartments for sale).
 */
function FloorZones({ tower, floors, hovered, onHover, onOpen }: { tower: TowerId; floors: FloorSummary[] } & Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const outline = useMemo(() => towerOutline(tower, 0.18), [tower]);
  const geometry = useMemo(() => extrude(outline, FLOOR_HEIGHT - 0.04), [outline]);
  const current = hovered?.tower === tower ? floors.find((f) => f.floor === hovered.floor) : undefined;

  return (
    <>
      {floors.map((f) => {
        const forSale = f.available > 0;
        const isHovered = current?.floor === f.floor;
        return (
          <mesh
            key={f.floor}
            geometry={geometry}
            position={[0, floorLevel(f.floor) + 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower, floor: f.floor });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4 || !forSale) return;
              e.stopPropagation();
              onOpen({ tower, floor: f.floor });
            }}
          >
            {/* no tint at rest, so the facade shows its real colours */}
            <meshBasicMaterial color={forSale ? '#2F6FDE' : '#5B6672'} transparent opacity={isHovered ? (forSale ? 0.34 : 0.26) : 0} depthWrite={false} />
          </mesh>
        );
      })}
      {current && (
        <FloorFrame outline={outline} y0={floorLevel(current.floor)} y1={floorLevel(current.floor) + FLOOR_HEIGHT} color={current.available > 0 ? '#5B95FF' : '#8D98A5'} />
      )}
    </>
  );
}

/** The podium floors you can see: the basement (floor 0) is underground, reached from the lift panel. */
const aboveGround = podiumFloors.filter((f) => f.floor > 0);

/**
 * The podium (block A): one clickable band per floor, floors 1-3 around the whole podium and
 * floor 4 around the roof playground. Invisible until pointed at, as the podium is not for sale.
 */
function PodiumZones({ hovered, onHover, onOpen }: Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  // 0.6 m out from the walls, clear of the facade's mullions, slab edges and parapet
  const outlines = useMemo(() => aboveGround.map((f) => offsetPolygon(f.floor === 4 ? terraceOutline : podiumOutline, 0.6)), []);
  const geometries = useMemo(() => aboveGround.map((f, i) => extrude(outlines[i], f.z1 - f.z0 - 0.12)), [outlines]);

  return (
    <>
      {aboveGround.map((f, i) => {
        const isHovered = hovered?.tower === 'A' && hovered.floor === f.floor;
        return (
          <mesh
            key={f.floor}
            geometry={geometries[i]}
            position={[0, f.z0 + 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower: 'A', floor: f.floor });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onOpen({ tower: 'A', floor: f.floor });
            }}
          >
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.3 : 0} depthWrite={false} />
          </mesh>
        );
      })}
      {aboveGround.map((f, i) =>
        hovered?.tower === 'A' && hovered.floor === f.floor ? (
          <FloorFrame key={`frame-${f.floor}`} outline={outlines[i]} y0={f.z0} y1={f.z1} color="#5B95FF" />
        ) : null,
      )}
    </>
  );
}

/** The technical floor on each tower roof (floor 17): a band round its block, invisible until
 *  pointed at, like the podium's. */
function RoofZones({ hovered, onHover, onOpen }: Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const geometries = useMemo(
    () =>
      towers.map((tower) => {
        const b = bounds(techBlock(tower));
        const [u0, u1, v0, v1] = [b.u0 - 0.3, b.u1 + 0.3, b.v0 - 0.3, b.v1 + 0.3];
        return extrude([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], TECH_HEIGHT - 0.12);
      }),
    [],
  );

  return (
    <>
      {towers.map((tower, i) => {
        const isHovered = hovered?.tower === tower && hovered.floor === ROOF_FLOOR;
        return (
          <mesh
            key={tower}
            geometry={geometries[i]}
            position={[0, TOP + 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower, floor: ROOF_FLOOR });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onOpen({ tower, floor: ROOF_FLOOR });
            }}
          >
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.3 : 0} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

/** Block D: a band per floor above ground (1-3) round the building and its stair core, invisible
 *  until pointed at. Its basement is only on the lift panel. */
const D_ABOVE = blockDFloors.filter((f) => f.z0 >= 0);

function BlockDZones({ hovered, onHover, onOpen }: Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const above = D_ABOVE;
  const outline = useMemo(() => offsetPolygon(blockDOutline.map(blockDToSite), 0.4), []);
  const geometries = useMemo(() => above.map((f) => extrude(outline, f.z1 - f.z0 - 0.12)), [above, outline]);

  return (
    <>
      {above.map((f, i) => {
        const isHovered = hovered?.tower === 'D' && hovered.floor === f.floor;
        return (
          <mesh
            key={f.floor}
            geometry={geometries[i]}
            position={[0, f.z0 + 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower: 'D', floor: f.floor });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onOpen({ tower: 'D', floor: f.floor });
            }}
          >
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.3 : 0} depthWrite={false} />
          </mesh>
        );
      })}
      {above.map((f) =>
        hovered?.tower === 'D' && hovered.floor === f.floor ? (
          <FloorFrame key={`frame-${f.floor}`} outline={outline} y0={f.z0} y1={f.z1} color="#5B95FF" />
        ) : null,
      )}
    </>
  );
}

/** Middle of a floor in scene coordinates (x = u, y = height, z = -v). */
function floorPoint({ tower, floor }: FloorKey): Vector3 {
  if (tower === 'B' || tower === 'C') {
    const t = towerPlate(tower);
    const y = floor >= ROOF_FLOOR ? ROOF_LEVEL + TECH_HEIGHT / 2 : floorLevel(floor) + FLOOR_HEIGHT / 2;
    return new Vector3((t.u0 + t.u1) / 2, y, -(t.v0 + t.v1) / 2);
  }
  if (tower === 'D') {
    const b = bounds(blockDOutline.map(blockDToSite));
    const f = blockDFloors.find((x) => x.floor === floor);
    return new Vector3((b.u0 + b.u1) / 2, f ? Math.max(1, (f.z0 + f.z1) / 2) : 2, -(b.v0 + b.v1) / 2);
  }
  const b = bounds(podiumOutline);
  const f = podiumFloors.find((x) => x.floor === floor);
  return new Vector3((b.u0 + b.u1) / 2, f ? Math.max(1, (f.z0 + f.z1) / 2) : 1, -(b.v0 + b.v1) / 2);
}

/** Zoom duration (seconds) when a floor is picked. */
const ZOOM_TIME = 1.7;

const smooth = (k: number) => k * k * (3 - 2 * k);

/**
 * Flies the camera to the picked floor in two moves: first round and down until it is level with the floor,
 * square on to the side it was looking from, with the whole floor across the view; then straight in through
 * the facade at the floor's height. The page fades over the second move and opens the floor, whose own view
 * starts from the same side (ARRIVE_KEY).
 */
function ZoomIn({ to, onDone }: { to: FloorKey; onDone?: () => void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; enabled: boolean } | null;
  const path = useRef<{ p0: Vector3; t0: Vector3; p1: Vector3; p2: Vector3; t1: Vector3; f0: number; k: number; done: boolean; dir: Vector3 } | null>(null);
  useEffect(() => {
    const t1 = floorPoint(to);
    const t0 = controls ? controls.target.clone() : t1.clone();
    // the side the camera is on, flattened: we end up facing the floor square on
    const dir = camera.position.clone().sub(t1).setY(0);
    if (dir.lengthSq() < 1) dir.set(-1, 0, 1);
    dir.normalize();
    // far enough that the whole floor plate (about 26 m) spans two thirds of the view
    const half = MathUtils.degToRad(camera.fov / 2);
    const d1 = 13 / Math.tan(half) / 0.66;
    const p1 = t1.clone().add(dir.clone().multiplyScalar(d1)).add(new Vector3(0, 1.2, 0));
    // into the floor: just inside the facade, at eye height over the slab
    const p2 = t1.clone().add(dir.clone().multiplyScalar(4)).add(new Vector3(0, 0.3, 0));
    path.current = { p0: camera.position.clone(), t0, p1, p2, t1, f0: camera.fov, k: 0, done: false, dir };
    if (controls) controls.enabled = false;
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [to, camera, controls]);
  useFrame((_, dt) => {
    const z = path.current;
    if (!z || z.done) return;
    z.k = Math.min(1, z.k + dt / ZOOM_TIME);
    const a = smooth(Math.min(1, z.k / 0.62)); // round and level with the floor
    const b = z.k <= 0.62 ? 0 : smooth((z.k - 0.62) / 0.38); // straight in
    const pos = new Vector3().lerpVectors(z.p0, z.p1, a).lerp(z.p2, b * b);
    camera.position.copy(pos);
    const target = z.t0.clone().lerp(z.t1, Math.min(1, a * 1.15));
    if (controls) controls.target.copy(target);
    camera.lookAt(target);
    camera.fov = MathUtils.lerp(z.f0, 30, a) + 12 * b * b;
    camera.updateProjectionMatrix();
    if (z.k >= 1) {
      z.done = true;
      try {
        sessionStorage.setItem(ARRIVE_KEY, JSON.stringify({ x: z.dir.x, z: z.dir.z, at: Date.now() }));
      } catch {
        // storage blocked: the floor page just opens at its usual view
      }
      onDone?.();
    }
  });
  return null;
}

export default function BuildingScene({ floors, hovered, onHover, onOpen, autoRotate, layer, tour, sun, onReady, onProgress, zoomTo, onZoomed }: Props) {
  const hoverAnchor = useMemo<Anchor[]>(() => {
    if (!hovered || hovered.floor === 0) return [];
    const p = floorPoint(hovered);
    // just above the band, so the tag never hides the floor it names
    return [{ id: 'hover', position: [p.x, p.y + FLOOR_HEIGHT * 1.4, p.z] }];
  }, [hovered]);
  const anchors = useMemo<Anchor[]>(() => {
    // Block A, the podium: tag floats over the roof playground between the towers
    const a = bounds(terraceOutline);
    // Block D: tag sits just above its parapet
    const [du, dv] = blockDToSite([9, 15]);
    return [
      ...towers.map((id): Anchor => {
        const t = towerPlate(id);
        return { id: `tower:${id}`, position: [(t.u0 + t.u1) / 2, TOP + 10, -(t.v0 + t.v1) / 2] };
      }),
      { id: 'tower:A', position: [(a.u0 + a.u1) / 2, PODIUM_HEIGHT + 9, -(a.v0 + a.v1) / 2] },
      { id: 'tower:D', position: [du, D_PARAPET + 6, -dv] },
    ];
  }, []);

  const [buildingsIn, setBuildingsIn] = useState(false);
  const ready = useCallback(() => {
    setBuildingsIn(true);
    onReady?.();
  }, [onReady]);

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ toneMapping: NeutralToneMapping, toneMappingExposure: 1 }} camera={{ fov: 30, near: 1, far: 1200, position: [-175, 95, 95] }}>
      <Sun sun={sun} overview={tour.kind === 'overview'} />
      <CameraRig tour={tour} autoRotate={autoRotate} targetY={TOP / 2 - 6} />

      {/* The buildings come first, so the view appears as soon as they are in; the street and the
          sky reflections (about 7 MB more) load right after, without holding it up. */}
      <Suspense fallback={null}>
        <Model />
        <PodiumDetail />
        <WhenReady onReady={ready} />
      </Suspense>
      {buildingsIn && (
        <Suspense fallback={null}>
          {/* real sky (Poly Haven HDRI) for reflections in glass, metal and car paint; the sky you
              see stays the Sun component's dome */}
          <Hdri files="/hdri/sky-1k.hdr" environmentIntensity={0.35} />
          <Environment />
        </Suspense>
      )}
      <Progress onProgress={onProgress} />

      {tour.kind === 'overview' && towers.map((tower) => (
        <FloorZones key={tower} tower={tower} floors={floors.filter((f) => f.tower === tower)} hovered={hovered} onHover={onHover} onOpen={onOpen} />
      ))}
      {tour.kind === 'overview' && (
        <>
          <PodiumZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
          <RoofZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
          <BlockDZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
        </>
      )}

      {zoomTo && <ZoomIn to={zoomTo} onDone={onZoomed} />}
      <Projector anchors={zoomTo ? anchors : [...anchors, ...hoverAnchor]} layer={layer} />
    </Canvas>
  );
}
