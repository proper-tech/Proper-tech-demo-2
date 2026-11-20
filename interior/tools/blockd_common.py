"""Shared by the block D scene builders (build_blockd.py for floor 1, build_blockd_parking.py for the car parks):
opens the plan-F scene for its materials, sky and furniture pieces, and provides the materials, shape helpers,
the site's car and the render settings. Block metres: Blender X = u east, Y = v north, Z up, floor at 0.
"""
import sys, json, math, random
import bpy
from mathutils import Vector, Matrix

F_BLEND, CAR_GLB, OUT = sys.argv[1:4]
random.seed(11)
bpy.ops.wm.open_mainfile(filepath=F_BLEND)
sc = bpy.context.scene

# ------------------------------------------------------------------ keep F's assets, drop its rooms
KEEP_ROOTS = {
    'plant_big': 'DiffuseTransmissionPlant_root.006',
    'plant_mid': 'DiffuseTransmissionPlant_root.007',
    'plant_small': 'DiffuseTransmissionPlant_root.008',
    'sofa': 'GlamVelvetSofa_root.001',
    'armchair': 'SheenChair_root.003',
}
assets = {}
keep = set()
for key, name in KEEP_ROOTS.items():
    o = bpy.data.objects[name]
    assets[key] = o
    keep.add(o)
    keep.update(o.children_recursive)
for o in list(bpy.data.objects):
    if o not in keep and o.name != 'Pano_F':
        bpy.data.objects.remove(o, do_unlink=True)
cam = bpy.data.objects['Pano_F']
cam.name = 'Pano_D1'
lib = bpy.data.collections.new('Assets')
sc.collection.children.link(lib)
for o in keep:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    lib.objects.link(o)
lib.hide_render = True
lib.hide_viewport = True
coll = bpy.data.collections.new('BlockD_1')
sc.collection.children.link(coll)

# ------------------------------------------------------------------ materials
M = bpy.data.materials

def principled(name, color, rough=0.5, metal=0.0, coat=0.0, emit=None, strength=0.0, alpha=1.0, transmission=0.0):
    m = M.get(name) or M.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(b.outputs[0], o.inputs['Surface'])
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Transmission Weight'].default_value = transmission
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    return m

def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

