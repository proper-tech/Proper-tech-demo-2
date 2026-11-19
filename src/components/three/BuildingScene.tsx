'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
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


function Model() {
  const { scene, animations } = useGLTF(MODEL_URL, DRACO_URL);
  usePeopleMotion(scene, animations);
  // The parked cars now come with the environment model, so the complex's own set is hidden.
  useMemo(() => {
    const cars = scene.getObjectByName('Cars');
    if (cars) cars.visible = false;
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
useGLTF.preload(ENV_URL, DRACO_URL);

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

/**
 * One see-through, clickable band per floor, wrapped around the tower in the model.
 * Invisible until pointed at; the hovered floor lights up (blue when it has apartments for sale).
 */
function FloorZones({ tower, floors, hovered, onHover, onOpen }: { tower: TowerId; floors: FloorSummary[] } & Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const geometry = useMemo(() => {
    const t = towerPlate(tower);
    const [u0, u1, v0, v1, c] = [t.u0 - 0.3, t.u1 + 0.3, t.v0 - 0.3, t.v1 + 0.3, CHAMFER];
    const outline = [
      [u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c],
      [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c],
    ];
    return extrude(outline, FLOOR_HEIGHT - 0.12);
  }, [tower]);

  return (
    <>
      {floors.map((f) => {
        const forSale = f.available > 0;
        const isHovered = hovered?.tower === tower && hovered.floor === f.floor;
        const color = isHovered ? (forSale ? '#2F6FDE' : '#5B6672') : '#F2B632';
        // No tint at rest, so the facade shows its real colours; the floor picker marks the floors for sale.
        const opacity = isHovered ? (forSale ? 0.62 : 0.4) : 0;
        return (
          <mesh
            key={f.floor}
            geometry={geometry}
            position={[0, PODIUM_HEIGHT + (f.floor - FLOOR_MIN) * FLOOR_HEIGHT + 0.06, 0]}
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
            <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
          </mesh>
        );
      })}
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
  const geometries = useMemo(
    () => aboveGround.map((f) => extrude(offsetPolygon(f.floor === 4 ? terraceOutline : podiumOutline, 0.6), f.z1 - f.z0 - 0.12)),
    [],
  );

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
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.5 : 0} depthWrite={false} />
          </mesh>
        );
      })}
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
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.5 : 0} depthWrite={false} />
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
  const geometries = useMemo(() => {
    const outline = offsetPolygon(blockDOutline.map(blockDToSite), 0.4);
    return above.map((f) => extrude(outline, f.z1 - f.z0 - 0.12));
  }, [above]);

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
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.5 : 0} depthWrite={false} />
          </mesh>
        );
      })}
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
const ZOOM_TIME = 1.15;

/**
 * Flies the camera from wherever it is towards the picked floor, keeping the direction it was
 * looking from, and closes in until the floor fills the view; then tells the page to open it.
 */
function ZoomIn({ to, onDone }: { to: FloorKey; onDone?: () => void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; enabled: boolean } | null;
  const start = useRef<{ p0: Vector3; t0: Vector3; p1: Vector3; t1: Vector3; f0: number; k: number; done: boolean } | null>(null);
  useEffect(() => {
    const t1 = floorPoint(to);
    const t0 = controls ? controls.target.clone() : t1.clone();
    // approach from the side the camera is on, a little above the floor
    const dir = camera.position.clone().sub(t1);
    dir.y = Math.max(dir.y, dir.length() * 0.18);
    const p1 = t1.clone().add(dir.normalize().multiplyScalar(16));
    start.current = { p0: camera.position.clone(), t0, p1, t1, f0: camera.fov, k: 0, done: false };
    if (controls) controls.enabled = false;
    return () => {
      if (controls) controls.enabled = true;
    };
  }, [to, camera, controls]);
  useFrame((_, dt) => {
    const z = start.current;
    if (!z || z.done) return;
    z.k = Math.min(1, z.k + dt / ZOOM_TIME);
    // ease in, then accelerate into the building
    const e = z.k < 0.5 ? 4 * z.k ** 3 : 1 - (-2 * z.k + 2) ** 3 / 2;
    camera.position.lerpVectors(z.p0, z.p1, e);
    const target = z.t0.clone().lerp(z.t1, Math.min(1, e * 1.4));
    if (controls) controls.target.copy(target);
    camera.lookAt(target);
    camera.fov = MathUtils.lerp(z.f0, z.f0 * 0.8, e);
    camera.updateProjectionMatrix();
    if (z.k >= 1) {
      z.done = true;
      onDone?.();
    }
  });
  return null;
}

export default function BuildingScene({ floors, hovered, onHover, onOpen, autoRotate, layer, tour, sun, onReady, onProgress, zoomTo, onZoomed }: Props) {
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

  return (
    <Canvas shadows dpr={[1, 2]} gl={{ toneMapping: NeutralToneMapping, toneMappingExposure: 1 }} camera={{ fov: 30, near: 1, far: 1200, position: [-175, 95, 95] }}>
      <Sun sun={sun} overview={tour.kind === 'overview'} />
      <CameraRig tour={tour} autoRotate={autoRotate} targetY={TOP / 2 - 6} />

      <Suspense fallback={null}>
        {/* real sky (Poly Haven HDRI) for reflections in glass, metal and car paint; the sky you
            see stays the Sun component's dome */}
        <Hdri files="/hdri/sky-1k.hdr" environmentIntensity={0.35} />
        <Environment />
        <Model />
        <WhenReady onReady={onReady} />
      </Suspense>
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
      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}
