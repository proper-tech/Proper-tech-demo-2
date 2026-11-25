'use client';

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Environment as Hdri, useGLTF, useProgress } from '@react-three/drei';
import site from '@/data/site.json';
import { Color, EquirectangularReflectionMapping, Fog, NeutralToneMapping, SRGBColorSpace, TextureLoader, ExtrudeGeometry, MathUtils, Plane, Raycaster, Shape, Spherical, Vector3, type Group, type Material, type Object3D, type Mesh, MeshStandardMaterial, type PerspectiveCamera } from 'three';
import { FLOOR_HEIGHT, FLOOR_MAX, FLOOR_MIN, PODIUM_HEIGHT, ROOF_LEVEL, coreFor, floorLevel, getFloor, towerPlate, towers, type FloorSummary } from '@/data/building';
import { blockDFloors, blockDOutline, blockDToSite, D_PARAPET } from '@/data/blockD';
import { podiumFloors, podiumOutline, terraceOutline } from '@/data/podium';
import { ROOF_FLOOR, TECH_HEIGHT, techBlock } from '@/data/roof';
import type { BlockId, TowerId } from '@/data/types';
import { bounds, offsetPolygon } from '@/lib/geometry';
import { Projector, type Anchor, type LabelLayer } from './Projector';
import { SafeCanvas } from './SafeCanvas';
import { CameraRig, HOME, type Tour } from './Tour';
import { Sun, type SunSettings } from './Sun';
import { fixPeople, usePeopleMotion } from './people';
import { useTraffic } from './traffic';
import { interiorFocus, interiorGlass, nightFactor } from './interiorGlass';
import { NightDriver, StreetLights, registerFacadeWash, registerNightGlow } from './nightLights';
import { removeStrayKerbs } from './strayKerbs';
import { CityTrees, dressGround, dressRoofs } from './cityDressing';
import { ARRIVE_KEY, FLOOR_FOV, FLOOR_VIEW, fitScale, handoff, liftsOut } from '@/lib/arrive';

// The complex: a detailed model (public/models/complex.glb: towers, podium with the roof
// playground, media screen, annex) standing in the environment model
// (public/models/blocks/environment.glb: ground, roads, parking, cars, trees, people). The model is generated from the same
// site.json by scripts/build-model.py, so the two always line up.
// Site-plan coordinates (u, v) map to the scene as x = u, z = -v. Heights come from the
// architect's sections (see building.ts). complex.glb is merged from one file per block
// (public/models/blocks, see scripts/merge-blocks.py).

export interface FloorKey {
  /** 'A' is the podium; B and C are the towers; D the service and parking building. */
  tower: BlockId;
  floor: number;
}

interface Props {
  floors: FloorSummary[];
  hovered: FloorKey | null;
  onHover: (key: FloorKey | null) => void;
  onOpen: (key: FloorKey) => void;
  autoRotate: boolean;
  /** False while the view is scrolled out of sight: it stops drawing, so scrolling stays smooth. */
  active?: boolean;
  /** Element that holds the tower name tags (see Projector). */
  layer: LabelLayer;
  /** The 360° tour: overview orbit or an eye-level viewpoint (see Tour.tsx). */
  tour: Tour;
  /** Sun position and brightness (see Sun.tsx). */
  sun: SunSettings;
  /** Called once the models are loaded, their shaders compiled and the first frames drawn. */
  onReady?: () => void;
  /** Loading progress of the models, 0-100. */
  onProgress?: (percent: number) => void;
  /** A floor that was just picked: the camera flies in to it, then onZoomed is called. */
  zoomTo?: FloorKey | null;
  onZoomed?: () => void;
}

const MODEL_URL = '/models/complex.glb';
/** Draco decoder for the compressed models, served from public/draco. */
const DRACO_URL = '/draco/';
const TOP = PODIUM_HEIGHT + (FLOOR_MAX - FLOOR_MIN + 1) * FLOOR_HEIGHT;
/** Glazed tower corners. Same value as CHAMFER in scripts/build-model.py. */
const CHAMFER = 2.4;

type Pt = number[];

function extrude(outline: Pt[], height: number) {
  const shape = new Shape();
  outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
  return new ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
}


/** Glass of block A (podium) and D, matched to the towers' glass: deeper blue, glossy, so the sky reflects. */
const GLASS: Record<string, { color: string; roughness: number }> = {
  Glass: { color: '#0E2E5E', roughness: 0.12 },
  'Glass Shopfront': { color: '#16222F', roughness: 0.06 },
};

