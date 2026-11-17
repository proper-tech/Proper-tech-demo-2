'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { ExtrudeGeometry, Shape } from 'three';
import { FLOOR_HEIGHT, FLOOR_MAX, FLOOR_MIN, PODIUM_HEIGHT, towers, type FloorSummary } from '@/data/building';
import site from '@/data/site.json';
import type { TowerId } from '@/data/types';
import { Projector, type Anchor, type LabelLayer } from './Projector';

// The complex: a detailed model (public/models/complex.glb: towers, podium with the roof
// playground, media screen, annex, parked cars) standing on the architect's site plan
// (site.json: paved site, kerbs, parking bays, trees). The model is generated from the same
// site.json by scripts/build-model.py, so the two always line up.
// Site-plan coordinates (u, v) map to the scene as x = u, z = -v. Heights are estimates.

export interface FloorKey {
  tower: TowerId;
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
}

const MODEL_URL = '/models/complex.glb';
const TOP = PODIUM_HEIGHT + (FLOOR_MAX - FLOOR_MIN + 1) * FLOOR_HEIGHT;
/** Glazed tower corners. Same value as CHAMFER in scripts/build-model.py. */
const CHAMFER = 2.4;

type Pt = number[];

function extrude(outline: Pt[], height: number) {
  const shape = new Shape();
  outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
  return new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
}

/** Extrudes a site-plan outline upwards. */
function Slab({ outline, y = 0, height, color }: { outline: Pt[]; y?: number; height: number; color: string }) {
  const geometry = useMemo(() => extrude(outline, height), [outline, height]);
  return (
    <mesh geometry={geometry} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function Model() {
  const { scene } = useGLTF(MODEL_URL);
  return <primitive object={scene} />;
}
useGLTF.preload(MODEL_URL);

/**
 * One see-through, clickable band per floor, wrapped around the tower in the model.
 * Floors with apartments for sale carry a faint amber tint; the hovered floor lights up.
 */
function FloorZones({ index, floors, hovered, onHover, onOpen }: { index: number; floors: FloorSummary[] } & Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const tower = towers[index];
  const geometry = useMemo(() => {
    const t = site.towers[index];
    const [u0, u1, v0, v1, c] = [t.u0 - 0.3, t.u1 + 0.3, t.v0 - 0.3, t.v1 + 0.3, CHAMFER];
    const outline = [
      [u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c],
      [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c],
    ];
    return extrude(outline, FLOOR_HEIGHT - 0.12);
  }, [index]);

  return (
    <>
      {floors.map((f) => {
        const forSale = f.available > 0;
        const isHovered = hovered?.tower === tower && hovered.floor === f.floor;
        const color = isHovered ? (forSale ? '#2F6FDE' : '#5B6672') : '#F2B632';
        const opacity = isHovered ? (forSale ? 0.62 : 0.4) : forSale ? 0.2 : 0;
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

/** A flat strip along one segment of a site-plan line (kerbs and parking bay lines). */
function Strip({ a, b, width, color }: { a: Pt; b: Pt; width: number; color: string }) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (length < 0.05) return null;
  return (
    <mesh position={[(a[0] + b[0]) / 2, 0.06, -(a[1] + b[1]) / 2]} rotation={[0, Math.atan2(b[1] - a[1], b[0] - a[0]), 0]}>
      <boxGeometry args={[length, 0.08, width]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

export default function BuildingScene({ floors, hovered, onHover, onOpen, autoRotate, layer }: Props) {
  const anchors = useMemo<Anchor[]>(
    () =>
      site.towers.map((t, i) => ({
        id: `tower:${towers[i]}`,
        position: [(t.u0 + t.u1) / 2, TOP + 10, -(t.v0 + t.v1) / 2],
      })),
    [],
  );

  return (
    <Canvas flat dpr={[1, 2]} camera={{ fov: 30, near: 1, far: 900, position: [-175, 95, 95] }}>
      <ambientLight intensity={1.25} />
      <hemisphereLight args={['#ffffff', '#c3ccd6', 0.7]} />
      <directionalLight position={[-60, 90, 40]} intensity={2.0} />
      <OrbitControls
        makeDefault
        target={[0, TOP / 2 - 6, 16]}
        enablePan={false}
        enableZoom={false}
        autoRotate={autoRotate}
        autoRotateSpeed={0.5}
        minPolarAngle={0.7}
        maxPolarAngle={1.5}
      />

      {/* Ground, the paved site, kerbs and parking bays */}
      <mesh position={[0, -0.3, 16]}>
        <cylinderGeometry args={[72, 72, 0.5, 72]} />
        <meshStandardMaterial color="#D3DAE1" />
      </mesh>
      <Slab outline={site.boundary} y={-0.05} height={0.08} color="#BEC7D0" />
      {site.kerbs.flatMap((line, i) => line.slice(1).map((p, j) => <Strip key={`k${i}-${j}`} a={line[j]} b={p} width={0.25} color="#EEF1F4" />))}
      {site.parking.map((line, i) => (
        <Strip key={`p${i}`} a={line[0]} b={line[line.length - 1]} width={0.18} color="#FFFFFF" />
      ))}

      <Suspense fallback={null}>
        <Model />
      </Suspense>

      {towers.map((tower, i) => (
        <FloorZones key={tower} index={i} floors={floors.filter((f) => f.tower === tower)} hovered={hovered} onHover={onHover} onOpen={onOpen} />
      ))}

      {site.trees.map(([u, v], i) => (
        <group key={i} position={[u, 0, -v]}>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.12, 0.15, 1.8, 6]} />
            <meshStandardMaterial color="#8C7B6A" />
          </mesh>
          <mesh position={[0, 2.6, 0]}>
            <icosahedronGeometry args={[1.3, 1]} />
            <meshStandardMaterial color="#7FA27A" flatShading />
          </mesh>
        </group>
      ))}

      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}
