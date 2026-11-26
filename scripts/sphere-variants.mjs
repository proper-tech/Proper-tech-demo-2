// Half-size copies of the drone's 360° spheres: public/views/4k/<name>, 4096 × 2048 beside the 8192 × 4096
// originals, and public/views/manifest-4k.json, the manifest pointing at them.
//
// Why: an 8192 sphere is 1.5-2 MB to download and 128 MB of GPU memory once drawn, more than many phones allow
// for one texture (three.js then shrinks it on the main thread first). The tours' own rooms are 4096 wide, so
// the view through their windows needs no more than that: the apartment page hands the tour manifest-4k.json
// (the tour's ?views=). The 360° views take the copy on phones, and on larger screens show it first and swap
// in the original when it has arrived (src/data/views.ts, smallSrc).
//
// Runs before `dev` and `build`; only copies whose original is newer are made again, so after the first run
// it costs nothing. Never stops a build: a failure only warns, and the views fall back to the originals.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const VIEWS = join('public', 'views');
const OUT = join(VIEWS, '4k');
const SMALL_W = 4096;

try {
  const sharp = (await import('sharp')).default;
  const manifest = JSON.parse(readFileSync(join(VIEWS, 'manifest.json'), 'utf8'));
  const small = (src) => src.replace(/^\/views\//, '/views/4k/');
  const files = new Set();
  const swap = (entry) => {
    files.add(entry.src);
    for (const s of Object.values(entry.seasons ?? {})) files.add(s);
    return { ...entry, src: small(entry.src), seasons: Object.fromEntries(Object.entries(entry.seasons ?? {}).map(([k, s]) => [k, small(s)])) };
  };
  const out = Object.fromEntries(Object.entries(manifest).map(([tower, floors]) => [tower, Object.fromEntries(Object.entries(floors).map(([f, e]) => [f, swap(e)]))]));

  mkdirSync(OUT, { recursive: true });
  let made = 0;
  for (const src of files) {
    const from = join('public', src);
    const to = join(OUT, basename(src));
    if (!existsSync(from)) continue;
    if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) continue;
    const img = sharp(from).resize(SMALL_W, SMALL_W / 2, { kernel: 'lanczos3' });
    await (from.endsWith('.webp') ? img.webp({ quality: 82 }) : img.jpeg({ quality: 86, progressive: true, mozjpeg: true })).toFile(to);
    made++;
  }
  // copies of spheres the manifest no longer lists
  const wanted = new Set([...files].map((s) => basename(s)));
  for (const f of readdirSync(OUT)) if (!wanted.has(f)) rmSync(join(OUT, f));
  writeFileSync(join(VIEWS, 'manifest-4k.json'), JSON.stringify(out, null, 1) + '\n');
  if (made) console.log(`sphere-variants: made ${made} half-size sphere${made === 1 ? '' : 's'} in ${OUT}`);
} catch (error) {
  console.warn('sphere-variants: could not make the half-size spheres:', error.message);
}