function Model() {
  const { scene, animations } = useGLTF(MODEL_URL, DRACO_URL);
  usePeopleMotion(scene, animations);
  // The parked cars now come with the environment model, so the complex's own set is hidden.
  useMemo(() => {
    const cars = scene.getObjectByName('Cars');
    if (cars) cars.visible = false;
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        // The podium's baked occlusion (PodiumA_AO) is black over most of its outer walls, which then
        // turn black wherever the sun is not on them, so it is left off.
        if (m.name.endsWith('PodiumAO')) (m as MeshStandardMaterial).aoMap = null;
        const g = GLASS[m.name];
        if (g && 'color' in m) {
          (m as MeshStandardMaterial).color.set(g.color);
          (m as MeshStandardMaterial).roughness = g.roughness;
          (m as MeshStandardMaterial).metalness = 0;
        }
      }
    });
    // the podium's glass shows lit shops and offices behind it (interiorGlass.ts)
    const shopGlass = interiorGlass('shop');
    const officeGlass = interiorGlass('office');
    scene.getObjectByName('Podium')?.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      if (mesh.material.name === 'Glass Shopfront') mesh.material = shopGlass;
      else if (mesh.material.name === 'Glass') mesh.material = officeGlass;
    });
    // block D: its store on the ground floor, parking decks above (storeys from data/blockD.ts)
    const dGlass = interiorGlass('shop', { storeys: [4.5, 7.8, 10.8, 0.3], shopType: 0, parking: true });
    scene.getObjectByName('Annex')?.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === 'D Glass') mesh.material = dGlass;
    });
    // the towers' glass shows homes behind it (interiorGlass.ts)
    const homeGlass = interiorGlass('home');
    for (const name of ['Tower_B', 'Tower_C']) {
      scene.getObjectByName(name)?.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name.startsWith('TB Glass')) mesh.material = homeGlass;
      });
    }
    registerNightGlow(scene);
    registerFacadeWash(scene);
    fixPeople(scene);
    // skinned people on the roof must not be culled by their rest-pose bounds
    scene.traverse((o) => {
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false;
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(MODEL_URL, DRACO_URL);

/** Facade detail of the podium (scripts/podium-detail.py): framed windows, mullions and transoms, shopfront
 *  canopies. Kept apart from complex.glb so the podium model itself is not re-exported. */
const PODIUM_DETAIL_URL = '/models/blocks/A-detail.glb';

function PodiumDetail() {
  const { scene } = useGLTF(PODIUM_DETAIL_URL, DRACO_URL);
  useMemo(() => {
    registerNightGlow(scene);
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(PODIUM_DETAIL_URL, DRACO_URL);

/** Facade detail of block D (scripts/blockD-detail.py): plinth, slab bands, coping, framed windows, a lit
 *  canopy and name sign over the shopfront, framed garage doors, faceted metal panels on the blank west
 *  wall, roof plant. */
const D_DETAIL_URL = '/models/blocks/D-detail.glb';

function BlockDDetail() {
  const { scene } = useGLTF(D_DETAIL_URL, DRACO_URL);
  useMemo(() => {
    registerNightGlow(scene);
    registerFacadeWash(scene);
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(D_DETAIL_URL, DRACO_URL);

/** Glass of the podium's curtain walls (scripts/podium-glass.py): in complex.glb the infill behind the
 *  dark metal glazing grid is modelled in the facade material, so these panes sit just in front of it. */
const PODIUM_GLASS_URL = '/models/blocks/A-glass.glb';

function PodiumGlass() {
  const { scene } = useGLTF(PODIUM_GLASS_URL, DRACO_URL);
  useMemo(() => {
    const glass = interiorGlass('office');
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) (o as Mesh).material = glass;
    });
  }, [scene]);
  return <primitive object={scene} />;
}
useGLTF.preload(PODIUM_GLASS_URL, DRACO_URL);

/** Everything around the buildings, modelled in Blender (environment.blend): ground, roads,
 *  parking with cars, trees, hedges, street lights, furniture and people. Same site-plan frame
 *  as complex.glb (x = u, y = up, z = -v), so it needs no offset. Draco-compressed; the decoder
 *  is served from public/draco. */
const ENV_URL = '/models/blocks/environment.glb';

/** Ground materials that are procedural (noise / tile nodes) in Blender reach glTF without a
 *  colour, so they are given their average colour here. */
const GROUND_COLORS: Record<string, string> = {
  'Env Asphalt': '#5A5E63',
  'Env Street Asphalt': '#4A4E53',
  'Env Pavers': '#D6D3CC',
  'Env Sidewalk': '#CFCDC8',
  'Env Concrete': '#D9D6D0',
  'Env Lawn': '#7FA35A',
};

/** Street trees whose crowns ran into a facade (found with scripts/tree-clearance.py): moved
 *  clear of the building along the street, metres in x and z, and the crown scaled where a move
 *  alone would have taken it off the verge. Scale 0 takes the tree out. */
const TREE_FIX: Record<string, [number, number, number]> = {
  Env_Tree_04: [-1.95, 0, 1.0],
  Env_Tree_04001: [0, -2.7, 1.0],
  Env_Tree_05: [0, -2.7, 0.72],
  Env_Tree_06: [0, -2.2, 1.0],
  Env_Tree_06001: [0, -0.45, 1.0],
  Env_Tree_07: [0, -1.2, 1.0],
  Env_Tree_09: [1.7, 0, 1.0],
  Env_Tree_14: [0.95, 0, 1.0],
  Env_Tree_15: [1.7, 0, 1.0],
  Env_Tree_17: [0, 0.45, 1.0],
  Env_Tree_20: [0.45, 0, 1.0],
  Env_Tree_21: [1.2, 0, 1.0],
  Env_Tree_22: [1.45, 0, 1.0],
  Env_Tree_23: [1.45, 0, 1.0],
  Env_Tree_24: [1.2, 0, 1.0],
  Env_Tree_08: [0, 0, 0], // between the buildings: no room for it
};

function Environment() {
  const { scene, animations } = useGLTF(ENV_URL, DRACO_URL);
  usePeopleMotion(scene, animations);
  useTraffic(scene);
  // Compiled off-screen first (against the live scene's lights), then shown: adding it straight
  // away compiled all its materials in one frame, a visible hitch.
  const { gl, camera, scene: world } = useThree();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let live = true;
    gl.compileAsync(scene, camera, world)
      .catch(() => undefined)
      .then(() => live && setShown(true));
    return () => {
      live = false;
    };
  }, [gl, camera, world, scene]);
  useMemo(() => {
    for (const [name, [dx, dz, k]] of Object.entries(TREE_FIX)) {
      const tree = scene.getObjectByName(name);
      if (!tree || tree.userData.cleared) continue;
      tree.userData.cleared = true;
      if (k === 0) tree.visible = false;
      tree.position.x += dx;
      tree.position.z += dz;
      tree.scale.multiplyScalar(k || 1);
    }
    removeStrayKerbs(scene);
    registerNightGlow(scene);
    fixPeople(scene);
    // the big lawn round the site read as a park in a field: the real city (City) stands there instead, as in the film
    const under = scene.getObjectByName('Env_Grass_Underlay');
    if (under) under.visible = false;
    // the lawn east of the east street is really a building (Гэрэл төв, in city.glb): paved like the sidewalks,
    // its UVs scaled from the lawn's texture (6 m a tile) to the sidewalk's (1.8 m), as in scripts/build-film.py
    const far = scene.getObjectByName('Env_EastStreet_FarLawn') as Mesh | undefined;
    let walk: Material | undefined;
    scene.traverse((o) => {
      const m = (o as Mesh).material;
      if (m && !Array.isArray(m) && m.name === 'Env Sidewalk') walk = m;
    });
    if (far?.isMesh && walk && far.material !== walk) {
      const uv = far.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 6) / 1.8, (uv.getY(i) * 6) / 1.8);
      uv.needsUpdate = true;
      far.material = walk;
    }
    scene.traverse((o) => {
      // skinned people must not be culled by their rest-pose bounds
      if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false;
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      // people and small street furniture don't cast: their shadows are a few pixels at this
      // distance and cost a shadow pass each, every frame
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      mesh.castShadow = !(o as { isSkinnedMesh?: boolean }).isSkinnedMesh && (mesh.geometry.boundingSphere?.radius ?? 0) * Math.max(...o.getWorldScale(new Vector3()).toArray()) > 1.5;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const color = GROUND_COLORS[m.name.replace(/\.\d{3}$/, '')];
        // textured ground (photo textures, environment.blend) keeps its own colours
        if (color && 'color' in m && !(m as MeshStandardMaterial).map) (m as MeshStandardMaterial).color.set(color);
      }
    });
  }, [scene]);
  return (
    <>
      <primitive object={scene} visible={shown} />
      {shown && <StreetLights root={scene} />}
    </>
  );
}
// not preloaded: the street loads after the buildings are on screen (see BuildingScene)

