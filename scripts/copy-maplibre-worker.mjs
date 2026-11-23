// MapLibre 6 starts its worker from a file next to its own module, which the Next bundle does not keep:
// copy the worker to public/ so LocationMap can point MapLibre at /maplibre-gl-worker.mjs.
// Never stops `npm run dev` / `build`: with an old maplibre-gl still installed it only says to run npm install.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

try {
  const pkg = createRequire(import.meta.url).resolve('maplibre-gl/package.json');
  const worker = join(dirname(pkg), 'dist', 'maplibre-gl-worker.mjs');
  if (!existsSync(worker)) {
    console.warn('maplibre-gl is out of date here: run `npm install` (the location map needs maplibre-gl 6).');
  } else {
    mkdirSync('public', { recursive: true });
    copyFileSync(worker, join('public', 'maplibre-gl-worker.mjs'));
  }
} catch (error) {
  console.warn('maplibre-gl is not installed: run `npm install`.', error.message);
}
