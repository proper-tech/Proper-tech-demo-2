"""Block A, 1st floor: stock the supermarket with real product models instead of the plain packs.

Products (free, unbranded): BlenderKit models (bk_*.blend) and Poly Haven scans (ph_*/, glTF 1k) in
~/Documents/Blender Assets/Grocery. Each model is imported once into the hidden collection
A1_Products, scaled to its real height, its base centred on the origin, front to -Y; shelves,
chillers, till racks and produce tables then get them as geometry-node instances (one point per
product, attributes `pid` = product, `rz` = turn), so thousands of products cost little memory.
Run after build_a1_arch.py and build_a1_fit.py (same namespace: coll, obj, box, F, M, ...)."""
import bpy, bmesh, math, os, random, glob
from mathutils import Vector, Matrix

LIB = os.path.expanduser('~/Documents/Blender Assets/Grocery/')
R2 = random.Random(21)
# file -> real height of its tallest item (m), aisle groups it belongs to
CAT = {
 'bk_russian_food_cans_01': (0.20, 'food canned'), 'bk_glass_jar': (0.12, 'food tea canned'),
 'bk_petbottle': (0.30, 'drinks'), 'bk_plastic_watter_bottle': (0.25, 'drinks chill'),
 'bk_liquid_detergent_bottle': (0.30, 'home clean'), 'bk_joghurt_tubs': (0.11, 'dairy chill'),
 'bk_a_loaf_of_bread': (0.12, 'bakery'), 'bk_bread': (0.13, 'bakery'), 'bk_sunflower_seed_bread': (0.11, 'bakery'),
 'bk_ketchup_bottle': (0.21, 'food'), 'bk_red_squeeze_sauce_bottle': (0.20, 'food'),
 'bk_plastic_packaging_bag': (0.22, 'sweets grain kids'), 'bk_shampoo_bottle': (0.22, 'beauty kids'),
 'bk_soap': (0.19, 'beauty clean kids'), 'bk_organic_fresh_milk_bottle_1l': (0.26, 'dairy chill'),
 'bk_old_fashioned_bottle_of_milk': (0.24, 'dairy chill'), 'bk_eggs_in_an_egg_box_carton': (0.07, 'dairy'),
 'bk_zlakovy_coffee_cereal_based_coffee': (0.16, 'tea sweets'), 'bk_vermicelli_pasta_250g_package': (0.20, 'grain food'),
 'bk_pack_of_orange_pop_drinks': (0.13, 'drinks frozen'), 'bk_case_of_fizzy_lemon_drinks': (0.13, 'drinks frozen'),
 'bk_premium_mocha_mix_jar': (0.15, 'tea sweets'), 'bk_kitchen_set_7_oil_bottles': (0.25, 'food grain'),
 'ph_wine_bottles_01': (0.31, 'drinks'), 'ph_long_life_food': (0.20, 'grain canned food'),
 'ph_multi_cleaner_bottle': (0.28, 'home clean'), 'ph_all_purpose_cleaner': (0.27, 'home clean'),
 'ph_bleach_bottle': (0.27, 'home clean'), 'ph_plastic_bottle_gallon': (0.30, 'home drinks'),
 'ph_hamburger_buns': (0.08, 'bakery'), 'ph_croissant': (0.06, 'bakery'),
}
FRUIT = {'ph_food_apple_01': 0.08, 'ph_food_avocado_01': 0.10, 'ph_food_kiwi_01': 0.065, 'ph_food_lime_01': 0.06,
         'ph_lemon': 0.075, 'ph_food_pears_asian_01': 0.09, 'ph_food_pomegranate_01': 0.10, 'ph_bananas': 0.12,
         'ph_yellow_onion': 0.08, 'ph_sweet_potato': 0.07}
# which product groups each aisle sign (CATS in build_a1_fit.py) stocks
AISLE = ['food', 'drinks', 'dairy', 'home', 'bakery', 'beauty', 'kids', 'sweets', 'grain', 'tea', 'canned', 'clean', 'frozen']

