'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import type { Finish, Layout } from '@/data/types';
import { ApartmentModel } from './ApartmentModel';
import { SafeCanvas } from './SafeCanvas';
import { photoModels } from '@/data/photoModels';
import { photoRoomCentre } from './PhotoApartment';
import { Projector, type Anchor, type LabelLayer } from './Projector';

export interface RoomLabel {
  name: string;
  area: string;
}

interface Props {
  layout: Layout;
  finish: Finish;
  roomId: string;
  /** Element that holds the room tags (see Projector). */
  layer: LabelLayer;
  /** A room was picked in the 3D model. */
  onSelectRoom: (id: string) => void;
}

export function Lights() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <hemisphereLight args={['#ffffff', '#c9d2dc', 0.9]} />
      <directionalLight position={[6, 14, -8]} intensity={1.1} />
      <directionalLight position={[-8, 9, 10]} intensity={0.5} />
    </>
  );
}

/** Outside view: orbit around the open model. */
function OrbitRig({ layout }: { layout: Layout }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const cx = layout.w / 2;
  const cz = layout.d / 2;
  // Step back on narrow (phone) screens so the whole apartment stays in view.
  const narrow = useThree((s) => s.size.width / s.size.height < 0.9);
  const dist = Math.max(layout.w, layout.d * 1.4) * (narrow ? 1.4 : 1);

  // from the south, so the model reads the same way as the north-up 2D plan
  useEffect(() => {
    camera.position.set(cx + dist * 0.25, dist * 1.3, cz + dist * 1.25);
    camera.fov = 40;
    camera.updateProjectionMatrix();
  }, [camera, cx, cz, dist]);

  return (
    <OrbitControls
      makeDefault
      target={[cx, 0.6, cz]}
      enablePan={false}
      minDistance={6}
      maxDistance={dist * 3}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2.2}
    />
  );
}

/** The apartment's 3D model, seen from outside: orbit round it and pick a room. (The 360° tour is the rendered
 *  one in public/tour, shown by ApartmentExperience.) */
export default function ApartmentScene({ layout, finish, roomId, layer, onSelectRoom }: Props) {
  // the ground under the drawn model (the rendered interior's picture needs none)
  const base = photoModels[layout.plan] ? null : { x: layout.w / 2, z: layout.d / 2, w: layout.w + 0.5, d: layout.d + 0.5 };
  const anchors = useMemo<Anchor[]>(
    () =>
      layout.rooms
        .filter((r) => !r.partOf)
        .map((r) => {
          // over the room of the rendered interior where there is one
          const c = (photoModels[layout.plan] && photoRoomCentre(layout, photoModels[layout.plan]!, r.id)) ?? [r.x + r.w / 2, r.z + r.d / 2];
          return { id: `room:${r.id}`, position: [c[0], 1.2, c[1]] as [number, number, number] };
        }),
    [layout],
  );

  return (
    <SafeCanvas flat dpr={[1, 2]} camera={{ fov: 40, near: 0.05, far: 300, position: [layout.w / 2, 14, layout.d + 12] }}>
      <color attach="background" args={['#E9EDF0']} />
      <Lights />
      <ApartmentModel layout={layout} finish={finish} selectedRoom={roomId} onSelectRoom={onSelectRoom} />
      <OrbitRig layout={layout} />
      {base && (
        <mesh position={[base.x, -0.03, base.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[base.w, base.d]} />
          <meshBasicMaterial color="#C5CDD6" />
        </mesh>
      )}
      <Projector anchors={anchors} layer={layer} />
    </SafeCanvas>
  );
}
