"""Block A, 1st floor (podium ground floor): architecture, materials and lighting for the 360° tour.

Blender X = u (site plan east), Y = v (north), Z up, metres; floor at 0 (data: interior/A1_floor.json,
dumped from src/data/podium.ts). Run inside Blender with A1.blend open:
    exec(open('<repo>/interior/tools/build_a1_arch.py').read())
"""
import bpy, bmesh, json, math, os, random
from mathutils import Vector

ROOT = os.path.expanduser('~/Desktop/tenger-residence 2/interior')
D = json.load(open(os.path.join(ROOT, 'A1_floor.json')))
F = D['floor']
SP = {s['id']: s for s in F['spaces']}
H_HALL, H_SHOP = 4.2, 4.0
rnd = random.Random(7)

def coll(name):
    c = bpy.data.collections.get(name)
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o, do_unlink=True)
    else:
        c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c)
    return c
ARCH = coll('A1_Arch'); LIGHTS = coll('A1_Lights')

def obj(name, me, c=ARCH):
    o = bpy.data.objects.new(name, me); c.objects.link(o); return o

def inpoly(p, poly):
    x, y = p; ins = False; j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi: ins = not ins
        j = i
    return ins

# ---------------------------------------------------------------- materials
def nodes(m):
    m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bs.outputs[0], out.inputs[0]); return nt, bs

def mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); return m

