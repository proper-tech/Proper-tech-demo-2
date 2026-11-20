import type { PanoStop, PanoTourData } from '@/data/blockDTour';

/**
 * Rendered 360° tours and top views of the podium's (block A's) floors, made in Blender
 * (interior/tools/build_podium2.py, interior/render_panos.py, interior/render_top.py).
 * Site-plan metres as in podium.ts: u east, v north.
 */

const spot = (at: [number, number]): [number, number, number] => [at[0], at[1], 0.15];

/** Stops and the ways on from each; a ring shows on the floor at the stop it leads to. */
const tour = (base: string, top: [number, number, number, number], stops: PanoStop[], links: Record<string, string[]>): PanoTourData => ({
  base,
  eye: 1.55,
  top: { src: `${base}/top.webp`, rect: top },
  stops,
  links: Object.fromEntries(
    Object.entries(links).map(([id, to]) => [id, to.map((t) => ({ to: t, point: spot(stops.find((s) => s.id === t)!.at) }))]),
  ),
});

export const podiumTours: Partial<Record<number, PanoTourData>> = {
  // floor 2: hall 201, an empty rental hall round the escalators
  2: tour(
    '/tour-a/2',
    [-19.0, -32.2, 18.8, 32.4],
    [
      { id: 'hall', at: [7.0, -4.6], heading: 300, room: '201' },
      { id: 'escalator', at: [1.0, -0.8], heading: 0, room: '201' },
      { id: 'west', at: [-12.6, 13.6], heading: 110, room: '201' },
      { id: 'north', at: [6.6, 17.6], heading: 200, room: '201' },
      { id: 'east', at: [13.8, 0.6], heading: 260, room: '201' },
      { id: 'south', at: [0.4, -24.4], heading: 10, room: '201' },
    ],
    {
      hall: ['escalator', 'east', 'south'],
      escalator: ['hall', 'west', 'north', 'south'],
      west: ['escalator', 'north'],
      north: ['escalator', 'west', 'east'],
      east: ['hall', 'north'],
      south: ['hall', 'escalator'],
    },
  ),
};
