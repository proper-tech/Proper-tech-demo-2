import photos from '../../public/views/photos.json';
import { floorLevel } from './building';

/**
 * Plain photographs from the drone, beside the spheres: still frames of the 2026-11-25 flight at the moments picked
 * from screenshots (interior/tools/drone/photos.py). Each belongs to the floor whose eye level is nearest the height
 * it was taken at, and carries the true compass heading it looks along. The spiral flown between 36 and 29 m gives
 * floors 9 to 12 photographs of their own. Block C is shown block B's, as with the spheres.
 */
export interface ViewPhoto {
  floor: number;
  src: string;
  thumb: string;
  /** Degrees clockwise from true north. */
  heading: number;
  /** Degrees; below about -15 the camera looks down at the street. */
  pitch: number;
  /** Metres above the take-off point. */
  height: number;
  taken: string;
}

const ALL = photos as ViewPhoto[];

/** Photographs looking down at the street rather than across: shown in the list, not when turning round. */
export const isDown = (p: ViewPhoto) => p.pitch < -15;

/** The circle is split into 30° directions; a floor borrows only for the directions it has no photograph of. */
const SECTOR = 30;
const sector = (p: ViewPhoto) => Math.floor((((p.heading % 360) + 360) % 360) / SECTOR);

/** The photographs a floor shows: its own, then, for each direction it has none of, those of the nearest floors
 *  that do (one floor away, then two, up to three; the lower floor first, as the spheres do). Each keeps its floor,
 *  so the page can say where it was taken. Sorted by heading. */
export function photosFor(floor: number): ViewPhoto[] {
  const list = ALL.filter((p) => p.floor === floor);
  const covered = new Set(list.filter((p) => !isDown(p)).map(sector));
  for (let d = 1; d <= 3 && covered.size < 360 / SECTOR; d++) {
    for (const f of [floor - d, floor + d]) {
      const add = ALL.filter((p) => p.floor === f && !isDown(p) && !covered.has(sector(p)));
      for (const p of add) list.push(p);
      for (const p of add) covered.add(sector(p));
    }
  }
  return list.sort((a, b) => a.heading - b.heading);
}

const turn = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);

/** The level photograph nearest a heading, or null. */
export function nearestPhoto(list: ViewPhoto[], heading: number): ViewPhoto | null {
  let best: ViewPhoto | null = null;
  for (const p of list) if (!isDown(p) && (!best || turn(p.heading, heading) < turn(best.heading, heading))) best = p;
  return best;
}

/** Metres between where a photograph was taken and a floor's eye level (positive: taken higher up). */
export const photoGap = (p: ViewPhoto, floor: number) => p.height - (floorLevel(floor) + 1.5);

/** Whether a photograph looks out the way a window facing `heading` does (within 60°). */
export const facesWindow = (p: ViewPhoto, heading: number) => turn(p.heading, heading) <= 60;
