import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AnimationMixer, type AnimationClip, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

/** Hair, eyebrows and eyelashes (gaps between the strands), and the eyes (a clear cornea over the iris). */
const CUTOUT = /eyebrow|eyelash|high-poly|^Human\.(short|long|bob|ponytail|braid|afro)\d/i;

/**
 * The people (MakeHuman figures, materials named "Human.*") come out of Blender with every
 * material set to alpha blending. three.js draws blended materials without writing depth, so
 * nothing hides what is behind it: the eyes and hair showed through the face and the skin
 * through the trousers. Skin, clothes and shoes have no transparency in their textures,
 * so they are made opaque; hair, eyebrows, eyelashes and the eyes keep their gaps as a cut-out
 * (alpha test, smoothed by alpha-to-coverage), and all of them write depth again.
 */
export function fixPeople(root: Object3D) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
      if (!m.name.startsWith('Human.') || m.userData.peopleFixed) continue;
      const cutout = CUTOUT.test(m.name);
      m.transparent = false;
      m.depthWrite = true;
      m.alphaTest = cutout ? 0.5 : 0;
      m.alphaToCoverage = cutout;
      if (!cutout) (m as MeshStandardMaterial).opacity = 1;
      m.userData.peopleFixed = true;
      m.needsUpdate = true;
    }
  });
}

/**
 * Plays the people's motion. The walk cycles and idle poses are keyframed in Blender
 * (A.blend for the roof garden, environment.blend for the street): one looping clip per
 * person, all started together. Without this the figures stand in their T-shaped rest pose.
 * `root` must be the object the clips were loaded with, or a SkeletonUtils clone of it
 * (a plain clone keeps the original bones, so it would not move).
 */
export function usePeopleMotion(root: Object3D | null, clips: AnimationClip[]) {
  const mixer = useMemo(() => (root ? new AnimationMixer(root) : null), [root]);
  useEffect(() => {
    if (!mixer || !root) return;
    for (const clip of clips) {
      if (/^(Walk|Idle)_/.test(clip.name)) mixer.clipAction(clip).play();
    }
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    };
  }, [mixer, root, clips]);
  // capped so a background tab coming back does not jump the walkers across the site
  useFrame((_, dt) => mixer?.update(Math.min(dt, 0.1)));
}
