import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three';

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
