// MapLibre 6 starts its worker from a file next to its own module, which the Next bundle does not keep:
// copy the worker to public/ so LocationMap can point MapLibre at /maplibre-gl-worker.mjs.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pkg = createRequire(import.meta.url).resolve('maplibre-gl/package.json');
mkdirSync('public', { recursive: true });
copyFileSync(join(dirname(pkg), 'dist', 'maplibre-gl-worker.mjs'), join('public', 'maplibre-gl-worker.mjs'));
