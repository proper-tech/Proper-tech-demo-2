'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LinearFilter, MathUtils, SRGBColorSpace, SphereGeometry, TextureLoader, Vector3, type PerspectiveCamera, type Texture } from 'three';
import { SafeCanvas } from './SafeCanvas';
import { smallSrc, wantsFullSphere } from '@/data/views';

/** Where the visitor looks: compass heading and pitch in degrees, vertical field of view in degrees. */
export type Look = { heading: number; pitch: number; fov: number };

// The spheres have true north in the middle. On three's sphere, turned inside out as in PanoTour, the middle
// of the picture lies along -x and a quarter turn to the right of it along -z, so compass heading h looks
// along (-cos h, 0, -sin h) once the sphere's own yaw correction is taken off. (PanoTour's pictures have east
// in the middle, hence its formula is this one a quarter turn on.)
const toDir = (heading: number, pitch: number, out: Vector3) => {
  const h = MathUtils.degToRad(heading);
  const p = MathUtils.degToRad(pitch);
  return out.set(-Math.cos(h) * Math.cos(p), Math.sin(p), -Math.sin(h) * Math.cos(p));
};

function Rig({ look, yaw }: { look: RefObject<Look>; yaw: number }) {
  const { camera } = useThree();
  const dir = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    const { heading, pitch, fov } = look.current!;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(toDir(heading - yaw, pitch, dir));
  });
  return null;
}

/** Half-size spheres kept after leaving them (32 MB of GPU memory each), so going back to a floor or season seen
 *  a moment ago is instant. The full-size one (128 MB) is only ever kept while it is shown. */
const KEEP = 3;

function Sphere({ src, onReady }: { src: string; onReady: (ready: boolean) => void }) {
  const geometry = useMemo(() => {
    const g = new SphereGeometry(50, 96, 64);
    g.scale(-1, 1, 1);
    return g;
  }, []);
  const gl = useThree((s) => s.gl);
  const [texture, setTexture] = useState<Texture | null>(null);
  const kept = useMemo(() => new Map<string, Texture>(), []);
  const shown = useRef<Texture | null>(null);
  shown.current = texture;
  useEffect(() => {
    let live = true;
    const loader = new TextureLoader();
    const prepare = (tex: Texture) => {
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = LinearFilter;
      tex.generateMipmaps = false;
      return tex;
    };
    const keep = (url: string, tex: Texture) => {
      kept.delete(url);
      kept.set(url, tex);
      while (kept.size > KEEP) {
        const [oldest, t] = kept.entries().next().value!;
        kept.delete(oldest);
        // the one on screen goes when it is replaced instead (the effect below)
        if (t !== shown.current) t.dispose();
      }
    };
    // the half-size copy first (quick, and all a phone needs), then on a larger screen the original; the last
    // picture stays until the next one has arrived
    const small = smallSrc(src);
    const full = () => {
      if (!wantsFullSphere(gl.capabilities.maxTextureSize)) return;
      loader.load(src, (tex) => (live ? setTexture(prepare(tex)) : tex.dispose()));
    };
    const hit = kept.get(small);
    if (hit) {
      keep(small, hit);
      setTexture(hit);
      onReady(true);
      full();
    } else {
      onReady(false);
      loader.load(
        small,
        (tex) => {
          if (!live) return tex.dispose();
          keep(small, prepare(tex));
          setTexture(tex);
          onReady(true);
          full();
        },
        undefined,
        // no half-size copy (not made yet): the original alone
        () => live && loader.load(src, (tex) => (live ? (setTexture(prepare(tex)), onReady(true)) : tex.dispose())),
      );
    }
    return () => {
      live = false;
    };
  }, [src, onReady, kept, gl]);
  // a picture is let go once the next one is on screen, unless it is one of the kept half-size ones
  useEffect(() => () => void (texture && ![...kept.values()].includes(texture) && texture.dispose()), [texture, kept]);
  useEffect(
    () => () => {
      geometry.dispose();
      kept.forEach((t) => t.dispose());
    },
    [geometry, kept],
  );
  if (!texture) return null;
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

export default function WindowSphere({ src, yaw, look, onReady }: { src: string; yaw: number; look: RefObject<Look>; onReady: (ready: boolean) => void }) {
  return (
    <SafeCanvas flat dpr={[1, 1.5]} camera={{ fov: 70, near: 0.1, far: 200, position: [0, 0, 0] }}>
      <Sphere src={src} onReady={onReady} />
      <Rig look={look} yaw={yaw} />
    </SafeCanvas>
  );
}
