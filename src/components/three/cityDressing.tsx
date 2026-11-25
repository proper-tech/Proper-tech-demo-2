'use client';

// Dressing for the city round the site (BuildingScene's City, from public/models/blocks/city.glb): the map
// gives every roof the same grey and leaves the ground between the blocks a flat colour with nothing on it.
// Here the roofs get a tone per building height and some wear, the ground patches of dirt and grass, and the
// open yards trees, so the city reads as lived in from the overview. All of it is computed on the client:
// no new files to download.

import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderTarget,
  type Material,
} from 'three';

/** Smooth value noise in GLSL, in world metres (shared by the roofs and the ground). */
const NOISE = /* glsl */ `
  varying vec3 vCityPos;
  float cityHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float cityNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(cityHash(i), cityHash(i + vec2(1.0, 0.0)), u.x), mix(cityHash(i + vec2(0.0, 1.0)), cityHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

/** Adds `tint` (GLSL that changes diffuseColor.rgb, with vCityPos the world position) to a standard material. */
function worldTint(material: Material, key: string, tint: string) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCityPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCityPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${tint}`);
  };
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
}

/** Roofs: a tone per height (buildings of different heights rarely share a roof colour; most stay grey,
 *  some warm, some green-grey or rusty, as the bitumen, painted metal and tiles round the site) and soft
 *  patches of wear across each. */
export function dressRoofs(material: Material) {
  worldTint(
    material,
    'city-roof',
    /* glsl */ `
    float k = cityHash(vec2(floor(vCityPos.y * 2.0), 7.0));
    vec3 tone = k < 0.55 ? vec3(1.0) : k < 0.75 ? vec3(1.08, 0.99, 0.9) : k < 0.9 ? vec3(0.9, 1.0, 0.94) : vec3(1.14, 0.92, 0.8);
    float wear = cityNoise(vCityPos.xz / 14.0) * 0.6 + cityNoise(vCityPos.xz / 3.0) * 0.4;
    diffuseColor.rgb *= tone * (0.8 + 0.35 * wear);
  `,
  );
}

/** The ground between the blocks: patches of bare earth and dry grass, and finer grain, instead of one flat colour. */
export function dressGround(material: Material) {
  worldTint(
    material,
    'city-ground',
    /* glsl */ `
    vec2 p = vCityPos.xz;
    float grain = cityNoise(p / 40.0) * 0.55 + cityNoise(p / 9.0) * 0.3 + cityNoise(p / 1.7) * 0.15;
    float grass = smoothstep(0.55, 0.78, cityNoise(p / 60.0 + 13.0));
    diffuseColor.rgb *= mix(vec3(1.22, 1.14, 1.0), vec3(0.98, 1.12, 0.9), grass) * (0.78 + 0.44 * grain);
  `,
  );
}