/** The real city round the site, the same as in the film: OpenStreetMap buildings with photo facades and
 *  the streets (public/models/blocks/city.glb, made by scripts/build-film.py --city-glb; map data ©
 *  OpenStreetMap contributors), on plain ground out to the horizon. Not raycast, so the eye-level tour only
 *  walks on the site model; casts no shadows, since most heights are guesses (untagged in OpenStreetMap),
 *  too rough for the sun study. */
const CITY_URL = '/models/blocks/city.glb';
const noRaycast = () => {};

function City() {
  const { scene } = useGLTF(CITY_URL, DRACO_URL);
  const env = useGLTF(ENV_URL, DRACO_URL).scene;
  const gl = useThree((s) => s.gl);
  useMemo(() => {
    // the streets come with plain stand-ins named after the street model's materials ("City Sidewalk" for
    // "Env Sidewalk"): they get the model's own, so the asphalt, sidewalks and paint match it exactly
    const own = new Map<string, Material>();
    env.traverse((o) => {
      const m = (o as Mesh).material;
      if (m && !Array.isArray(m)) own.set(m.name, m);
    });
    scene.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      mesh.raycast = noRaycast;
      const m = mesh.material as MeshStandardMaterial;
      const match = m.name.startsWith('City ') && own.get(m.name.replace('City ', 'Env '));
      if (match) mesh.material = match;
      else if (m.name === 'Film Roof' && !m.userData.dressed) {
        m.userData.dressed = true;
        dressRoofs(m);
      } else if (m.map) m.map.anisotropy = gl.capabilities.getMaxAnisotropy(); // walls seen edge-on stay sharp
    });
  }, [scene, env, gl]);
  // trees go only where neither the city nor the site's own street model has anything (cityDressing)
  const blockers = useMemo(() => [scene, env], [scene, env]);
  // the film's ground colour, in patches of earth and grass (cityDressing)
  const ground = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#6B6A65', roughness: 1 });
    dressGround(m);
    return m;
  }, []);
  return (
    <>
      <primitive object={scene} />
      {/* below the streets (+0.02) and the site model (0) */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.15} receiveShadow raycast={noRaycast} material={ground}>
        <planeGeometry args={[3000, 3000]} />
      </mesh>
      <CityTrees blockers={blockers} />
    </>
  );
}
// not preloaded: loads with the street, after the buildings are on screen (see BuildingScene)

/** The drone's 360° photo from block B, floor 5 (public/views/B-05-v2.jpg, scaled to 1024 px: reflections
 *  are blurred anyway). Its middle is true north; three puts an equirectangular map's middle at the plan's
 *  north (-z), so it is turned by the plan's own turn from true north (site.rotation). Checked against the
 *  photo's sun (winter noon, bearing about 192°). */
const REFLECTION_URL = '/hdri/ub-sphere-1k.jpg';
const REFLECTION_TURN = (site.rotation * Math.PI) / 180;

function Reflections({ intensity }: { intensity: number }) {
  const map = useLoader(TextureLoader, REFLECTION_URL);
  useMemo(() => {
    map.mapping = EquirectangularReflectionMapping;
    map.colorSpace = SRGBColorSpace;
  }, [map]);
  return <Hdri map={map} environmentIntensity={intensity} environmentRotation={[0, REFLECTION_TURN, 0]} />;
}

/** Reports download progress of the models to the page's loader. */
function Progress({ onProgress }: { onProgress?: (percent: number) => void }) {
  const { progress } = useProgress();
  useEffect(() => {
    onProgress?.(progress);
  }, [progress, onProgress]);
  return null;
}

/**
 * Mounted after the models (inside the same Suspense), so it runs once they are in the scene:
 * compiles every material's shaders up front, then lets a few frames render (the first
 * shadow-map passes) before telling the page the view is ready. Without this the first seconds
 * stutter while the GPU compiles on the fly.
 */
