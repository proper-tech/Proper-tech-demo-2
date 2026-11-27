// Builds the photographic ("HD") 360° tours, public/tour-hd/<plan>/, from the published tours in public/tour/<plan>/
// and the repainted panoramas in interior/hd/<plan>/ (D, F, E; C, A and B are their mirror images).
//
// interior/hd/<plan>/ holds, per room (the tour's key without "D_": entry, living, bed_d3, ...):
//   <room>.jpg                the repainted panorama, 4096 x 2048, its 360° join already blended
//   <room>-glass.png          its window glass (white = glass), where the tour shows the drone's view
//   <room>-<scheme>.jpg       the same room in each interior colour scheme (navy, sage, charcoal), and
//   <room>-<scheme>-glass.png its glass
// A room without its .jpg keeps the published picture.
//
// Each tour is the published page with: the repainted rooms' pictures (WebP, named after a hash of their content,
// so cached copies never go stale), their glass masks, a window.__BAKED__ table of the colour-scheme photos, and
// four small changes to its script, each checked to apply exactly once:
//   - a room with a photo for the chosen colour scheme shows that photo instead of tinting the default one through
//     the colour masks (made for the old renders, they halo round the repainted furniture);
//   - choosing a scheme in such a room loads its photo;
//   - the drone's view uses the glass mask of the photo shown;
//   - the view is drawn as it is, sharp and at its own exposure, with no glass haze or reflection over it.
// Mirrored plans: the picture is the original turned over left to right and half a turn round (as mirror_tour.py
// makes them), so the same is done to the repainted ones.
//
// Run from the repository root: node interior/tools/hd_tours.mjs [plans...]   (default: D F E C A B)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SCHEMES = ['navy', 'sage', 'charcoal'];
const MIRROR = { C: 'D', A: 'F', B: 'E' };
const W = 4096, H = 2048;

/** The picture as a mirrored plan shows it: turned over left to right, then half a turn round. */
async function mirrored(file) {
  const flipped = await sharp(file).flop().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = flipped;
  const half = (info.width / 2) * info.channels;
  const row = info.width * info.channels;
  const out = Buffer.alloc(data.length);
  for (let y = 0; y < info.height; y++) {
    const o = y * row;
    data.copy(out, o, o + half, o + row);
    data.copy(out, o + row - half, o, o + half);
  }
  return sharp(out, { raw: info });
}

async function source(file, mirror) {
  return mirror ? mirrored(file) : sharp(file);
}

function emit(dir, plan, buffer) {
  const key = createHash('sha1').update(buffer).digest('hex').slice(0, 16);
  writeFileSync(join(dir, `${key}.webp`), buffer);
  return `/tour-hd/${plan}/img/${key}.webp`;
}

/** hi (4096), lo (1280) and thumb (384) of a panorama, as the published tours have them. */
async function panorama(dir, plan, file, mirror) {
  // raw pixels with their size, as the mirrored ones already are
  const { data, info } = await (await source(file, mirror)).resize(W, H).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const webp = (w, h) => sharp(data, { raw: info }).resize(w, h, { kernel: 'lanczos3' }).webp({ quality: 82, effort: 6 }).toBuffer();
  return {
    lo: emit(dir, plan, await webp(1280, 640)),
    hi: emit(dir, plan, await webp(W, H)),
    thumb: emit(dir, plan, await webp(384, 192)),
  };
}

async function glass(dir, plan, file, mirror) {
  const { data, info } = await (await source(file, mirror)).resize(W, H).greyscale().raw().toBuffer({ resolveWithObject: true });
  return emit(dir, plan, await sharp(data, { raw: info }).webp({ lossless: true }).toBuffer());
}

/** Replaces `from` by `to` in `html`, which must hold it exactly once. */
function patch(html, from, to, what) {
  const n = html.split(from).length - 1;
  if (n !== 1) throw new Error(`${what}: found ${n} times, expected once`);
  return html.replace(from, to);
}

function table(html, name) {
  const m = html.match(new RegExp(`window\\.${name} = (\\{.*?\\});`, 's'));
  if (!m) throw new Error(`${name} not found`);
  return { text: m[1], value: JSON.parse(m[1]) };
}