SRC = coll('A1_Products')
lc = bpy.context.view_layer.layer_collection.children.get('A1_Products')
if lc: lc.exclude = False
SRC.hide_render = False

def load_roots(key):
    """Objects of one asset file, grouped by top-level parent: [[mesh objects], ...]."""
    before = set(bpy.data.objects)
    if key.startswith('bk_'):
        with bpy.data.libraries.load(LIB + key + '.blend') as (src, dst):
            dst.objects = list(src.objects)
        new = [o for o in dst.objects if o]
        for o in new: SRC.objects.link(o)
    else:
        gl = glob.glob(LIB + key + '/*.gltf')[0]
        bpy.ops.object.select_all(action='DESELECT')
        bpy.ops.import_scene.gltf(filepath=gl)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            for c in list(o.users_collection): c.objects.unlink(o)
            SRC.objects.link(o)
    bpy.context.view_layer.update()
    roots = [o for o in new if o.parent is None or o.parent not in new]
    groups = []
    for r in roots:
        ms = [o for o in [r] + list(r.children_recursive) if o.type == 'MESH']
        if ms: groups.append(ms)
    junk = [o for o in new if o.type not in ('MESH', 'EMPTY')]
    for o in junk: bpy.data.objects.remove(o, do_unlink=True)
    return groups

def bake_item(name, meshes):
    """One mesh, transforms applied, base centred on the origin."""
    bm = bmesh.new(); mats = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        ev = o.evaluated_get(dg); me = ev.to_mesh()
        tmp = bmesh.new(); tmp.from_mesh(me); tmp.transform(o.matrix_world)
        remap = []
        for s in o.material_slots:
            if s.material not in mats: mats.append(s.material)
            remap.append(mats.index(s.material))
        for f in tmp.faces:
            if remap: f.material_index = remap[min(f.material_index, len(remap) - 1)]
        m2 = bpy.data.meshes.new('tmp'); tmp.to_mesh(m2); tmp.free(); ev.to_mesh_clear()
        bm.from_mesh(m2); bpy.data.meshes.remove(m2)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]; zs = [v.co.z for v in me.vertices]
    if not xs: return None
    me.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    return me

