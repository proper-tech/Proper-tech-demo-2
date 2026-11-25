import { FLOOR_MAX, FLOOR_MIN } from '@/data/building';

/** sessionStorage key: the side the building view zoomed in to a floor from (x, z of the direction, and when),
 *  so the floor page's 3D view starts from that side (BuildingScene's ZoomIn -> FloorScene). With `lift`,
 *  the floor was lifted out of its tower and the building view ended at the floor page's own view. */
export const ARRIVE_KEY = 'sebotse:arrive';

/**
 * The building view's last frame of a lift-out (BuildingScene's LiftOut), handed to the floor page,
 * which shows it until its own 3D view has drawn, then fades it out. Kept in memory: the page change
 * is a client-side navigation, so this module (and the picture) survive it.
 */
export const handoff: { image: string | null; at: number } = { image: null, at: 0 };

/** Floors the building view lifts out of their tower when picked: the towers' apartment floors. The
 *  podium, block D and the roofs keep the flight in through the glass. */
export const liftsOut = (tower: string, floor: number) => (tower === 'B' || tower === 'C') && floor >= FLOOR_MIN && floor <= FLOOR_MAX;

/** The floor page's camera, looking at the plate's centre from FLOOR_VIEW times fitScale (FloorScene);
 *  the lift-out ends exactly there. fitScale steps back on narrow screens so the whole plate fits. */
export const FLOOR_VIEW = [4, 40, 22] as const;
export const FLOOR_FOV = 38;
export const fitScale = (aspect: number) => Math.max(1, 1.05 / aspect);

/** Where the floor page's 3D view sits in the window (globals.css: .floor, and its 900px breakpoint),
 *  so the floor picker's view can slide there before the page changes. */
export function floorStageRect() {
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header')) || 60;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 900) return { top: header, left: 0, width: w, height: Math.round(h * 0.72) };
  return { top: header, left: 0, width: w - 25 * rem, height: h - header };
}
