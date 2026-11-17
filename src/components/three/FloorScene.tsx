'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ExtrudeGeometry, Shape } from 'three';
import { PLATE, type CoreSpace } from '@/data/building';
import { defaultFinish, mutedFinish } from '@/data/finishes';
import { layouts } from '@/data/layouts';
import type { Layout, Unit } from '@/data/types';
import { maxCeiling } from '@/lib/geometry';
import { ApartmentModel } from './ApartmentModel';
import { Lights } from './ApartmentScene';
import { Projector, type Anchor, type LabelLayer } from './Projector';

interface Props {
  units: Unit[];
  core: CoreSpace[];
  /** Element that holds the apartment tags (see Projector). */
  layer: LabelLayer;
  hovered: string | null;
  onHover: (id: string | null) => void;
  onOpen: (id: string) => void;
}

// Floor-plate coordinates (X east, Y north, see layouts.ts) -> scene: x east, z south,
// centred on the plate.
const CX = (PLATE.x0 + PLATE.x1) / 2;
const CY = (PLATE.y0 + PLATE.y1) / 2;
const sx = (X: number) => X - CX;
const sz = (Y: number) => CY - Y;

/** Where an apartment's own coordinates start on the plate (its north-west corner). */
export function unitPlacement(layout: Layout): [number, number, number] {
  return [sx(layout.origin[0]), 0, sz(layout.origin[1])];
}

/** The middle of the apartment's living room, where its tag goes. */
export function unitCentre(layout: Layout): [number, number] {
  const r = layout.rooms.find((room) => room.id === 'living') ?? layout.rooms[0];
  return [layout.origin[0] + r.x + r.w / 2, layout.origin[1] - r.z - r.d / 2];
}

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

function Slab() {
  const geometry = useMemo(() => {
    // Built in scene x / -z so it can be laid flat with a -90° turn about x.
    const shape = roundedRect(sx(PLATE.x0), -sz(PLATE.y0), sx(PLATE.x1), -sz(PLATE.y1), PLATE.corner);
    return new ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  }, []);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
      <meshStandardMaterial color="#C5CDD6" />
    </mesh>
  );
}

const CORE_LOOK: Record<CoreSpace['id'], { h: number; color: string }> = {
  corridor: { h: 0, color: '#DDE2E7' },
  stair: { h: 2.7, color: '#AEB8C3' },
  lifts: { h: 2.7, color: '#AEB8C3' },
  shafts: { h: 2.7, color: '#B9C2CC' },
  hoa: { h: 2.7, color: '#C9D0D8' },
  trash: { h: 2.7, color: '#B9C2CC' },
};

function CoreBlock({ space }: { space: CoreSpace }) {
  const look = CORE_LOOK[space.id];
  const w = space.x1 - space.x0;
  const d = space.y1 - space.y0;
  const x = sx((space.x0 + space.x1) / 2);
  const z = sz((space.y0 + space.y1) / 2);
  if (look.h === 0) {
    return (
      <mesh position={[x, 0.004, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={look.color} />
      </mesh>
    );
  }
  return (
    <mesh position={[x, look.h / 2, z]}>
      <boxGeometry args={[w - 0.1, look.h, d - 0.1]} />
      <meshStandardMaterial color={look.color} />
    </mesh>
  );
}

function UnitOnFloor({ unit, hovered, onHover, onOpen }: { unit: Unit; hovered: boolean; onHover: Props['onHover']; onOpen: Props['onOpen'] }) {
  const layout = layouts[unit.layout];
  const available = unit.status === 'available';

  return (
    <group
      position={unitPlacement(layout)}
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
      {hovered &&
        available &&
        layout.rooms.map((r) => (
          <mesh key={r.id} position={[r.x + r.w / 2, 0.03, r.z + r.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[r.w, r.d]} />
            <meshBasicMaterial color="#2F6FDE" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        ))}
    </group>
  );
}

export default function FloorScene({ units, core, layer, hovered, onHover, onOpen }: Props) {
  const anchors = useMemo<Anchor[]>(
    () =>
      units.map((u) => {
        const layout = layouts[u.layout];
        const [X, Y] = unitCentre(layout);
        return { id: `unit:${u.id}`, position: [sx(X), maxCeiling(layout) + 0.6, sz(Y)] };
      }),
    [units],
  );

  return (
    <Canvas flat dpr={[1, 2]} camera={{ fov: 38, near: 0.1, far: 400, position: [8, 30, 27] }}>
      <Lights />
      <OrbitControls makeDefault target={[0, 0, 0]} enablePan={false} minDistance={16} maxDistance={60} minPolarAngle={0.1} maxPolarAngle={Math.PI / 2.3} />

      <Slab />
      {core.map((space) => (
        <CoreBlock key={space.id} space={space} />
      ))}
      {units.map((unit) => (
        <UnitOnFloor key={unit.id} unit={unit} hovered={hovered === unit.id} onHover={onHover} onOpen={onOpen} />
      ))}
      <Projector anchors={anchors} layer={layer} />
    </Canvas>
  );
}
