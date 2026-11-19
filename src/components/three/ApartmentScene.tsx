'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import { BackSide, Euler, MathUtils, Quaternion, SRGBColorSpace, Vector3, type PerspectiveCamera } from 'three';
import type { Finish, Layout } from '@/data/types';
import { doorLinks, roomEdges, roomEye } from '@/lib/geometry';
import { ApartmentModel } from './ApartmentModel';
import { SafeCanvas } from './SafeCanvas';
import { Projector, type Anchor, type LabelLayer } from './Projector';

export type SceneMode = 'model' | 'tour';

export interface RoomLabel {
  name: string;
  area: string;
}

interface Props {
  layout: Layout;
  finish: Finish;
  mode: SceneMode;
  roomId: string;
  /** Element that holds the room tags and door labels (see Projector). */
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

const EYE_HEIGHT = 1.6;

/** Inside view: the camera stands in a room and only turns. Drag to look, wheel to zoom. */
function TourRig({ eye, look }: { eye: [number, number]; look: [number, number] | null }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  // Start facing the room's window.
  const yaw = useRef(look ? Math.atan2(-(look[0] - eye[0]), -(look[1] - eye[1])) : Math.PI);
  const pitch = useRef(0);
  const fov = useRef(75);
  const prev = useRef<[number, number] | null>(null);
  const target = useMemo(() => new Vector3(), []);
  const q = useMemo(() => new Quaternion(), []);
  const e = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);

  // Walking to another room: turn to face the way we are going.
  useEffect(() => {
    if (prev.current) {
      const dx = eye[0] - prev.current[0];
      const dz = eye[1] - prev.current[1];
      if (Math.hypot(dx, dz) > 0.1) {
        yaw.current = Math.atan2(-dx, -dz);
        pitch.current = 0;
      }
    }
    prev.current = eye;
  }, [eye]);

  useEffect(() => {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const down = (ev: PointerEvent) => {
      dragging = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      dom.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (!dragging) return;
      const k = (fov.current / 75) * 0.005;
      yaw.current += (ev.clientX - lastX) * k;
      pitch.current = MathUtils.clamp(pitch.current + (ev.clientY - lastY) * k, -1.3, 1.3);
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = (ev: PointerEvent) => {
      dragging = false;
      if (dom.hasPointerCapture(ev.pointerId)) dom.releasePointerCapture(ev.pointerId);
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      fov.current = MathUtils.clamp(fov.current + ev.deltaY * 0.04, 40, 95);
    };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    dom.style.cursor = 'grab';
    dom.style.touchAction = 'none';
    return () => {
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up);
      dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
      dom.style.cursor = '';
    };
  }, [dom]);

  useFrame((_, dt) => {
    target.set(eye[0], EYE_HEIGHT, eye[1]);
    camera.position.lerp(target, 1 - Math.exp(-5 * dt));
    e.set(pitch.current, yaw.current, 0);
    q.setFromEuler(e);
    camera.quaternion.slerp(q, 1 - Math.exp(-12 * dt));
    if (Math.abs(camera.fov - fov.current) > 0.05) {
      camera.fov = MathUtils.lerp(camera.fov, fov.current, 1 - Math.exp(-10 * dt));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/** Real 360° photo for a room, when `panorama` is set in the layout data. */
function Panorama({ url, eye }: { url: string; eye: [number, number] }) {
  const texture = useTexture(url);
  texture.colorSpace = SRGBColorSpace;
  return (
    <mesh position={[eye[0], EYE_HEIGHT, eye[1]]} scale={[-1, 1, 1]}>
      <sphereGeometry args={[40, 64, 40]} />
      <meshBasicMaterial map={texture} side={BackSide} />
    </mesh>
  );
}

export default function ApartmentScene({ layout, finish, mode, roomId, layer, onSelectRoom }: Props) {
  const room = layout.rooms.find((r) => r.id === roomId) ?? layout.rooms[0];
  const eye = useMemo(() => roomEye(room), [room]);
  const links = useMemo(() => doorLinks(layout, room.id), [layout, room.id]);
  // The middle of the room's widest window, for the first view of the tour.
  const look = useMemo<[number, number] | null>(() => {
    let best: [number, number] | null = null;
    let widest = 0;
    for (const edge of roomEdges(room, layout.openings))
      for (const seg of edge.segments)
        if (seg.kind === 'window' && seg.to - seg.from > widest) {
          widest = seg.to - seg.from;
          best = edge.at((seg.from + seg.to) / 2);
        }
    return best;
  }, [layout, room]);
  const photo = mode === 'tour' ? room.panorama : undefined;
  const anchors = useMemo<Anchor[]>(
    () =>
      mode === 'model'
        ? layout.rooms.filter((r) => !r.partOf).map((r) => ({ id: `room:${r.id}`, position: [r.x + r.w / 2, 1.2, r.z + r.d / 2] }))
        : links.map((l) => ({ id: `door:${l.to.id}`, position: [l.opening.x, 1.15, l.opening.z] })),
    [mode, layout, links],
  );

  return (
    <SafeCanvas flat dpr={[1, 2]} camera={{ fov: 40, near: 0.05, far: 300, position: [layout.w / 2, 14, layout.d + 12] }}>
      <color attach="background" args={[mode === 'tour' ? '#D3E3F3' : '#E9EDF0']} />
      <Lights />

      <group visible={!photo}>
        <ApartmentModel
          layout={layout}
          finish={finish}
          selectedRoom={mode === 'model' ? room.id : null}
          onSelectRoom={mode === 'model' ? onSelectRoom : undefined}
        />
      </group>
      {photo && (
        <Suspense fallback={null}>
          <Panorama url={photo} eye={eye} />
        </Suspense>
      )}

      {mode === 'model' ? (
        <>
          <OrbitRig layout={layout} />
          <mesh position={[layout.w / 2, -0.03, layout.d / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[layout.w + 0.5, layout.d + 0.5]} />
            <meshBasicMaterial color="#C5CDD6" />
          </mesh>
        </>
      ) : (
        <TourRig eye={eye} look={look} />
      )}
      <Projector anchors={anchors} layer={layer} />
    </SafeCanvas>
  );
}