def noisy(name, base, rough=0.6, scale=6.0, amount=0.12, bump=0.0, metal=0.0, coat=0.0):
    """A colour with a soft cloudy variation (concrete, epoxy, painted plaster)."""
    m = principled(name, srgb(base), rough, metal, coat)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeNewGeometry')  # world position: tiles keep their size on scaled boxes
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = 8
    nt.links.new(tc.outputs['Position'], n.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = amount
    mix.inputs['A'].default_value = (*srgb(base), 1)
    nt.links.new(n.outputs['Fac'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    if bump:
        bn = nt.nodes.new('ShaderNodeBump')
        bn.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], bn.inputs['Height'])
        nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    return m

def tiles(name, base, grout, size, rough=0.3):
    """Square floor tiles of `size` metres with thin grout lines (world coordinates)."""
    m = principled(name, srgb(base), rough)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeNewGeometry')  # world position: tiles keep their size on scaled boxes
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.offset = 0.0
    br.squash = 1.0
    br.inputs['Scale'].default_value = 1.0 / size
    br.inputs['Mortar Size'].default_value = 0.003 / size
    br.inputs['Brick Width'].default_value = 1.0
    br.inputs['Row Height'].default_value = 1.0
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Color1'].default_value = (*srgb(base), 1)
    br.inputs['Color2'].default_value = (*[c * 0.94 for c in srgb(base)], 1)
    br.inputs['Mortar'].default_value = (*srgb(grout), 1)
    nt.links.new(tc.outputs['Position'], br.inputs['Vector'])
    nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
    bn = nt.nodes.new('ShaderNodeBump')
    bn.inputs['Strength'].default_value = 0.15
    bn.invert = True
    nt.links.new(br.outputs['Fac'], bn.inputs['Height'])
    nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    return m

def ribbed(name, base, pitch=0.5, rough=0.35, metal=0.4):
    """Sectional garage door: horizontal panels with grooves."""
    m = principled(name, srgb(base), rough, metal)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeNewGeometry')  # world position: tiles keep their size on scaled boxes
    w = nt.nodes.new('ShaderNodeTexWave')
    w.wave_type = 'BANDS'
    w.bands_direction = 'Z'
    w.inputs['Scale'].default_value = 1.0 / pitch
    nt.links.new(tc.outputs['Position'], w.inputs['Vector'])
    bn = nt.nodes.new('ShaderNodeBump')
    bn.inputs['Strength'].default_value = 0.35
    nt.links.new(w.outputs['Fac'], bn.inputs['Height'])
    nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    return m

MAT = {
    'plaster': M['Wall_WarmPlaster'],
    'ceiling': M['Ceiling'],
    'frame': M['Window_Frame'],
    'glass': M['Window_Glass'],
    'oak': M['Oak_Furniture'],
    'walnut': M['Walnut'],
    'steel': M['Detail_BrushedSteel'],
    'black': M['Black_Metal'],
    'marble': M['Marble_Warm'],
    'porcelain': M['Revision_GlazedPorcelain'],
    'mirror': M['Mirror'],
    'rug': M['Wool_Rug'],
    'concrete': noisy('D_Concrete', '#a7a6a1', 0.85, 3.0, 0.22, 0.05),
    'concrete_dark': noisy('D_ConcreteDark', '#8c8b86', 0.9, 2.0, 0.25, 0.05),
    'epoxy': noisy('D_Epoxy', '#80878b', 0.32, 1.5, 0.1, 0.0, coat=0.3),
    'shop_floor': tiles('D_ShopTiles', '#bdb7ab', '#8f897e', 0.6, 0.22),
    'wet_floor': tiles('D_WetTiles', '#cfd2d2', '#a9adad', 0.3, 0.25),
    'paint_grey': noisy('D_PaintGrey', '#5d646b', 0.45, 4.0, 0.06),
    'paint_white': noisy('D_PaintWhite', '#eceae4', 0.55, 4.0, 0.04),
    'red': principled('D_Red', srgb('#b3171f'), 0.32, 0.2, 0.4),
    'blue': principled('D_Blue', srgb('#1f4f9a'), 0.32, 0.2, 0.4),
    'yellow': principled('D_Yellow', srgb('#e8b10c'), 0.4, 0.0, 0.2),
    'stripe_black': principled('D_StripeBlack', srgb('#1b1b1b'), 0.45),
    'rubber': noisy('D_Rubber', '#191919', 0.85, 20.0, 0.15, 0.2),
    'garage': ribbed('D_GarageDoor', '#d9dcdf'),
    'steel_door': principled('D_SteelDoor', srgb('#7c838a'), 0.4, 0.5),
    'shelf': principled('D_ShelfMetal', srgb('#e4e5e3'), 0.35, 0.3),
    'shelf_dark': principled('D_ShelfDark', srgb('#3a3f44'), 0.4, 0.4),
    'locker': principled('D_Locker', srgb('#9aa3aa'), 0.35, 0.45),
    'cardboard': noisy('D_Cardboard', '#b58b5a', 0.8, 30.0, 0.15),
    'drum': principled('D_Drum', srgb('#1d4f8c'), 0.3, 0.6, 0.3),
    'screen': principled('D_Screen', srgb('#0d1014'), 0.15, 0.0, 0.6, emit=srgb('#24486e'), strength=0.6),
    'panel_light': principled('D_PanelLight', (1, 1, 1), 0.5, emit=(1.0, 0.97, 0.92), strength=5.0),
    'tube_light': principled('D_TubeLight', (1, 1, 1), 0.5, emit=(0.98, 0.99, 1.0), strength=14.0),
    'sign': principled('D_Sign', srgb('#c0262d'), 0.4, emit=srgb('#ff3a3a'), strength=1.2),
    'asphalt': noisy('D_Asphalt', '#4d4f51', 0.85, 8.0, 0.25, 0.1),
    'pavement': tiles('D_Pavement', '#b9b6ae', '#8f8c86', 0.5, 0.7),
    'upholstery': principled('D_Seat', srgb('#3e4a52'), 0.7),
    'chair_shell': principled('D_ChairShell', srgb('#2b2f33'), 0.4),
}
PRODUCT_COLOURS = ['#c62828', '#1565c0', '#f9a825', '#2e7d32', '#212121', '#e65100', '#6a1b9a', '#eceff1',
                   '#00838f', '#bf360c', '#37474f', '#fdd835', '#455a64', '#b71c1c', '#0d47a1']
PRODUCT = [principled(f'D_Product{i}', srgb(h), random.uniform(0.25, 0.6), 0.0, 0.3) for i, h in enumerate(PRODUCT_COLOURS)]

# ------------------------------------------------------------------ geometry helpers
_unit = {}
def unit_mesh(kind='box', seg=24):
    key = (kind, seg)
    if key in _unit:
        return _unit[key]
    me = bpy.data.meshes.new(f'unit_{kind}_{seg}')
    if kind == 'box':
        v = [(x, y, z) for z in (0, 1) for y in (0, 1) for x in (0, 1)]
        f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
        me.from_pydata(v, [], f)
    else:  # cylinder along Z, radius 0.5 around (0.5, 0.5), height 1
        v, f = [], []
        for z in (0, 1):
            for i in range(seg):
                a = 2 * math.pi * i / seg
                v.append((0.5 + 0.5 * math.cos(a), 0.5 + 0.5 * math.sin(a), z))
        for i in range(seg):
            j = (i + 1) % seg
            f.append((i, j, seg + j, seg + i))
        f.append(tuple(range(seg - 1, -1, -1)))
        f.append(tuple(range(seg, 2 * seg)))
        me.from_pydata(v, [], f)
        for p in me.polygons:
            p.use_smooth = len(p.vertices) == 4
    me.update()
    _unit[key] = me
    return me

def tyre_mesh():
    """A tyre 0.66 m across and 0.22 m wide, lying flat, its centre at (0.5, 0.5, 0.5) of a unit box."""
    if 'tyre' in _unit:
        return _unit['tyre']
    R, r, n, m = 0.25, 0.08, 32, 12
    v, f = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        for j in range(m):
            b = 2 * math.pi * j / m
            rr = R + r * math.cos(b) * 1.0
            v.append(((rr * math.cos(a)) / 0.66 + 0.5, (rr * math.sin(a)) / 0.66 + 0.5, (r * 1.4 * math.sin(b)) / 0.22 + 0.5))
    for i in range(n):
        for j in range(m):
            f.append((i * m + j, ((i + 1) % n) * m + j, ((i + 1) % n) * m + (j + 1) % m, i * m + (j + 1) % m))
    me = bpy.data.meshes.new('unit_tyre')
    me.from_pydata(v, [], f)
    for p in me.polygons:
        p.use_smooth = True
    me.update()
    _unit['tyre'] = me
    return me

_mesh_mat = {}
def shaped(kind, mat, seg=24):
    """A unit mesh with one material; shared by every object of that shape and material."""
    key = (kind, seg, mat.name)
    if key not in _mesh_mat:
        me = (tyre_mesh() if kind == 'tyre' else unit_mesh(kind, seg)).copy()
        me.materials.append(mat)
        _mesh_mat[key] = me
    return _mesh_mat[key]

def obj(name, me, loc, scale, rot_z=0.0, parent_coll=None):
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.scale = scale
    o.rotation_euler = (0, 0, rot_z)
    (parent_coll or coll).objects.link(o)
    return o

def box(name, x0, x1, y0, y1, z0, z1, mat):
    x0, x1 = min(x0, x1), max(x0, x1)
    y0, y1 = min(y0, y1), max(y0, y1)
    z0, z1 = min(z0, z1), max(z0, z1)
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return None
    return obj(name, shaped('box', mat), (x0, y0, z0), (x1 - x0, y1 - y0, z1 - z0))

def cyl(name, cx, cy, z0, h, r, mat, seg=24):
    return obj(name, shaped('cyl', mat, seg), (cx - r, cy - r, z0), (2 * r, 2 * r, h))

def rbox(name, cx, cy, z0, l, w, h, mat, rot):
    """A box `l` long along its heading `rot` (radians, 0 = east), `w` wide, centred on (cx, cy)."""
    o = obj(name, shaped('box', mat), (0, 0, 0), (l, w, h))
    o.matrix_world = Matrix.Translation((cx, cy, z0)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Translation((-l / 2, -w / 2, 0)) @ Matrix.Diagonal((l, w, h, 1))
    return o

def prism(name, pts, z0, ztops, mat):
    """A vertical prism over polygon pts, bottom z0, top z at each point (sloped tops under the ramp)."""
    n = len(pts)
    v = [(x, y, z0) for x, y in pts] + [(x, y, z) for (x, y), z in zip(pts, ztops)]
    f = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(v, [], f)
    me.materials.append(mat)
    me.update()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o

def place(asset, x, y, rot=0.0, z=0.0, s=1.0):
    """A linked copy of an F asset (plants, sofa, armchair), its base centred on (x, y)."""
    src = assets[asset]
    pts = [c.matrix_world @ Vector(p) for c in src.children_recursive if c.type == 'MESH' for p in c.bound_box]
    cx = (min(p.x for p in pts) + max(p.x for p in pts)) / 2
    cy = (min(p.y for p in pts) + max(p.y for p in pts)) / 2
    z0 = min(p.z for p in pts)
    root = bpy.data.objects.new(f'{asset}_at', None)
    coll.objects.link(root)
    for c in src.children_recursive:
        if c.type not in ('MESH', 'CURVE'):
            continue
        d = c.copy()
        coll.objects.link(d)
        d.parent = None
        d.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -z0)) @ c.matrix_world
    return root

