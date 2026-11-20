import type { Layout } from '@/data/types';

/** The middle of the apartment's living room, where its tag goes. */
export function unitCentre(layout: Layout): [number, number] {
  const r = layout.rooms.find((room) => room.id === 'living') ?? layout.rooms[0];
  return [layout.origin[0] + r.x + r.w / 2, layout.origin[1] - r.z - r.d / 2];
}