function WhenReady({ onReady }: { onReady?: () => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    (async () => {
      try {
        await gl.compileAsync(scene, camera);
      } catch {
        // older drivers: fall through and let the frames below compile
      }
      let n = 0;
      const step = () => {
        if (cancelled) return;
        if (++n < 6) frame = requestAnimationFrame(step);
        else onReady?.();
      };
      frame = requestAnimationFrame(step);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

/** Rings round a floor at its slab and ceiling lines: the hovered floor's crisp outline. */
function FloorFrame({ outline, y0, y1, color }: { outline: Pt[]; y0: number; y1: number; color: string }) {
  const ring = useMemo(() => extrude(offsetPolygon(outline as [number, number][], 0.06), 0.14), [outline]);
  return (
    <>
      {[y0, y1 - 0.14].map((y) => (
        <mesh key={y} geometry={ring} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** The tower's outline (chamfered corners), a little out from the facade. */
function towerOutline(tower: TowerId, out: number): Pt[] {
  const t = towerPlate(tower);
  const [u0, u1, v0, v1, c] = [t.u0 - out, t.u1 + out, t.v0 - out, t.v1 + out, CHAMFER];
  return [
    [u0 + c, v0], [u1 - c, v0], [u1, v0 + c], [u1, v1 - c],
    [u1 - c, v1], [u0 + c, v1], [u0, v1 - c], [u0, v0 + c],
  ];
}

/**
 * One see-through, clickable band per floor, wrapped tight round the tower in the model from slab to slab.
 * Invisible until pointed at; the hovered floor gets a light tint and a crisp frame at its slab and ceiling
 * lines (blue when it has apartments for sale).
 */
function FloorZones({ tower, floors, hovered, onHover, onOpen }: { tower: TowerId; floors: FloorSummary[] } & Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const outline = useMemo(() => towerOutline(tower, 0.18), [tower]);
  const geometry = useMemo(() => extrude(outline, FLOOR_HEIGHT - 0.04), [outline]);
  const current = hovered?.tower === tower ? floors.find((f) => f.floor === hovered.floor) : undefined;

  return (
    <>
      {floors.map((f) => {
        const forSale = f.available > 0;
        const isHovered = current?.floor === f.floor;
        return (
          <mesh
            key={f.floor}
            geometry={geometry}
            position={[0, floorLevel(f.floor) + 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower, floor: f.floor });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4 || !forSale) return;
              e.stopPropagation();
              onOpen({ tower, floor: f.floor });
            }}
          >
            {/* no tint at rest, so the facade shows its real colours */}
            <meshBasicMaterial color={forSale ? '#2F6FDE' : '#5B6672'} transparent opacity={isHovered ? (forSale ? 0.34 : 0.26) : 0} depthWrite={false} />
          </mesh>
        );
      })}
      {current && (
        <FloorFrame outline={outline} y0={floorLevel(current.floor)} y1={floorLevel(current.floor) + FLOOR_HEIGHT} color={current.available > 0 ? '#5B95FF' : '#8D98A5'} />
      )}
    </>
  );
}

/** The podium floors you can see: the basement (floor 0) is underground, reached from the lift panel. */
const aboveGround = podiumFloors.filter((f) => f.floor > 0);

/**
 * The podium (block A): one clickable band per floor, floors 1-3 around the whole podium and
 * floor 4 around the roof playground. Invisible until pointed at, as the podium is not for sale.
 */
function PodiumZones({ hovered, onHover, onOpen }: Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  // 0.6 m out from the walls, clear of the facade's mullions, slab edges and parapet
  const outlines = useMemo(() => aboveGround.map((f) => offsetPolygon(f.floor === 4 ? terraceOutline : podiumOutline, 0.6)), []);
  const geometries = useMemo(() => aboveGround.map((f, i) => extrude(outlines[i], f.z1 - f.z0 - 0.12)), [outlines]);

  return (
    <>
      {aboveGround.map((f, i) => {
        const isHovered = hovered?.tower === 'A' && hovered.floor === f.floor;
        return (
          <mesh
            key={f.floor}
            geometry={geometries[i]}
            position={[0, f.z0 + 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower: 'A', floor: f.floor });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onOpen({ tower: 'A', floor: f.floor });
            }}
          >
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.3 : 0} depthWrite={false} />
          </mesh>
        );
      })}
      {aboveGround.map((f, i) =>
        hovered?.tower === 'A' && hovered.floor === f.floor ? (
          <FloorFrame key={`frame-${f.floor}`} outline={outlines[i]} y0={f.z0} y1={f.z1} color="#5B95FF" />
        ) : null,
      )}
    </>
  );
}

/** The technical floor on each tower roof (floor 17): a band round its block, invisible until
 *  pointed at, like the podium's. */
function RoofZones({ hovered, onHover, onOpen }: Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const geometries = useMemo(
    () =>
      towers.map((tower) => {
        const b = bounds(techBlock(tower));
        const [u0, u1, v0, v1] = [b.u0 - 0.3, b.u1 + 0.3, b.v0 - 0.3, b.v1 + 0.3];
        return extrude([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], TECH_HEIGHT - 0.12);
      }),
    [],
  );

  return (
    <>
      {towers.map((tower, i) => {
        const isHovered = hovered?.tower === tower && hovered.floor === ROOF_FLOOR;
        return (
          <mesh
            key={tower}
            geometry={geometries[i]}
            position={[0, TOP + 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower, floor: ROOF_FLOOR });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onOpen({ tower, floor: ROOF_FLOOR });
            }}
          >
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.3 : 0} depthWrite={false} />
          </mesh>
        );
      })}
    </>
  );
}

/** Block D: a band per floor above ground (1-3) round the building and its stair core, invisible
 *  until pointed at. Its basement is only on the lift panel. */
const D_ABOVE = blockDFloors.filter((f) => f.z0 >= 0);

function BlockDZones({ hovered, onHover, onOpen }: Pick<Props, 'hovered' | 'onHover' | 'onOpen'>) {
  const above = D_ABOVE;
  const outline = useMemo(() => offsetPolygon(blockDOutline.map(blockDToSite), 0.4), []);
  const geometries = useMemo(() => above.map((f) => extrude(outline, f.z1 - f.z0 - 0.12)), [above, outline]);

  return (
    <>
      {above.map((f, i) => {
        const isHovered = hovered?.tower === 'D' && hovered.floor === f.floor;
        return (
          <mesh
            key={f.floor}
            geometry={geometries[i]}
            position={[0, f.z0 + 0.06, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHover({ tower: 'D', floor: f.floor });
            }}
            onPointerOut={() => onHover(null)}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onOpen({ tower: 'D', floor: f.floor });
            }}
          >
            <meshBasicMaterial color="#2F6FDE" transparent opacity={isHovered ? 0.3 : 0} depthWrite={false} />
          </mesh>
        );
      })}
      {above.map((f) =>
        hovered?.tower === 'D' && hovered.floor === f.floor ? (
          <FloorFrame key={`frame-${f.floor}`} outline={outline} y0={f.z0} y1={f.z1} color="#5B95FF" />
        ) : null,
      )}
    </>
  );
}

