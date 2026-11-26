import panoramas from '../../public/views/panoramas.json';
import { floorLevel } from './building';

/**
 * Flat panoramas: the band round the horizon the drone actually photographed at each height it turned a circle at,
 * as one strip with true north in the middle column (interior/tools/drone/panoramas.py). The page pans it sideways
 * like a long photograph. Block C is shown block B's, as with the spheres.
 */
export interface Panorama {
  /** The floor whose eye level the circle was flown nearest to. */
  floor: number;
  src: string;
  width: number;
  height: number;
  /** Elevations (degrees) of the strip's top and bottom rows. */
  top: number;
  bottom: number;
  /** Metres above the take-off point. */
  metres: number;
  taken: string;
}

const ALL: Panorama[] = Object.entries(panoramas as Record<string, Omit<Panorama, 'floor'>>)
  .map(([floor, p]) => ({ ...p, floor: Number(floor) }))
  .sort((a, b) => a.floor - b.floor);

/** The panorama a floor shows: its own, or the nearest floor's (the lower one on a tie, as the spheres do). */
export function panoramaFor(floor: number): Panorama | null {
  if (!ALL.length) return null;
  return ALL.reduce((a, b) => (Math.abs(b.floor - floor) < Math.abs(a.floor - floor) ? b : a));
}

/** Metres between where a panorama was taken and a floor's eye level (positive: taken higher up). */
export const panoramaGap = (p: Panorama, floor: number) => p.metres - (floorLevel(floor) + 1.5);
