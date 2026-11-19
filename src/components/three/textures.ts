import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

// Procedural stand-ins for real material photos. Both are light greyscale patterns that
// are multiplied by the material colour, so one texture serves every flooring swatch.

let wood: CanvasTexture | null = null;
let tile: CanvasTexture | null = null;

function finish(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Plank flooring. One repeat covers 2 m x 2 m. */
export function woodTexture() {
  if (wood) return wood;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rows = 16; // 12.5 cm planks
  const rowH = size / rows;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < rows; r++) {
    const offset = rand() * size;
    for (let k = -1; k < 2; k++) {
      const plankLen = size * 0.6;
      for (let x = offset + k * size; x < size * 2; x += plankLen) {
        const v = 232 + Math.floor(rand() * 23);
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.fillRect(x - size, r * rowH, plankLen, rowH);
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(x - size, r * rowH, 1.5, rowH);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, r * rowH, size, 1.5);
  }
  return (wood = finish(canvas));
}

/** Bathroom tiles. One repeat covers 1.2 m x 1.2 m (four 60 cm tiles). */
export function tileTexture() {
  if (tile) return tile;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f6f6f6';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (const p of [0, size / 2]) {
    ctx.fillRect(p, 0, 2, size);
    ctx.fillRect(0, p, size, 2);
  }
  return (tile = finish(canvas));
}

let stone: CanvasTexture | null = null;

/** Large stone tiles for the corridors and lift lobby: 60 cm tiles, one repeat covers 2.4 m x 2.4 m. */
export function stoneTexture() {
  if (stone) return stone;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const n = 4;
  const t = size / n;
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = '#cfc7ba';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = 232 + Math.round(rand() * 8 - 4);
      ctx.fillStyle = `rgb(${v}, ${v - 4}, ${v - 11})`;
      ctx.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
      // faint veining
      ctx.strokeStyle = 'rgba(160, 150, 135, 0.10)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(i * t + rand() * t, j * t + 2);
        ctx.bezierCurveTo(i * t + rand() * t, j * t + t * 0.4, i * t + rand() * t, j * t + t * 0.6, i * t + rand() * t, j * t + t - 2);
        ctx.stroke();
      }
    }
  stone = finish(canvas);
  return stone;
}
