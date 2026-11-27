// Readies one repainted panorama for interior/hd/<plan>/ (see hd_tours.mjs): blends its 360° join and finds its
// window glass.
//
// The panoramas are repainted by an image model from the published renders (public/tour/<plan>, D, F and E), asked
// to keep every edge where it was and to paint the window glass flat white. The model's left and right edges do not
// quite meet, which shows as a seam behind the viewer; the step across it is shared out over 48 px each side, row by
// row (smoothed over 15 rows so it leaves no streaks). The glass is the flat white within 40 px of the render's own
// glass mask, so nothing else in the room that happens to be white is taken for glass. A window the model did not
// paint pure white (the far one at the end of plan D's living room, seen down the corridor) keeps the render's mask
// in the columns given as KEEP=x0-x1.
//
// Run from the repository root:
//   [KEEP=1800-2200] node interior/tools/hd_prepare.mjs <repainted.png|jpg> <render's window mask|-> <out.jpg> [<out-glass.png>]
import sharp from 'sharp';

const [input, maskFile, out, glassOut] = process.argv.slice(2);
const keep = process.env.KEEP ? process.env.KEEP.split('-').map(Number) : null;
const W = 4096, H = 2048, N = W * H;

const p = await sharp(input).resize(W, H, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();

// the join
{
  const B = 48, d = new Float32Array(H * 3), s = new Float32Array(H * 3);
  for (let y = 0; y < H; y++) for (let c = 0; c < 3; c++) d[y * 3 + c] = p[y * W * 3 + c] - p[(y * W + W - 1) * 3 + c];
  for (let y = 0; y < H; y++) for (let c = 0; c < 3; c++) {
    let t = 0, n = 0;
    for (let k = -7; k <= 7; k++) { const yy = y + k; if (yy < 0 || yy >= H) continue; t += d[yy * 3 + c]; n++; }
    s[y * 3 + c] = t / n;
  }
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let y = 0; y < H; y++) for (let x = 0; x < B; x++) {
    const w = 0.5 * (1 - x / B);
    for (let c = 0; c < 3; c++) {
      const o = s[y * 3 + c] * w, L = (y * W + x) * 3 + c, R = (y * W + W - 1 - x) * 3 + c;
      p[L] = clamp(p[L] - o);
      p[R] = clamp(p[R] + o);
    }
  }
}
await sharp(p, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 94, chromaSubsampling: '4:4:4' }).toFile(out);

if (glassOut && maskFile && maskFile !== '-') {
  const ref = await sharp(maskFile).resize(W, H).greyscale().raw().toBuffer();
  // where to look: the render's glass grown by 40 px (two running passes per axis)
  const R = 40, old = new Uint8Array(N), tmp = new Uint8Array(N), reg = new Uint8Array(N);
  for (let i = 0; i < N; i++) old[i] = ref[i] > 12 ? 1 : 0;
  for (let y = 0; y < H; y++) {
    let run = -1e9;
    for (let x = 0; x < W; x++) { if (old[y * W + x]) run = x; tmp[y * W + x] = x - run <= R ? 1 : 0; }
    run = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (old[y * W + x]) run = x; if (run - x <= R) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let run = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) run = y; reg[y * W + x] = y - run <= R ? 1 : 0; }
    run = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) run = y; if (run - y <= R) reg[y * W + x] = 1; }
  }
  const g = Buffer.alloc(N);
  let n = 0;
  for (let i = 0; i < N; i++) {
    let v = 0;
    if (reg[i]) v = Math.max(0, Math.min(1, (Math.min(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) - 228) / 20)) * 255;
    const x = i % W;
    if (keep && x >= keep[0] && x < keep[1]) v = Math.max(v, ref[i]);
    g[i] = Math.round(v);
    if (v > 127) n++;
  }
  // a faint blur so the glass edge is not stair-stepped
  await sharp(g, { raw: { width: W, height: H, channels: 1 } }).blur(0.7).png().toFile(glassOut);
  console.log(out, 'glass pixels', n);
} else console.log(out, 'no windows');
