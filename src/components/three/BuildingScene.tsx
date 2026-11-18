'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { ExtrudeGeometry, Shape, type Mesh, type MeshStandardMaterial } from 'three';
import { FLOOR_HEIGHT, FLOOR_MAX, FLOOR_MIN, PODIUM_HEIGHT, towerPlate, towers, type FloorSummary } from '@/data/building';
import { podiumFloors, podiumOutline, terraceOutline } from '@/data/podium';
import { ROOF_FLOOR, TECH_HEIGHT, techBlock } from '@/data/roof';
import type { BlockId, TowerId } from '@/data/types';
import { bounds, offsetPolygon } from '@/lib/geometry';
import { Projector, type Anchor, type LabelLayer } from './Projector';
import { CameraRig, type Tour } from './Tour';

// The complex: a detailed model (public/models/complex.glb: towers, podium with the roof
// playground, media screen, annex) standing in the environment model
// (public/models/blocks/environment.glb: ground, roads, parking, cars, trees, people). The model is generated from the same
// site.json by scripts/build-model.py, so the two always line up.
// Site-plan coordinates (u, v) map to the scene as x = u, z = -v. Heights come from the
// architect's sections (see building.ts). complex.glb is merged from one file per block
// (public/models/blocks, see scripts/merge-blocks.py).

export interface FloorKey {
  /** 'A' is the podium; B and C are the towers. */
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
  /** The 360° tour: overview orbit, drone flight or an eye-level viewpoint (see Tour.tsx). */
  tour: Tour;
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
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  // The parked cars now come with the environment model, so the complex's own set is hidden.
  useMemo(() => {
    const cars = scene.getObjectByName('Cars');
    if (cars) cars.visible = false;
    // skinned people on the roof must not be culled by their rest-pose bounds
    scene.traverse((o) => {
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false;
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
  const { scene } = useGLTF(ENV_URL, DRACO_URL);
  useMemo(() => {
    scene.traverse((o) => {
      // skinned people must not be culled by their rest-pose bounds
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false;
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const color = GROUND_COLORS[m.name.replace(/\.\d{3}$/, '')];
        if (color && 'color' in m) (m as MeshStandardMaterial).color.set(color);
      }
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(ENV_URL, DRACO_URL);

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

/**
 * The podium (block A): one clickable band per floor, floors 1-3 around the whole podium and
 * floor 4 around the roof playground. Invisible until pointed at, as the podium is not for sale.
 */
function PodiumZones({ hovered, onHover, onOpen }: Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  // 0.6 m out from the walls, clear of the facade's mullions, slab edges and parapet
  const geometries = useMemo(
    () => podiumFloors.map((f) => extrude(offsetPolygon(f.floor === 4 ? terraceOutline : podiumOutline, 0.6), f.z1 - f.z0 - 0.12)),
    [],
  );

  return (
    <>
      {podiumFloors.map((f, i) => {
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


export default function BuildingScene({ floors, hovered, onHover, onOpen, autoRotate, layer, tour }: Props) {
  const anchors = useMemo<Anchor[]>(
    () =>
      towers.map((id) => {
        const t = towerPlate(id);
        return { id: `tower:${id}`, position: [(t.u0 + t.u1) / 2, TOP + 10, -(t.v0 + t.v1) / 2] };
      }),
    [],
  );

  return (
    <Canvas flat dpr={[1, 2]} camera={{ fov: 30, near: 1, far: 1200, position: [-175, 95, 95] }}>
      <ambientLight intensity={1.25} />
      <hemisphereLight args={['#ffffff', '#c3ccd6', 0.7]} />
      <directionalLight position={[-60, 90, 40]} intensity={2.0} />
      <CameraRig tour={tour} autoRotate={autoRotate} targetY={TOP / 2 - 6} />

      <Suspense fallback={null}>
        <Environment />
        <Model />
      </Suspense>

      {tour.kind === 'overview' && towers.map((tower) => (
        <FloorZones key={tower} tower={tower} floors={floors.filter((f) => f.tower === tower)} hovered={hovered} onHover={onHover} onOpen={onOpen} />
      ))}
      {tour.kind === 'overview' && (
        <>
          <PodiumZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
          <RoofZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
        </>
      )}

      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}
