"""Small clean-ups shared by fix_scene.py (plan D) and build_unit.py (plans F, E). Pasted in by exec(), not imported.

- fireflies: the plant asset carries animated fireflies (tiny glowing bugs) that read as glitches - removed
- plants: pots were scaled 1.5x and poked through walls and glazing; each plant is scaled to fit its room
  and moved inside it, and of two overlapping plants the smaller goes
- soap dispensers stood inside the vessel basins; each moves to the free corner of its counter nearest to where it was
- the balcony lantern stood on the floor; it goes
"""
import re
import bpy
from mathutils import Matrix, Vector


def _bbox(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return (min(p.x for p in pts), max(p.x for p in pts), min(-p.y for p in pts), max(-p.y for p in pts))


def remove_tree(o):
    names = [c.name for c in o.children_recursive] + [o.name]
    for n in names:
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)


def remove_fireflies():
    for n in [o.name for o in bpy.data.objects if re.match(r'^(chase_)?firefly|^path\d', o.name)]:
        if n in bpy.data.objects: remove_tree(bpy.data.objects[n])


def remove_lanterns():
    for n in [o.name for o in bpy.data.objects if o.name.startswith('Lantern')]:
        bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)


def fit_plants(rooms, small=()):
    """rooms: {name: (x0, y0, x1, y1)} in plan coords; plants in rooms named in `small` get pots of at most 0.5 m."""
    roots = [o for o in bpy.data.objects if o.parent is None and o.name.startswith('DiffuseTransmissionPlant_root')]
    placed = []
    for r in roots:
        pot = [c for c in r.children_recursive if c.name.startswith('pot')]
        leaves = [c for c in r.children_recursive if c.name.startswith('leaves')]
        if not pot: continue
        x0, x1, y0, y1 = _bbox(pot)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        room = next((k for k, (a, b, c, d) in rooms.items() if a - 0.3 <= cx <= c + 0.3 and b - 0.3 <= cy <= d + 0.3), None)
        if room is None: continue
        a, b, c, d = rooms[room]
        for _ in range(4):  # scale until pot and leaves fit the room
            x0, x1, y0, y1 = _bbox(pot)
            lx0, lx1, ly0, ly1 = _bbox(leaves or pot)
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            k = min(1.0, (0.5 if room in small else 0.75) / max(x1 - x0, y1 - y0),
                    (c - a - 0.1) / max(lx1 - lx0, 1e-3), (d - b - 0.1) / max(ly1 - ly0, 1e-3))
            if k > 0.98: break
            piv = Vector((cx, -cy, 0))
            r.matrix_world = Matrix.Translation(piv) @ Matrix.Scale(k, 4) @ Matrix.Translation(-piv) @ r.matrix_world
        x0, x1, y0, y1 = _bbox(pot)
        lx0, lx1, ly0, ly1 = _bbox(leaves or pot)
        m = 0.05
        dx = max(0, a + m - min(x0, lx0 + 0.05)) - max(0, max(x1, lx1 - 0.05) - (c - m))
        dy = max(0, b + m - min(y0, ly0 + 0.05)) - max(0, max(y1, ly1 - 0.05) - (d - m))
        r.matrix_world = Matrix.Translation(Vector((dx, -dy, 0))) @ r.matrix_world
        bb = _bbox(pot)
        clash = next((p for p in placed if bb[0] < p[1][1] and p[1][0] < bb[1] and bb[2] < p[1][3] and p[1][2] < bb[3]), None)
        if clash:
            keep_new = (bb[1] - bb[0]) > (clash[1][1] - clash[1][0])
            gone = clash[0] if keep_new else r
            print('plant removed (overlap)', gone.name)
            if keep_new: placed.remove(clash); placed.append((r, bb))
            remove_tree(gone)
            if not keep_new: continue
        else:
            placed.append((r, bb))
        print('plant', room, [round(v, 2) for v in _bbox(pot)])


def move_soaps():
    for s in [o for o in bpy.data.objects if re.match(r'^Bath_D\d_soap(\.\d+)?$', o.name)]:
        tag = re.match(r'^(Bath_D\d)_soap(\.\d+)?$', s.name)
        suf = tag.group(2) or ''
        stone = bpy.data.objects.get(f'{tag.group(1)}_stone{suf}')
        basin = bpy.data.objects.get(f'{tag.group(1)}_basin{suf}')
        pump = bpy.data.objects.get(f'{tag.group(1)}_soap_pump{suf}')
        if not (stone and basin): continue
        sx0, sx1, sy0, sy1 = _bbox([s])
        tx0, tx1, ty0, ty1 = _bbox([stone])
        bx0, bx1, by0, by1 = _bbox([basin])
        bcx, bcy, rx, ry = (bx0 + bx1) / 2, (by0 + by1) / 2, (bx1 - bx0) / 2, (by1 - by0) / 2
        h = (sx1 - sx0) / 2 + 0.01
        corners = [(x, y) for x in (tx0 + h, tx1 - h) for y in (ty0 + h, ty1 - h)
                   if ((x - bcx) / (rx + h)) ** 2 + ((y - bcy) / (ry + h)) ** 2 > 1]
        if not corners: continue
        ocx, ocy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
        nx, ny = min(corners, key=lambda p: (p[0] - ocx) ** 2 + (p[1] - ocy) ** 2)
        d = Matrix.Translation(Vector((nx - ocx, -(ny - ocy), 0)))
        for o in (s, pump):
            if o: o.matrix_world = d @ o.matrix_world
        print('soap moved', s.name, round(nx, 3), round(ny, 3))


def teak_deck():
    m = bpy.data.materials.get('Teak_Deck')
    if not m: return
    nt = m.node_tree
    br = next(n for n in nt.nodes if n.type == 'TEX_BRICK')
    mp = next(n for n in nt.nodes if n.type == 'MAPPING')
    mp.inputs['Scale'].default_value = (1, 1, 1)
    br.inputs['Color1'].default_value = (0.36, 0.22, 0.12, 1)
    br.inputs['Color2'].default_value = (0.30, 0.18, 0.10, 1)
    br.inputs['Mortar'].default_value = (0.09, 0.055, 0.03, 1)
    br.inputs['Mortar Size'].default_value = 0.004
    br.inputs['Brick Width'].default_value = 1.2
    br.inputs['Row Height'].default_value = 0.14


def remove_table_flowers():
    for n in ('GlassVaseFlowers_root', 'Flowers1'):
        o = bpy.data.objects.get(n)
        if o: remove_tree(o)