def tile_mat(name, size, c1, c2, grout, rough, vein=0.0):
    """Polished large-format porcelain: per-tile tone, soft veining, thin grout, low roughness."""
    m = mat(name); nt, bs = nodes(m); L = nt.links
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / size[0], 1 / size[1], 1)
    L.new(tc.outputs['Object'], mp.inputs[0])
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.offset = 0.5 if size[0] != size[1] else 0.0; br.offset_frequency = 1
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.0025 / size[1]
    br.inputs['Mortar Smooth'].default_value = 0.2
    br.inputs['Brick Width'].default_value = 1.0; br.inputs['Row Height'].default_value = 1.0
    br.inputs['Color1'].default_value = (*c1, 1); br.inputs['Color2'].default_value = (*c2, 1)
    br.inputs['Mortar'].default_value = (*grout, 1)
    L.new(mp.outputs[0], br.inputs['Vector'])
    col = br.outputs['Color']
    if vein:
        tc2 = nt.nodes.new('ShaderNodeTexCoord')
        wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'DIAGONAL'
        wv.inputs['Scale'].default_value = 0.6; wv.inputs['Distortion'].default_value = 9
        wv.inputs['Detail'].default_value = 6; wv.inputs['Detail Scale'].default_value = 1.5
        L.new(tc2.outputs['Object'], wv.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = 0.86
        ramp.color_ramp.elements[0].color = (1, 1, 1, 1); ramp.color_ramp.elements[1].color = (0.82, 0.8, 0.78, 1)
        L.new(wv.outputs['Fac'], ramp.inputs[0])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
        mx.inputs['Factor'].default_value = vein
        L.new(col, mx.inputs[6]); L.new(ramp.outputs[0], mx.inputs[7]); col = mx.outputs[2]
    L.new(col, bs.inputs['Base Color'])
    # roughness: polished tile, matte grout, faint smudges
    ns = nt.nodes.new('ShaderNodeTexNoise'); ns.inputs['Scale'].default_value = 3.0
    rr = nt.nodes.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough * 0.6; rr.inputs['To Max'].default_value = rough * 1.6
    L.new(ns.outputs['Fac'], rr.inputs['Value'])
    mx2 = nt.nodes.new('ShaderNodeMix'); mx2.data_type = 'FLOAT'
    L.new(br.outputs['Fac'], mx2.inputs['Factor']); L.new(rr.outputs[0], mx2.inputs[2]); mx2.inputs[3].default_value = 0.7
    L.new(mx2.outputs[0], bs.inputs['Roughness'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25; bump.inputs['Distance'].default_value = 0.002
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1
    L.new(br.outputs['Fac'], inv.inputs[1]); L.new(inv.outputs[0], bump.inputs['Height']); L.new(bump.outputs[0], bs.inputs['Normal'])
    bs.inputs['Coat Weight'].default_value = 0.15
    return m

def plain(name, color, rough=0.5, metal=0.0, emit=None, strength=0.0, alpha=None):
    m = mat(name); nt, bs = nodes(m)
    bs.inputs['Base Color'].default_value = (*color, 1); bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    if emit:
        bs.inputs['Emission Color'].default_value = (*emit, 1); bs.inputs['Emission Strength'].default_value = strength
    return m

M = {
 'hallfloor': tile_mat('A1_HallPorcelain', (1.2, 0.6), (0.62, 0.60, 0.57), (0.58, 0.565, 0.54), (0.42, 0.41, 0.39), 0.10, vein=0.25),
 'shopfloor': tile_mat('A1_ShopPorcelain', (0.6, 0.6), (0.44, 0.44, 0.43), (0.40, 0.40, 0.395), (0.3, 0.3, 0.3), 0.25),
 'wall': bpy.data.materials['Wall_WarmPlaster'],
 'paint': plain('A1_WhitePaint', (0.70, 0.70, 0.69), 0.6),
 'darkceil': plain('A1_ExposedCeiling', (0.05, 0.05, 0.055), 0.8),
 'ceiling': bpy.data.materials['Ceiling'],
 'glass': bpy.data.materials['Window_Glass'],
 'frame': plain('A1_Anodised', (0.06, 0.065, 0.07), 0.35, 1.0),
 'steel': bpy.data.materials['Detail_BrushedSteel'],
 'column': plain('A1_ColumnWhite', (0.70, 0.69, 0.67), 0.35),
 'led': plain('A1_LED', (1, 1, 1), 0.5, emit=(1.0, 0.95, 0.88), strength=18),
 'ledcool': plain('A1_LEDCool', (1, 1, 1), 0.5, emit=(0.95, 0.97, 1.0), strength=14),
 'housing': plain('A1_Housing', (0.9, 0.9, 0.9), 0.4),
 'dark': plain('A1_DarkGrey', (0.12, 0.12, 0.13), 0.5),
 'void': plain('A1_UpperCeiling', (0.75, 0.75, 0.74), 0.8),
}

# ---------------------------------------------------------------- world
w = bpy.data.worlds.get('A1_World') or bpy.data.worlds.new('A1_World')
bpy.context.scene.world = w; w.use_nodes = True; nt = w.node_tree
for n in list(nt.nodes): nt.nodes.remove(n)
tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value[2] = math.radians(70)
env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(os.path.join(ROOT, 'hdri', 'modern_buildings_2_4k.hdr'), check_existing=True)
bg = nt.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = 2.2
out = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(tc.outputs['Generated'], mp.inputs[0]); nt.links.new(mp.outputs[0], env.inputs[0])
nt.links.new(env.outputs[0], bg.inputs[0]); nt.links.new(bg.outputs[0], out.inputs[0])

# ---------------------------------------------------------------- helpers
def poly_mesh(name, poly, z, m, flip=False):
    bm = bmesh.new(); vs = [bm.verts.new((x, y, z)) for x, y in poly]
    f = bm.faces.new(vs if not flip else vs[::-1]); bmesh.ops.recalc_face_normals(bm, faces=[f])
    if (f.normal.z < 0) != flip: f.normal_flip()
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    return obj(name, me)

def box(name, x0, y0, z0, x1, y1, z1, m, c=ARCH):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector(((x0 + x1) / 2 + v.co.x * abs(x1 - x0), (y0 + y1) / 2 + v.co.y * abs(y1 - y0), (z0 + z1) / 2 + v.co.z * abs(z1 - z0)))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    return obj(name, me, c)

def seg_box(name, p, q, z0, z1, t, m, off=0.0, c=ARCH):
    """A slab of thickness t along the segment p->q (centred on it, shifted `off` to the left)."""
    p, q = Vector((*p, 0)), Vector((*q, 0)); d = q - p; L = d.length
    if L < 1e-4: return None
    n = Vector((-d.y, d.x, 0)).normalized()
    bm = bmesh.new()
    a = [p + n * (off - t / 2), q + n * (off - t / 2), q + n * (off + t / 2), p + n * (off + t / 2)]
    vs = [bm.verts.new((v.x, v.y, z0)) for v in a] + [bm.verts.new((v.x, v.y, z1)) for v in a]
    for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(m)
    return obj(name, me, c)

def glazing(tag, pts, h, pane=1.5, closed=False):
    """Floor-to-ceiling curtain wall along a polyline: glass, mullions at every vertex and every `pane` m."""
    segs = list(zip(pts, pts[1:] + ([pts[0]] if closed else [])))
    for i, (p, q) in enumerate(segs):
        seg_box(f'{tag}_Glass_{i}', p, q, 0.08, h - 0.1, 0.012, M['glass'])
        seg_box(f'{tag}_Sill_{i}', p, q, 0.0, 0.08, 0.16, M['frame'])
        seg_box(f'{tag}_Head_{i}', p, q, h - 0.1, h, 0.16, M['frame'])
        seg_box(f'{tag}_Transom_{i}', p, q, 2.95, 3.0, 0.1, M['frame'])
        L = math.dist(p, q); k = max(1, round(L / pane))
        for j in range(k + 1):
            if j == k and i < len(segs) - 1: continue
            t = j / k; x = p[0] + (q[0] - p[0]) * t; y = p[1] + (q[1] - p[1]) * t
            d = Vector((q[0] - p[0], q[1] - p[1], 0)).normalized() * 0.03
            seg_box(f'{tag}_Mullion_{i}_{j}', (x - d.x, y - d.y), (x + d.x, y + d.y), 0, h, 0.16, M['frame'])

def walls(tag, pts, h, m, t=0.2, closed=False):
    for i, (p, q) in enumerate(zip(pts, pts[1:] + ([pts[0]] if closed else []))):
        seg_box(f'{tag}_{i}', p, q, 0, h, t, m)

# ---------------------------------------------------------------- floors and ceilings
hall = [tuple(p) for p in SP['101']['outline']]
shop = [tuple(p) for p in SP['102']['outline']]
poly_mesh('Floor_Hall', hall, 0, M['hallfloor'])
poly_mesh('Floor_Shop', shop, 0, M['shopfloor'])
for k in ('103', 'lobby-b', '108', 'corridor'):
    poly_mesh(f'Floor_{k}', [tuple(p) for p in SP[k]['outline']], 0, M['hallfloor'])
poly_mesh('Ceiling_Hall', hall, H_HALL, M['ceiling'], flip=True)
poly_mesh('Ceiling_Shop', shop, H_SHOP + 0.5, M['darkceil'], flip=True)
# escalator void through the hall ceiling, up to the 2nd floor
esc = SP['escalators']['outline']; ex0, ex1 = min(p[0] for p in esc), max(p[0] for p in esc); ey0, ey1 = min(p[1] for p in esc), max(p[1] for p in esc)
c = bpy.data.objects['Ceiling_Hall']
cut = box('VoidCut', ex0 - 0.3, ey0 - 0.3, H_HALL - 1, ex1 + 0.3, ey1 + 0.3, H_HALL + 1, M['dark'])
md = c.modifiers.new('void', 'BOOLEAN'); md.object = cut; md.operation = 'DIFFERENCE'; md.solver = 'EXACT'
bpy.context.view_layer.objects.active = c; bpy.ops.object.modifier_apply(modifier='void')
bpy.data.objects.remove(cut, do_unlink=True)
for nm, a, b in (('VoidN', (ex0 - .3, ey1 + .3), (ex1 + .3, ey1 + .3)), ('VoidS', (ex0 - .3, ey0 - .3), (ex1 + .3, ey0 - .3)),
                 ('VoidW', (ex0 - .3, ey0 - .3), (ex0 - .3, ey1 + .3)), ('VoidE', (ex1 + .3, ey0 - .3), (ex1 + .3, ey1 + .3))):
    seg_box(nm, a, b, H_HALL, 4.5 + 0.3, 0.05, M['column'])
    seg_box(nm + '_Rail', a, b, 4.8, 5.85, 0.015, M['glass'])
    seg_box(nm + '_Rail', a, b, 5.85, 5.9, 0.06, M['steel'])
box('Upper_Ceiling', ex0 - 3, ey0 - 3, 8.1, ex1 + 3, ey1 + 3, 8.15, M['void'])
box('Upper_Floor', ex0 - 3, ey0 - 3, 4.5, ex0 - 0.35, ey1 + 3, 4.52, M['hallfloor'])
box('Upper_Floor_E', ex1 + 0.35, ey0 - 3, 4.5, ex1 + 3, ey1 + 3, 4.52, M['hallfloor'])

# ---------------------------------------------------------------- walls and glazing
# hall 101: the whole outside edge, north side and rounded west end, is a glass shopfront
glazing('Hall_Front', hall[0:11], H_HALL)
walls('Hall_Wall', [hall[10], hall[11]], H_HALL, M['wall'])
# hall | supermarket: open front over the tills (u -11..-2), glazed beyond it
glazing('Shop_Front', [(-2.0, 3.11), (3.28, 3.11), (3.28, 13.41), (-5.12, 13.41), (-5.12, 24.22)], H_HALL)
box('Shop_Fascia', -11.22, 3.01, 3.0, -2.0, 3.21, H_HALL, M['column'])
# supermarket outer walls: glass to the west street, solid elsewhere
glazing('Shop_West', [(-11.12, 3.11), (-11.12, -15.59)], H_SHOP)
walls('Shop_Wall', [(-11.12, -15.59), (-4.02, -15.59), (-4.02, -8.89), (17.68, -8.89), (17.68, 31.31), (10.48, 31.31), (10.48, 24.11), (3.28, 24.11), (3.28, 26.91), (-3.92, 26.91), (-3.92, 24.11), (-5.12, 24.11)], H_SHOP, M['paint'])
# the west stair core inside the hall
sw = SP['stairs-w']['outline']; sx0, sx1 = min(p[0] for p in sw), max(p[0] for p in sw); sy0, sy1 = min(p[1] for p in sw), max(p[1] for p in sw)
walls('StairW', [(sx0, sy0), (sx0, sy1), (sx1, sy1), (sx1, sy0)], H_HALL, M['wall'])
seg_box('StairW_S_a', (sx0, sy0), (sx0 + 1.6, sy0), 0, H_HALL, 0.2, M['wall'])
seg_box('StairW_S_b', (sx0 + 2.6, sy0), (sx1, sy0), 0, H_HALL, 0.2, M['wall'])
seg_box('StairW_S_head', (sx0 + 1.6, sy0), (sx0 + 2.6, sy0), 2.4, H_HALL, 0.2, M['wall'])
seg_box('StairW_Door', (sx0 + 1.62, sy0 - 0.02), (sx0 + 2.58, sy0 - 0.02), 0, 2.38, 0.05, M['steel'])

# ---------------------------------------------------------------- columns on the structural grid
U = D['grid']['u'] + [17.68]; V = D['grid']['v']
cols = []
for u in U:
    for v in V:
        for poly, h, rnd_col in ((hall, H_HALL, True), (shop, H_SHOP, False)):
            if not inpoly((u, v), poly): continue
            near = min(math.dist((u, v), p) for p in poly)
            if near < 0.8 or (ex0 - 0.6 < u < ex1 + 0.6 and ey0 - 0.6 < v < ey1 + 0.6): continue
            if rnd_col:
                bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.32, depth=h, location=(u, v, h / 2))
                o = bpy.context.active_object; o.name = f'Column_{u}_{v}'; o.data.materials.append(M['column'])
                for cc in o.users_collection: cc.objects.unlink(o)
                ARCH.objects.link(o); bpy.ops.object.shade_smooth()
            else:
                box(f'Column_{u}_{v}', u - .3, v - .3, 0, u + .3, v + .3, h, M['column'])
            cols.append((u, v))

# ---------------------------------------------------------------- lighting
def area(name, loc, size, power, shape='DISK', size_y=None, color=(1, 0.93, 0.84), rot=(0, 0, 0)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = shape; ld.size = size
    if size_y: ld.size_y = size_y
    ld.energy = power; ld.color = color
    o = bpy.data.objects.new(name, ld); o.location = loc; o.rotation_euler = rot; LIGHTS.objects.link(o); return o

# hall: recessed downlights on a 2.4 m grid (a glowing disc you can see, an area light that lights)
n = 0
for i in range(-9, 2):
    for j in range(2, 11):
        x, y = -18.5 + i * 0 + (i + 9) * 2.4, 3.6 + (j - 2) * 2.4
        if not inpoly((x, y), hall) or min(math.dist((x, y), p) for p in hall) < 0.7: continue
        if ex0 - 0.5 < x < ex1 + 0.5 and ey0 - 0.5 < y < ey1 + 0.5: continue
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.09, depth=0.02, location=(x, y, H_HALL - 0.005))
        o = bpy.context.active_object; o.name = f'Downlight_{n}'; o.data.materials.append(M['led'])
        for cc in o.users_collection: cc.objects.unlink(o)
        ARCH.objects.link(o)
        area(f'DL_{n}', (x, y, H_HALL - 0.03), 0.16, 45); n += 1
# a continuous light cove along the glazed front
for i, (p, q) in enumerate(zip(hall[0:10], hall[1:11])):
    seg_box(f'Cove_{i}', p, q, H_HALL - 0.06, H_HALL - 0.02, 0.06, M['led'], off=-0.45)
# supermarket: linear LED lines running north-south over the aisles, 3 m apart
n = 0
for k in range(-4, 7):
    x = 2.18 + 3.0 * k - 3.0
    for y0 in (-14.5, -7.0, 0.5, 8.0, 15.5, 23.0):
        cy = y0 + 2.9
        if not (inpoly((x, y0), shop) and inpoly((x, y0 + 5.8), shop)): continue
        box(f'Linear_{n}', x - 0.04, y0, H_SHOP - 0.6, x + 0.04, y0 + 5.8, H_SHOP - 0.55, M['housing'])
        box(f'LinearLED_{n}', x - 0.035, y0, H_SHOP - 0.605, x + 0.035, y0 + 5.8, H_SHOP - 0.6, M['ledcool'])
        for hx in (y0 + 0.4, y0 + 5.4):
            box(f'Hanger_{n}_{hx}', x - 0.003, hx - 0.003, H_SHOP - 0.55, x + 0.003, hx + 0.003, H_SHOP, M['steel'])
        area(f'LL_{n}', (x, cy, H_SHOP - 0.62), 0.07, 150, shape='RECTANGLE', size_y=5.8, color=(0.97, 0.97, 1.0)); n += 1
# exposed services in the supermarket: two silver ducts running north-south, black cable trays
for k, x in enumerate((-0.82 + 1.5, 8.18 + 1.5)):
    for y0, y1 in ((-8.5, 23.5),):
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.32, depth=y1 - y0, location=(x, (y0 + y1) / 2, H_SHOP + 0.05), rotation=(math.pi / 2, 0, 0))
        o = bpy.context.active_object; o.name = f'Duct_{k}'; o.data.materials.append(M['steel'])
        for cc in o.users_collection: cc.objects.unlink(o)
        ARCH.objects.link(o); bpy.ops.object.shade_smooth()
for k, x in enumerate((-2.32 + 1.5, 5.18, 11.18)):
    box(f'Tray_{k}', x - 0.15, -8.5, H_SHOP + 0.25, x + 0.15, 30.5, H_SHOP + 0.3, M['dark'])
# the upper floor seen through the escalator void
for i in range(3):
    area(f'Up_{i}', (ex0 + 1.6, ey0 + 1 + i * 2.5, 8.05), 0.3, 120)

sc = bpy.context.scene
sc.view_settings.view_transform = 'AgX'; sc.view_settings.exposure = -0.9; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.cycles.use_light_tree = True
print('arch ok', len(cols), 'columns')