def area_light(name, x, y, z, sx, sy, power, color=(1.0, 0.96, 0.9)):
    d = bpy.data.lights.new(name, 'AREA')
    d.shape = 'RECTANGLE'
    d.size, d.size_y = sx, sy
    d.energy = power
    d.color = color
    o = bpy.data.objects.new(name, d)
    o.location = (x, y, z)
    coll.objects.link(o)
    return o
def wall_rack(name, cx, cy, length, rot, height=2.4, depth=0.6, levels=4, tyres=False, boxes=True):
    c, s = math.cos(rot), math.sin(rot)
    def at(a, b):
        return cx + c * a - s * b, cy + s * a + c * b
    for e in range(int(length / 1.2) + 1):
        a = -length / 2 + min(e * 1.2, length)
        for b in (-depth / 2, depth / 2):
            x, y = at(a, b)
            rbox(f'{name}_Post{e}{b}', x, y, 0, 0.06, 0.06, height, MAT['blue'], rot)
    for k in range(levels):
        z = 0.12 + k * (height - 0.2) / (levels - 1)
        rbox(f'{name}_Beam{k}', cx, cy, z, length, depth, 0.05, MAT['yellow'] if k % 2 else MAT['shelf'], rot)
        a = -length / 2 + 0.1
        while a < length / 2 - 0.3:
            if tyres:
                x, y = at(a + 0.33, 0)
                o = obj(f'{name}_T{k}{a:.2f}', shaped('tyre', MAT['rubber']), (0, 0, 0), (1, 1, 1))
                o.matrix_world = Matrix.Translation((x, y, z + 0.05 + 0.33)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Translation((-0.33, -0.33, -0.11)) @ Matrix.Diagonal((0.66, 0.66, 0.22, 1))
                a += 0.24
                continue
            w = random.choice([0.3, 0.4, 0.5, 0.6])
            if boxes and random.random() < 0.85:
                h = random.uniform(0.2, 0.45)
                x, y = at(a + w / 2, 0)
                rbox(f'{name}_Box{k}{a:.2f}', x, y, z + 0.05, w - 0.03, depth - 0.1, h, MAT['cardboard'] if random.random() < 0.7 else random.choice(PRODUCT), rot)
            a += w

car_src = None
def load_car():
    global car_src
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=CAR_GLB)
    new = [o for o in bpy.data.objects if o not in before]
    mesh = [o for o in new if o.type == 'MESH'][0]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        lib.objects.link(o)
    mesh.parent = None
    mesh.matrix_world = Matrix.Identity(4)
    # car paint: a clear coat over metallic flake
    for s in mesh.material_slots:
        m = s.material
        b = m.node_tree.nodes.get('Principled BSDF')
        if not b:
            continue
        if 'Paint' in m.name:
            b.inputs['Metallic'].default_value = 0.55
            b.inputs['Roughness'].default_value = 0.32
            b.inputs['Coat Weight'].default_value = 1.0
            b.inputs['Coat Roughness'].default_value = 0.03
        if 'Glass' in m.name:
            b.inputs['Roughness'].default_value = 0.02
            b.inputs['Metallic'].default_value = 0.0
    # which way is the nose? the headlights' side along x
    hl = [i for i, s in enumerate(mesh.material_slots) if 'Headlight' in s.material.name]
    xs = [mesh.data.vertices[v].co.x for p in mesh.data.polygons if p.material_index in hl for v in p.vertices]
    nose = 1 if sum(xs) / max(1, len(xs)) > 0 else -1
    car_src = (mesh, nose)
