"""Poly Haven (CC0) textures and props for an apartment scene; called by upgrade_interior.py.

Textures replace the flat procedural colours of the floor, stone, wood and fabrics (box-projected in object
space, so no UVs are needed). Props (plants, vases, books, bowls, a cutting board, clocks) go on the tables,
counters, consoles and nightstands found by name, and big plants stand on free floor near the windows.
Everything is placed by rule, so D, E and F (and their mirrors) get the same treatment.
"""
import os, math, random
import bpy
from mathutils import Vector

ASSETS = ''


def _bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def _mat(o):
    return o.data.materials[0].name if o.type == 'MESH' and o.data.materials and o.data.materials[0] else ''


def _base(name):
    return name.split('.')[0]


# ------------------------------------------------------------------------------------------------ textures
def _tex(tid, kind):
    for k in ([kind] if kind != 'Rough' else ['Rough', 'arm']):
        f = os.path.join(ASSETS, 'textures', tid, f'{tid}_{k}_2k.jpg')
        if os.path.exists(f):
            return f, k
    return None, None


def textured(mat_name, tid, scale=1.0, tint=None, keep_color=False, normal=1.0, rough_bias=0.0, project='BOX'):
    """Give material `mat_name` the Poly Haven texture `tid`. scale: repeats per metre."""
    m = bpy.data.materials.get(mat_name)
    diff, _ = _tex(tid, 'Diffuse')
    if not m or not (diff or keep_color or tint or _tex(tid, 'nor_gl')[0]):
        return False
    nt = m.node_tree
    p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not p:
        return False
    old = tuple(p.inputs['Base Color'].default_value)
    for n in list(nt.nodes):
        if n not in (p,) and n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])

    def img(path, non_color):
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            t.image.colorspace_settings.name = 'Non-Color'
        t.projection = project
        t.projection_blend = 0.25
        nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        return t

    col = img(diff, False).outputs['Color'] if diff else None
    if col is None:
        p.inputs['Base Color'].default_value = tint or old
    elif keep_color or tint:
        # keep the designer's colour, take only the texture's light and dark (fabric weave, grain)
        bw = nt.nodes.new('ShaderNodeRGBToBW')
        nt.links.new(col, bw.inputs[0])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = tint or old
        gain = nt.nodes.new('ShaderNodeMath')
        gain.operation = 'MULTIPLY_ADD'
        gain.inputs[1].default_value = 1.1
        gain.inputs[2].default_value = 0.45
        nt.links.new(bw.outputs[0], gain.inputs[0])
        nt.links.new(gain.outputs[0], mix.inputs['B'])
        col = mix.outputs['Result']
    if col is not None:
        nt.links.new(col, p.inputs['Base Color'])
    rf, rk = _tex(tid, 'Rough')
    if rf:
        r = img(rf, True)
        out = r.outputs['Color']
        if rk == 'arm':
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(out, sep.inputs[0])
            out = sep.outputs['Green']
        if rough_bias:
            add = nt.nodes.new('ShaderNodeMath')
            add.operation = 'ADD'
            add.use_clamp = True
            add.inputs[1].default_value = rough_bias
            nt.links.new(out, add.inputs[0])
            out = add.outputs[0]
        nt.links.new(out, p.inputs['Roughness'])
    nf, _ = _tex(tid, 'nor_gl')
    if nf and normal > 0:
        n = img(nf, True)
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return True


def textures():
    done = []
    rules = [
        # material,            texture,            per metre, options
        ('Oak_Floor', 'laminate_floor_02', 0.42, dict(normal=0.6, tint=(0.62, 0.47, 0.3, 1))),
        ('Marble_Warm', 'marble_01', 0.8, dict(normal=0.3, rough_bias=-0.1, tint=(0.83, 0.81, 0.77, 1))),
        ('Revision_Limestone', 'marble_01', 0.8, dict(normal=0.3, tint=(0.78, 0.74, 0.66, 1))),
        ('Walnut', 'dark_wood', 0.9, dict(normal=0.5)),
        ('Oak_Furniture', 'oak_veneer_01', 0.9, dict(normal=0.4)),
        ('Oak_Side', 'oak_veneer_01', 0.9, dict(normal=0.4)),
        ('Door_Oak', 'oak_veneer_01', 0.7, dict(normal=0.3)),
        ('Wool_Rug', 'fabric_pattern_05', 1.6, dict(keep_color=True, normal=1.0)),
        ('Wool_Rug_Rust', 'fabric_pattern_05', 1.6, dict(keep_color=True, normal=1.0)),
        ('Linen_Sand', 'fabric_pattern_07', 3.0, dict(keep_color=True, normal=0.8)),
        ('Cushion_Cream', 'fabric_pattern_07', 3.0, dict(keep_color=True, normal=0.8)),
        ('Detail_SofaLinen', 'fabric_pattern_07', 3.0, dict(keep_color=True, normal=0.8)),
        ('Duvet_Oat', 'fabric_pattern_07', 3.0, dict(keep_color=True, normal=0.6)),
        ('Throw_Knit', 'velour_velvet', 2.0, dict(keep_color=True, normal=1.0)),
        ('Wall_WarmPlaster', 'plastered_wall_04', 0.5, dict(keep_color=True, normal=0.25, tint=(0.9, 0.88, 0.84, 1))),
    ]
    finish = os.environ.get('FINISH', 'warm')
    rules = [FINISHES.get(finish, {}).get(r[0], r) for r in rules]
    for mat, tid, sc, kw in rules:
        if textured(mat, tid, sc, **kw):
            done.append(mat)
    for mat, colour in CABINETS.get(finish, {}).items():
        m = bpy.data.materials.get(mat)
        p = m and next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if p:
            p.inputs['Base Color'].default_value = colour
    print('textured:', ', '.join(done), '| finish', finish)


