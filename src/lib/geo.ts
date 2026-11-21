import type { Pt } from '@/lib/geometry';

// The site plan's frame (metres, u along the buildings' short side, v along their long side, 0,0
// between the two towers) on the map. Same fit as scripts/fetch-osm.py, which brings OpenStreetMap
// into the site frame: UTM zone 48N round PIN, turned by TURN degrees and shifted by SHIFT.

const PIN: [number, number] = [47.928253, 106.913053];
const TURN = 10.31;
const SHIFT: Pt = [3.25, -1.0];

/** WGS84 -> UTM zone 48N metres (Krueger series, mm accuracy), as in fetch-osm.py. */
function utm48(lat: number, lon: number): [number, number] {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const n = f / (2 - f);
  const A = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const al = [n / 2 - (2 * n ** 2) / 3 + (5 * n ** 3) / 16, (13 * n ** 2) / 48 - (3 * n ** 3) / 5, (61 * n ** 3) / 240];
  const p = (lat * Math.PI) / 180;
  const dl = ((lon - 105) * Math.PI) / 180;
  const c = (2 * Math.sqrt(n)) / (1 + n);
  const t = Math.sinh(Math.atanh(Math.sin(p)) - c * Math.atanh(c * Math.sin(p)));
  const xi = Math.atan2(t, Math.cos(dl));
  const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let E = eta;
  let N = xi;
  for (let j = 0; j < 3; j++) {
    E += al[j] * Math.cos(2 * (j + 1) * xi) * Math.sinh(2 * (j + 1) * eta);
    N += al[j] * Math.sin(2 * (j + 1) * xi) * Math.cosh(2 * (j + 1) * eta);
  }
  return [500000 + k0 * A * E, k0 * A * N];
}

const [E0, N0] = utm48(...PIN);
const ca = Math.cos((TURN * Math.PI) / 180);
const sa = Math.sin((TURN * Math.PI) / 180);

/** A lat/lon point -> the site frame. */
export function toSite(lat: number, lon: number): Pt {
  const [E, N] = utm48(lat, lon);
  const x = E - E0;
  const y = N - N0;
  return [x * ca + y * sa + SHIFT[0], -x * sa + y * ca + SHIFT[1]];
}

/** A point of the site frame -> [lon, lat] (the map's order), by Newton's method on toSite. */
export function toLonLat([u, v]: Pt): [number, number] {
  let lat = PIN[0];
  let lon = PIN[1];
  const h = 1e-6;
  for (let i = 0; i < 6; i++) {
    const [a, b] = toSite(lat, lon);
    const [aLat, bLat] = toSite(lat + h, lon);
    const [aLon, bLon] = toSite(lat, lon + h);
    const j11 = (aLat - a) / h, j12 = (aLon - a) / h;
    const j21 = (bLat - b) / h, j22 = (bLon - b) / h;
    const det = j11 * j22 - j12 * j21;
    const du = u - a;
    const dv = v - b;
    lat += (j22 * du - j12 * dv) / det;
    lon += (-j21 * du + j11 * dv) / det;
  }
  return [lon, lat];
}

/** Great-circle distance in metres. */
export function distance([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]) {
  const r = Math.PI / 180;
  const s = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(s));
}
