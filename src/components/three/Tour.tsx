"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SPOTS, type SpotDef, type Tour } from "./spots";
export { ROOF_SPOTS, SPOTS, type SpotDef, type SpotId, type Tour } from "./spots";

// 360° tour of the complex: eye-level viewpoints you
// can look around from and walk on from, like Google Street View: arrows on the ground take a
// step that way, and clicking a free spot on the ground walks there.
// Scene coordinates: x = u, y = up, z = -v (site plan, metres).

const EYE = 1.65;
/** One click on an arrow moves this far (metres). */
const STEP = 3.5;
/** Clicking the ground walks at most this far (metres). */
const MAX_WALK = 35;

export type Pt3 = [number, number, number];
const toScene = ([u, v, h]: Pt3) => new Vector3(u, h, -v);

export const HOME = {
  position: new Vector3(-175, 95, 95),
  target: new Vector3(0, 0, 16),
  fov: 30,
};

/** Things you cannot stand on: plants, people, cars, lamps, furniture and play equipment. */
const NOT_GROUND =
  /Person|MH_|Tree|Shrub|Hedge|Car|Traffic|StreetLight|Lamp|Bollard|Bench|Fitness|Spring|Climbing|Pavilion|Flowers|Screen|LED/i;
/** Things you can walk through (people). */
const PASSABLE = /Person|MH_/i;

function named(o: Object3D | null, re: RegExp) {
  for (let p = o; p; p = p.parent) if (p.name && re.test(p.name)) return true;
  return false;
}

/** The arrow drawn on the ground: a flat chevron pointing along -Z, lying on the floor. */
function chevronGeometry() {
  const s = new Shape();
  s.moveTo(0, 0.55);
  s.lineTo(0.55, -0.05);
  s.lineTo(0.38, -0.22);
  s.lineTo(0, 0.2);
  s.lineTo(-0.38, -0.22);
  s.lineTo(-0.55, -0.05);
  s.closePath();
  const g = new ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  return g;
}

interface Props {
  tour: Tour;
  autoRotate: boolean;
  /** Overview orbit target height (half the tower height). */
  targetY: number;
  /** Viewpoints this scene offers (default: around the complex). */
  spots?: SpotDef[];
  /** Site-plan point (u, v, height) to scene coordinates (default x = u, y = height, z = -v). */
  frame?: (p: Pt3) => Vector3;
  /** Overview camera, where "back" flies to (default: the whole complex). */
  home?: { position: Vector3; target: Vector3; fov: number; near?: number };
  /** Orbit limits in the overview (default: fixed distance, as on the home page). */
  overview?: { enableZoom?: boolean; minDistance?: number; maxDistance?: number; minPolarAngle?: number; maxPolarAngle?: number };
}

type Flight = {
  p0: Vector3;
  t0: Vector3;
  p1: Vector3;
  t1: Vector3;
  f0: number;
  f1: number;
  k: number;
  dur: number;
};

/** Owns the camera: the usual orbit view and the walkable look-around
 *  viewpoints, with a smooth flight between them. */
