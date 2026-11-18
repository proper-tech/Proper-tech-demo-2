import type { Layout, PhotoStop, RoomType } from './types';

// Rendered 360° tour of apartment D (interior concept, Blender / Cycles, 2560 × 1280).
// The photos and the hotspot points come from the interior package in docs/interior-D:
// camera positions from render_log.json, hotspot points from navigation_visibility.json
// (measured in the Blender scene, so they sit on the door openings seen in the photos).
//
// That scene uses its own frame: x east and y south, in metres from the outer face of the tower's
// west and north walls. It was traced from the same sheets as layouts.ts but is not identical to
// it (inner walls differ by up to ~1.2 m), so the photo stops carry their own eye points and
// hotspots instead of using the doors of layouts.ts. The 3D model is hidden while a photo is shown.
//
// The renders face east at the centre of the image; the files in public/media/360/D are rolled
// by half a turn so they face west at the centre, as ApartmentScene's photo sphere expects.

const EYE_HEIGHT = 1.6; // ApartmentScene's eye height

/** Blender scene (x east, y south) -> apartment D's own coordinates. */
const toLocal = (layout: Layout, x: number, y: number): [number, number] => {
  // scene -> floor plate: X = x - 0.1, Y (north) = 21.2 - y; plate -> apartment: x - X0, Y1 - Y
  const [X0, Y1] = layout.origin;
  return [+(x - 0.1 - X0).toFixed(3), +(Y1 - (21.2 - y)).toFixed(3)];
};

interface StopSpec {
  id: string;
  room: string;
  type: RoomType;
  n?: number;
  /** Camera in the Blender scene: x, y (south), height. */
  cam: [number, number, number];
}

// Rooms of layout D (mirror of C): bedroom1 is the north-east bedroom (D4 on the drawing),
// bedroom2 the south one (D3), bathroom1 has the bath (D5), bathroom2 the shower (D2).
const STOPS: StopSpec[] = [
  { id: 'entry', room: 'living', type: 'hall', cam: [11.45, 12.75, 1.5] },
  { id: 'kitchen', room: 'living', type: 'kitchen', cam: [13.3, 15.25, 1.5] },
  { id: 'living', room: 'living', type: 'living', cam: [13.85, 17.55, 1.5] },
  { id: 'hall', room: 'living', type: 'corridor', cam: [16.3, 17.22, 1.5] },
  { id: 'bed_d4', room: 'bedroom1', type: 'bedroom', n: 1, cam: [19.6, 16.9, 1.5] },
  { id: 'bed_d3', room: 'bedroom2', type: 'bedroom', n: 2, cam: [17.25, 19.0, 1.5] },
  { id: 'bath_d5', room: 'bathroom1', type: 'bathroom', n: 1, cam: [17.3, 16.47, 1.4] },
  { id: 'bath_d2', room: 'bathroom2', type: 'bathroom', n: 2, cam: [15.45, 16.14, 1.5] },
];

/** Hotspots: from, to, point in the Blender scene (x, y south, height). navigation_visibility.json */
const LINKS: [string, string, [number, number, number]][] = [
  ['entry', 'kitchen', [11.45, 14.8, 1.0]],
  ['kitchen', 'entry', [11.55, 15.1, 0.25]],
  ['kitchen', 'living', [13.9, 16.85, 1.12]],
  ['living', 'kitchen', [13.9, 16.85, 1.12]],
  ['living', 'hall', [15.75, 17.22, 1.05]],
  ['hall', 'living', [14.65, 17.4, 1.05]],
  ['hall', 'bed_d3', [16.4, 17.72, 1.15]],
  ['hall', 'bed_d4', [17.86, 17.175, 1.15]],
  ['hall', 'bath_d2', [15.4, 16.658, 1.15]],
  ['hall', 'bath_d5', [17.05, 16.658, 1.15]],
  ['bed_d3', 'hall', [16.4, 17.94, 1.15]],
  ['bed_d4', 'hall', [18.09, 17.175, 1.15]],
  ['bath_d2', 'hall', [15.4, 16.59, 1.18]],
  ['bath_d5', 'hall', [17.05, 16.59, 1.18]],
];

export function photoTourD(layout: Layout): PhotoStop[] {
  return STOPS.map((s) => ({
    id: s.id,
    room: s.room,
    type: s.type,
    ...(s.n ? { n: s.n } : {}),
    panorama: `/media/360/D/${s.id}.jpg`,
    eye: toLocal(layout, s.cam[0], s.cam[1]),
    links: LINKS.filter(([from]) => from === s.id).map(([, to, p]) => {
      const [x, z] = toLocal(layout, p[0], p[1]);
      // keep the point's height relative to the camera, which stood lower than the site's eye
      return { to, at: [x, +(p[2] + EYE_HEIGHT - s.cam[2]).toFixed(3), z] as [number, number, number] };
    }),
  }));
}