PRODUCTS = []   # (object, width x, depth y, height z, groups)
FRUITS = []
idx = 0
for key, spec in list(CAT.items()) + [(k, (h, 'fruit')) for k, h in FRUIT.items()]:
    if not (os.path.exists(LIB + key + '.blend') or os.path.isdir(LIB + key)):
        print('missing', key); continue
    h_target, groups = spec
    try:
        gs = load_roots(key)
    except Exception as e:
        print('fail', key, e); continue
    items = [bake_item(f'{key}_{k}', ms) for k, ms in enumerate(gs)]
    for ms in gs:
        for o in ms:
            if o.name in bpy.data.objects: bpy.data.objects.remove(o, do_unlink=True)
    for o in [o for o in SRC.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
    items = [m for m in items if m and len(m.vertices) > 8]
    if not items: continue
    hmax = max(m.vertices and max(v.co.z for v in m.vertices) for m in items)
    s = h_target / hmax if hmax > 0 else 1
    for m in items:
        m.transform(Matrix.Scale(s, 4))
        xs = [v.co.x for v in m.vertices]; ys = [v.co.y for v in m.vertices]; zs = [v.co.z for v in m.vertices]
        w, d, h = max(xs) - min(xs), max(ys) - min(ys), max(zs)
        if max(w, d, h) > 0.6 or min(w, d, h) < 0.005: continue
        o = bpy.data.objects.new(f'P{idx:03d}_{m.name}', m); SRC.objects.link(o); o.location = (100 + idx * 0.7, 100, 0)
        rec = (o, w, d, h, groups.split())
        (FRUITS if groups == 'fruit' else PRODUCTS).append(rec); idx += 1
print('products', len(PRODUCTS), 'fruit', len(FRUITS))

# ---------------------------------------------------------------- instancing set-up
def gn_tree():
    ng = bpy.data.node_groups.get('A1_Stock') or bpy.data.node_groups.new('A1_Stock', 'GeometryNodeTree')
    ng.nodes.clear()
    if not ng.interface.items_tree:
        ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
        ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N = ng.nodes; L = ng.links
    gi = N.new('NodeGroupInput'); go = N.new('NodeGroupOutput')
    ci = N.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = SRC
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    ci.transform_space = 'ORIGINAL'
    pid = N.new('GeometryNodeInputNamedAttribute'); pid.data_type = 'INT'; pid.inputs['Name'].default_value = 'pid'
    rz = N.new('GeometryNodeInputNamedAttribute'); rz.data_type = 'FLOAT'; rz.inputs['Name'].default_value = 'rz'
    sc = N.new('GeometryNodeInputNamedAttribute'); sc.data_type = 'FLOAT'; sc.inputs['Name'].default_value = 'sc'
    cx = N.new('ShaderNodeCombineXYZ'); L.new(rz.outputs['Attribute'], cx.inputs['Z'])
    ip = N.new('GeometryNodeInstanceOnPoints'); ip.inputs['Pick Instance'].default_value = True
    L.new(gi.outputs[0], ip.inputs['Points']); L.new(ci.outputs[0], ip.inputs['Instance'])
    L.new(pid.outputs['Attribute'], ip.inputs['Instance Index']); L.new(cx.outputs[0], ip.inputs['Rotation'])
    L.new(sc.outputs['Attribute'], ip.inputs['Scale'])
    L.new(ip.outputs[0], go.inputs[0])
    return ng
NG = gn_tree()
ORDER = sorted([r[0].name for r in PRODUCTS + FRUITS])   # Collection Info lists children by name
PID = {n: i for i, n in enumerate(ORDER)}

def point_cloud(name, pts):
    """pts: (x, y, z, product object, rz, scale)."""
    me = bpy.data.meshes.new(name); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [c for p in pts for c in p[:3]])
    a = me.attributes.new('pid', 'INT', 'POINT'); a.data.foreach_set('value', [PID[p[3].name] for p in pts])
    b = me.attributes.new('rz', 'FLOAT', 'POINT'); b.data.foreach_set('value', [p[4] for p in pts])
    c = me.attributes.new('sc', 'FLOAT', 'POINT'); c.data.foreach_set('value', [p[5] for p in pts])
    o = obj(name, me, FIT); md = o.modifiers.new('stock', 'NODES'); md.node_group = NG
    return o

def shelf_run(pts, pool, v0, v1, x_front, x_back, z, hmax, side, rows=2):
    """Facings along a shelf running along v; side +1 faces +x (front at x_front), -1 faces -x."""
    usable = [p for p in pool if p[3] <= hmax]
    if not usable: return
    v = v0 + 0.01
    while v < v1 - 0.05:
        o, w, d, h, _ = R2.choice(usable)
        n = R2.randint(3, 8)
        # the product's front (-Y) turns to face the aisle; along the shelf it takes its width w
        rz = -math.pi / 2 if side > 0 else math.pi / 2
        depth = abs(x_back - x_front)
        nrow = max(1, min(rows, int(depth / (d + 0.01))))
        for _ in range(n):
            if v + w > v1: break
            for r in range(nrow):
                x = x_front - side * (d / 2 + 0.01 + r * (d + 0.01))
                pts.append((x, v + w / 2, z, o, rz + R2.uniform(-0.04, 0.04), 1.0))
            v += w + 0.006
        v += R2.uniform(0.01, 0.04)

pool_of = lambda g: [p for p in PRODUCTS if g in p[4]] or PRODUCTS
# remove the plain packs of the first version
for o in [o for o in FIT.objects if o.name.startswith(('Stock_', 'ChillerStock_', 'TillRack_', 'Produce_1_Fruit', 'Produce_2_Fruit'))]:
    bpy.data.objects.remove(o, do_unlink=True)

