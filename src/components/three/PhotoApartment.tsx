'use client';

import { Suspense, useMemo } from 'react';
import { useLoader, type ThreeEvent } from '@react-three/fiber';
import { BoxGeometry, DoubleSide, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader } from 'three';
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

/** Plate rectangle cut to [x0, x1] in plate x; null when nothing is left. */
function clipRect(r: PlateRect, clip?: [number, number]): PlateRect | null {
  if (!clip) return r;
  const w = Math.max(r[0], clip[0]);
  const e = Math.min(r[2], clip[1]);
  return e - w > 0.01 ? [w, r[1], e, r[3]] : null;
}

function Picture({ layout, model, clip, y }: { layout: Layout; model: PhotoModel; clip?: [number, number]; y: number }) {
  const texture = useLoader(TextureLoader, model.image.src);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  const full = model.image.rect;
  const cut = clipRect(full, clip);
  const geometry = useMemo(() => {
    if (!cut) return null;
    const { x0, x1, z0, z1 } = localRect(layout, cut);
    const g = new PlaneGeometry(x1 - x0, z1 - z0);
    // the part of the picture that is left: u along plate x
    const u0 = (cut[0] - full[0]) / (full[2] - full[0]);
    const u1 = (cut[2] - full[0]) / (full[2] - full[0]);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    g.translate((x0 + x1) / 2, -(z0 + z1) / 2, 0);
    return g;
  }, [layout, cut?.[0], cut?.[2], full]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!geometry) return null;
  // cut-out instead of blending: the transparent margins of neighbouring pictures then never hide each other
  return (
    <mesh geometry={geometry} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshBasicMaterial map={texture} alphaTest={0.5} toneMapped={false} />
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
  /** Keeps only this band of plate x (the floor overview: C and D meet on the mirror line). */
  clipX?: [number, number];
  /** Raises the picture a few millimetres, so apartments that touch on the floor never fight over a pixel. */
  lift?: number;
}

export function PhotoApartment({ layout, model, selectedRoom, onSelectRoom, tint, clipX, lift = 0 }: PhotoApartmentProps) {
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
        .filter((b) => b[4] < WALL_CUT && clipRect([b[0], b[1], b[2], b[3]], clipX))
        .map((b) => {
          const { x0, x1, z0, z1 } = localRect(layout, clipRect([b[0], b[1], b[2], b[3]], clipX)!);
          const top = Math.min(b[5], WALL_CUT);
          return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: (b[4] + top) / 2, g: new BoxGeometry(x1 - x0, top - b[4], z1 - z0), cut: b[5] >= WALL_CUT };
        }),
    [layout, model, clipX],
  );
  const glass = useMemo(
    () =>
      model.glass
        .filter((b) => b[4] < WALL_CUT && clipRect([b[0], b[1], b[2], b[3]], clipX))
        .map((b) => {
          const { x0, x1, z0, z1 } = localRect(layout, clipRect([b[0], b[1], b[2], b[3]], clipX)!);
          const top = Math.min(b[5], WALL_CUT);
          return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: (b[4] + top) / 2, w: x1 - x0, h: top - b[4], d: z1 - z0 };
        }),
    [layout, model, clipX],
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
        <mesh key={`f-${r.id}`} position={[(r.x0 + r.x1) / 2, 0.006 + lift, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
          <meshStandardMaterial color="#E4D3BC" roughness={0.9} />
        </mesh>
      ))}
      <Suspense fallback={null}>
        <Picture layout={layout} model={model} clip={clipX} y={0.014 + lift} />
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
            position={[(r.x0 + r.x1) / 2, 0.03 + lift, (r.z0 + r.z1) / 2]}
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