# The three finish packages a buyer can pick (FINISH=warm|light|dark): floor, joinery, doors and worktops.
# warm is the scene as designed; the other two swap these materials.
FINISHES = {
    'light': {
        'Oak_Floor': ('Oak_Floor', 'herringbone_parquet', 0.55, dict(normal=0.5, tint=(0.8, 0.69, 0.53, 1))),
        'Walnut': ('Walnut', 'oak_veneer_01', 0.9, dict(normal=0.4, tint=(0.72, 0.6, 0.44, 1))),
        'Oak_Furniture': ('Oak_Furniture', 'oak_veneer_01', 0.9, dict(normal=0.4, tint=(0.76, 0.65, 0.5, 1))),
        'Door_Oak': ('Door_Oak', 'oak_veneer_01', 0.7, dict(normal=0.3, tint=(0.78, 0.69, 0.55, 1))),
        'Marble_Warm': ('Marble_Warm', 'marble_01', 0.8, dict(normal=0.3, rough_bias=-0.1, tint=(0.92, 0.91, 0.89, 1))),
    },
    'dark': {
        'Oak_Floor': ('Oak_Floor', 'dark_wood', 0.6, dict(normal=0.6, tint=(0.34, 0.23, 0.15, 1))),
        'Oak_Furniture': ('Oak_Furniture', 'dark_wood', 0.9, dict(normal=0.5, tint=(0.32, 0.21, 0.14, 1))),
        'Door_Oak': ('Door_Oak', 'dark_wood', 0.7, dict(normal=0.4, tint=(0.3, 0.2, 0.13, 1))),
        'Marble_Warm': ('Marble_Warm', 'marble_01', 0.8, dict(normal=0.3, rough_bias=-0.1, tint=(0.3, 0.3, 0.31, 1))),
    },
}
# kitchen and wardrobe fronts are plain lacquer: just their colour
CABINETS = {
    'light': {'Cabinet_Greige': (0.84, 0.83, 0.8, 1)},
    'dark': {'Cabinet_Greige': (0.16, 0.16, 0.17, 1)},
}


# ------------------------------------------------------------------------------------------------ props
_cache = {}


def _load(mid):
    """Import a Poly Haven glTF once; returns a hidden template collection."""
    if mid in _cache:
        return _cache[mid]
    f = os.path.join(ASSETS, 'models', mid, f'{mid}.gltf')
    if not os.path.exists(f):
        _cache[mid] = None
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    col = bpy.data.collections.new(f'PH_{mid}')
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
    _cache[mid] = col
    return col


def _footprint(col):
    lo = Vector((1e9, 1e9, 1e9)); hi = -lo
    for o in col.objects:
        if o.type != 'MESH':
            continue
        a, b = _bbox(o)
        lo = Vector(map(min, lo, a)); hi = Vector(map(max, hi, b))
    return lo, hi


def place(mid, at, z, yaw=None, height=None, scene_col=None):
    """Put prop `mid` with its base at height z, centred on `at` (x, y). height: scale to this height."""
    col = _load(mid)
    if not col:
        return None
    lo, hi = _footprint(col)
    inst = bpy.data.objects.new(f'Prop_{mid}', None)
    inst.instance_type = 'COLLECTION'
    inst.instance_collection = col
    s = 1.0 if not height else height / max(hi.z - lo.z, 1e-3)
    inst.scale = (s, s, s)
    yaw = random.uniform(0, 2 * math.pi) if yaw is None else yaw
    inst.rotation_euler = (0, 0, yaw)
    c = (lo + hi) / 2
    off = Vector((c.x, c.y, lo.z)) * s
    off.rotate(inst.rotation_euler)
    inst.location = (at[0] - off.x, at[1] - off.y, z - off.z)
    (scene_col or bpy.context.scene.collection).objects.link(inst)
    return inst, (hi.x - lo.x) * s, (hi.y - lo.y) * s