for gi, it in enumerate([i for i in F['furniture'] if i['type'] == 'gondola']):
    cx, cy = it['x'], it['z']; y0, y1 = cy - 3.0, cy + 3.0
    pool = pool_of(AISLE[gi % len(AISLE)]) + R2.sample(PRODUCTS, min(3, len(PRODUCTS)))
    pts = []
    for s in (-1, 1):
        for z, top in zip(LEVELS, LEVELS[1:] + [1.68]):
            shelf_run(pts, pool, y0, y1, cx + s * 0.49, cx + s * 0.06, z, top - z - 0.04, s)
    point_cloud(f'ShelfStock_{gi}', pts)

chill = pool_of('chill') + pool_of('dairy')
for ci, it in enumerate([i for i in F['furniture'] if i['type'] == 'chiller']):
    x, y, W = it['x'] + 0.2, it['z'], 2.45
    pts = []
    for z, top in zip((0.45, 0.85, 1.2, 1.55, 1.85), (0.85, 1.2, 1.55, 1.85, 2.08)):
        dd = 0.75 - (z - 0.45) * 0.25
        shelf_run(pts, chill, y - W / 2 + 0.06, y + W / 2 - 0.06, x - 0.1 - dd + 0.02, x - 0.12, z, top - z - 0.03, -1, rows=3)
    point_cloud(f'ChillerStock_{ci}', pts)

impulse = pool_of('sweets') + pool_of('beauty')
for ti, it in enumerate([i for i in F['furniture'] if i['type'] == 'checkout']):
    x, y = it['x'], it['z']
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts: v.co = Vector((x - 0.525 + v.co.x * 0.25, y + v.co.y * 1.2, 0.6 + v.co.z * 1.2))
    me = bpy.data.meshes.new(f'TillRack_{ti}'); bm.to_mesh(me); bm.free(); me.materials.append(M['shelf']); obj(f'TillRack_{ti}', me, FIT)
    pts = []
    for z in (0.3, 0.62, 0.94):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        for v in bm.verts: v.co = Vector((x - 0.75 + v.co.x * 0.3, y + v.co.y * 1.2, z - 0.01 + v.co.z * 0.02))
        me = bpy.data.meshes.new(f'TillShelf_{ti}_{z}'); bm.to_mesh(me); bm.free(); me.materials.append(M['shelf']); obj(f'TillShelf_{ti}_{z}', me, FIT)
        shelf_run(pts, impulse, y - 0.58, y + 0.58, x - 0.9, x - 0.66, z, 0.28, -1, rows=1)
    point_cloud(f'TillStock_{ti}', pts)

# produce tables: real fruit, heaped in their crates
for name in ('Produce_1', 'Produce_2'):
    t = bpy.data.objects.get(name)
    if not t or not FRUITS: continue
    xs = [ (t.matrix_world @ Vector(c)).x for c in t.bound_box]; ys = [(t.matrix_world @ Vector(c)).y for c in t.bound_box]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pts = []; order = FRUITS[:] if name == 'Produce_1' else FRUITS[::-1]
    k = 0
    for bx0, bx1 in ((x0 + 0.02, (x0 + x1) / 2 - 0.01), ((x0 + x1) / 2 + 0.01, x1 - 0.02)):
        for j in range(3):
            o, w, d, h, _ = order[k % len(order)]; k += 1
            by0 = y0 + 0.02 + j * (y1 - y0 - 0.04) / 3; by1 = by0 + (y1 - y0 - 0.04) / 3 - 0.02
            step = max(w, d) * 0.95
            for layer in range(3):
                off = layer * step / 2
                yy = by0 + step / 2 + off
                while yy < by1 - step / 2 - off + 1e-6:
                    xx = bx0 + step / 2 + off
                    while xx < bx1 - step / 2 - off + 1e-6:
                        pts.append((xx + R2.uniform(-.008, .008), yy + R2.uniform(-.008, .008), 0.74 + layer * h * 0.7, o, R2.uniform(0, 6.28), R2.uniform(0.92, 1.08)))
                        xx += step
                    yy += step
    point_cloud(f'{name}_Fruit', pts)

# the product sources stay out of the scene: their collection is excluded from the view layer
# (geometry nodes still instance it)
lc = bpy.context.view_layer.layer_collection.children.get('A1_Products')
if lc: lc.exclude = True
print('stock ok')