/** Middle of a floor in scene coordinates (x = u, y = height, z = -v). */
function floorPoint({ tower, floor }: FloorKey): Vector3 {
  if (tower === 'B' || tower === 'C') {
    const t = towerPlate(tower);
    const y = floor >= ROOF_FLOOR ? ROOF_LEVEL + TECH_HEIGHT / 2 : floorLevel(floor) + FLOOR_HEIGHT / 2;
    return new Vector3((t.u0 + t.u1) / 2, y, -(t.v0 + t.v1) / 2);
  }
  if (tower === 'D') {
    const b = bounds(blockDOutline.map(blockDToSite));
    const f = blockDFloors.find((x) => x.floor === floor);
    return new Vector3((b.u0 + b.u1) / 2, f ? Math.max(1, (f.z0 + f.z1) / 2) : 2, -(b.v0 + b.v1) / 2);
  }
  const b = bounds(podiumOutline);
  const f = podiumFloors.find((x) => x.floor === floor);
  return new Vector3((b.u0 + b.u1) / 2, f ? Math.max(1, (f.z0 + f.z1) / 2) : 1, -(b.v0 + b.v1) / 2);
}

/** Zoom duration (seconds) when a floor is picked. */
const ZOOM_TIME = 2.8;

const smooth = (k: number) => k * k * (3 - 2 * k);

/**
 * Flies the camera to the picked floor. For the towers, in three moves: round and down until it is level
 * with the floor, square on to the facade it was looking at, with the whole floor across the view; then
 * straight at that facade until a window fills the view and the rooms behind the glass show (interiorGlass);
 * then on through the glass, while the page fades and opens the floor, whose own view starts inside that
 * facade (ARRIVE_KEY). The podium and block D the same, onto a window or shopfront on a side with open
 * space in front of it, found by casting rays at the building and what stands round it.
 */
function ZoomIn({ to, onDone }: { to: FloorKey; onDone?: () => void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; enabled: boolean } | null;
  const scene = useThree((s) => s.scene);
  type Path = { p0: Vector3; t0: Vector3; p1: Vector3; p2: Vector3; p3: Vector3; t1: Vector3; t3: Vector3; f0: number; k: number; done: boolean; dir: Vector3; near: number };
  const path = useRef<Path | null>(null);
  useEffect(() => {
    const t1 = floorPoint(to);
    const t0 = controls ? controls.target.clone() : t1.clone();
    // the side the camera is on, flattened
    const dir = camera.position.clone().sub(t1).setY(0);
    if (dir.lengthSq() < 1) dir.set(-1, 0, 1);
    dir.normalize();
    const half = MathUtils.degToRad(camera.fov / 2);
    // far enough that the whole floor plate (about 26 m) spans two thirds of the view
    const d1 = 13 / Math.tan(half) / 0.66;
    let p1: Vector3, p2: Vector3, p3: Vector3, t3: Vector3;
    if (to.tower === 'B' || to.tower === 'C') {
      // square on to the nearest facade of the plate
      const t = towerPlate(to.tower);
      const hx = (t.u1 - t.u0) / 2;
      const hz = (t.v1 - t.v0) / 2;
      if (Math.abs(dir.x) * hz > Math.abs(dir.z) * hx) dir.set(Math.sign(dir.x), 0, 0);
      else dir.set(0, 0, Math.sign(dir.z));
      const face = dir.x !== 0 ? hx : hz;
      // a little off the middle of the facade, onto a window bay rather than the core
      const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(face * 0.18);
      const eye = new Vector3(0, -0.1, 0);
      p1 = t1.clone().add(dir.clone().multiplyScalar(face + d1 * 0.55)).add(side).add(new Vector3(0, 0.6, 0));
      p2 = t1.clone().add(dir.clone().multiplyScalar(face + 3.6)).add(side).add(eye);
      p3 = t1.clone().add(dir.clone().multiplyScalar(face - 1.5)).add(side).add(eye);
      const y0 = floorLevel(to.floor);
      interiorFocus.value.set(y0, y0 + FLOOR_HEIGHT);
      t3 = t1.clone().add(side).add(eye);
    } else {
      // the podium and block D: onto a window or shopfront at the floor's height, on the side
      // nearest the camera that has one there (rays cast at the building), else the nearest side
      const bb = to.tower === 'D' ? bounds(blockDOutline.map(blockDToSite)) : bounds(podiumOutline);
      const hx = (bb.u1 - bb.u0) / 2;
      const hz = (bb.v1 - bb.v0) / 2;
      const building = scene.getObjectByName(to.tower === 'D' ? 'Annex' : 'Podium');
      const extra = to.tower === 'D' ? scene.getObjectByName('D Facade Detail') : scene.getObjectByName('A Curtain Glass');
      const axes = [new Vector3(1, 0, 0), new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 0, -1)].sort((p, q) => q.dot(dir) - p.dot(dir));
      type Pick = { d: Vector3; face: number; off: number; dy: number; clear: number };
      let pick: Pick | null = null;
      let best: Pick | null = null;
      const ray = new Raycaster();
      const targets = [building, extra].filter((o): o is NonNullable<typeof o> => !!o);
      // what the camera must not fly through: anything visible but the ground, the sky and labels
      const solid = (o: Object3D) => {
        const m = o as Mesh;
        if (!m.isMesh || !m.visible || (o as { isSprite?: boolean }).isSprite) return false;
        for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox!;
        return b.max.y - b.min.y > 0.5;
      };
      // collected once, without people (skinned meshes are slow to cast rays at) and without the sky
      const obstacles: Object3D[] = [];
      scene.traverse((o) => {
        // trees and street furniture are left out: brushing a crown is fine, a wall is not
        if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh || /Person|MH_|Sky|Tree|Shrub|Hedge|Lamp|Light|Car|Traffic|Bench|Bollard/i.test(o.name)) return;
        const m = o as Mesh;
        if (m.isMesh && solid(o) && (m.geometry.boundingSphere?.radius ?? (m.geometry.computeBoundingSphere(), m.geometry.boundingSphere!.radius)) < 500) obstacles.push(o);
      });
      for (const d of axes) {
        if (pick || !building) break;
        const half = d.x !== 0 ? hz : hx;
        const along = new Vector3(-d.z, 0, d.x);
        // windows sit at different heights in a storey: try a few
        search: for (const dy of [0, 0.7, -0.7, 1.1]) {
          for (const f of [0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8]) {
            const from = t1.clone().add(d.clone().multiplyScalar(200)).add(along.clone().multiplyScalar(f * half)).setY(t1.y + dy);
            ray.set(from, d.clone().negate());
            ray.far = 400;
            const hit = ray.intersectObjects(targets, true)[0];
            const mat = hit && (Array.isArray((hit.object as Mesh).material) ? null : ((hit.object as Mesh).material as Material));
            if (hit && mat && /glass/i.test(mat.name)) {
              // and clear in front: nothing (another block, the city round the site, a tree) within
              // 12 m of the window; how far it stays clear sets how far out the approach starts
              // a few rays, a little to either side and higher up, so a gap can't fool it
              let clear = 60;
              for (const [ox, oy] of [[0, 0], [-1.5, 0], [1.5, 0], [0, 3]]) {
                ray.set(hit.point.clone().add(d.clone().multiplyScalar(0.3)).add(along.clone().multiplyScalar(ox)).add(new Vector3(0, oy, 0)), d);
                ray.far = 60;
                const block = ray.intersectObjects(obstacles, false)[0];
                if (block) clear = Math.min(clear, block.distance);
              }
              const cand = { d, face: 200 - hit.distance, off: f * half, dy, clear };
              if (clear >= 20) {
                pick = cand;
                break search;
              }
              // nothing clear yet: remember the window with the most room in front of it
              if (!best || clear > best.clear) best = cand;
            }
          }
        }
      }
      if (!pick && best) pick = best;
      if (!pick) {
        const d = Math.abs(dir.x) * hz > Math.abs(dir.z) * hx ? new Vector3(Math.sign(dir.x), 0, 0) : new Vector3(0, 0, Math.sign(dir.z));
        pick = { d, face: d.x !== 0 ? hx : hz, off: 0, dy: 0, clear: 30 };
      }
      dir.copy(pick.d);
      const face = pick.face;
      const side = new Vector3(-dir.z, 0, dir.x).multiplyScalar(pick.off);
      t1.add(side).add(new Vector3(0, pick.dy, 0));
      p1 = t1.clone().add(dir.clone().multiplyScalar(face + Math.max(8, Math.min(d1 * 0.4, pick.clear - 2)))).add(new Vector3(0, 3, 0));
      p2 = t1.clone().add(dir.clone().multiplyScalar(face + 4)).add(new Vector3(0, 0.1, 0));
      p3 = t1.clone().add(dir.clone().multiplyScalar(face - 1.5)).add(new Vector3(0, 0.1, 0));
      t3 = t1.clone().add(new Vector3(0, 0.1, 0));
    }
    path.current = { p0: camera.position.clone(), t0, p1, p2, p3, t1, t3, f0: camera.fov, k: 0, done: false, dir, near: camera.near };
    if (controls) controls.enabled = false;
    return () => {
      if (controls) controls.enabled = true;
      interiorFocus.value.set(-1, -1);
      if (path.current) {
        camera.near = path.current.near;
        camera.updateProjectionMatrix();
      }
    };
  }, [to, camera, controls, scene]);
  useFrame((_, dt) => {
    const z = path.current;
    if (!z || z.done) return;
    z.k = Math.min(1, z.k + dt / ZOOM_TIME);
    // 0 – 0.45 round and level with the floor; 0.45 – 0.8 up to the glass; 0.8 – 1 through it
    const a = smooth(Math.min(1, z.k / 0.45));
    const b = smooth(MathUtils.clamp((z.k - 0.45) / 0.35, 0, 1));
    const c = MathUtils.clamp((z.k - 0.8) / 0.2, 0, 1);
    // on the way round, keep height until near the end, so the camera comes down onto the floor's
    // level from above instead of skimming through trees and neighbouring blocks
    const pos = new Vector3().lerpVectors(z.p0, z.p1, a);
    pos.y = MathUtils.lerp(z.p0.y, z.p1.y, a * a);
    pos.lerp(z.p2, b).lerp(z.p3, c * c);
    camera.position.copy(pos);
    const target = z.t0.clone().lerp(z.t1, Math.min(1, a * 1.15)).lerp(z.t3, b);
    if (controls) controls.target.copy(target);
    camera.lookAt(target);
    camera.fov = MathUtils.lerp(z.f0, 30, a) + 14 * b + 10 * c * c;
    // close to the glass the near plane must not cut it away before the camera reaches it
    camera.near = MathUtils.lerp(z.near, 0.05, b);
    camera.updateProjectionMatrix();
    if (z.k >= 1) {
      z.done = true;
      try {
        sessionStorage.setItem(ARRIVE_KEY, JSON.stringify({ x: z.dir.x, z: z.dir.z, at: Date.now(), inside: to.tower === 'B' || to.tower === 'C' }));
      } catch {
        // storage blocked: the floor page just opens at its usual view
      }
      onDone?.();
    }
  });
  return null;
}

