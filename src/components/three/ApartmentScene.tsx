'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import { BackSide, Euler, MathUtils, Matrix4, Quaternion, SRGBColorSpace, TextureLoader, Vector3, type PerspectiveCamera } from 'three';
import type { Finish, Layout } from '@/data/types';
import { doorLinks, roomEdges, roomEye } from '@/lib/geometry';
import { ApartmentModel } from './ApartmentModel';
import { SafeCanvas } from './SafeCanvas';
import { photoModels } from '@/data/photoModels';
import { photoRoomCentre } from './PhotoApartment';
import { Projector, type Anchor, type LabelLayer } from './Projector';
import { FLIGHT_IN, FLIGHT_OUT, TOUR_EYE, easeInOut, easeOut, type Flight } from './flight';

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
  /** Fly the camera into a tour stop or back out to the model view (see ApartmentExperience). */
  flight?: Flight | null;
  /** Each frame of a flight: progress 0..1, and true once it has landed. */
  onFlight?: (id: number, progress: number) => void;
  /** Where the camera is now, for the heading of a flight in. */
  cameraRef?: { current: PerspectiveCamera | null };
  /** Called once the model's picture is in and the first frames are drawn. */
  onReady?: () => void;
}

/** Waits for the plan picture (the same cached texture PhotoApartment draws) and three frames. */
function ReadyAfterFrames({ picture, onReady }: { picture: string | null; onReady: () => void }) {
  useLoader(TextureLoader, picture ? [picture] : []);
  const n = useRef(0);
  useFrame(() => {
    if (n.current < 0) return;
    if (++n.current >= 3) {
      n.current = -1;
      onReady();
    }
  });
  return null;
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

/** The model view: from the south, so the model reads the same way as the north-up 2D plan. */
function useOrbitPose(layout: Layout) {
  const cx = layout.w / 2;
  const cz = layout.d / 2;
  // Step back on narrow (phone) screens so the whole apartment stays in view.
  const narrow = useThree((s) => s.size.width / s.size.height < 0.9);
  const dist = Math.max(layout.w, layout.d * 1.4) * (narrow ? 1.4 : 1);
  return { cx, cz, dist, position: [cx + dist * 0.25, dist * 1.3, cz + dist * 1.25] as const };
}

/** Outside view: orbit around the open model. */
function OrbitRig({ layout }: { layout: Layout }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const { cx, cz, dist, position } = useOrbitPose(layout);

  useEffect(() => {
    camera.position.set(...position);
    camera.fov = 40;
    camera.updateProjectionMatrix();
  }, [camera, cx, cz, dist]); // eslint-disable-line react-hooks/exhaustive-deps

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

/**
 * A flight in: from wherever the orbit left the camera, it swoops down over the room and lands at the tour stop's
 * eye, facing the way it flew, at the tour's tilt and field of view; the page fades the 360° picture in on the way.
 * A flight out: from the stop, looking as the tour was left, back up to the model view.
 */
function FlightRig({ layout, flight, onFlight }: { layout: Layout; flight: Flight; onFlight?: (id: number, p: number) => void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const orbit = useOrbitPose(layout);
  const tmp = useMemo(() => ({ m: new Matrix4(), up: new Vector3(0, 1, 0), look: new Vector3(), q: new Quaternion(), aim: new Quaternion() }), []);
  /** the rotation of a camera at `from` looking at `to` (cameras look down their -z) */
  const aim = (from: Vector3, to: Vector3) => tmp.aim.setFromRotationMatrix(tmp.m.lookAt(from, to, tmp.up));
  const plan = useRef<{
    p0: Vector3; c: Vector3; p1: Vector3; q0: Quaternion; q1: Quaternion; f0: number; f1: number;
    /** what the camera looks at: the stop on the floor, and straight ahead from the stop */
    near: Vector3; ahead: Vector3; centre: Vector3; start: number;
  } | null>(null);
  useEffect(() => {
    const eye = new Vector3(flight.eye[0], TOUR_EYE, flight.eye[1]);
    const view = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(flight.pitch), flight.yaw, 0, 'YXZ'));
    const fwd = new Vector3(-Math.sin(flight.yaw), 0, -Math.cos(flight.yaw));
    const ahead = eye.clone().addScaledVector(fwd, 4).add(new Vector3(0, 4 * Math.tan(MathUtils.degToRad(flight.pitch)), 0));
    const near = new Vector3(flight.eye[0], 0.4, flight.eye[1]).addScaledVector(fwd, 1.2);
    const centre = new Vector3(orbit.cx, 0.6, orbit.cz);
    // come in from behind and above the stop, along the way the camera will face
    const c = eye.clone().addScaledVector(fwd, -2.4).add(new Vector3(0, 2.8, 0));
    if (flight.dir === 'in') {
      plan.current = { p0: camera.position.clone(), c, p1: eye, q0: camera.quaternion.clone(), q1: view, f0: camera.fov, f1: flight.fov, near, ahead, centre, start: -1 };
    } else {
      camera.position.copy(eye);
      camera.quaternion.copy(view);
      camera.fov = flight.fov;
      camera.updateProjectionMatrix();
      const p1 = new Vector3(...orbit.position);
      plan.current = { p0: eye, c, p1, q0: view, q1: aim(p1, centre).clone(), f0: flight.fov, f1: 40, near, ahead, centre, start: -1 };
    }
  }, [flight.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock }) => {
    const f = plan.current;
    if (!f) return;
    const now = clock.getElapsedTime();
    if (f.start < 0) f.start = now;
    const dur = flight.dir === 'in' ? FLIGHT_IN : FLIGHT_OUT;
    const raw = Math.min(1, (now - f.start) / dur);
    // the way out waits a moment for the 360° picture to fade
    const t = flight.dir === 'out' ? Math.max(0, (raw - 0.18) / 0.82) : raw;
    const k = easeInOut(t);
    const u = 1 - k;
    camera.position.set(0, 0, 0).addScaledVector(f.p0, u * u).addScaledVector(f.c, 2 * u * k).addScaledVector(f.p1, k * k);
    if (flight.dir === 'in') {
      // keep the room in view on the way down, then level out to the tour's first view
      tmp.look.lerpVectors(f.near, f.ahead, MathUtils.smoothstep(t, 0.45, 0.95));
      tmp.q.slerpQuaternions(f.q0, aim(camera.position, tmp.look), easeOut(Math.min(1, t / 0.3)));
      if (t > 0.97) tmp.q.slerp(f.q1, (t - 0.97) / 0.03);
    } else {
      tmp.look.lerpVectors(f.ahead, f.centre, MathUtils.smoothstep(t, 0.0, 0.6));
      tmp.q.copy(aim(camera.position, tmp.look));
      if (t < 0.05) tmp.q.slerpQuaternions(f.q0, tmp.aim, t / 0.05);
      if (t > 0.8) tmp.q.slerp(f.q1, (t - 0.8) / 0.2);
    }
    camera.quaternion.copy(tmp.q);
    camera.fov = MathUtils.lerp(f.f0, f.f1, k);
    camera.updateProjectionMatrix();
    onFlight?.(flight.id, raw);
  });
  return null;
}