export function CameraRig({ tour, autoRotate, targetY, spots = SPOTS, frame = toScene, home: homeView, overview = {} }: Props) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const flight = useRef<Flight | null>(null);
  const home = useRef(homeView ? homeView.target.clone() : HOME.target.clone().setY(targetY));
  const homePos = homeView?.position ?? HOME.position;
  const homeFov = homeView?.fov ?? HOME.fov;
  const homeNear = homeView?.near ?? 1;
  const started = useRef(false);

  const walking = tour.kind === "spot";
  const ground = useRef(0);
  const arrows = useRef<Group>(null);
  const arrowMeshes = useRef<(Mesh | null)[]>([]);
  const ring = useRef<Mesh>(null);
  const lastCheck = useRef(0);
  const ray = useMemo(() => new Raycaster(), []);
  const chevron = useMemo(chevronGeometry, []);
  const targets = useRef<{ list: Object3D[]; at: number }>({ list: [], at: -1 });

  /** Meshes the walk rays test against: everything except the arrows and the skinned people
   *  (slow to ray-cast and not an obstacle). Rebuilt every few seconds while models stream in. */
  const rayTargets = (now: number) => {
    const t = targets.current;
    if (now - t.at > 3 || !t.list.length) {
      const list: Object3D[] = [];
      scene.traverse((o) => {
        const m = o as Mesh & { isSkinnedMesh?: boolean };
        if (!m.isMesh || m.isSkinnedMesh || !m.visible) return;
        if (named(m, /^WalkUi$/) || named(m, PASSABLE)) return;
        list.push(m);
      });
      t.list = list;
      t.at = now;
    }
    return t.list;
  };

  /** Ground height at (x, z) near the current level, or null when there is nothing to stand on. */
  const groundAt = (x: number, z: number, now: number) => {
    ray.set(new Vector3(x, ground.current + 1.2, z), new Vector3(0, -1, 0));
    ray.far = 2.4;
    for (const h of ray.intersectObjects(rayTargets(now), false)) {
      if (named(h.object, NOT_GROUND)) continue;
      const n = h.face?.normal.clone().transformDirection(h.object.matrixWorld);
      if (!n || Math.abs(n.y) < 0.6) continue; // flat surface (some ground meshes face down)
      return Math.abs(h.point.y - ground.current) < 0.55 ? h.point.y : null;
    }
    return null;
  };

  /** True when nothing blocks a walk of `dist` metres along `dir` (horizontal, unit length). */
  const clear = (dir: Vector3, dist: number, now: number) => {
    const from = camera.position;
    for (const h of [0.7, 1.5]) {
      ray.set(new Vector3(from.x, ground.current + h, from.z), dir);
      ray.far = dist + 0.4;
      if (ray.intersectObjects(rayTargets(now), false).length) return false;
    }
    return true;
  };

  /** Fly a short step to (x, groundY, z), keeping the direction you look in. */
  const walkTo = (x: number, gy: number, z: number) => {
    const c = controls.current;
    if (!c) return;
    const p1 = new Vector3(x, gy + EYE, z);
    const look = c.target.clone().sub(camera.position);
    const dist = p1.distanceTo(camera.position);
    flight.current = {
      p0: camera.position.clone(),
      t0: c.target.clone(),
      p1,
      t1: p1.clone().add(look),
      f0: camera.fov,
      f1: camera.fov,
      k: 0,
      dur: MathUtils.clamp(0.35 + dist * 0.05, 0.45, 1.6),
    };
    ground.current = gy;
  };

  const heading = () => {
    const d = controls.current
      ? controls.current.target.clone().sub(camera.position)
      : new Vector3(0, 0, -1);
    d.y = 0;
    return d.lengthSq() > 1e-8 ? d.normalize() : new Vector3(0, 0, -1);
  };

  // arrow i points forward, right, back, left of the view
  const arrowDir = (i: number) =>
    heading().applyAxisAngle(new Vector3(0, 1, 0), (-i * Math.PI) / 2);

  const step = (i: number) => {
    const now = performance.now() / 1000;
    const d = arrowDir(i);
    if (!clear(d, STEP, now)) return;
    const p = camera.position.clone().addScaledVector(d, STEP);
    const gy = groundAt(p.x, p.z, now);
    if (gy !== null) walkTo(p.x, gy, p.z);
  };

  // ------------------------------------------------------------------ tour changes
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (!started.current) {
      // first render: start on the overview without a flight
      started.current = true;
      c.target.copy(home.current);
      c.update();
      if (tour.kind === "overview") return;
    }
    let p1: Vector3, t1: Vector3, f1: number;
    if (tour.kind === "spot") {
      const s = spots.find((x) => x.id === tour.id) ?? spots[0];
      p1 = frame(s.at);
      ground.current = p1.y;
      p1.add(new Vector3(0, EYE, 0));
      const look = frame(s.look);
      t1 = p1.clone().add(look.sub(p1).normalize().multiplyScalar(0.1));
      f1 = 62;
    } else {
      p1 = homePos.clone();
      t1 = home.current.clone();
      f1 = homeFov;
    }
    flight.current = {
      p0: camera.position.clone(),
      t0: c.target.clone(),
      p1,
      t1,
      f0: camera.fov,
      f1,
      k: 0,
      dur: 1.8,
    };
  }, [tour, camera]);

  // ------------------------------------------------------------------ clicks and hover while walking
  useEffect(() => {
    if (!walking) return;
    const el = gl.domElement;
    let down: { x: number; y: number; t: number } | null = null;
    const ndc = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return new Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    };
    const arrowUnder = (e: PointerEvent) => {
      ray.setFromCamera(ndc(e), camera);
      ray.far = 50;
      const live = arrowMeshes.current.filter((m): m is Mesh => !!m && m.visible);
      const hit = ray.intersectObjects(live, false)[0];
      return hit ? arrowMeshes.current.indexOf(hit.object as Mesh) : -1;
    };
    /** Walkable ground under the pointer, or null. */
    const groundUnder = (e: PointerEvent) => {
      const now = performance.now() / 1000;
      ray.setFromCamera(ndc(e), camera);
      ray.far = 200;
      const hit = ray.intersectObjects(rayTargets(now), false)[0];
      if (!hit || named(hit.object, NOT_GROUND)) return null;
      const n = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld);
      if (!n || Math.abs(n.y) < 0.6 || Math.abs(hit.point.y - ground.current) > 0.55) return null;
      const flat = new Vector3(hit.point.x - camera.position.x, 0, hit.point.z - camera.position.z);
      const d = flat.length();
      if (d < 1 || d > MAX_WALK) return null;
      return { point: hit.point, dir: flat.normalize(), dist: d };
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      // a drag looks around; only a short, still press is a click
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 600) return;
      const a = arrowUnder(e);
      if (a >= 0) return step(a);
      const g = groundUnder(e);
      if (g && clear(g.dir, g.dist - 0.4, performance.now() / 1000)) walkTo(g.point.x, g.point.y, g.point.z);
    };
    const onMove = (e: PointerEvent) => {
      if (down) return;
      const overArrow = arrowUnder(e) >= 0;
      const g = overArrow ? null : groundUnder(e);
      el.style.cursor = overArrow || g ? "pointer" : "grab";
      const r = ring.current;
      if (r) {
        r.visible = !!g;
        if (g) r.position.set(g.point.x, g.point.y + 0.03, g.point.z);
      }
    };
    const onLeave = () => {
      if (ring.current) ring.current.visible = false;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.style.cursor = "";
      if (ring.current) ring.current.visible = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking, gl, camera]);

  // ------------------------------------------------------------------ per frame
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const f = flight.current;
    const g = arrows.current;
    if (g) g.visible = walking && !f;
    if (f) {
      f.k = Math.min(1, f.k + dt / f.dur);
      const e = f.k < 0.5 ? 4 * f.k ** 3 : 1 - (-2 * f.k + 2) ** 3 / 2;
      camera.position.lerpVectors(f.p0, f.p1, e);
      c.target.lerpVectors(f.t0, f.t1, e);
      camera.fov = MathUtils.lerp(f.f0, f.f1, e);
      // close-up views need a closer near plane; the overview keeps 1 m for depth precision
      camera.near = walking ? 0.25 : homeNear;
      camera.updateProjectionMatrix();
      c.update();
      if (f.k >= 1) {
        flight.current = null;
        lastCheck.current = 0;
      }
      return;
    }
    if (walking && g) {
      // the arrows sit on the floor around you and turn with your view
      const h = heading();
      g.position.set(camera.position.x, ground.current + 0.04, camera.position.z);
      g.rotation.set(0, Math.atan2(-h.x, -h.z), 0);
      // every few frames hide the arrows whose step is blocked (walls, cars, edges)
      const now = performance.now() / 1000;
      if (now - lastCheck.current > 0.3) {
        lastCheck.current = now;
        for (let i = 0; i < 4; i++) {
          const m = arrowMeshes.current[i];
          if (!m) continue;
          const d = arrowDir(i);
          const p = camera.position.clone().addScaledVector(d, STEP);
          m.visible = clear(d, STEP, now) && groundAt(p.x, p.z, now) !== null;
        }
      }
    }
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableZoom={!walking && !!overview.enableZoom}
        minDistance={walking ? 0 : overview.minDistance ?? 0}
        maxDistance={walking ? Infinity : overview.maxDistance ?? Infinity}
        // in a viewpoint the camera turns on the spot: dragging moves the view like a panorama
        rotateSpeed={walking ? -0.35 : 1}
        autoRotate={autoRotate && tour.kind === "overview"}
        autoRotateSpeed={0.5}
        minPolarAngle={walking ? 0.2 : overview.minPolarAngle ?? 0.7}
        maxPolarAngle={walking ? Math.PI - 0.35 : overview.maxPolarAngle ?? 1.5}
      />
      {/* walk controls, Street View style: four arrows on the floor and a ring under the pointer */}
      <group ref={arrows} name="WalkUi" visible={false}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, (-i * Math.PI) / 2, 0]}>
            <mesh
              ref={(m) => {
                arrowMeshes.current[i] = m;
              }}
              name="WalkUi"
              geometry={chevron}
              position={[0, 0, -3.4]}
              renderOrder={10}
            >
              <meshBasicMaterial color="#ffffff" transparent opacity={i === 0 ? 0.95 : 0.75} depthTest={false} side={DoubleSide} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh ref={ring} name="WalkUi" visible={false} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <ringGeometry args={[0.38, 0.5, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} depthTest={false} side={DoubleSide} />
      </mesh>
    </>
  );
}
