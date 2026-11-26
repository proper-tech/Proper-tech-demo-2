// Smaller copies of the drone's views, made from the originals before `dev` and `build`:
//
// 1. Half-size spheres: public/views/4k/<name>, 4096 × 2048 beside the 8192 × 4096 originals, and
//    public/views/manifest-4k.json, the manifest pointing at them. An 8192 sphere is 1.5-2 MB to download and
//    128 MB of GPU memory once drawn, more than many phones allow for one texture (three.js then shrinks it on the
//    main thread first). The tours' own rooms are 4096 wide, so the view through their windows needs no more than
//    that: the apartment page hands the tour manifest-4k.json (the tour's ?views=). The 360° views take the copy
//    on phones, and on larger screens show it first and swap in the original when it has arrived
//    (src/data/views.ts, smallSrc).
// 2. Window-view thumbnails: public/views/thumbs/<facing>-<floor>.webp, 640 × 360, the winter photograph of each
//    apartment facing and floor (public/views/window/manifest.json), for the apartment page's link to its view
//    (src/data/views.ts, windowThumb). The originals are 2560 wide and up to half a megabyte.
//
// Only copies whose original is newer are made again, so after the first run it costs nothing. Never stops a
// build: a failure only warns, and the views fall back to the originals.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const VIEWS = join('public', 'views');

/** Writes `to` from `from` with `make(sharp(from))` unless `to` is already newer; true if it wrote. */
async function remake(sharp, from, to, make) {
  if (!existsSync(from)) return false;
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) return false;
  await make(sharp(from)).toFile(to);
  return true;
}

/** Deletes the files in `dir` that are not in `wanted` (copies of originals that are gone). */
function prune(dir, wanted) {
  for (const f of readdirSync(dir)) if (!wanted.has(f)) rmSync(join(dir, f));
}

try {
  const sharp = (await import('sharp')).default;

  // 1. half-size spheres and their manifest
  const OUT = join(VIEWS, '4k');
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
  let spheres = 0;
  for (const src of files) {
    const made = await remake(sharp, join('public', src), join(OUT, basename(src)), (img) => {
      img = img.resize(4096, 2048, { kernel: 'lanczos3' });
      return src.endsWith('.webp') ? img.webp({ quality: 82 }) : img.jpeg({ quality: 86, progressive: true, mozjpeg: true });
    });
    if (made) spheres++;
  }
  prune(OUT, new Set([...files].map((s) => basename(s))));
  writeFileSync(join(VIEWS, 'manifest-4k.json'), JSON.stringify(out, null, 1) + '\n');

  // 2. window-view thumbnails
  const THUMBS = join(VIEWS, 'thumbs');
  const windows = JSON.parse(readFileSync(join(VIEWS, 'window', 'manifest.json'), 'utf8')).views ?? {};
  mkdirSync(THUMBS, { recursive: true });
  const thumbs = new Set();
  let made = 0;
  for (const [facing, floors] of Object.entries(windows)) {
    for (const [floor, entry] of Object.entries(floors)) {
      if (!entry.seasons?.winter) continue;
      const name = `${facing}-${String(floor).padStart(2, '0')}.webp`;
      thumbs.add(name);
      if (await remake(sharp, join('public', entry.seasons.winter), join(THUMBS, name), (img) => img.resize(640, 360).webp({ quality: 74 }))) made++;
    }
  }
  prune(THUMBS, thumbs);

  if (spheres || made) console.log(`view-variants: made ${spheres} half-size sphere(s) and ${made} window thumbnail(s)`);
} catch (error) {
  console.warn('view-variants: could not make the smaller views:', error.message);
}