def _blockers(lo, hi, top, surface=None):
    """Footprints of what a prop on the surface lo..hi at height top must keep clear of: the things standing on it,
    the things let into it (a hob, a sink) and the things rising past it (a tall fridge unit beside a worktop).
    Shells far bigger than the surface (a room's walls as one mesh) are left out, or nothing would fit anywhere."""
    out = []
    area = max((hi.x - lo.x) * (hi.y - lo.y), 1e-3)
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.hide_render or o == surface:
            continue
        a, b = _bbox(o)
        if a.z > top + 0.25 or b.z < top - 0.005:
            continue
        if b.x < lo.x or a.x > hi.x or b.y < lo.y or a.y > hi.y:
            continue
        if (b.x - a.x) * (b.y - a.y) > 4 * area:
            continue
        # A box round most of the surface is a shell (an L-shaped wall), not a thing on it.
        ox = min(b.x, hi.x) - max(a.x, lo.x); oy = min(b.y, hi.y) - max(a.y, lo.y)
        if ox * oy > 0.6 * area:
            continue
        out.append((a.x, a.y, b.x, b.y))
    return out


def _free_spot(lo, hi, r, blocks, prefer, margin=0.04):
    """The free centre nearest `prefer` for a footprint of half-size r (a number, or (half x, half y))."""
    rx, ry = r if isinstance(r, tuple) else (r, r)
    best = None
    nx = max(1, int((hi.x - lo.x) / 0.05)); ny = max(1, int((hi.y - lo.y) / 0.05))
    for i in range(nx + 1):
        for j in range(ny + 1):
            x = lo.x + rx + margin + (hi.x - lo.x - 2 * (rx + margin)) * i / nx
            y = lo.y + ry + margin + (hi.y - lo.y - 2 * (ry + margin)) * j / ny
            if x - rx < lo.x or x + rx > hi.x or y - ry < lo.y or y + ry > hi.y:
                continue
            if any(x + rx > a and x - rx < c and y + ry > b and y - ry < d for a, b, c, d in blocks):
                continue
            dist = (Vector((x, y)) - Vector(prefer)).length
            if best is None or dist < best[0]:
                best = (dist, x, y)
    return best and (best[1], best[2])


def on_surface(surface, items):
    """items: [(model id, radius m, prefer 'centre'|'end0'|'end1'|(u, v) in 0..1, height or None)]

    The radius only picks a first spot: once placed, a prop's real footprint (its size after scaling, turned by its
    yaw) must be clear too, or it moves to a spot that is, or it is left out. A wicker basket given 0.15 m was in fact
    some 0.45 m long, and in plan F it went half into the tall fridge unit beside the worktop."""
    lo, hi = _bbox(surface)
    top = hi.z
    blocks = _blockers(lo, hi, top, surface)
    placed = 0
    for mid, rad, prefer, h in items:
        if isinstance(prefer, tuple):
            pt = (lo.x + (hi.x - lo.x) * prefer[0], lo.y + (hi.y - lo.y) * prefer[1])
        else:
            pt = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2)
        spot = _free_spot(lo, hi, rad, blocks, pt)
        if not spot:
            continue
        r = place(mid, spot, top, height=h)
        if not r:
            continue
        inst, sx, sy = r
        c, s_ = abs(math.cos(inst.rotation_euler.z)), abs(math.sin(inst.rotation_euler.z))
        half = (max(rad, (sx * c + sy * s_) / 2), max(rad, (sx * s_ + sy * c) / 2))
        real = _free_spot(lo, hi, half, blocks, spot, margin=0.01)
        if not real:
            bpy.data.objects.remove(inst)
            continue
        inst.location.x += real[0] - spot[0]
        inst.location.y += real[1] - spot[1]
        blocks.append((real[0] - half[0], real[1] - half[1], real[0] + half[0], real[1] + half[1]))
        placed += 1
    return placed