if CAR_GLB != "none":  # the podium scene has no cars
    load_car()
PAINTS = {}
def car(name, cx, cy, heading, z=0.0, paint='#d8d9db'):
    """The site's car, nose towards `heading` (radians, 0 = east), centred on (cx, cy), wheels at z."""
    mesh, nose = car_src
    o = bpy.data.objects.new(name, mesh.data.copy() if paint not in PAINTS else PAINTS[paint])
    if paint not in PAINTS:
        PAINTS[paint] = o.data
        for s in o.data.materials:
            pass
        slots = o.data.materials
        for i, m in enumerate(slots):
            if m and 'Paint' in m.name:
                pm = m.copy()
                pm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*srgb(paint), 1)
                slots[i] = pm
    coll.objects.link(o)
    o.matrix_world = Matrix.Translation((cx, cy, z)) @ Matrix.Rotation(heading + (0 if nose > 0 else math.pi), 4, 'Z')
    return o


def finish(name, stops, eye=1.55, exposure=-0.9, sun_energy=2.2):
    """Sun, render settings, the panorama camera; save <name>.blend and <name>_cams.json (x = u, y = -v)."""
    global cam
    for o in bpy.data.objects:
        if o.type == 'LIGHT' and o.data.type == 'SUN':
            pass
    sun_d = bpy.data.lights.new('Sun_D', 'SUN')
    sun_d.energy = sun_energy
    sun_d.angle = math.radians(1.0)
    sun = bpy.data.objects.new('Sun_D', sun_d)
    sun.rotation_euler = (math.radians(50), 0, math.radians(125))
    coll.objects.link(sun)
    sc.view_settings.exposure = exposure
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 4096, 2048
    cam.data.type = 'PANO'
    cam.data.panorama_type = 'EQUIRECTANGULAR'
    cam.data.clip_start = 0.05
    for c in list(cam.users_collection):
        c.objects.unlink(cam)
    coll.objects.link(cam)
    sc.camera = cam

    # ------------------------------------------------------------------ the tour stops (u, v) -> [x, y south, z]
    STOPS = stops
    cams = {k: [u, -v, eye] for k, (u, v) in STOPS.items()}
    cam.location = (next(iter(STOPS.values()))[0], next(iter(STOPS.values()))[1], eye)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    # the library of F's pieces is only copied from: drop it, and whatever nothing uses any more
    for o in list(lib.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/{name}.blend', compress=True)
    json.dump(cams, open(f'{OUT}/{name}_cams.json', 'w'), indent=1)
    print('saved', len(bpy.data.objects), 'objects')

