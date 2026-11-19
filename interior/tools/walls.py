"""Dump wall and glass boxes (plan coords: x east, y south, z up) of a scene. python3 -I walls.py <blend> <out.json>"""
import sys, json, bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
out = {'walls': [], 'glass': []}
for o in bpy.data.objects:
    if o.type != 'MESH': continue
    k = 'walls' if (o.name.startswith('Wall') and 'Tile' not in o.name) else 'glass' if o.name.startswith('Glass') else None
    if not k or o.hide_render: continue
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    x0, x1 = min(v.x for v in bb), max(v.x for v in bb)
    y0, y1 = min(-v.y for v in bb), max(-v.y for v in bb)
    z0, z1 = min(v.z for v in bb), max(v.z for v in bb)
    out[k].append([round(v, 3) for v in (x0, y0, z0, x1, y1, z1)])
json.dump(out, open(sys.argv[2], 'w'))
print(len(out['walls']), len(out['glass']))
