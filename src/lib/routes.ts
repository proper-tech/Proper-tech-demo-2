import { floors, towers, units } from '@/data/building';
import { blockDFloors } from '@/data/blockD';
import { floorName, podiumFloors } from '@/data/podium';
import { ROOF_FLOOR } from '@/data/roof';

/** Every floor page: towers B and C (apartments, and the technical floor on the roof as floor 17), the podium,
 *  block A (floors 1-3 and the roof playground), the basement under it all (A/B1), and block D (its own
 *  basement, D/B1, and floors 1-3). The floor page prerenders these and the sitemap lists them, so the two
 *  can't drift apart. */
export const floorParams = (): { tower: string; floor: string }[] => [
  ...floors.map((f) => ({ tower: f.tower, floor: String(f.floor) })),
  ...towers.map((tower) => ({ tower, floor: String(ROOF_FLOOR) })),
  ...podiumFloors.map((f) => ({ tower: 'A', floor: floorName(f.floor) })),
  ...blockDFloors.map((f) => ({ tower: 'D', floor: floorName(f.floor) })),
];

/** Every page's address after the language ('' is the home page), for the sitemap. */
export const sitePaths = (): string[] => [
  '',
  '/views',
  '/drone',
  ...floorParams().map((p) => `/floors/${p.tower}/${p.floor}`),
  ...units.map((u) => `/apartments/${u.id}`),
];
