'use client';

import { Suspense, useMemo } from 'react';
import { useLoader, type ThreeEvent } from '@react-three/fiber';
import { BoxGeometry, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace, TextureLoader } from 'three';
import type { Layout } from '@/data/types';
import type { PhotoModel, PlateRect } from '@/data/photoModels';

// An apartment drawn from its rendered interior: the furnished top view of the 360° tour lies on the floor and the
// rendered scene's walls stand on it, cut at WALL_CUT so the whole picture shows from above.

const WALL_CUT = 1.25;

/** A plate rectangle in the apartment's own coordinates (x east, z south from its north-west corner). */
export function localRect(layout: Layout, r: PlateRect) {
  const [ox, oy] = layout.origin;
  return { x0: r[0] - ox, x1: r[2] - ox, z0: oy - r[3], z1: oy - r[1] };
}

/** The middle of a room of the picture, in the apartment's own coordinates. */
export function photoRoomCentre(layout: Layout, model: PhotoModel, id: string): [number, number] | null {
  const r = model.rooms[id];
  if (!r) return null;
  const { x0, x1, z0, z1 } = localRect(layout, r);
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}

function Picture({ layout, model }: { layout: Layout; model: PhotoModel }) {
  const texture = useLoader(TextureLoader, model.image.src);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const { x0, x1, z0, z1 } = localRect(layout, model.image.rect);
  return (
    <mesh position={[(x0 + x1) / 2, 0.004, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[x1 - x0, z1 - z0]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  );
}

export interface PhotoApartmentProps {
  layout: Layout;
  model: PhotoModel;
  selectedRoom?: string | null;
  onSelectRoom?: (id: string) => void;
  /** Tints these rooms (the floor overview's hover). */
  tint?: string;
}

export function PhotoApartment({ layout, model, selectedRoom, onSelectRoom, tint }: PhotoApartmentProps) {
  const mats = useMemo(() => {
    const wall = new MeshStandardMaterial({ color: '#F7F6F2', roughness: 0.95 });
    const cap = new MeshStandardMaterial({ color: '#14233B', roughness: 0.9 });
    return {
      cut: [wall, wall, cap, wall, wall, wall],
      whole: wall,
      glass: new MeshBasicMaterial({ color: '#A9CBEA', transparent: true, opacity: 0.3, side: DoubleSide, depthWrite: false }),
    };
  }, []);

  const walls = useMemo(
    () =>
      model.walls
        .filter((b) => b[4] < WALL_CUT)
        .map((b) => {
          const { x0, x1, z0, z1 } = localRect(layout, [b[0], b[1], b[2], b[3]]);
          const top = Math.min(b[5], WALL_CUT);
          return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: (b[4] + top) / 2, g: new BoxGeometry(x1 - x0, top - b[4], z1 - z0), cut: b[5] >= WALL_CUT };
        }),
    [layout, model],
  );
  const glass = useMemo(
    () =>
      model.glass
        .filter((b) => b[4] < WALL_CUT)
        .map((b) => {
          const { x0, x1, z0, z1 } = localRect(layout, [b[0], b[1], b[2], b[3]]);
          const top = Math.min(b[5], WALL_CUT);
          return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: (b[4] + top) / 2, w: x1 - x0, h: top - b[4], d: z1 - z0 };
        }),
    [layout, model],
  );
  const rooms = useMemo(() => Object.entries(model.rooms).map(([id, r]) => ({ id, ...localRect(layout, r) })), [layout, model]);

  const click = (id: string) =>
    onSelectRoom
      ? (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > 4) return; // a drag, not a click
          e.stopPropagation();
          onSelectRoom(id);
        }
      : undefined;

  return (
    <group>
      {/* the plain floor under the picture, so the model shows while the picture loads */}
      {rooms.map((r) => (
        <mesh key={`f-${r.id}`} position={[(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
          <meshStandardMaterial color="#E4D3BC" roughness={0.9} />
        </mesh>
      ))}
      <Suspense fallback={null}>
        <Picture layout={layout} model={model} />
      </Suspense>
      {walls.map((w, i) => (
        <mesh key={i} position={[w.x, w.y, w.z]} geometry={w.g} material={w.cut ? mats.cut : mats.whole} />
      ))}
      {glass.map((g, i) => (
        <mesh key={`g-${i}`} position={[g.x, g.y, g.z]} material={mats.glass}>
          <boxGeometry args={[g.w, g.h, g.d]} />
        </mesh>
      ))}
      {rooms.map((r) => {
        const on = selectedRoom === r.id || !!tint;
        return (
          <mesh
            key={`s-${r.id}`}
            position={[(r.x0 + r.x1) / 2, 0.02, (r.z0 + r.z1) / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            onClick={click(r.id)}
          >
            <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
            <meshBasicMaterial color={tint ?? '#2F6FDE'} transparent opacity={on ? (tint ? 0.35 : 0.22) : 0} depthWrite={false} />
          </mesh>
        );
      })}
    </group>
  );
}