/** Seconds the lift-out takes, from the click to the floor page's view. */
const LIFT_TIME = 3.4;
/** How far the picked floor rises out of its tower (m). */
const LIFT = 30;
/** The page background (--board in globals.css): the city fades into it as the floor rises. */
const BOARD = '#e9edf0';
/** The floor as the floor page shows it: loaded on demand (the pick has already started fetching it). */
const FloorModel = lazy(() => import('./FloorScene').then((m) => ({ default: m.FloorModel })));

/**
 * A tower floor picked: the camera flies round and level with it as ZoomIn does, then the tower opens
 * there (cut away from the top down to the floor), and the floor, furnished as on its page, rises out of
 * it and up towards the camera, which swings over it, while the rest of the city fades into the page
 * background. It ends on the floor page's own view (FLOOR_VIEW), so the page can take over from the
 * last frame (handoff) without a cut.
 */
function LiftOut({ to, onDone }: { to: FloorKey; onDone?: () => void }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; enabled: boolean } | null;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const group = useRef<Group>(null);
  const summary = getFloor(to.tower, to.floor);
  const core = useMemo(() => coreFor(to.tower as TowerId, to.floor), [to]);
  type Run = { p0: Vector3; t0: Vector3; p1: Vector3; p1b: Vector3; t1: Vector3; origin: Vector3; dir: Vector3; f0: number; cut: Plane; cutTop: number; tower: [Material, number][]; fading: boolean; k: number; done: boolean };
  const run = useRef<Run | null>(null);
  // the picked floor glows amber on the way in, so it is clear which one is opening
  const glow = useRef<Mesh>(null);
  const plate = towerPlate(to.tower as TowerId);

  useEffect(() => {
    const t = towerPlate(to.tower as TowerId);
    // the floor page's scene origin: the plate's centre, on the floor's slab
    const origin = new Vector3((t.u0 + t.u1) / 2, floorLevel(to.floor), -(t.v0 + t.v1) / 2);
    const t1 = floorPoint(to);
    const t0 = controls ? controls.target.clone() : t1.clone();
    // round to the facade nearest the camera, square on, the whole floor across the view (as ZoomIn)
    const dir = camera.position.clone().sub(t1).setY(0);
    if (dir.lengthSq() < 1) dir.set(-1, 0, 1);
    dir.normalize();
    const hx = (t.u1 - t.u0) / 2;
    const hz = (t.v1 - t.v0) / 2;
    if (Math.abs(dir.x) * hz > Math.abs(dir.z) * hx) dir.set(Math.sign(dir.x), 0, 0);
    else dir.set(0, 0, Math.sign(dir.z));
    const d1 = 13 / Math.tan(MathUtils.degToRad(15)) / 0.66;
    // far enough to see the storeys round it, a little above it, looking slightly down
    const p1 = t1.clone().add(dir.clone().multiplyScalar((dir.x !== 0 ? hx : hz) + d1 * 0.75)).add(new Vector3(0, 7, 0));
    // while the tower opens, the camera keeps drifting back and up, so the cut is seen coming down to it
    const p1b = p1.clone().add(dir.clone().multiplyScalar(6)).add(new Vector3(0, 10, 0));

    // the tower's own materials, copied, cut at a plane that sweeps down to the floor; the other
    // tower and everything else keep theirs
    const cutTop = ROOF_LEVEL + TECH_HEIGHT + 2;
    const cut = new Plane(new Vector3(0, -1, 0), cutTop); // keeps y below the constant
    const swaps: [Mesh, Material | Material[]][] = [];
    // the copies and their own opacity: the stump left under the rising floor fades out (useFrame)
    const tower: [Material, number][] = [];
    const copy = (m: Material) => {
      const c = m.clone();
      c.onBeforeCompile = m.onBeforeCompile; // the glass's lit homes (interiorGlass) aren't copied by clone()
      c.customProgramCacheKey = m.customProgramCacheKey;
      c.clippingPlanes = [cut];
      c.clipShadows = true;
      tower.push([c, m.opacity]);
      return c;
    };
    scene.getObjectByName(`Tower_${to.tower}`)?.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      swaps.push([mesh, mesh.material]);
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
    });
    gl.localClippingEnabled = true;
    const fog0 = scene.fog;
    const bg0 = scene.background;
    scene.fog = new Fog(BOARD, 3000, 4000);

    run.current = { p0: camera.position.clone(), t0, p1, p1b, t1, origin, dir, f0: camera.fov, cut, cutTop, tower, fading: false, k: 0, done: false };
    if (controls) controls.enabled = false;
    return () => {
      if (controls) controls.enabled = true;
      for (const [mesh, m] of swaps) {
        for (const c of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) c.dispose();
        mesh.material = m;
      }
      gl.localClippingEnabled = false;
      scene.fog = fog0;
      scene.background = bg0;
    };
  }, [to, camera, controls, scene, gl]);

  const sph0 = useMemo(() => new Spherical(), []);
  const sph1 = useMemo(() => new Spherical(), []);
  useFrame((_, dt) => {
    const z = run.current;
    if (!z || z.done) return;
    // a stalled tab (hidden, busy) pauses the lift instead of skipping it: one frame moves it 1/20 s at most
    z.k = Math.min(1, z.k + Math.min(dt, 0.05) / LIFT_TIME);
    // The moves overlap, so the camera never stops: 0 – 0.28 round to the floor; 0.22 – 0.46 the tower
    // opens down to it while the camera drifts back and up; 0.46 – 1 the floor rises and the camera
    // swings over it to the floor page's view.
    const a = smooth(Math.min(1, z.k / 0.28));
    const b = smooth(MathUtils.clamp((z.k - 0.22) / 0.24, 0, 1));
    const drift = smooth(MathUtils.clamp((z.k - 0.2) / 0.3, 0, 1));
    const c = smooth(MathUtils.clamp((z.k - 0.46) / 0.54, 0, 1));

    z.cut.constant = MathUtils.lerp(z.cutTop, z.origin.y - 0.03, b);
    const lift = LIFT * c;
    const centre = z.origin.clone().add(new Vector3(0, lift, 0));
    if (group.current) {
      group.current.visible = b > 0.5;
      group.current.position.copy(centre);
    }
    if (glow.current) (glow.current.material as Material).opacity = 0.4 * a * (1 - b);

    // round to the floor (ZoomIn's first move), keeping height until near the end, then drifting
    const pos = new Vector3().lerpVectors(z.p0, z.p1, a);
    pos.y = MathUtils.lerp(z.p0.y, z.p1.y, a * a);
    pos.lerp(z.p1b, drift);
    let target = z.t0.clone().lerp(z.t1, Math.min(1, a * 1.15));
    let fov = MathUtils.lerp(z.f0, 30, a);
    if (c > 0) {
      // then about the rising floor, on a sphere: from beside it to the floor page's view above it
      const end = new Vector3(...FLOOR_VIEW).multiplyScalar(fitScale(size.width / size.height));
      sph0.setFromVector3(z.p1b.clone().sub(z.origin));
      sph1.setFromVector3(end);
      let dTheta = sph1.theta - sph0.theta;
      dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta)); // the short way round
      const s = new Spherical(MathUtils.lerp(sph0.radius, sph1.radius, c), MathUtils.lerp(sph0.phi, sph1.phi, c), sph0.theta + dTheta * c);
      pos.setFromSpherical(s).add(centre);
      target = z.t1.clone().lerp(centre, c);
      fov = MathUtils.lerp(30, FLOOR_FOV, c);
      // the city fades into the page background as soon as the floor starts rising, gone by two thirds
      // of the way; the fog closes in geometrically (km to tens of metres) to just past the floor as
      // the camera is now, so the floor stays clear while the towers round it go early, no ghost left
      const f = smooth(MathUtils.clamp((z.k - 0.46) / 0.2, 0, 1));
      const r = pos.distanceTo(centre);
      const fog = scene.fog as Fog;
      fog.near = 3000 * ((r + 14) / 3000) ** f;
      fog.far = 4000 * ((r + 28) / 4000) ** f;
      if (f > 0.5 && !scene.background) scene.background = new Color(BOARD);
      // the tower's own stump, just under the floor, is too near for the fog: it fades out by itself,
      // quicker still, so no ghost of it is left under the floor
      const g = smooth(MathUtils.clamp((z.k - 0.46) / 0.14, 0, 1));
      if (g > 0 && !z.fading) {
        z.fading = true;
        for (const [m] of z.tower) {
          m.transparent = true;
          m.depthWrite = false;
          m.needsUpdate = true;
        }
      }
      for (const [m, o] of z.tower) m.opacity = o * (1 - g);
    }
    camera.position.copy(pos);
    camera.lookAt(target);
    if (controls) controls.target.copy(target);
    camera.fov = fov;
    camera.updateProjectionMatrix();

    if (z.k >= 1) {
      z.done = true;
      // the last frame, for the floor page to show until its own view has drawn
      try {
        gl.render(scene, camera);
        handoff.image = gl.domElement.toDataURL('image/jpeg', 0.9);
        handoff.at = Date.now();
      } catch {
        handoff.image = null;
      }
      try {
        sessionStorage.setItem(ARRIVE_KEY, JSON.stringify({ x: z.dir.x, z: z.dir.z, at: Date.now(), lift: true }));
      } catch {
        // storage blocked: the floor page just opens at its usual view
      }
      onDone?.();
    }
  });

  return (
    <>
      <group ref={group} visible={false}>
        <Suspense fallback={null}>{summary && <FloorModel units={summary.units} core={core} />}</Suspense>
      </group>
      <mesh ref={glow} position={[(plate.u0 + plate.u1) / 2, floorLevel(to.floor) + FLOOR_HEIGHT / 2, -(plate.v0 + plate.v1) / 2]}>
        <boxGeometry args={[plate.u1 - plate.u0 + 0.8, FLOOR_HEIGHT + 0.2, plate.v1 - plate.v0 + 0.8]} />
        <meshBasicMaterial color="#F2B632" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

export default function BuildingScene({ floors, hovered, onHover, onOpen, autoRotate, layer, tour, sun, onReady, onProgress, zoomTo, onZoomed, active = true }: Props) {
  const hoverAnchor = useMemo<Anchor[]>(() => {
    if (!hovered || hovered.floor === 0) return [];
    const p = floorPoint(hovered);
    // just above the band, so the tag never hides the floor it names
    return [{ id: 'hover', position: [p.x, p.y + FLOOR_HEIGHT * 1.4, p.z] }];
  }, [hovered]);
  const anchors = useMemo<Anchor[]>(() => {
    // Block A, the podium: tag floats over the roof playground between the towers
    const a = bounds(terraceOutline);
    // Block D: tag sits just above its parapet
    const [du, dv] = blockDToSite([9, 15]);
    return [
      ...towers.map((id): Anchor => {
        const t = towerPlate(id);
        return { id: `tower:${id}`, position: [(t.u0 + t.u1) / 2, TOP + 10, -(t.v0 + t.v1) / 2] };
      }),
      { id: 'tower:A', position: [(a.u0 + a.u1) / 2, PODIUM_HEIGHT + 9, -(a.v0 + a.v1) / 2] },
      { id: 'tower:D', position: [du, D_PARAPET + 6, -dv] },
    ];
  }, []);

  const [buildingsIn, setBuildingsIn] = useState(false);
  // the street starts one render after the loading bar has gone (see <Progress> below)
  const [streetOn, setStreetOn] = useState(false);
  useEffect(() => {
    if (buildingsIn) setStreetOn(true);
  }, [buildingsIn]);
  const ready = useCallback(() => {
    setBuildingsIn(true);
    onReady?.();
  }, [onReady]);

  return (
    <SafeCanvas shadows="percentage" frameloop={active ? 'always' : 'never'} dpr={[1, 1.5]} gl={{ toneMapping: NeutralToneMapping, toneMappingExposure: 1 }} camera={{ fov: 30, near: 1, far: 1200, position: HOME.position.toArray() }}>
      <Sun sun={sun} overview={tour.kind === 'overview'} />
      <NightDriver />
      <CameraRig tour={tour} autoRotate={autoRotate} targetY={TOP / 2 - 6} />

      {/* The buildings come first, so the view appears as soon as they are in; the street and the
          sky reflections (about 7 MB more) load right after, without holding it up. */}
      <Suspense fallback={null}>
        <Model />
        <PodiumDetail />
        <PodiumGlass />
        <BlockDDetail />
        <WhenReady onReady={ready} />
      </Suspense>
      {streetOn && (
        <Suspense fallback={null}>
          {/* the real view from the site (the drone's 360° photo) for reflections in glass, metal and car
              paint; the sky you see stays the Sun component's dome. A day photo: dimmed in the evening,
              so the facades go dark and the lit windows carry */}
          <Reflections intensity={0.6 * (1 - 0.75 * nightFactor(sun.elevation))} />
          <Environment />
          <City />
        </Suspense>
      )}
      {/* the loading bar only listens until the buildings are in: the street, loading after,
          would otherwise update it mid-render */}
      {!buildingsIn && <Progress onProgress={onProgress} />}

      {tour.kind === 'overview' && !zoomTo && towers.map((tower) => (
        <FloorZones key={tower} tower={tower} floors={floors.filter((f) => f.tower === tower)} hovered={hovered} onHover={onHover} onOpen={onOpen} />
      ))}
      {tour.kind === 'overview' && !zoomTo && (
        <>
          <PodiumZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
          <RoofZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
          <BlockDZones hovered={hovered} onHover={onHover} onOpen={onOpen} />
        </>
      )}

      {zoomTo && (liftsOut(zoomTo.tower, zoomTo.floor) ? <LiftOut to={zoomTo} onDone={onZoomed} /> : <ZoomIn to={zoomTo} onDone={onZoomed} />)}
      <Projector anchors={zoomTo ? anchors : [...anchors, ...hoverAnchor]} layer={layer} />
    </SafeCanvas>
  );
}