async function build(plan) {
  const from = MIRROR[plan] ?? plan;
  const mirror = plan in MIRROR;
  const hd = join('interior', 'hd', from);
  const out = join('public', 'tour-hd', plan);
  const imgDir = join(out, 'img');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(imgDir, { recursive: true });
  let html = readFileSync(join('public', 'tour', plan, 'index.html'), 'utf8');
  const panos = table(html, '__PANOS__');
  const masks = table(html, '__WINDOW_MASKS__');
  const baked = {};
  let rooms = 0;
  for (const key of Object.keys(panos.value)) {
    if (!key.startsWith('D_') || key.includes('@')) continue;
    const room = key.slice(2);
    const base = join(hd, `${room}.jpg`);
    if (!existsSync(base)) continue;
    panos.value[key] = { ...panos.value[key], ...(await panorama(imgDir, plan, base, mirror)) };
    if (existsSync(join(hd, `${room}-glass.png`)) && masks.value[key]) masks.value[key] = await glass(imgDir, plan, join(hd, `${room}-glass.png`), mirror);
    for (const scheme of SCHEMES) {
      const file = join(hd, `${room}-${scheme}.jpg`);
      if (!existsSync(file)) continue;
      const entry = await panorama(imgDir, plan, file, mirror);
      const g = join(hd, `${room}-${scheme}-glass.png`);
      if (existsSync(g) && masks.value[key]) entry.glass = await glass(imgDir, plan, g, mirror);
      (baked[key] ??= {})[scheme] = entry;
    }
    rooms++;
  }
  html = patch(html, `window.__PANOS__ = ${panos.text};`, `window.__PANOS__ = ${JSON.stringify(panos.value)};`, 'panoramas');
  html = patch(html, `window.__WINDOW_MASKS__ = ${masks.text};`, `window.__WINDOW_MASKS__ = ${JSON.stringify(masks.value)};`, 'window masks');
  html = patch(html, '<script>window.__WINDOW_MASKS__', `<script>window.__BAKED__ = ${JSON.stringify(baked)};</script>\n<script>window.__WINDOW_MASKS__`, 'baked table');

  // a room's photo for the chosen colour scheme, when there is one
  html = patch(html,
    "const asset = (interiorTour.mood === 'evening' && Mf[`D_${room}@eve`]) || Mf[`D_${room}`];",
    "const baked = interiorTour.mood !== 'evening' && window.__BAKED__?.[`D_${room}`]?.[tourPaletteState.id];\n  const asset = baked || (interiorTour.mood === 'evening' && Mf[`D_${room}@eve`]) || Mf[`D_${room}`];",
    'room picture');
  // no mask tint over such a photo
  html = patch(html,
    "uniforms.tourPaletteEnabled.value=ready && tourPaletteState.id!=='neutral'?1:0;",
    "uniforms.tourPaletteEnabled.value=ready && tourPaletteState.id!=='neutral' && !window.__BAKED__?.['D_'+interiorTour.room]?.[tourPaletteState.id]?1:0;",
    'palette tint');
  // a new scheme in such a room loads its photo
  html = patch(html,
    '  applyTourPaletteUniforms();\n  return true;\n}',
    "  applyTourPaletteUniforms();\n  if(interiorTour.active && window.__BAKED__?.['D_'+interiorTour.room])loadTourRoom(interiorTour.room);\n  return true;\n}",
    'palette switch');
  // the glass mask of the photo shown
  html = patch(html, '  const mask = tourOutside.masks.get(tourOutside.room);', '  const mask = tourOutside.masks.get(tourOutsideKey(tourOutside.room));', 'outside mask');
  html = patch(html,
    `function setTourOutsideRoom(room) {
  tourOutside.room = room;
  const source = window.__WINDOW_MASKS__?.['D_' + room];
  if (tourOutside.texture && source && !tourOutside.masks.has(room)) {
    tourOutside.masks.set(room, 'loading');`,
    `function tourOutsideKey(room) {
  return window.__BAKED__?.['D_' + room]?.[tourPaletteState.id] ? room + '|' + tourPaletteState.id : room;
}
function setTourOutsideRoom(room) {
  tourOutside.room = room;
  const key = tourOutsideKey(room);
  const source = window.__BAKED__?.['D_' + room]?.[tourPaletteState.id]?.glass || window.__WINDOW_MASKS__?.['D_' + room];
  if (tourOutside.texture && source && !tourOutside.masks.has(key)) {
    tourOutside.masks.set(key, 'loading');`,
    'outside room');
  html = patch(html,
    `      tourOutside.masks.set(room, texture);
      refreshTourOutside();
    }, undefined, () => tourOutside.masks.delete(room));`,
    `      tourOutside.masks.set(key, texture);
      refreshTourOutside();
    }, undefined, () => tourOutside.masks.delete(key));`,
    'outside mask load');
  // the view as it is: the repainted glass is plain white, so nothing of it is kept over the street
  const start = html.indexOf('          vec2 px = vec2(0.00045, 0.0009);');
  const endMark = 'diffuseColor.rgb = mix(rendered, min(glassed, vec3(1.0)), glass);';
  const end = html.indexOf(endMark);
  if (start < 0 || end < start) throw new Error('window shader not found');
  html = html.slice(0, start) + `          // the street as it is: sharp, at its own exposure, with no glass haze or reflection over it. The level of
          // detail comes from the room picture's own steps, not ou's: ou jumps from 1 to 0 where the photo's ends meet,
          // and the blurriest level picked there drew a dotted line across the glass.
          vec3 outside = textureGrad(tourOutside, ou, vec2(dFdx(vMapUv.x), dFdx(vMapUv.y)), vec2(dFdy(vMapUv.x), dFdy(vMapUv.y))).rgb;
          vec3 rendered = diffuseColor.rgb;
          diffuseColor.rgb = mix(rendered, outside, glass);` + html.slice(end + endMark.length);
  html = patch(html, "'sebotse-material-palettes-v3-windows'", "'sebotse-material-palettes-v3-windows-hd3'", 'shader cache key');
  // the drone photo with its lower band filled, where there is one
  html = patch(html, '<script>window.__BAKED__', `<script>window.__OUTSIDE__ = ${JSON.stringify(OUTSIDE)};</script>\n<script>window.__BAKED__`, 'outside table');
  html = patch(html,
    '    const entry = spheres[String(nearest)];',
    "    const entry = { ...spheres[String(nearest)] };\n    const filled = window.__OUTSIDE__?.[entry.src.split('/').pop().replace(/\\.[a-z]+$/, '')];\n    if (filled) entry.src = filled;",
    'filled outside');
  // the photo wraps round, so its two ends blend into each other rather than into a hard edge
  html = patch(html, 'texture.minFilter = 1008; texture.generateMipmaps = true; resolve(texture);', 'texture.minFilter = 1008; texture.generateMipmaps = true; texture.wrapS = 1000; resolve(texture);', 'outside wrap');

  writeFileSync(join(out, 'index.html'), html);
  console.log(`${plan}: ${rooms} rooms repainted${mirror ? ` (mirrored from ${from})` : ''}, ${Object.values(baked).reduce((n, b) => n + Object.keys(b).length, 0)} colour-scheme photos`);
}

// The drone photos with the band under them filled (interior/hd/outside/<name>.jpg, made by hd_outside.mjs), for the
// windows: public/tour-hd/outside/<hash>.webp, looked up by the photo's name (B-16), which the tours use instead of it.
const OUTSIDE = {};
{
  const dir = join('public', 'tour-hd', 'outside');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const src = join('interior', 'hd', 'outside');
  for (const f of existsSync(src) ? readdirSync(src).filter((f) => f.endsWith('.jpg')) : []) {
    const buffer = await sharp(join(src, f)).webp({ quality: 88, effort: 6 }).toBuffer();
    const key = createHash('sha1').update(buffer).digest('hex').slice(0, 16);
    writeFileSync(join(dir, `${key}.webp`), buffer);
    OUTSIDE[f.replace(/\.jpg$/, '')] = `/tour-hd/outside/${key}.webp`;
  }
}

const plans = process.argv.slice(2);
for (const plan of plans.length ? plans : ['D', 'F', 'E', 'C', 'A', 'B']) await build(plan);
