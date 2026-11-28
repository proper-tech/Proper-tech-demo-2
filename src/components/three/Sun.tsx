'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { interiorNight, nightFactor } from './interiorGlass';
import site from '@/data/site.json';
import type { SunSettings } from './sunSettings';
import { BackSide, CanvasTexture, Fog, Object3D, SRGBColorSpace, Vector3, type DirectionalLight, type ShaderMaterial, type Group, type PerspectiveCamera, type Sprite } from 'three';

export { DEFAULT_SUN, type SunSettings } from './sunSettings';

/** Centre of the site in the scene and the half-size of the area that gets shadows (metres). */
const CENTER: [number, number, number] = [0, 0, -12];
const REACH = 115;
/** Middle of the complex, between the towers, half-way up. */
const SITE_CENTER = new Vector3(3.3, 28, -0.1);
const DISTANCE = 260;
/** The sky dome and the sun disc travel with the camera, so they look infinitely far away
 *  like the real sky. Radius of the dome, distance of the disc (inside the camera's far plane
 *  of 1200 m) and the disc's size including its glow (about 12° across). */
const SKY_RADIUS = 1000;
/** Haze over the city (metres from the camera): clear over the site and its near neighbours, the far edge of the
 *  city (cut by the camera's far plane at 1200 m) all but horizon colour, so the map's distant blocks recede. */
const FOG_NEAR = 300;
const FOG_FAR = 1150;
const DISC_DISTANCE = 900;
const DISC_SIZE = 2 * DISC_DISTANCE * Math.tan((6 * Math.PI) / 180);
/** In the building overview the camera looks down on the complex and the real sky is out of
 *  the picture, so the sun is drawn crossing the picture above the apartments instead: it
 *  rises at the left edge, arcs over the towers at midday and sets at the right edge, whichever
 *  way the view is turned, passing behind the towers. Where the arc runs, as shares of the half-width and half-height of
 *  the view (0 = centre, 1 = edge), and the size of the disc with its glow (a share of the
 *  screen height, so it is always the same size). */
const ARC_X = 0.82;
const ARC_LOW = 0.42;
const ARC_RISE = 0.36;
const DOME_DISC = 0.36;
/** How far beyond the middle of the complex the sun is drawn (metres): past the farthest tower,
 *  but still above the ground behind it. */
const BEHIND = 70;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Pale at the horizon, blue overhead, brighter around the sun; warmer when the sun is low. */
/** The sun itself is not drawn: only its light and the shadows it casts show where it is.
 *  Set to true to bring the visible sun disc back. */
const SHOW_SUN_DISC = false;

/**
 * The mountains round Ulaanbaatar's valley, drawn in the sky so they sit infinitely far away: Bogd Khan
 * Uul high along the south, lower hills to the north and north-east, the valley open to the east and
 * west. ponytail: the crest is a hand-shaped approximation of those bearings (a few degrees high, as
 * seen from the city), not elevation data; swap in a sampled profile if it ever needs to be exact.
 */
const MOUNTAINS = /* glsl */ `
  float bump(float a, float c, float w) {
    float d = atan(sin(a - c), cos(a - c));
    return exp(-d * d / (2.0 * w * w));
  }
  // height of the crest above the horizon (radians) at a true compass bearing (radians, 0 north, clockwise)
  float crest(float b) {
    float r = 0.008
      + 0.055 * bump(b, 3.14159, 0.55)   // Bogd Khan Uul, south
      + 0.036 * bump(b, -0.35, 0.45)     // the hills to the north-north-west
      + 0.016 * bump(b, 1.20, 0.30);     // east-north-east
    r += 0.0055 * sin(b * 7.0 + 1.3) + 0.0035 * sin(b * 13.0 + 0.4) + 0.0020 * sin(b * 31.0 + 2.1) + 0.0010 * sin(b * 67.0 + 0.7);
    return max(r, 0.004);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 sunDir;
  uniform float low;
  uniform float brightness;
  uniform float night;
  uniform float north;
  uniform float foot;
  varying vec3 vDir;
  ${MOUNTAINS}
  void main() {
    vec3 dir = normalize(vDir);
    float h = max(dir.y, 0.0);
    vec3 horizon = mix(vec3(0.80, 0.87, 0.94), vec3(0.95, 0.82, 0.70), low * 0.7);
    vec3 zenith = mix(vec3(0.36, 0.56, 0.82), vec3(0.46, 0.56, 0.75), low * 0.5);
    vec3 col = mix(horizon, zenith, pow(h, 0.55));
    float d = max(dot(dir, sunDir), 0.0);
    col += vec3(1.0, 0.90, 0.72) * (pow(d, 8.0) * (0.05 + 0.1 * low));
    // the mountains: blue-grey, the side facing the sun a little lighter, hazier towards their foot. The
    // foot starts where the ground stops (the camera's far plane, below the horizon by the camera's height:
    // foot), so they stand on the hazy far city instead of floating over a strip of sky
    float bearing = atan(dir.x, -dir.z) - north;
    float el = asin(clamp(dir.y, -1.0, 1.0));
    float top = crest(bearing);
    float m = (1.0 - smoothstep(top - 0.0012, top + 0.0012, el)) * smoothstep(foot - 0.006, foot, el);
    float t = clamp((el - foot) / (top - foot), 0.0, 1.0);
    vec3 rock = mix(vec3(0.40, 0.45, 0.50), vec3(0.56, 0.60, 0.66), t);
    float lit = 0.5 + 0.5 * dot(normalize(dir.xz + 1e-5), normalize(sunDir.xz + 1e-5));
    rock *= 0.88 + 0.22 * lit;
    rock = mix(rock, horizon, mix(0.86, 0.42, smoothstep(0.0, 0.75, t)));
    col = mix(col, rock, m);
    vec3 nightCol = mix(vec3(0.17, 0.22, 0.34), vec3(0.04, 0.07, 0.16), pow(h, 0.5));
    nightCol = mix(nightCol, vec3(0.08, 0.10, 0.16), m);
    col = mix(col, nightCol, night);
    col *= mix(0.75, 1.0, clamp(brightness, 0.0, 1.0)) + max(brightness - 1.0, 0.0) * 0.15;
    gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
  }
`;

