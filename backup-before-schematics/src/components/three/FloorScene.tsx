'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { PLATE } from '@/data/building';
import { defaultFinish, mutedFinish } from '@/data/finishes';
import { layouts } from '@/data/layouts';
import type { Unit } from '@/data/types';
import { maxCeiling } from '@/lib/geometry';
import { ApartmentModel } from './ApartmentModel';
import { Lights } from './ApartmentScene';
import { Projector, type Anchor, type LabelLayer } from './Projector';

interface Props {
  units: Unit[];
  /** Element that holds the apartment tags (see Projector). */
  layer: LabelLayer;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
}

const HALF_CORRIDOR = PLATE.corridor / 2;

/** Where an apartment sits on the floor plate. South-side apartments are turned around
 *  so every entrance opens onto the corridor and every window faces outside. */
export function unitPlacement(unit: Unit) {
  const layout = layouts[unit.layout];
  return unit.side === 'N'
    ? { position: [unit.x0, 0, HALF_CORRIDOR] as [number, number, number], rotation: 0 }
    : { position: [unit.x0 + layout.w, 0, -HALF_CORRIDOR] as [number, number, number], rotation: Math.PI };
}

function UnitOnFloor({ unit, hovered, onHover, onOpen }: { unit: Unit; hovered: boolean; onHover: Props['onHover']; onOpen: Props['onOpen'] }) {
  const layout = layouts[unit.layout];
  const place = unitPlacement(unit);
  const available = unit.status === 'available';

  return (
    <group
      position={place.position}
      rotation={[0, place.rotation, 0]}
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
      <ApartmentModel layout={layout} finish={available ? defaultFinish : mutedFinish} muted={!available} />
      {hovered && available && (
        <mesh position={[layout.w / 2, 0.03, layout.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[layout.w, layout.d]} />
          <meshBasicMaterial color="#2F6FDE" transparent opacity={0.22} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export default function FloorScene({ units, layer, hovered, onHover, onOpen }: Props) {
  const anchors = useMemo<Anchor[]>(
    () =>
      units.map((u) => {
        const layout = layouts[u.layout];
        const z = (HALF_CORRIDOR + layout.d / 2) * (u.side === 'N' ? 1 : -1);
        return { id: `unit:${u.id}`, position: [u.x0 + layout.w / 2, maxCeiling(layout) + 0.6, z] };
      }),
    [units],
  );

  return (
    <Canvas flat dpr={[1, 2]} camera={{ fov: 38, near: 0.1, far: 400, position: [6, 27, -27] }}>
      <Lights />
      <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} minDistance={16} maxDistance={60} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2.3} />

      {/* Floor slab, corridor and the two lift and stair cores */}
      <mesh position={[0, -0.17, 0]}>
        <boxGeometry args={[PLATE.w + 0.5, 0.3, PLATE.d + 0.5]} />
        <meshStandardMaterial color="#C5CDD6" />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLATE.w, PLATE.corridor]} />
        <meshStandardMaterial color="#DDE2E7" />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (PLATE.w / 2 - 0.8), 1.45, 0]}>
          <boxGeometry args={[1.6, 2.9, PLATE.corridor - 0.1]} />
          <meshStandardMaterial color="#AEB8C3" />
        </mesh>
      ))}

      {units.map((unit) => (
        <UnitOnFloor key={unit.id} unit={unit} hovered={hovered === unit.id} onHover={onHover} onOpen={onOpen} />
      ))}
      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}
