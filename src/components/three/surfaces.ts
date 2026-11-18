import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

// Procedural surfaces for block D (DFloorScene): concrete, epoxy, floor tiles, hazard stripes and
// painted signs. They are drawn once on a canvas, so the site needs no image files. Floor textures
// are light greyscale, multiplied by the material colour. Sizes are in metres per repeat; geometry
// UVs are in metres, so `repeat = 1 / size`.

const cache = new Map<string, CanvasTexture>();

function make(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, n: number) => void) {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const t = new CanvasTexture(canvas);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

/** A copy that shares the image, repeating every `metres`. */
export function scaled(t: Texture, metres: number) {
  const c = t.clone();
  c.repeat.set(1 / metres, 1 / metres);
  c.needsUpdate = true;
  return c;
}

/** Seeded random numbers, so the patterns are the same on every visit. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** Speckle and blotches over a flat base. */
function noise(ctx: CanvasRenderingContext2D, n: number, base: number, spread: number, blotch: number, seed: number) {
  const r = rng(seed);
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, n, n);
  for (let i = 0; i < 40; i++) {
    const v = base + (r() - 0.5) * blotch;
    const g = ctx.createRadialGradient(r() * n, r() * n, 0, r() * n, r() * n, n * (0.1 + r() * 0.25));
    g.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  }
  const img = ctx.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (r() - 0.5) * spread;
    img.data[i] += d;
    img.data[i + 1] += d;
    img.data[i + 2] += d;
  }
  ctx.putImageData(img, 0, 0);
}

/** Bare concrete: blotchy, with fine grit. */
export const concrete = () => make('concrete', 512, (ctx, n) => noise(ctx, n, 226, 26, 40, 11));

/** Sealed (epoxy) floor: smoother, with a faint sheen of trowel marks. */
export const epoxy = () =>
  make('epoxy', 512, (ctx, n) => {
    noise(ctx, n, 238, 10, 18, 5);
    const r = rng(3);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 30; i++) {
      ctx.lineWidth = 6 + r() * 14;
      ctx.beginPath();
      const x = r() * n, y = r() * n;
      ctx.arc(x, y, n * (0.15 + r() * 0.3), r() * 6, r() * 6 + 1.2);
      ctx.stroke();
    }
  });

/** Large floor tiles: one repeat is two by two tiles. */
export const tiles = () =>
  make('tiles', 512, (ctx, n) => {
    noise(ctx, n, 244, 8, 10, 17);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (const p of [0, n / 2]) {
      ctx.fillRect(p, 0, 3, n);
      ctx.fillRect(0, p, n, 3);
    }
  });

/** Wall paint: almost flat, a little roller texture. */
export const paint = () => make('paint', 256, (ctx, n) => noise(ctx, n, 246, 6, 8, 23));

/** Yellow and black hazard stripes, for column bases and kerbs. One repeat is 0.4 m. */
export const hazard = () =>
  make('hazard', 128, (ctx, n) => {
    ctx.fillStyle = '#E8B931';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#1E2126';
    for (let k = -2; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(k * n, n);
      ctx.lineTo(k * n + n / 2, n);
      ctx.lineTo(k * n + n, 0);
      ctx.lineTo(k * n + n / 2, 0);
      ctx.closePath();
      ctx.fill();
    }
  });

/** Ribbed steel of a roller garage door. */
export const shutter = () =>
  make('shutter', 128, (ctx, n) => {
    ctx.fillStyle = '#B8BEC5';
    ctx.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += n / 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y, n, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, y + 3, n, 2);
    }
  });

/** A painted sign: big text, white on a coloured plate (or the colour on transparent). */
export function sign(text: string, color = '#2F6FDE', plate = true) {
  return make(`sign:${text}:${color}:${plate}`, 256, (ctx, n) => {
    if (plate) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(8, 8, n - 16, n - 16, 28);
      ctx.fill();
    }
    ctx.fillStyle = plate ? '#FFFFFF' : color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = text.length > 4 ? 58 : text.length > 2 ? 96 : 150;
    ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.fillText(text, n / 2, n / 2 + size * 0.05);
  });
}

/** Packaged goods on a shelf, seen from the front: boxes and bottles of many colours with small gaps.
 *  One repeat is 1.2 m of shelf. */
export const products = () =>
  make('products', 512, (ctx, n) => {
    const r = rng(29);
    const colors = ['#D9534F', '#F0AD4E', '#5CB85C', '#5BC0DE', '#E6E1D8', '#9B7FD1', '#2F6FDE', '#1E2126', '#F7F7F2', '#C0392B'];
    ctx.fillStyle = '#C9CED3';
    ctx.fillRect(0, 0, n, n);
    for (let x = 0; x < n; ) {
      const w = n * (0.04 + r() * 0.07);
      const h = n * (0.55 + r() * 0.42);
      const c = colors[Math.floor(r() * colors.length)];
      ctx.fillStyle = c;
      ctx.fillRect(x + 2, n - h, w - 4, h);
      // a label band and a highlight down one side
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 2, n - h * 0.62, w - 4, h * 0.18);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 4, n - h, 3, h);
      x += w;
    }
  });

/** Ramp concrete with grooves across it for grip. One repeat is 1 m. */
export const grooves = () =>
  make('grooves', 256, (ctx, n) => {
    noise(ctx, n, 214, 22, 30, 41);
    for (let y = 0; y < n; y += n / 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, y, n, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, y + 6, n, 2);
    }
  });
