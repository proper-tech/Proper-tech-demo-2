import manifest from '../../public/views/manifest.json';
import { FLOOR_MAX, FLOOR_MIN, floorLevel } from './building';
import type { Facing, TowerId } from './types';

/**
 * The real view through the windows: drone 360° spheres taken beside the towers (public/views, made by
 * interior/tools/drone/window_views.py from the same masters as the flat window views). The same manifest feeds the window glass in the apartment tours, so a sphere
 * added there shows up on the window-view page too. Each sphere is equirectangular with true north in the
 * middle; `yaw` (degrees, clockwise) corrects one that isn't.
 */

/** The photographs are the winter view (late November); the other seasons are made from them by an image model,
 *  sector by sector at 4K (interior/tools/drone/window_views.py spheres), which keeps the buildings and streets and
 *  changes leaves, snow, sky and light. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
export const PHOTO_SEASON: Season = 'winter';

export interface ViewSphere {
  /** The floor the sphere is for. */
  floor: number;
  src: string;
  yaw: number;
  /** photo: the drone turned a circle at this height. derived: the nearest photographed floor's sphere, moved to
   *  this floor's height (interior/tools/drone/window_views.py spheres). render: a stand-in rendered from the 3D city. */
  kind: 'photo' | 'derived' | 'render';
  /** For a derived sphere: the photographed floor it comes from, its file, and the eye height (m) it is moved to. */
  from?: number;
  fromSrc?: string;
  height?: number;
  /** The band every heading was photographed in (degrees above and below the horizon): the view stays inside it.
   *  Above and below it the sphere is plain sky and ground (window_views.py spheres). */
  top?: number;
  bottom?: number;
  seasons: Partial<Record<Season, string>>;
}

/** When and how high each sphere was taken, from the flight records in interior/tools/drone/README.md (the
 *  2026-11-25 flight; height in metres above the take-off point). Floor 4 is no longer photographed: its circle
 *  was flown 2.4 m low beside a street hoarding, so it is moved down from floor 5 (window_views.py). */
const SHOTS: Record<string, { taken: string; height?: number }> = {
  '/views/B-05.jpg': { taken: '2026-11-25T12:05+08:00', height: 16.2 },
  '/views/B-07.jpg': { taken: '2026-11-25T12:04+08:00', height: 22.0 },
  // a spiral: the drone sank from 35.9 to 29.4 m while turning; the median height is given
  '/views/B-11.jpg': { taken: '2026-11-25T12:04+08:00', height: 32.9 },
  '/views/B-14.jpg': { taken: '2026-11-25T12:03+08:00', height: 42.5 },
  '/views/B-16.jpg': { taken: '2026-11-25T12:02+08:00', height: 51.5 },
};

type Entry = {
  src: string;
  yaw?: number;
  kind?: string;
  from?: number;
  height?: number;
  top?: number;
  bottom?: number;
  seasons?: Partial<Record<Season, string>>;
};
type Manifest = Partial<Record<TowerId, Record<string, Entry>>>;

export function spheresFor(tower: TowerId): ViewSphere[] {
  const list = (manifest as Manifest)[tower] ?? {};
  return Object.entries(list)
    .map(([floor, v]): ViewSphere => ({
      floor: Number(floor),
      src: v.src,
      yaw: v.yaw ?? 0,
      kind: v.kind === 'derived' || v.kind === 'render' ? v.kind : 'photo',
      from: v.from,
      fromSrc: v.from != null ? list[String(v.from)]?.src : undefined,
      height: v.height,
      top: v.top,
      bottom: v.bottom,
      seasons: v.seasons ?? {},
    }))
    .filter((s) => s.floor >= FLOOR_MIN && s.floor <= FLOOR_MAX)
    .sort((a, b) => a.floor - b.floor);
}

