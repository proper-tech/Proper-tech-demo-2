// Run after export_a1_web.py: node scripts/lighten-interior.mjs public/models/interior/A1.glb public/models/interior/A1.glb
// Lighten a furnished interior for the top-down floor view: shelf/chiller stock instances become
// one box each, the product source models are dropped, plants simplified, glass made a plain
// transparent material (no transmission pass), textures at most 256 px.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress, simplifyPrimitive, draco, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
const [,, src, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(src); const root = doc.getRoot();
await MeshoptSimplifier.ready;
const tri = (p) => (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
// unit box with per-face UVs: 24 verts, 12 tris
function boxPrim(min, max, material) {
  const P = [], N = [], U = [], I = [];
  const faces = [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]];
  for (const [ax, s] of faces) {
    const a = (ax + 1) % 3, b = (ax + 2) % 3, base = P.length / 3;
    for (const [ua, ub] of [[0,0],[1,0],[1,1],[0,1]]) {
      const v = [0,0,0]; v[ax] = s > 0 ? max[ax] : min[ax]; v[a] = ua ? max[a] : min[a]; v[b] = ub ? max[b] : min[b];
      P.push(...v); const n=[0,0,0]; n[ax]=s; N.push(...n); U.push(s>0?ua:1-ua, 1-ub);
    }
    if (s > 0) I.push(base, base+1, base+2, base, base+2, base+3); else I.push(base, base+2, base+1, base, base+3, base+2);
  }
  const buf = root.listBuffers()[0];
  const acc = (arr, type, T) => doc.createAccessor().setArray(new T(arr)).setType(type).setBuffer(buf);
  return doc.createPrimitive().setAttribute('POSITION', acc(P,'VEC3',Float32Array)).setAttribute('NORMAL', acc(N,'VEC3',Float32Array))
    .setAttribute('TEXCOORD_0', acc(U,'VEC2',Float32Array)).setIndices(acc(I,'SCALAR',Uint16Array)).setMaterial(material);
}
let before = 0, after = 0;
const boxed = new Map();
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  const gi = n.getExtension('EXT_mesh_gpu_instancing');
  const k = gi ? gi.getAttribute('TRANSLATION')?.getCount() || 1 : 1;
  for (const p of m.listPrimitives()) before += tri(p) * k;
  if (gi && /Stock|Produce/.test(n.getName())) {
    if (!boxed.has(m)) {
      const min=[1e9,1e9,1e9], max=[-1e9,-1e9,-1e9]; let mat=null, big=-1;
      for (const p of m.listPrimitives()) { const pa=p.getAttribute('POSITION'); const lo=pa.getMin([]), hi=pa.getMax([]);
        for (let i=0;i<3;i++){min[i]=Math.min(min[i],lo[i]); max[i]=Math.max(max[i],hi[i]);}
        if (tri(p) > big) { big = tri(p); mat = p.getMaterial(); } }
      const nm = doc.createMesh(m.getName()).addPrimitive(boxPrim(min, max, mat));
      boxed.set(m, nm);
    }
    n.setMesh(boxed.get(m));
  } else if (/^P\d{3}_/.test(n.getName())) { n.dispose(); continue; }
  else for (const p of m.listPrimitives()) if (tri(p) > 3000) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.12, error: 0.02, lockBorder: false });
  for (const p of (n.getMesh()?.listPrimitives() || [])) after += tri(p) * k;
}
// glass: plain alpha blend instead of a transmission pass; drop costly material extensions
for (const mat of root.listMaterials()) {
  const t = mat.getExtension('KHR_materials_transmission');
  if (t) { const c = mat.getBaseColorFactor(); mat.setBaseColorFactor([c[0], c[1], c[2], Math.min(c[3], 0.25)]).setAlphaMode('BLEND'); mat.setExtension('KHR_materials_transmission', null); }
  for (const e of ['KHR_materials_clearcoat','KHR_materials_anisotropy','KHR_materials_specular','KHR_materials_ior']) mat.setExtension(e, null);
}
for (const e of root.listExtensionsUsed()) if (/transmission|clearcoat|anisotropy|specular|materials_ior/.test(e.extensionName)) e.dispose();
await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [256, 256], quality: 78 }), prune(), draco());
await io.write(out, doc);
console.log('tris drawn', Math.round(before), '->', Math.round(after), 'meshes', root.listMeshes().length, 'materials', root.listMaterials().length, 'textures', root.listTextures().length);