def floor_plants():
    """One big plant beside a window in each room that has floor space there."""
    floors = [o for o in bpy.data.objects if o.type == 'MESH' and _mat(o) == 'Oak_Floor']
    glass = [o for o in bpy.data.objects if o.type == 'MESH' and _mat(o) == 'Window_Glass']
    tall = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render and _bbox(o)[0].z < 0.3
            and _bbox(o)[1].z > 0.05 and not _mat(o).startswith(('Oak_Floor', 'Wool_Rug', 'Revision_WarmGrout'))]
    blocks = []
    for o in tall:
        a, b = _bbox(o)
        if (b.x - a.x) * (b.y - a.y) < 30:
            blocks.append((a.x, a.y, b.x, b.y))
    # keep clear of the 360° camera stops
    import json
    cams = json.load(open(os.path.join(os.path.dirname(ASSETS), f'{PLAN}_cams.json')))
    for x, y, _ in cams.values():
        blocks.append((x - 0.75, -y - 0.75, x + 0.75, -y + 0.75))
    plants = ['pachira_aquatica_01', 'potted_plant_02', 'calathea_orbifolia_01', 'potted_plant_01']
    k = 0
    for g in glass:
        a, b = _bbox(g)
        horiz = (b.x - a.x) > (b.y - a.y)
        for end in (0, 1):
            if horiz:
                x = (a.x - 0.35) if end == 0 else (b.x + 0.35)
                y = a.y + (0.45 if a.y < sum(_bbox(f)[0].y + _bbox(f)[1].y for f in floors) / (2 * len(floors)) else -0.45)
            else:
                y = (a.y - 0.35) if end == 0 else (b.y + 0.35)
                x = a.x + (0.45 if a.x < sum(_bbox(f)[0].x + _bbox(f)[1].x for f in floors) / (2 * len(floors)) else -0.45)
            r = 0.3
            on_floor = any(_bbox(f)[0].x + r < x < _bbox(f)[1].x - r and _bbox(f)[0].y + r < y < _bbox(f)[1].y - r for f in floors)
            if not on_floor or any(x + r > p and x - r < q and y + r > s and y - r < t for p, s, q, t in blocks):
                continue
            mid = plants[k % len(plants)]
            h = {'pachira_aquatica_01': 1.55, 'potted_plant_02': 1.1, 'calathea_orbifolia_01': 0.75, 'potted_plant_01': 0.9}[mid]
            if place(mid, (x, y), 0.0, height=h):
                blocks.append((x - r, y - r, x + r, y + r))
                k += 1
            break  # one per window
        if k >= 4:
            break
    return k


def props():
    n = 0
    by = {}
    for o in bpy.data.objects:
        if o.type == 'MESH' and not o.hide_render:
            by.setdefault(_base(o.name), []).append(o)
    for o in by.get('Dining_Top', []):
        n += on_surface(o, [('wooden_bowl_01', 0.15, 'centre', None), ('ceramic_vase_02', 0.08, (0.5, 0.2), 0.3)])
    for o in by.get('Island_Top', []) + by.get('Kitchen_Run_Top', []):
        n += on_surface(o, [('wooden_cutting_board', 0.2, (0.3, 0.5), None), ('jug_01', 0.08, (0.7, 0.5), None)])
    for o in by.get('Kitchen_Top', []):
        n += on_surface(o, [('tea_set_01', 0.18, (0.5, 0.8), None), ('wicker_basket_01', 0.15, (0.5, 0.2), 0.2)])
    for o in by.get('TV_Console', []):
        n += on_surface(o, [('book_encyclopedia_set_01', 0.15, (0.15, 0.5), None), ('brass_vase_01', 0.08, (0.85, 0.5), 0.3),
                            ('potted_plant_04', 0.1, (0.7, 0.5), None)])
    for o in by.get('Desk', []):
        n += on_surface(o, [('book_encyclopedia_set_01', 0.15, (0.2, 0.3), None), ('potted_plant_04', 0.1, (0.8, 0.3), None)])
    for o in by.get('SideTable_Top', []):
        n += on_surface(o, [('ceramic_vase_01', 0.07, 'centre', 0.25)])
    for i, o in enumerate(by.get('Nightstand', [])):
        n += on_surface(o, [('alarm_clock_01' if i % 2 == 0 else 'standing_picture_frame_01', 0.08, 'centre', None)])
    for o in by.get('Detail_EntryConsoleStone', []):
        n += on_surface(o, [('ceramic_vase_03', 0.08, (0.8, 0.5), 0.35), ('wooden_bowl_01', 0.12, (0.3, 0.5), None)])
    n += floor_plants()
    print('props placed:', n)


PLAN = ''


def run(plan, mood, assets):
    global ASSETS, PLAN
    ASSETS = assets
    PLAN = plan
    random.seed(sum(map(ord, plan)))
    textures()
    props()
