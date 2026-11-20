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

/** An empty rental hall (floors 2 and 3 share the plan); only the escalator stop differs. */
const hall = (base: string, room: string, esc: [number, number], escHeading: number) =>
  tour(
    base,
    [-19.0, -32.2, 18.8, 32.4],
    [
      { id: 'hall', at: [7.0, -4.6], heading: 300, room },
      { id: 'escalator', at: esc, heading: escHeading, room },
      { id: 'west', at: [-12.6, 13.6], heading: 110, room },
      { id: 'north', at: [6.6, 17.6], heading: 200, room },
      { id: 'east', at: [13.8, 0.6], heading: 260, room },
      { id: 'south', at: [0.4, -24.4], heading: 10, room },
    ],
    {
      hall: ['escalator', 'east', 'south'],
      escalator: ['hall', 'west', 'north', 'south'],
      west: ['escalator', 'north'],
      north: ['escalator', 'west', 'east'],
      east: ['hall', 'north'],
      south: ['hall', 'escalator'],
    },
  );

export const podiumTours: Partial<Record<number, PanoTourData>> = {
  // floor 2: hall 201, an empty rental hall round the escalators
  2: hall('/tour-a/2', '201', [1.0, -0.8], 0),
  // floor 3: hall 120, the same under the roof; the escalators arrive from floor 2
  3: hall('/tour-a/3', '120', [-2.2, 8.0], 180),
};
