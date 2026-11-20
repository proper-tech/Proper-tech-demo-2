// Shrink a 3D model for the website: textures to at most MAXTEX px WebP, the MakeHuman people and
// other heavy meshes (cars, trees) simplified, bone channels that never move dropped, Draco geometry.
// Run after exporting from Blender (needs: npm i -D @gltf-transform/core @gltf-transform/extensions
// @gltf-transform/functions meshoptimizer sharp draco3dgltf):
//   node scripts/optimize-glb.mjs public/models/blocks/environment.glb public/models/blocks/environment.glb 512 0.25
//   node scripts/optimize-glb.mjs public/models/complex.glb public/models/complex.glb 1024 0.25
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, simplifyPrimitive, draco, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
const [,, src, out, maxTex, ratio] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(src);
await MeshoptSimplifier.ready;
const tri = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
const people = new Set();
for (const n of doc.getRoot().listNodes()) if (n.getSkin() && n.getMesh()) people.add(n.getMesh());
let b = 0, a = 0;
for (const m of people) for (const p of m.listPrimitives()) {
  b += tri(p);
  if (tri(p) > 400) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.004, lockBorder: true });
  a += tri(p);
}
// other heavy meshes (cars, trees): seen from far away in the site view
let hb = 0, ha = 0;
for (const m of doc.getRoot().listMeshes()) {
  if (people.has(m)) continue;
  for (const p of m.listPrimitives()) if (tri(p) > 6000) { hb += tri(p); simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.15, error: 0.012, lockBorder: false }); ha += tri(p); }
}
console.log('heavy tris', Math.round(hb), '->', Math.round(ha));
// walk cycles: drop the channels of bones that never move (most of a MakeHuman rig)
let dropped = 0;
for (const anim of doc.getRoot().listAnimations()) for (const ch of anim.listChannels()) {
  const out = ch.getSampler().getOutput().getArray(); const k = ch.getSampler().getOutput().getElementSize();
  let still = true;
  for (let i = k; i < out.length && still; i++) if (Math.abs(out[i] - out[i % k]) > 1e-4) still = false;
  if (still) { const node = ch.getTargetNode(), path = ch.getTargetPath(), v = Array.from(out.slice(0, k));
    if (node && path === 'rotation') node.setRotation(v); if (node && path === 'translation') node.setTranslation(v); if (node && path === 'scale') node.setScale(v);
    ch.dispose(); dropped++; }
}
console.log('static channels dropped', dropped);
await doc.transform(resample(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+maxTex, +maxTex], quality: 80 }), prune(), draco());
await io.write(out, doc);
console.log(out.split('/').pop(), 'people tris', Math.round(b), '->', Math.round(a));
