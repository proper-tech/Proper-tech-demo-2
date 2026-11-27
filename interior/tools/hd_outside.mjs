// Fills the band under a drone 360° photo for the photographic tours' windows (see hd_tours.mjs).
//
// The drone's photos stop some 20° below the horizon and are flat colour below that, which tall windows (balcony glass
// reaches 46° down) showed as a brown block. An image model repainted the whole photo with the band filled in; this
// keeps every real pixel of the photo and takes the model's only where the photo is the flat fill, blended over 24 px.
// Only the tours use the result: the views pages keep the real photo.
//
// The photos also stop some 11-14° above the horizon ("top" in the manifest), which cuts the nearby towers off flat
// on the lower floors (4-13). With --top <degrees>, the repainted picture has those towers finished upwards, and this
// keeps the photo below 2° under that edge (the faded rows just under it go too) and takes the repainted one above,
// blended over 1°.
//
// Run from the repository root:
//   node interior/tools/hd_outside.mjs <drone photo> <repainted.png> interior/hd/outside/<name>.jpg
//   node interior/tools/hd_outside.mjs interior/hd/outside/<name>.jpg <repainted.png> interior/hd/outside/<name>.jpg --top 14
import sharp from 'sharp';

const [photo, painted, out, flag, topArg] = process.argv.slice(2);
const { data: p, info } = await sharp(photo).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const g = await sharp(painted).resize(W, H, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
if (flag === '--top') {
  // rows from the top down to the blend: lat = 90 - y / H * 180
  const row = (lat) => Math.round((90 - lat) / 180 * H);
  const from = row(Number(topArg) - 2), to = row(Number(topArg) - 3);
  const o = Buffer.from(p);
  for (let y = 0; y < to; y++) {
    const t = y <= from ? 1 : 1 - (y - from) / (to - from);
    for (let i = y * W * 3, e = (y + 1) * W * 3; i < e; i++) o[i] = Math.round(p[i] * (1 - t) + g[i] * t);
  }
  await sharp(o, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(out + '.tmp');
  const { renameSync } = await import('node:fs');
  renameSync(out + '.tmp', out);
  console.log(out, 'top above', topArg);
  process.exit(0);
}
const fill = [0, 1, 2].map((c) => p[((H - 3) * W + (W >> 1)) * 3 + c]);
const isFill = (i) => Math.abs(p[i * 3] - fill[0]) + Math.abs(p[i * 3 + 1] - fill[1]) + Math.abs(p[i * 3 + 2] - fill[2]) < 14;
const F = 24;
const o = Buffer.from(p);
for (let x = 0; x < W; x++) {
  // the last real row of this column, below the horizon
  let edge = H >> 1;
  for (let y = H >> 1; y < H; y++) if (!isFill(y * W + x)) edge = y;
  for (let y = edge - F; y < H; y++) {
    const t = y <= edge - F ? 0 : y >= edge + 4 ? 1 : (y - (edge - F)) / (F + 4);
    const i = (y * W + x) * 3;
    for (let c = 0; c < 3; c++) o[i + c] = Math.round(p[i + c] * (1 - t) + g[i + c] * t);
  }
}
await sharp(o, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(out);
console.log(out, W, 'x', H);
