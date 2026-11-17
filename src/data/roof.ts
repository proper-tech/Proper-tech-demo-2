import type { Pt } from '@/lib/geometry';
import { FLOOR_HEIGHT, FLOOR_MAX, FLOOR_MIN, PLATE, PODIUM_HEIGHT, coreOf, siteTower, towerPlate, type Rect } from './building';
import { towerOutline, type PodiumFloor, type PodiumSpace } from './podium';
import type { TowerId } from './types';

// The technical floor on each tower's roof, from the architect's roof plan ("Техникийн давхрын
// байгуулалт"): a block on grid lines X4-X5 and Y4-Y2 of tower C (X5-X6, Y12-Y10 on tower B)
// holding stair 117 (113 on B) and two technical rooms round the lift shafts; the rest of the roof
// is open. The plan is traced for tower C in floor-plate metres (see PLATE); tower B's is the
// mirror image, like the rest of its core. Areas are the room schedule's.
// The page and the building treat it as floor 17 of each tower.

export const ROOF_FLOOR = FLOOR_MAX + 1;
/** Roof of the 16th floor, and the technical floor's height (sections). */
const TOP = PODIUM_HEIGHT + (FLOOR_MAX - FLOOR_MIN + 1) * FLOOR_HEIGHT;
export const TECH_HEIGHT = 4.0;

const C = coreOf('C');
/** Outside of the block's walls, which stand on the grid lines. Keep in step with build_tower()
 *  in scripts/build-model.py. */
const BLOCK: Rect = { x: 6.95, z: -0.25, w: 7.7, d: 14.3 };

/** Floor-plate point of tower C's plan -> site plan, mirrored for tower B. */
function toSite(tower: TowerId) {
  const t = siteTower(tower);
  const [gx, gy] = [t.u0 + 0.5, t.v1 - 0.5]; // grid crossing at the plate's north-west corner
  const pt = ([x, z]: Pt): Pt => [gx + (tower === 'B' ? 2 * PLATE.axis - x : x), gy - z];
  const rect = (r: Rect): Pt[] => ([[r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d]] as Pt[]).map(pt);
  return { pt, rect };
}

/** The technical block's outline on the site plan. */
export const techBlock = (tower: TowerId) => toSite(tower).rect(BLOCK);

function roofFloor(tower: TowerId): PodiumFloor {
  const { pt, rect } = toSite(tower);
  const [stairs, small, big] = tower === 'B' ? ['113', '114', '115'] : ['117', '116', '118'];
  const { x: lx, w: lw, d: ld } = C.lifts;
  const roof = towerOutline(towerPlate(tower));
  const spaces: PodiumSpace[] = [
    { id: 'roof', type: 'roof', outline: roof },
    // the stair comes up from floor 16 and goes on up, with a door out onto the roof
    { id: stairs, no: stairs, type: 'stairs', area: 18.1, door: tower === 'B' ? 'E' : 'W', flip: tower === 'B', outline: rect(C.stairs) },
    { id: 'lifts', type: 'lifts', outline: rect(C.lifts) },
    {
      id: small, no: small, type: 'technical', area: 20.5,
      outline: ([[lx, ld], [lx + lw, ld], [lx + lw, 0], [14.4, 0], [14.4, 7.2], [lx, 7.2]] as Pt[]).map(pt),
    },
    { id: big, no: big, type: 'technical', area: 47.2, outline: rect({ x: 7.2, z: 7.2, w: 7.2, d: 6.6 }) },
  ];
  return { floor: ROOF_FLOOR, z0: TOP, z1: TOP + TECH_HEIGHT, below: FLOOR_HEIGHT, outline: roof, spaces, total: 85.8 };
}

const roofs: Record<TowerId, PodiumFloor> = { B: roofFloor('B'), C: roofFloor('C') };
export const getRoofFloor = (tower: TowerId) => roofs[tower];
