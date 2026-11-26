import manifest from '../../public/views/window/manifest.json';
import type { Facing } from './types';
import { circleTaken, type Season } from './views';

/**
 * The plain window views: one 16:9 picture per floor, per apartment facing and per season, looking straight out
 * along the windows (64° wide, 6° down). Made by interior/tools/drone/window_views.py from the drone's 4K frames:
 * the floors it turned a circle at are photographs, the others are the nearest one moved to their eye level, and
 * spring, summer and autumn are the photograph edited by an image model. Tower C uses tower B's, as the spheres do.
 */
export interface WindowView {
  facing: Facing;
  floor: number;
  /** photo: the drone's frames at this height. derived: the nearest photographed floor moved to this one. */
  kind: 'photo' | 'derived';
  /** For a derived view: the floor it was moved from. */
  from?: number;
  /** Eye height (m) the view is from, and how far it looks down (degrees, negative). */
  height: number;
  pitch: number;
  seasons: Partial<Record<Season, string>>;
}

type Entry = { kind: string; from?: number; height: number; pitch: number; seasons: Partial<Record<Season, string>> };
const views = (manifest as unknown as { views: Partial<Record<Facing, Record<string, Entry>>> }).views;

export function windowView(facing: Facing, floor: number): WindowView | null {
  const e = views[facing]?.[String(floor)];
  if (!e) return null;
  return { facing, floor, kind: e.kind === 'photo' ? 'photo' : 'derived', from: e.from, height: e.height, pitch: e.pitch, seasons: e.seasons };
}

/** Which floors have a photographed or an estimated view for a facing (floor 14 missed the west, for one). */
export function windowKinds(facing: Facing): Map<number, WindowView['kind']> {
  return new Map(Object.entries(views[facing] ?? {}).map(([f, e]) => [Number(f), e.kind === 'photo' ? 'photo' : 'derived']));
}

/** When the photograph a view comes from was taken: the drone's circle at that floor. */
export const windowTaken = (v: WindowView): string | null => circleTaken(v.from ?? v.floor);
