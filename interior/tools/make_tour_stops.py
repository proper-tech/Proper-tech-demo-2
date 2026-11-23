"""Where each 360° tour stop stands on the site plate, and which tour stop a room of the 3D model opens.
Reads the stops (vf.D.pts, Blender plan coords) from public/tour/<P>/index.html and maps them with the affine map of
make_models.py; A, B, C tours are mirrors of F, E, D. Writes src/data/tourStops.ts.
python3 -I interior/tools/make_tour_stops.py <repo>"""
import sys, json, re
import numpy as np
R = sys.argv[1]
XP = [(10.95, 10.8), (21.85, 23.35), (12.45, 12.6), (21.85, 23.35), (13.0, 12.6), (21.85, 23.35)]
YP = [(13.9, 7.15), (21.0, 0.15), (7.15, 13.55), (13.9, 7.15), (0.0, 20.9), (9.6, 11.91)]
A_ = np.array([[x, 1] for x, _ in XP]); a, b = np.linalg.lstsq(A_, np.array([s for _, s in XP]), rcond=None)[0]
A_ = np.array([[-y, 1] for y, _ in YP]); e, c = np.linalg.lstsq(A_, np.array([s for _, s in YP]), rcond=None)[0]
m = (21.6 - 2 * b) / (2 * a)
MIRROR = {'C': ('D', 32.85), 'B': ('E', 34.3), 'A': ('F', 35.0)}   # tour x = sum - source tour x
models = re.search(r'photoModels[^=]*= (\{.*\});', open(f'{R}/src/data/photoModels.ts').read()).group(1)
models = json.loads(models)
out = {}
for P in 'ABCDEF':
    html = open(f'{R}/public/tour/{P}/index.html', encoding='utf-8').read()
    pts = json.loads(re.search(r'"pts":(\{[^}]*\})', html).group(1))
    plate = {}
    for k, (x, y) in pts.items():
        if P in MIRROR:
            xs = MIRROR[P][1] - x            # the same stop in the source plan
            px = a * (2 * m - xs) + b        # make_models mirrors the source plan about m
        else:
            px = a * x + b
        plate[k] = [round(float(px), 3), round(float(c - e * y), 3)]
    rooms = {}
    for rid, (w, s_, east, n) in models[P]['rooms'].items():
        inside = [k for k, (px, py) in plate.items() if w <= px <= east and s_ <= py <= n]
        pref = [k for k in inside if k == rid or k.startswith({'bedroom': 'bed', 'bathroom': 'bath'}.get(re.sub(r'\d', '', rid), rid))]
        pick = (pref or inside or [min(plate, key=lambda k: (plate[k][0] - (w + east) / 2) ** 2 + (plate[k][1] - (s_ + n) / 2) ** 2)])
        rooms[rid] = pick[0]
    out[P] = {'stops': plate, 'rooms': rooms}
    print(P, rooms)
ts = ["import type { PlanId } from './types';", '',
      '/** The 360° tour stops of each plan on the site plate (metres, x east, y north) and the stop a room opens.',
      ' * Tour headings: yaw° = 180 - atan2(-dy, dx) with (dx, dy) in Blender plan metres, which are plate metres scaled by',
      ' * (A, E) on x and y. Made by interior/tools/make_tour_stops.py. */',
      'export interface TourStops { stops: Record<string, [number, number]>; rooms: Record<string, string> }',
      f'export const TOUR_SCALE = {{ x: {round(float(a), 5)}, y: {round(float(e), 5)} }};',
      'export const tourStops: Partial<Record<PlanId, TourStops>> = ' + json.dumps(out) + ';', '']
open(f'{R}/src/data/tourStops.ts', 'w').write('\n'.join(ts))
