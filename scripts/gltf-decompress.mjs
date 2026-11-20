// Writes a copy of a GLB without Draco / meshopt compression, for tools that cannot read them
// (e.g. a Blender build without the Draco library): node scripts/gltf-decompress.mjs in.glb out.glb
// Needs: npm i -D @gltf-transform/core @gltf-transform/extensions draco3dgltf meshoptimizer
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
const [inp, out] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(), 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
for (const e of doc.getRoot().listExtensionsUsed()) if (/draco|meshopt/i.test(e.extensionName)) e.dispose();
await io.write(out, doc);
console.log('ok', out);
