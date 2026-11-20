import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { interiorNight, interiorTime } from './interiorGlass';

// Outdoor lighting for the evening and night, driven by interiorNight (the sun's height, Sun.tsx):
// lamps, LED strips, canopy lights and car lights glow brighter, the street lights throw pools of
// light on the ground, and the facades are washed by uplights (the podium from the pavement, the
// towers from the podium roof and at the crown).

/** How much brighter each glowing material gets at full night (emissive x (1 + k)). */
const GLOW: Record<string, number> = {
  Lamp_Lens: 6,
  'Lamp Head': 4,
  RG_Lamp_Glow: 4,
  'A LED Strip': 3,
  'A Canopy Light': 3,
  Car_Headlight: 5,
  Car_Taillight: 6,
  'Media Screen': 1.2,
};

const glowing: { m: MeshStandardMaterial; base: number; k: number }[] = [];
const seen = new WeakSet<Material>();

/** Registers a loaded model's glowing materials, once each. */
export function registerNightGlow(root: Object3D) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const k = GLOW[m.name.replace(/\.\d{3}$/, '')];
      if (k === undefined || seen.has(m) || !('emissiveIntensity' in m)) continue;
      seen.add(m);
      glowing.push({ m: m as MeshStandardMaterial, base: (m as MeshStandardMaterial).emissiveIntensity, k });
    }
  });
}

/** Updates the glow and the homes' clock every frame. */
export function NightDriver() {
  const last = useRef(-1);
  useFrame(({ clock }) => {
    interiorTime.value = clock.elapsedTime;
    const n = interiorNight.value;
    if (n === last.current) return;
    last.current = n;
    for (const g of glowing) g.m.emissiveIntensity = g.base * (1 + g.k * n);
  });
  return null;
}

// ---- facade washes ----

/** Per facade material: warm uplight from the ground (strength, height it fades over), and a cooler
 *  wash at the top (from, to, strength). Heights in metres, in the model's frame. */
const WASH: Record<string, { up: [number, number]; base?: number; top?: [number, number, number] }> = {
  'Facade White PodiumAO': { up: [0.55, 2.2], top: [10.6, 11.7, 0.35] },
  'TB Panel White': { up: [0.45, 2.4], base: 11.7, top: [45.0, 52.0, 0.5] },
  'TB Slab Edge': { up: [0.3, 2.4], base: 11.7, top: [45.0, 52.0, 0.5] },
  'D Cladding': { up: [0.5, 2.0] },
};

export function registerFacadeWash(root: Object3D) {
  const done = new Set<Material>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const w = WASH[m.name];
      if (!w || done.has(m)) continue;
      done.add(m);
      const [upK, upH] = w.up;
      const [t0, t1, tK] = w.top ?? [1e4, 1e4 + 1, 0];
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uNight = interiorNight;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vWashY;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWashY = (modelMatrix * vec4(transformed, 1.0)).y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vWashY;\nuniform float uNight;')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            {
              float y = vWashY - ${(w.base ?? 0).toFixed(2)};
              vec3 wash = vec3(1.0, 0.74, 0.48) * ${upK.toFixed(3)} * exp(-max(y, 0.0) / ${upH.toFixed(2)}) * step(-0.2, y)
                        + vec3(0.82, 0.9, 1.0) * ${tK.toFixed(3)} * smoothstep(${t0.toFixed(2)}, ${t1.toFixed(2)}, vWashY);
              totalEmissiveRadiance += diffuseColor.rgb * wash * uNight;
            }`,
          );
      };
      m.customProgramCacheKey = () => `wash-${m.name}`;
      m.needsUpdate = true;
    }
  });
}

// ---- street lights ----

function radialTexture(stops: [number, string][]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, col] of stops) grad.addColorStop(at, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Heads of the street lights (the lens at the top of each pole), from the environment model. */
function lampHeads(root: Object3D) {
  const heads: Vector3[] = [];
  const v = new Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !/^Lamp_Lens/.test(mesh.material.name)) return;
    const pos = mesh.geometry.getAttribute('position');
    const sum = new Vector3();
    let n = 0;
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).y);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y > top - 0.6) {
        sum.add(v);
        n++;
      }
    }
    if (n) heads.push(sum.divideScalar(n));
  });
  return heads;
}

const POOL = 13;

/** Pools of warm light under the street lights and a glow round each lamp, faded in with the night. */
export function StreetLights({ root }: { root: Object3D }) {
  const heads = useMemo(() => lampHeads(root), [root]);
  const poolTex = useMemo(
    () => radialTexture([[0, 'rgba(255,214,160,0.9)'], [0.35, 'rgba(255,196,130,0.45)'], [1, 'rgba(255,180,110,0)']]),
    [],
  );
  const glowTex = useMemo(
    () => radialTexture([[0, 'rgba(255,240,215,1)'], [0.2, 'rgba(255,214,160,0.55)'], [1, 'rgba(255,190,120,0)']]),
    [],
  );
  const mats = useRef<{ opacity: number }[]>([]);
  const lastN = useRef(-1);
  useFrame(() => {
    const n = interiorNight.value;
    if (n === lastN.current) return;
    lastN.current = n;
    mats.current.forEach((m, i) => (m.opacity = n * (i % 2 ? 0.7 : 0.55)));
  });
  const reg = (i: number) => (m: { opacity: number } | null) => {
    if (m) mats.current[i] = m;
  };
  return (
    <group name="StreetLightGlow">
      {heads.map((h, i) => (
        <group key={i}>
          <mesh position={[h.x, 0.18, h.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={() => null}>
            <planeGeometry args={[POOL, POOL]} />
            <meshBasicMaterial ref={reg(i * 2)} map={poolTex} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-4} />
          </mesh>
          <sprite position={[h.x, h.y - 0.1, h.z]} scale={[1.5, 1.5, 1]} renderOrder={3} raycast={() => null}>
            <spriteMaterial ref={reg(i * 2 + 1)} map={glowTex} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} color={new Color(1, 0.95, 0.85)} />
          </sprite>
        </group>
      ))}
    </group>
  );
}