/** Seeded random numbers, so the trees stand in the same places on every visit. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Smooth value noise (0..1), for groves: some yards are full of trees, others have none. */
function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** How far round the site the trees go (metres): about where the haze has the city (Sun's fog). */
const REACH = 720;
/** None are added this close to the site: next to the building made-up trees would read as a park that
 *  isn't there (a buyer looks at what is round the site). Out in the city they only set the scene. */
const SITE_CLEAR = 150;
/** Top-down map of what is built: one pixel is 2 * REACH / MAP metres (1.4 m). */
const MAP = 1024;
const MAX_TREES = 4000;
const LEAVES = ['#4d5f37', '#5a6b3e', '#43552f', '#66713f', '#55663a'];

/**
 * Trees in the open ground between the city's blocks. Where they may stand comes from a top-down render of
 * the city's buildings and streets and the site's own street model (`blockers`, once, on the GPU): a tree
 * goes only where a few metres all round are clear. Simple crowns on trunks, two instanced meshes: from the overview they are a few pixels across,
 * under the haze. ponytail: no map data for where trees really are; groves follow a noise, not the parks.
 */
export function CityTrees({ blockers }: { blockers: Object3D[] }) {
  const gl = useThree((s) => s.gl);
  const [trees, setTrees] = useState<Object3D | null>(null);

  useEffect(() => {
    // 1. what is built, seen from straight above: white on black
    const white = new MeshBasicMaterial({ color: '#ffffff' });
    const map = new Scene();
    map.background = new Color('#000000');
    for (const root of blockers) {
      root.updateMatrixWorld(true);
      // only what is shown (the street model's big hidden lawn would otherwise count as built)
      root.traverseVisible((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh || (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh) return; // people move: not ground
        const copy = new Mesh(mesh.geometry, white);
        copy.matrixAutoUpdate = false;
        copy.matrix.copy(mesh.matrixWorld);
        map.add(copy);
      });
    }
    const camera = new OrthographicCamera(-REACH, REACH, REACH, -REACH, 1, 1000);
    camera.position.set(0, 500, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const target = new WebGLRenderTarget(MAP, MAP);
    const before = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(map, camera);
    gl.setRenderTarget(before);
    const built = new Uint8Array(MAP * MAP * 4);
    gl.readRenderTargetPixels(target, 0, 0, MAP, MAP, built);
    target.dispose();
    white.dispose();

    // 2. spots with about 3 m clear all round, in groves
    const taken = (i: number, j: number) => i < 0 || j < 0 || i >= MAP || j >= MAP || built[(j * MAP + i) * 4] > 20;
    const clear = (i: number, j: number) => {
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (taken(i + di, j + dj)) return false;
      return true;
    };
    const rand = random(7);
    const at = new Vector3();
    const spots: [number, number][] = [];
    for (let j = 2; j < MAP - 2 && spots.length < MAX_TREES; j += 5) {
      for (let i = 2; i < MAP - 2 && spots.length < MAX_TREES; i += 5) {
        const pi = i + Math.floor(rand() * 4), pj = j + Math.floor(rand() * 4);
        if (!clear(pi, pj)) continue;
        at.set(((pi + 0.5) / MAP) * 2 - 1, ((pj + 0.5) / MAP) * 2 - 1, 0).unproject(camera);
        const r = Math.hypot(at.x, at.z);
        if (r < SITE_CLEAR || r > REACH - 10) continue;
        const grove = Math.min(1, Math.max(0, (noise(at.x / 60, at.z / 60) - 0.35) * 2.2));
        if (rand() < grove * 0.8) spots.push([at.x, at.z]);
      }
    }

    // 3. a trunk and a crown for each
    const crownGeo = new IcosahedronGeometry(1, 1);
    const trunkGeo = new CylinderGeometry(0.12, 0.18, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const crownMat = new MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    const trunkMat = new MeshStandardMaterial({ color: '#5a4a3c', roughness: 1 });
    const crowns = new InstancedMesh(crownGeo, crownMat, spots.length);
    const trunks = new InstancedMesh(trunkGeo, trunkMat, spots.length);
    crowns.name = 'CityTreeCrowns';
    trunks.name = 'CityTreeTrunks';
    const o = new Object3D();
    const leaf = new Color();
    spots.forEach(([x, z], n) => {
      const size = 1.8 + rand() * 1.5;
      const stem = 1.8 + rand() * 1.2;
      o.position.set(x, -0.15, z);
      o.rotation.set(0, rand() * Math.PI * 2, 0);
      o.scale.set(1, stem, 1);
      o.updateMatrix();
      trunks.setMatrixAt(n, o.matrix);
      o.position.y = -0.15 + stem + size * 0.75;
      o.scale.set(size, size * (1.1 + rand() * 0.3), size);
      o.updateMatrix();
      crowns.setMatrixAt(n, o.matrix);
      leaf.set(LEAVES[Math.floor(rand() * LEAVES.length)]).multiplyScalar(0.85 + rand() * 0.25);
      crowns.setColorAt(n, leaf);
    });
    for (const m of [crowns, trunks]) {
      m.raycast = () => {}; // never in the way of a click, the walk or the camera's clearance checks
      m.computeBoundingSphere();
    }
    const group = new Object3D();
    group.add(trunks, crowns);
    setTrees(group);
    return () => {
      crownGeo.dispose();
      trunkGeo.dispose();
      crownMat.dispose();
      trunkMat.dispose();
      crowns.dispose();
      trunks.dispose();
      setTrees(null);
    };
  }, [blockers, gl]);

  return trees ? <primitive object={trees} /> : null;
}
