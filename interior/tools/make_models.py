"""Photo models of plans A-F for the site's 3D views: the furnished top view laid on the floor, the walls of the
rendered scene. Blender plan coords -> site plate coords by one affine map fitted on the apartments' outlines.
python3 -I make_models.py <dir with D.json E.json F.json> <out .ts>"""
import sys, json
import numpy as np
src, out = sys.argv[1:3]
# Blender rooms extent -> site layout extent (plate coords, Y north)
XP = [(10.95, 10.8), (21.85, 23.35), (12.45, 12.6), (21.85, 23.35), (13.0, 12.6), (21.85, 23.35)]
YP = [(13.9, 7.15), (21.0, 0.15), (7.15, 13.55), (13.9, 7.15), (0.0, 20.9), (9.6, 11.91)]
A_ = np.array([[x, 1] for x, _ in XP]); a, b = np.linalg.lstsq(A_, np.array([s for _, s in XP]), rcond=None)[0]
A_ = np.array([[-y, 1] for y, _ in YP]); e, c = np.linalg.lstsq(A_, np.array([s for _, s in YP]), rcond=None)[0]
m = (21.6 - 2 * b) / (2 * a)  # Blender x that maps onto the site's mirror line x = 10.8
print('x = %.4f*xb %+.4f   y = %.4f %+.4f*yb   mirror xb = %.3f' % (a, b, c, -e, m))
X = lambda x: a * x + b
Y = lambda y: c - e * y
CROP = {'D': (10.6, 10.95, 22.2, 21.35), 'E': (12.1, 6.8, 22.2, 14.1), 'F': (12.8, -0.35, 22.2, 9.95)}
ROOMS = {
 'F': dict(living=(13.95, 3.3, 21.85, 7.0), hall=(13.0, 7.15, 15.4, 9.6), bathroom=(15.55, 7.15, 16.9, 9.6),
           bedroom1=(17.4, 0, 20.3, 3.15), bedroom2=(13.95, 0, 17.25, 3.15), balcony=(20.45, 0, 21.85, 3.15)),
 'E': dict(living=(14.1, 9.85, 21.85, 13.9), bedroom=(17.45, 7.15, 20.2, 9.7), bathroom=(12.45, 11.45, 13.95, 13.9),
           balcony=(20.35, 7.15, 21.85, 9.7)),
 'D': dict(living=(10.95, 13.9, 14.75, 21.0), bathroom1=(16.55, 14.1, 17.9, 16.55), bathroom2=(14.9, 14.1, 16.4, 16.55),
           bedroom1=(18.05, 14.1, 21.85, 17.75), bedroom2=(15.9, 17.9, 20.55, 21.0), balcony=(20.7, 17.9, 21.85, 21.0)),
}
MIRROR = {'C': 'D', 'B': 'E', 'A': 'F'}
r3 = lambda v: round(float(v), 3)
def rect(x0, y0, x1, y1, mir):
    if mir: x0, x1 = 2 * m - x1, 2 * m - x0
    return [r3(X(x0)), r3(Y(y1)), r3(X(x1)), r3(Y(y0))]  # plate: west, south, east, north
models = {}
for P in 'ABCDEF':
    S = MIRROR.get(P, P); mir = P in MIRROR
    d = json.load(open(f'{src}/{S}.json'))
    walls = [rect(w[0], w[1], w[3], w[4], mir) + [r3(w[2]), r3(w[5])] for w in d['walls']]
    glass = [rect(w[0], w[1], w[3], w[4], mir) + [r3(w[2]), r3(w[5])] for w in d['glass']]
    rooms = {k: rect(*v, mir) for k, v in ROOMS[S].items()}
    models[P] = dict(image=dict(src=f'/plans/{P}.webp', rect=rect(*CROP[S], mir)), walls=walls, glass=glass, rooms=rooms)
lines = ["import type { PlanId } from './types';", '',
 '/** A box or rectangle in plate coordinates (metres, x east, y north): west, south, east, north[, bottom, top]. */',
 'export type PlateRect = [number, number, number, number];',
 'export type PlateBox = [number, number, number, number, number, number];', '',
 '/**',
 ' * Photo models of the plans for the 3D views: the furnished top view from the 360° tour (public/plans) laid on the',
 ' * floor, with the walls and window glass of the rendered Blender scene. Rooms are the rooms of that picture, by the',
 ' * room ids of layouts.ts. The scenes were drawn from the architect\'s plan; one affine map, fitted on the apartments\'',
 ' * outlines, puts them on the plate. Made by interior/tools/make_models.py.',
 ' */',
 'export interface PhotoModel {', '  image: { src: string; rect: PlateRect };', '  walls: PlateBox[];', '  glass: PlateBox[];',
 '  rooms: Record<string, PlateRect>;', '}', '',
 'export const photoModels: Partial<Record<PlanId, PhotoModel>> = ' + json.dumps(models, separators=(',', ':')) + ';', '']
open(out, 'w').write('\n'.join(lines))
print('written', out)
