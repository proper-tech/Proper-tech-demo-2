import type { Layout } from '@/data/types';
import { TOUR_SCALE } from '@/data/tourStops';

/** A camera flight between the 3D model and a 360° tour stop (eye in the apartment's own coordinates). */
export interface Flight {
  id: number;
  dir: 'in' | 'out';
  eye: [number, number];
  /** three.js yaw (radians): the camera looks along (-sin yaw, -cos yaw) in x, z. */
  yaw: number;
  /** degrees, up is positive (as in the tour) */
  pitch: number;
  /** vertical field of view, degrees */
  fov: number;
}

export const TOUR_EYE = 1.5;
export const FLIGHT_IN = 1.8;
export const FLIGHT_OUT = 1.5;

/** A tour stop (plate metres) in the apartment's own coordinates (x east, z south from its north-west corner). */
export function stopLocal(layout: Layout, plate: [number, number]): [number, number] {
  const [ox, oy] = layout.origin;
  return [plate[0] - ox, oy - plate[1]];
}

const DEG = Math.PI / 180;

/** The tour's heading (degrees) for a three.js yaw. The tour measures in Blender plan metres, which are plate metres
 *  scaled by TOUR_SCALE, with y north-to-south flipped (see tourStops.ts). */
export function tourYaw(yaw: number): number {
  const lx = -Math.sin(yaw);
  const lz = -Math.cos(yaw);
  const dx = lx / TOUR_SCALE.x;
  const dy = lz / TOUR_SCALE.y;
  return (((180 - Math.atan2(-dy, dx) / DEG) % 360) + 360) % 360;
}

/** The three.js yaw for a tour heading (degrees). */
export function sceneYaw(tour: number): number {
  const a = (180 - tour) * DEG;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const lx = dx * TOUR_SCALE.x;
  const lz = dy * TOUR_SCALE.y;
  return Math.atan2(-lx, -lz);
}

/** The tour's own first view of a stop: its tilt and field of view (as in the tour's changeTourRoom). */
export function tourView(stop: string): { pitch: number; fov: number } {
  const pitch = stop === 'bath_d5' ? -32 : stop === 'hall' ? -12 : stop.startsWith('bath_') ? -14 : stop === 'balcony' ? -28 : -3;
  const fov = stop === 'bath_d5' ? 86 : stop === 'hall' || stop === 'balcony' ? 90 : 72;
  return { pitch, fov };
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
