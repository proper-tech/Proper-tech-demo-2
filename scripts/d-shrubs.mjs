// Plants block D's hedges: the leafy hedge shrub of the surroundings model (environment.glb,
// Env_HedgeShrub), so both look the same, in two rows in front of block D's east face and its core.
// Run after build-model.py has written D.glb (its "D Landscape" has the lamps only):
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf
//   node scripts/d-shrubs.mjs public/models/blocks/D.glb public/models/blocks/environment.glb src/data/site.json public/models/blocks/D.glb
// (set DRACO=1 to compress the result). Then swap block D into complex.glb as before.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, prune, draco, unpartition } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const [dIn, envIn, siteJson, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(dIn);
const env = await io.read(envIn);
const root = doc.getRoot();
const land = root.listNodes().find((n) => n.getName() === 'D Landscape');
for (const p of land.getMesh().listPrimitives()) if (p.getMaterial()?.getName() === 'Hedge') p.dispose();
for (const m of root.listMaterials()) if (m.getName() === 'Hedge') m.dispose();
const src = env.getRoot().listNodes().find((n) => n.getName() === 'Env_HedgeShrub_1_01').getMesh();
const map = copyToDocument(doc, env, [src]);
const shrub = map.get(src);
shrub.setName('D Shrub');

// block metres -> site plan, as d_frame() in build-model.py
const A = JSON.parse(fs.readFileSync(siteJson, 'utf8')).annex.map(([x, y]) => ({ x, y }));
const by = (f, s) => A.reduce((a, b) => (s * f(b) > s * f(a) ? b : a));
const sw = by((p) => p.x + p.y, -1), se = by((p) => p.x - p.y, 1), nw = by((p) => p.x - p.y, -1);
const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
const e = unit(sw, se), n = unit(sw, nw), W = 0.45;
const o = { x: sw.x + (e.x + n.x) * W, y: sw.y + (e.y + n.y) * W };
const at = (x, y) => [o.x + e.x * x + n.x * y, o.y + e.y * x + n.y * y];
const angle = Math.atan2(e.y, e.x);

// same rows as build_annex_site(), shrubs a metre apart like the surroundings' hedges
let seed = 7;
const rnd = (a, b) => { seed = (seed * 16807) % 2147483647; return a + ((seed - 1) / 2147483646) * (b - a); };
const doors = [[2.1, 3.5], [12.1, 14.5], [25.9, 27.9]];
let i = 0;
const row = (x, y0, y1) => {
  for (let y = y0; y <= y1 + 1e-6; y += 1.05) {
    if (doors.some(([d0, d1]) => d0 - 0.3 < y && y < d1 + 0.3)) continue;
    const [u, v] = at(x, y);
    const s = rnd(0.95, 1.1), h = s * rnd(0.94, 1.08), yaw = angle + rnd(0, Math.PI * 2);
    const node = doc.createNode(`D Shrub ${String(++i).padStart(2, '0')}`)
      .setMesh(shrub)
      .setTranslation([u, 0, -v])
      .setRotation([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)])
      .setScale([s, h, s]);
    land.addChild(node);
  }
};
row(18 + W + 1.0, 0.6, 19.0);
row(21.2 + 0.9, 20.3, 30.0);
console.log('shrubs', i);
await doc.transform(unpartition(), prune(), ...(process.env.DRACO ? [draco()] : []));
await io.write(out, doc);
