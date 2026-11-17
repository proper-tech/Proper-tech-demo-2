'use client';

import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { FLOOR_HEIGHT, FLOOR_MIN, PLATE, PODIUM_FLOORS, coreOf, type Rect } from '@/data/building';
import { getPodiumFloor } from '@/data/podium';
import { defaultFinish, mutedFinish } from '@/data/finishes';
import { flatColors, layouts } from '@/data/layouts';
import type { TowerId, Unit } from '@/data/types';
import { maxCeiling } from '@/lib/geometry';
import { ApartmentModel } from './ApartmentModel';
import { Box, Lifts, Stairs, stairOpening, type StairSpec } from './Cores';
import { Lights } from './ApartmentScene';
import { Projector, type Anchor, type LabelLayer } from './Projector';

interface Props {
  tower: TowerId;
  units: Unit[];
  /** Element that holds the apartment tags (see Projector). */
  layer: LabelLayer;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
}

// Plate metres (see PLATE) map to the scene as x = x, z = z, moved so the plate is centred.
const CX = (PLATE.x0 + PLATE.x1) / 2;
const CZ = (PLATE.z0 + PLATE.z1) / 2;

/** Plate rectangle -> scene. */
const scene = (r: Rect): Rect => ({ ...r, x: r.x - CX, z: r.z - CZ });
const WALL_H = 2.7;
/** The podium's top storey, under the tower's first apartment floor (sections). */
const PODIUM_TOP = getPodiumFloor(PODIUM_FLOORS)!;

/** The floor slab around the stair's opening, in scene metres. */
function slab(hole: Rect | null): Rect[] {
  const s = scene({ x: PLATE.x0 - 0.2, z: PLATE.z0 - 0.2, w: PLATE.x1 - PLATE.x0 + 0.4, d: PLATE.z1 - PLATE.z0 + 0.4 });
  if (!hole) return [s];
  return [
    { x: s.x, z: s.z, w: hole.x - s.x, d: s.d },
    { x: hole.x + hole.w, z: s.z, w: s.x + s.w - hole.x - hole.w, d: s.d },
    { x: hole.x, z: s.z, w: hole.w, d: hole.z - s.z },
    { x: hole.x, z: hole.z + hole.d, w: hole.w, d: s.z + s.d - hole.z - hole.d },
  ];
}

/** Looks down steeply so the floor reads like the plan, and steps back on narrow (phone) screens
 *  so the whole floor plate fits across. */
function FitCamera() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / s.size.height);
  useEffect(() => {
    const k = Math.max(1, 1.05 / aspect);
    camera.position.set(4 * k, 40 * k, 22 * k);
  }, [camera, aspect]);
  return null;
}

function UnitOnFloor({ unit, hovered, onHover, onOpen }: { unit: Unit; hovered: boolean; onHover: Props['onHover']; onOpen: Props['onOpen'] }) {
  const layout = layouts[unit.layout];
  const available = unit.status === 'available';

  return (
    <group
      position={[layout.at[0] - CX, 0, layout.at[1] - CZ]}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(unit.id);
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        if (e.delta > 4 || !available) return;
        e.stopPropagation();
        onOpen(unit.id);
      }}
    >
      {/* furnished like the apartment page, the floor painted in the apartment's own colour */}
      <ApartmentModel
        layout={layout}
        finish={available ? defaultFinish : mutedFinish}
        muted={!available}
        floorColor={available ? flatColors[layout.id] : undefined}
      />
      {/* tint room by room: the apartments interlock, so their bounding boxes overlap */}
      {hovered &&
        available &&
        layout.rooms.map((r) => (
          <mesh key={r.id} position={[r.x + r.w / 2, 0.03, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[r.w, r.d]} />
            <meshBasicMaterial color="#2F6FDE" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
    </group>
  );
}

export default function FloorScene({ tower, units, layer, hovered, onHover, onOpen }: Props) {
  const core = coreOf(tower);
  const mirrored = tower === 'B'; // coreOf mirrors B's core; the stair and lift doors follow
  const floor = units[0].floor;
  // stair 602: the east flight goes up (it carries the cut line on the drawing), the door opens
  // onto corridor 601; the lifts open east onto their lobby. All mirrored on tower B.
  const stair: StairSpec = {
    r: scene(core.stairs),
    storey: FLOOR_HEIGHT,
    below: floor === FLOOR_MIN ? PODIUM_TOP.z1 - PODIUM_TOP.z0 : FLOOR_HEIGHT,
    door: mirrored ? 'W' : 'E',
    flip: mirrored,
  };
  const anchors = useMemo<Anchor[]>(
    () =>
      units.map((u) => {
        const layout = layouts[u.layout];
        const living = layout.rooms.find((r) => r.type === 'living')!;
        return {
          id: `unit:${u.id}`,
          position: [layout.at[0] + living.x + living.w / 2 - CX, maxCeiling(layout) + 0.6, layout.at[1] + living.z + living.d / 2 - CZ],
        };
      }),
    [units],
  );

  return (
    <Canvas flat dpr={[1, 2]} camera={{ fov: 38, near: 0.1, far: 400, position: [4, 40, 22] }}>
      <Lights />
      <FitCamera />
      <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} minDistance={18} maxDistance={80} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2.3} />

      {/* Floor slab (with the stair opening), then the lift and stair core */}
      {slab(stairOpening(stair)).map((r, i) => (
        <Box key={i} r={r} y={-0.32} h={0.3} color="#C5CDD6" />
      ))}
      {core.corridor.map((r, i) => (
        <Box key={i} r={scene(r)} h={0.02} color="#DDE2E7" />
      ))}
      <Stairs {...stair} wallH={WALL_H} cap />
      <Lifts r={scene(core.lifts)} doors={mirrored ? 'W' : 'E'} wallH={WALL_H} cap />

      {units.map((unit) => (
        <UnitOnFloor key={unit.id} unit={unit} hovered={hovered === unit.id} onHover={onHover} onOpen={onOpen} />
      ))}
      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}