/** A sphere's half-size copy, 4096 × 2048 (scripts/view-variants.mjs makes them before `dev` and `build`). */
export const smallSrc = (src: string) => src.replace(/^\/views\//, '/views/4k/');

/** A small picture (640 × 360) of the winter window view for an apartment facing and floor, made by
 *  scripts/view-variants.mjs from public/views/window: the apartment page's link to its view. */
export const windowThumb = (facing: Facing, floor: number) => `/views/thumbs/${facing}-${String(floor).padStart(2, '0')}.webp`;

/** The manifest of the half-size copies, for the tours' ?views=: their rooms are 4096 wide, so the view through
 *  their windows needs no more. */
export const SMALL_MANIFEST = '/views/manifest-4k.json';

/** Whether a 360° view should go on from the half-size copy to the 8192 × 4096 original: not on a phone-sized
 *  screen (a quarter of the memory and download, and no sharper there), not where the GPU cannot take a texture
 *  that wide, and not when the visitor asked the browser to save data. */
export function wantsFullSphere(maxTextureSize: number) {
  if (typeof window === 'undefined' || maxTextureSize < 8192) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !conn?.saveData && Math.min(screen.width, screen.height) >= 700;
}

/** The picture for a season: the photograph for winter, else its season version (the photograph if none). */
export const srcFor = (s: ViewSphere, season: Season) => (season === PHOTO_SEASON ? s.src : (s.seasons[season] ?? s.src));

/** The sphere a floor shows: its own, or the nearest floor's (the lower one on a tie, as the tours do). */
export function sphereFor(tower: TowerId, floor: number): ViewSphere | null {
  const list = spheresFor(tower);
  if (!list.length) return null;
  return list.reduce((a, b) => (Math.abs(b.floor - floor) < Math.abs(a.floor - floor) ? b : a));
}

/** When the photograph was taken (a derived sphere's is its source's) and how high: a derived sphere's height is
 *  the eye level it was moved to. */
export function shotOf(s: ViewSphere) {
  const shot = SHOTS[s.fromSrc ?? s.src];
  if (!shot) return null;
  return s.kind === 'derived' ? { ...shot, height: s.height } : shot;
}

/** When the drone turned its circle at a photographed floor, from the same flight records (null for a floor it
 *  did not photograph): the time of that floor's sphere and of its window views. */
export const circleTaken = (floor: number) => SHOTS[`/views/B-${String(floor).padStart(2, '0')}.jpg`]?.taken ?? null;

/** Metres a derived sphere was moved up from its photograph's height to its floor's eye level (negative: down). */
export function liftOf(s: ViewSphere) {
  const from = s.fromSrc ? SHOTS[s.fromSrc]?.height : undefined;
  return s.kind === 'derived' && s.height != null && from != null ? s.height - from : 0;
}

/** The band (degrees) the 360° view may show: where every heading was photographed. Outside it the sphere is plain
 *  sky and ground, and the view used to show street, cars and building tops drawn by an image model there, which
 *  did not join the photograph. A sphere without a band: the horizon band any circle covers, to be safe. */
export function lookBand(shown: ViewSphere | null): { top: number; bottom: number } | null {
  if (!shown) return null;
  return { top: shown.top ?? 12, bottom: shown.bottom ?? -20 };
}

/** Metres between a floor and the floor whose sphere it shows (positive: the picture is from higher up). */
export const heightGap = (floor: number, shown: ViewSphere) => floorLevel(shown.floor) - floorLevel(floor);

/** The plan's north is 8.9° west of true north (the site plan's turn of 10.31° less 1.42° of grid
 *  convergence; the same figure the tours use), so a window facing plan heading h faces h − 8.9° true. */
export const PLAN_NORTH = -8.89;

const PLAN_HEADING: Record<Facing, number> = { NE: 45, E: 90, SE: 135, SW: 225, W: 270, NW: 315 };

/** True compass heading (degrees clockwise from north) a facing's windows look along. */
export const facingHeading = (f: Facing) => (PLAN_HEADING[f] + PLAN_NORTH + 360) % 360;