/** Hands the scene's camera to the page. */
function CameraTap({ cameraRef }: { cameraRef: { current: PerspectiveCamera | null } }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera, cameraRef]);
  return null;
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

export default function ApartmentScene({ layout, finish, mode, roomId, layer, onSelectRoom, flight, onFlight, cameraRef, onReady }: Props) {
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
  // the ground under the drawn model (the rendered interior's picture needs none)
  const base = photoModels[layout.plan] ? null : { x: layout.w / 2, z: layout.d / 2, w: layout.w + 0.5, d: layout.d + 0.5 };
  const anchors = useMemo<Anchor[]>(
    () =>
      mode === 'model'
        ? layout.rooms
            .filter((r) => !r.partOf)
            .map((r) => {
              // over the room of the rendered interior where there is one
              const c = (photoModels[layout.plan] && photoRoomCentre(layout, photoModels[layout.plan]!, r.id)) ?? [r.x + r.w / 2, r.z + r.d / 2];
              return { id: `room:${r.id}`, position: [c[0], 1.2, c[1]] as [number, number, number] };
            })
        : links.map((l) => ({ id: `door:${l.to.id}`, position: [l.opening.x, 1.15, l.opening.z] })),
    [mode, layout, links],
  );

  return (
    <SafeCanvas flat dpr={[1, 2]} camera={{ fov: 40, near: 0.05, far: 300, position: [layout.w / 2, 14, layout.d + 12] }}>
      <color attach="background" args={[mode === 'tour' && !flight ? '#D3E3F3' : '#E9EDF0']} />
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

      {cameraRef && <CameraTap cameraRef={cameraRef} />}
      {onReady && (
        <Suspense fallback={null}>
          <ReadyAfterFrames picture={photoModels[layout.plan]?.image.src ?? null} onReady={onReady} />
        </Suspense>
      )}
      {flight ? (
        <FlightRig layout={layout} flight={flight} onFlight={onFlight} />
      ) : mode === 'model' ? (
        <>
          <OrbitRig layout={layout} />
          {base && (
            <mesh position={[base.x, -0.03, base.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[base.w, base.d]} />
              <meshBasicMaterial color="#C5CDD6" />
            </mesh>
          )}
        </>
      ) : (
        <TourRig eye={eye} look={look} />
      )}
      <Projector anchors={anchors} layer={layer} />
    </SafeCanvas>
  );
}
