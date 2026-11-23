import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { toLonLat } from '@/lib/geo';

// The complex itself on the city map: public/models/complex.glb (the site's model, x = u, y = up,
// z = -v in metres) drawn by three.js inside MapLibre as a custom layer, placed and turned with the
// site frame (geo.ts). It can be "built": hidden by a cut that rises storey by storey from the empty
// plot to the roof, with an amber line glowing where the work is, then shown whole.

const MODEL = '/models/complex.glb';
const DRACO = '/draco/';
/** Storey heights from the ground: podium (A) to 11.7 m, then the towers' 13 floors to 51.5 m, roof 54.7. */
const LEVELS = [0, 4.5, 8.1, 11.7, ...Array.from({ length: 13 }, (_, i) => 11.7 + 3.06 * (i + 1)), 54.8];

export interface ComplexLayer {
  layer: CustomLayerInterface;
  /** Resolves once the model has loaded (false if it could not). */
  ready: Promise<boolean>;
  /** Hide everything (an empty plot) and raise the building over `ms`; resolves when it stands. */
  build: (ms: number) => Promise<void>;
  /** Show the model whole (true) or not at all (false). */
  show: (on: boolean) => void;
}

export function complexLayer(map: MapLibreMap, maplibre: typeof import('maplibre-gl')): ComplexLayer {
  // where the site's 0,0 is and which way its u and v axes run, in Mercator units per metre
  const origin = maplibre.MercatorCoordinate.fromLngLat(toLonLat([0, 0]), 0);
  const along = (p: [number, number]) => {
    const q = maplibre.MercatorCoordinate.fromLngLat(toLonLat(p), 0);
    return new THREE.Vector3(q.x - origin.x, q.y - origin.y, 0).divideScalar(100);
  };
  const eu = along([100, 0]); // one metre along u
  const ev = along([0, 100]); // one metre along v
  const up = origin.meterInMercatorCoordinateUnits();
  // model (x = u, y = up, z = -v) -> Mercator (x east, y south, z up)
  const place = new THREE.Matrix4().set(
    eu.x, up * 0, -ev.x, origin.x,
    eu.y, 0, -ev.y, origin.y,
    0, up, 0, 0,
    0, 0, 0, 1,
  );

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4); // keeps y < constant
  let renderer: THREE.WebGLRenderer | null = null;
  let model: THREE.Object3D | null = null;
  let visible = false;
  let height = 1e4;

  // the glowing line along the top of the work, and a faint ghost of the finished building
  const glowMat = new THREE.MeshBasicMaterial({ color: '#F2B632', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const glow = new THREE.Group();
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#F2B632', transparent: true, opacity: 0.07, depthWrite: false });
  const ghost = new THREE.Group();
  glow.visible = false;
  ghost.visible = false;
  scene.add(glow, ghost);

  scene.add(new THREE.HemisphereLight('#eef4ff', '#8a8170', 1.2));
  const sun = new THREE.DirectionalLight('#fff4e2', 2.4);
  sun.position.set(-60, 90, -70);
  scene.add(sun);

  let resolveReady: (ok: boolean) => void = () => {};
  const ready = new Promise<boolean>((r) => (resolveReady = r));

  const layer: CustomLayerInterface = {
    id: 'sebotse-model',
    type: 'custom',
    renderingMode: '3d',
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGLRenderingContext, antialias: true });
      renderer.autoClear = false;
      renderer.localClippingEnabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.55;

      const draco = new DRACOLoader().setDecoderPath(DRACO);
      new GLTFLoader().setDRACOLoader(draco).load(
        MODEL,
        (gltf) => {
          model = gltf.scene;
          model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              m.clippingPlanes = [cut];
              m.clipShadows = true;
            }
          });
          model.visible = visible;
          scene.add(model);
          // the ghost and the work line follow the blocks' outlines (bounding boxes of the big meshes)
          const box = new THREE.Box3();
          model.updateMatrixWorld(true);
          model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            box.setFromObject(mesh);
            const s = box.getSize(new THREE.Vector3());
            if (s.x * s.z < 120 || s.y < 6) return; // only the blocks, not the furniture of the roofs
            const c = box.getCenter(new THREE.Vector3());
            const g = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), ghostMat);
            g.position.copy(c);
            ghost.add(g);
            const ring = new THREE.Mesh(new THREE.BoxGeometry(s.x + 0.6, 0.35, s.z + 0.6), glowMat);
            ring.position.set(c.x, 0, c.z);
            ring.userData = { bottom: box.min.y, top: box.max.y };
            glow.add(ring);
          });
          resolveReady(true);
          map.triggerRepaint();
        },
        undefined,
        () => resolveReady(false),
      );
    },
    render(_gl, args) {
      if (!renderer || !model || !visible) return;
      const m = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
      camera.projectionMatrix = m.multiply(place);
      cut.constant = height;
      for (const r of glow.children) {
        const { bottom, top } = r.userData as { bottom: number; top: number };
        r.visible = height > bottom + 0.2 && height < top - 0.2;
        r.position.y = height;
      }
      renderer.resetState();
      renderer.render(scene, camera);
    },
  };

  const show = (on: boolean) => {
    visible = on;
    height = 1e4;
    glow.visible = false;
    ghost.visible = false;
    if (model) model.visible = on;
    map.triggerRepaint();
  };

  const build = (ms: number) =>
    new Promise<void>((done) => {
      visible = true;
      if (model) model.visible = true;
      glow.visible = true;
      ghost.visible = true;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        // storey by storey: each level rises quickly, then holds a moment
        const f = k * (LEVELS.length - 1);
        const i = Math.min(LEVELS.length - 2, Math.floor(f));
        const local = f - i;
        const ease = local < 0.7 ? 1 - (1 - local / 0.7) ** 3 : 1;
        height = LEVELS[i] + (LEVELS[i + 1] - LEVELS[i]) * ease;
        map.triggerRepaint();
        if (k < 1) requestAnimationFrame(step);
        else {
          height = 1e4;
          glow.visible = false;
          // the ghost fades out once the building stands
          const f0 = performance.now();
          const fade = () => {
            const q = Math.min(1, (performance.now() - f0) / 700);
            ghostMat.opacity = 0.07 * (1 - q);
            map.triggerRepaint();
            if (q < 1) requestAnimationFrame(fade);
            else {
              ghost.visible = false;
              ghostMat.opacity = 0.07;
              done();
            }
          };
          fade();
        }
      };
      height = 0;
      step();
    });

  return { layer, ready, build, show };
}