type Stop = [number, string];
/** Real sun in the sky: small white-hot core and a faint glow. */
const SKY_SUN: Stop[] = [
  [0, 'rgba(255,255,255,1)'],
  [0.085, 'rgba(255,255,253,1)'],
  [0.105, 'rgba(255,248,222,0.7)'],
  [0.18, 'rgba(255,236,190,0.28)'],
  [0.4, 'rgba(255,225,170,0.08)'],
  [1, 'rgba(255,220,160,0)'],
];
/** Sun over the apartments: a golden glow so it stands out against white walls and pale sky. */
const DOME_SUN: Stop[] = [
  [0, 'rgba(255,255,250,1)'],
  [0.13, 'rgba(255,246,200,1)'],
  [0.17, 'rgba(255,214,95,0.9)'],
  [0.3, 'rgba(255,196,70,0.38)'],
  [0.6, 'rgba(255,185,70,0.1)'],
  [1, 'rgba(255,180,70,0)'],
];

/** Round sun texture from a list of radial colour stops. */
function sunTexture(stops: Stop[]) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Unit vector pointing from the scene towards the sun. Site frame: x = east (u), z = -north (v). */
export function sunDirection({ azimuth, elevation }: Pick<SunSettings, 'azimuth' | 'elevation'>) {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)] as const;
}

/**
 * Sun (a shadow-casting directional light) plus sky and ambient fill. The fill gets weaker and
 * the sunlight warmer as the sun drops towards the horizon; below the horizon the sunlight
 * fades out and the sky turns to night.
 */
/** Fill lights are halved: the sky HDRI in BuildingScene supplies the rest. */
const FILL = 0.55;

export function Sun({ sun, overview = false }: { sun: SunSettings; overview?: boolean }) {
  const light = useRef<DirectionalLight>(null);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(...CENTER);
    return o;
  }, []);

  // the site plan is drawn turned 10.71° from true north (site.json, from the surveyed DWG), so
  // a true compass direction is turned by that much to match the plan's frame
  const azimuth = sun.azimuth + site.rotation;
  const [dx, dy, dz] = sunDirection({ azimuth, elevation: sun.elevation });
  // the light itself never goes below 2°, it fades out instead
  const [lx, ly, lz] = sunDirection({ azimuth, elevation: Math.max(sun.elevation, 2) });
  const low = 1 - Math.min(1, Math.max(sun.elevation, 0) / 35); // 1 at the horizon, 0 from 35° up
  const day = smoothstep(-4, 4, sun.elevation); // 0 at night, 1 by day
  const up = sun.elevation > -1;
  const b = sun.brightness;
  const sunColor = `rgb(255, ${Math.round(250 - 60 * low)}, ${Math.round(240 - 110 * low)})`;

  const texture = useMemo(() => sunTexture(SKY_SUN), []);
  const domeTexture = useMemo(() => sunTexture(DOME_SUN), []);
  const sky = useRef<Group>(null);
  const skyMat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ sunDir: { value: new Vector3() }, low: { value: 0 }, brightness: { value: 1 }, night: { value: 0 }, north: { value: (site.rotation * Math.PI) / 180 }, foot: { value: 0 } }),
    [],
  );
  // haze: the city fades into the sky's own horizon colour (the shader's, in the same sRGB values) from a
  // few hundred metres out, so it melts into the distance instead of stopping at the camera's far plane
  const fog = useMemo(() => new Fog('#ffffff', FOG_NEAR, FOG_FAR), []);
  {
    const k = low * 0.7;
    const s = Math.min(1, Math.max(0, b)) * 0.25 + 0.75 + Math.max(b - 1, 0) * 0.15;
    const n = 1 - day;
    const ch = (dayC: number, nightC: number) => Math.min(1, (dayC + (nightC - dayC) * n) * s);
    fog.color.setRGB(ch(0.8 + 0.15 * k, 0.17), ch(0.87 - 0.05 * k, 0.22), ch(0.94 - 0.24 * k, 0.34), SRGBColorSpace);
  }
  uniforms.sunDir.value.set(dx, dy, dz);
  uniforms.low.value = low;
  uniforms.brightness.value = b;
  uniforms.night.value = 1 - day;
  // lights come on in the shops, offices and homes as the sun gets low, full by dusk
  interiorNight.value = nightFactor(sun.elevation);

  // the overview sun: placed in front of the camera each frame, at the distance of the complex
  const arcSun = useRef<Sprite>(null);
  const f = sun.dayFraction;
  const showArc = overview && up && f !== undefined && f >= 0 && f <= 1;
  const right = useMemo(() => new Vector3(), []);
  const upV = useMemo(() => new Vector3(), []);
  const fwd = useMemo(() => new Vector3(), []);

  // keep the sky centred on the camera, so the sun sits at the same angle from every viewpoint
  useFrame(({ camera }) => {
    sky.current?.position.copy(camera.position);
    // the dome's material holds its own copy of the uniforms: hand the current values over
    const u = skyMat.current?.uniforms;
    if (u && u !== uniforms) {
      u.sunDir.value.copy(uniforms.sunDir.value);
      u.low.value = uniforms.low.value;
      u.brightness.value = uniforms.brightness.value;
      u.night.value = uniforms.night.value;
      u.north.value = uniforms.north.value;
    }
    if (u) {
      // how far below the horizon the ground stops: at the camera's far plane (1200 m), seen from its height
      const cam = camera as PerspectiveCamera;
      u.foot.value = -Math.atan2(Math.max(cam.position.y, 0), cam.far * 0.97);
    }
    const disc = arcSun.current;
    if (!disc || !showArc || f === undefined) return;
    const cam = camera as PerspectiveCamera;
    // drawn a little beyond the far side of the complex, so the towers pass in front of it
    const distance = cam.position.distanceTo(SITE_CENTER) + BEHIND;
    const halfH = distance * Math.tan(((cam.fov ?? 30) * Math.PI) / 360);
    const halfW = halfH * (cam.aspect ?? 1);
    cam.getWorldDirection(fwd);
    right.setFromMatrixColumn(cam.matrixWorld, 0);
    upV.setFromMatrixColumn(cam.matrixWorld, 1);
    disc.position
      .copy(cam.position)
      .addScaledVector(fwd, distance)
      .addScaledVector(right, (f * 2 - 1) * ARC_X * halfW)
      .addScaledVector(upV, (ARC_LOW + ARC_RISE * Math.sin(Math.PI * f)) * halfH);
  });

  useLayoutEffect(() => {
    if (light.current) light.current.target = target;
  }, [target]);

  return (
    <>
      <primitive object={target} />
      <primitive object={fog} attach="fog" />
      <group ref={sky}>
        {/* sky dome */}
        <mesh renderOrder={-2} frustumCulled={false}>
          <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
          <shaderMaterial ref={skyMat} side={BackSide} depthWrite={false} uniforms={uniforms} vertexShader={SKY_VERTEX} fragmentShader={SKY_FRAGMENT} />
        </mesh>
        {/* the sun itself: a glowing disc that buildings and trees pass in front of */}
        <sprite visible={SHOW_SUN_DISC && !overview && up} position={[dx * DISC_DISTANCE, dy * DISC_DISTANCE, dz * DISC_DISTANCE]} scale={[DISC_SIZE, DISC_SIZE, 1]} renderOrder={-1} frustumCulled={false}>
          <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} fog={false} />
        </sprite>
      </group>
      {/* the sun over the apartments, for the overview */}
      <sprite
        ref={arcSun}
        name="DomeSun"
        visible={SHOW_SUN_DISC && showArc}
        frustumCulled={false}
        scale={[DOME_DISC, DOME_DISC, 1]}
        renderOrder={10}
      >
        {/* behind the buildings, so a tower hides it when it passes; constant size on screen */}
        <spriteMaterial map={domeTexture} transparent depthWrite={false} toneMapped={false} fog={false} sizeAttenuation={false} />
      </sprite>
      <ambientLight color={day < 1 ? '#c9d4ee' : '#ffffff'} intensity={(0.28 + (0.27 + 0.35 * (1 - low)) * day) * b * FILL} />
      <hemisphereLight args={['#ffffff', '#c3ccd6', (0.18 + (0.27 + 0.25 * (1 - low)) * day) * b * FILL]} />
      <directionalLight
        ref={light}
        castShadow
        color={sunColor}
        intensity={(1.6 + 0.8 * (1 - low)) * day * b}
        position={[CENTER[0] + lx * DISTANCE, CENTER[1] + ly * DISTANCE, CENTER[2] + lz * DISTANCE]}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-REACH}
        shadow-camera-right={REACH}
        shadow-camera-top={REACH}
        shadow-camera-bottom={-REACH}
        shadow-camera-near={1}
        shadow-camera-far={DISTANCE * 2}
      />
    </>
  );
}
