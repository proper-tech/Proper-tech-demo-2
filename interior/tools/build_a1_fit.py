"""Block A, 1st floor: escalators, supermarket fittings with stock, tills, chillers, produce, hall furniture, signs.
Run after build_a1_arch.py (uses its helpers through exec in the same namespace)."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

FIT = coll('A1_Fit')
R = random.Random(11)

def mesh_from(bm, name, mats, c=FIT):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    return obj(name, me, c)

def add_box(bm, x0, y0, z0, x1, y1, z1, col=None, mi=0, cl=None):
    vs = [bm.verts.new(v) for v in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    fs = []
    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        face = bm.faces.new([vs[i] for i in f]); face.material_index = mi; fs.append(face)
        if col is not None:
            for l in face.loops: l[cl] = (*col, 1)
    return fs

def add_cyl(bm, cx, cy, z0, z1, r, col, cl, mi=0, seg=10):
    ring0 = [bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z0)) for a in [2 * math.pi * k / seg for k in range(seg)]]
    ring1 = [bm.verts.new((v.co.x, v.co.y, z1)) for v in ring0]
    faces = [bm.faces.new(ring1)] + [bm.faces.new([ring0[k], ring0[(k + 1) % seg], ring1[(k + 1) % seg], ring1[k]]) for k in range(seg)]
    faces.append(bm.faces.new(ring0[::-1]))
    for f in faces:
        f.material_index = mi
        for l in f.loops: l[cl] = (*col, 1)

# ---------------------------------------------------------------- materials
def stock_mat():
    m = mat('A1_Stock'); nt, bs = nodes(m)
    at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'Col'
    nt.links.new(at.outputs['Color'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = 0.38; bs.inputs['Coat Weight'].default_value = 0.25
    return m
M['stock'] = stock_mat()
M['shelf'] = plain('A1_ShelfWhite', (0.88, 0.88, 0.87), 0.35)
M['backpanel'] = plain('A1_ShelfBack', (0.55, 0.56, 0.58), 0.5, metal=0.3)
M['price'] = plain('A1_PriceStrip', (0.95, 0.80, 0.12), 0.4)
M['belt'] = plain('A1_Belt', (0.03, 0.03, 0.03), 0.6)
M['wood'] = bpy.data.materials['Oak_Furniture']
M['screen'] = plain('A1_Screen', (0.02, 0.02, 0.03), 0.15, emit=(0.25, 0.45, 0.8), strength=1.5)
M['signred'] = plain('A1_SignRed', (0.55, 0.04, 0.03), 0.35)
M['tilllight'] = plain('A1_TillLight', (0.8, 0.1, 0.05), 0.4, emit=(1.0, 0.2, 0.1), strength=3)
M['signwhite'] = plain('A1_SignWhite', (1, 1, 1), 0.4, emit=(1, 1, 1), strength=6)
M['signgreen'] = plain('A1_SignGreen', (0.05, 0.35, 0.18), 0.5)
M['handrail'] = plain('A1_Handrail', (0.02, 0.02, 0.02), 0.3)
M['steps'] = plain('A1_Steps', (0.2, 0.2, 0.21), 0.35, metal=0.8)
M['chillin'] = plain('A1_ChillerInside', (0.85, 0.87, 0.9), 0.3, emit=(0.9, 0.95, 1.0), strength=0.6)
M['chillbody'] = plain('A1_ChillerBody', (0.08, 0.08, 0.09), 0.35)
M['bench'] = bpy.data.materials['Walnut']
M['pot'] = plain('A1_Planter', (0.18, 0.17, 0.16), 0.55)
M['soil'] = plain('A1_Soil', (0.08, 0.06, 0.04), 1.0)

# ---------------------------------------------------------------- escalators (rise southwards to floor 2)
def escalator(u0, u1, name):
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    vb, vt, rise = 8.7, 2.5, 4.5           # foot of the incline, top of it, storey height
    def zf(v): return 0 if v >= vb else (rise if v <= vt else rise * (vb - v) / (vb - vt))
    # truss/cladding: side profile extruded across the width
    prof = [(10.0, 0.02), (vb, 0.02), (vt, rise + 0.02), (1.2, rise + 0.02), (1.2, rise - 1.1), (vt + 0.4, rise - 1.1), (vb - 0.6, -0.2), (10.0, -0.2)]
    left = [bm.verts.new((u0, v, z)) for v, z in prof]; right = [bm.verts.new((u1, v, z)) for v, z in prof]
    bm.faces.new(left[::-1]); bm.faces.new(right)
    for k in range(len(prof)):
        bm.faces.new([left[k], left[(k + 1) % len(prof)], right[(k + 1) % len(prof)], right[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces: f.material_index = 0
    tr = mesh_from(bm, name + '_Truss', [M['steel']])
    # steps: a staircase surface in the middle 1.0 m
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    w0, w1 = u0 + 0.3, u1 - 0.3
    pitch_v = 0.40 * (vb - vt) / math.hypot(vb - vt, rise)
    v = 9.9
    while v > 1.4:
        z = zf(v); nv = v - (0.40 if (v > vb or v <= vt) else pitch_v)
        add_box(bm, w0, nv, z + 0.02, w1, v, z + 0.05, (0.2, 0.2, 0.2), 0, cl)
        v = nv
    st = mesh_from(bm, name + '_Steps', [M['steps']])
    # glass balustrades with a black handrail along the slope, on both sides
    for side, x in (('L', u0 + 0.12), ('R', u1 - 0.12)):
        pts = [(9.6, 0.05), (vb, 0.05), (vt, rise + 0.05), (1.4, rise + 0.05)]
        for k, ((va, za), (vb2, zb)) in enumerate(zip(pts, pts[1:])):
            bm = bmesh.new()
            vs = [bm.verts.new(p) for p in ((x, va, za + 0.1), (x, vb2, zb + 0.1), (x, vb2, zb + 0.95), (x, va, za + 0.95))]
            bm.faces.new(vs); mesh_from(bm, f'{name}_Glass{side}{k}', [M['glass']])
            bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
            # handrail: a slanted box from a to b
            d = Vector((0, vb2 - va, zb - za)); n = Vector((0, -d.z, d.y)).normalized() * 0.04
            a, b = Vector((x, va, za + 1.0)), Vector((x, vb2, zb + 1.0))
            ring = [Vector((-0.04, 0, 0)), Vector((0.04, 0, 0))]
            q = [a + ring[0] - n, a + ring[1] - n, a + ring[1] + n, a + ring[0] + n, b + ring[0] - n, b + ring[1] - n, b + ring[1] + n, b + ring[0] + n]
            vs = [bm.verts.new(p) for p in q]
            for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)): bm.faces.new([vs[i] for i in f])
            mesh_from(bm, f'{name}_Rail{side}{k}', [M['handrail']])
        # stainless skirt along the steps
        seg_box(f'{name}_Skirt{side}', (x + (0.1 if side == 'L' else -0.1), 9.8), (x + (0.1 if side == 'L' else -0.1), vb), 0.0, 0.12, 0.03, M['steel'], c=FIT)
    # comb plate at the foot
    add = bmesh.new(); cl = add.loops.layers.color.new('Col')
    add_box(add, u0 + 0.05, 9.75, 0.0, u1 - 0.05, 10.25, 0.03, (0.5, 0.5, 0.5), 0, cl)
    mesh_from(add, name + '_Comb', [M['steel']])
esc_x0, esc_x1 = ex0, ex1
escalator(esc_x0, (esc_x0 + esc_x1) / 2 - 0.05, 'EscUp')
escalator((esc_x0 + esc_x1) / 2 + 0.05, esc_x1, 'EscDown')

# ---------------------------------------------------------------- stock generator
PACK = [  # packaging colours, weighted towards white, kraft and muted tones like a real aisle
    (0.62, 0.10, 0.08), (0.80, 0.62, 0.12), (0.10, 0.26, 0.52), (0.88, 0.88, 0.86), (0.88, 0.87, 0.84), (0.15, 0.42, 0.22),
    (0.75, 0.38, 0.10), (0.30, 0.14, 0.34), (0.50, 0.06, 0.10), (0.80, 0.75, 0.60), (0.06, 0.06, 0.07), (0.85, 0.84, 0.80),
    (0.45, 0.28, 0.16), (0.20, 0.48, 0.62), (0.80, 0.50, 0.55), (0.32, 0.32, 0.34), (0.70, 0.66, 0.55), (0.92, 0.92, 0.9)]
def jitter(c, a=0.06): return tuple(min(1, max(0, x + R.uniform(-a, a))) for x in c)

def fill_shelf(bm, cl, x0, x1, y_front, y_back, z, hmax, axis='x', pal=PACK, bottles=0.3):
    """Rows of facings along a shelf from x0 to x1 (axis 'x') or along v (axis 'y': x0/x1 are v, y_* are u)."""
    p = x0
    while p < x1 - 0.06:
        kind = 'bottle' if R.random() < bottles else 'box'
        w = R.uniform(0.07, 0.11) if kind == 'bottle' else R.uniform(0.06, 0.22)
        h = min(hmax, R.uniform(0.14, 0.34) if kind == 'bottle' else R.uniform(0.10, 0.32))
        col = R.choice(pal); band = R.choice(pal)
        n = R.randint(3, 9)
        for _ in range(n):
            if p + w > x1: break
            depth = abs(y_back - y_front); dd = R.uniform(0.85, 1.0) * depth
            yf = y_front; yb = y_front + (dd if y_back > y_front else -dd)
            c = jitter(col, 0.03)
            if kind == 'box':
                if axis == 'x': add_box(bm, p + 0.004, min(yf, yb), z, p + w - 0.004, max(yf, yb), z + h, c, 0, cl)
                else: add_box(bm, min(yf, yb), p + 0.004, z, max(yf, yb), p + w - 0.004, z + h, c, 0, cl)
                lab = jitter(band, 0.02); s_ = 1 if y_back > y_front else -1
                if axis == 'y' and h > 0.12:
                    add_box(bm, yf - s_ * 0.002, p + 0.012, z + h * 0.35, yf + s_ * 0.0005, p + w - 0.012, z + h * 0.7, lab, 0, cl)
            else:
                r = w / 2 - 0.006; rows = max(1, int(depth / (2 * r + 0.01)))
                for k in range(min(rows, 3)):
                    off = (r + 0.005 + k * (2 * r + 0.01)) * (1 if y_back > y_front else -1)
                    cx, cy = (p + w / 2, yf + off) if axis == 'x' else (yf + off, p + w / 2)
                    add_cyl(bm, cx, cy, z, z + h * 0.72, r, c, cl, 0, 8)
                    add_cyl(bm, cx, cy, z + h * 0.72, z + h, r * 0.45, c, cl, 0, 8)
                    if k == 0: add_cyl(bm, cx, cy, z + h * 0.3, z + h * 0.55, r + 0.002, band, cl, 0, 8)
            p += w
        p += R.uniform(0.0, 0.02)

# ---------------------------------------------------------------- gondolas (6 m, along v, double-sided)
LEVELS = [0.12, 0.52, 0.92, 1.32]
for gi, it in enumerate([i for i in F['furniture'] if i['type'] == 'gondola']):
    cx, cy, L = it['x'], it['z'], 6.0
    y0, y1 = cy - L / 2, cy + L / 2
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    add_box(bm, cx - 0.5, y0, 0, cx + 0.5, y1, 0.1, (1, 1, 1), 0, cl)             # plinth
    add_box(bm, cx - 0.03, y0, 0.1, cx + 0.03, y1, 1.75, (1, 1, 1), 1, cl)        # back panel
    for s in (-1, 1):
        for z in LEVELS + [1.7]:
            add_box(bm, cx + s * 0.03, y0, z - 0.02, cx + s * 0.5, y1, z, (1, 1, 1), 0, cl)
            add_box(bm, cx + s * 0.495, y0, z - 0.06, cx + s * 0.505, y1, z, (1, 1, 1), 2, cl)  # price strip
        for k in range(7):                                                          # uprights every metre
            yy = y0 + k * L / 6
            add_box(bm, cx + s * 0.03, yy - 0.015, 0.1, cx + s * 0.08, yy + 0.015, 1.75, (1, 1, 1), 1, cl)
    for e in (y0, y1):                                                              # end panels
        add_box(bm, cx - 0.52, e - 0.02 if e == y0 else e, 0, cx + 0.52, e if e == y0 else e + 0.02, 1.8, (1, 1, 1), 0, cl)
    mesh_from(bm, f'Gondola_{gi}', [M['shelf'], M['backpanel'], M['price']])
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    for s in (-1, 1):
        for z, top in zip(LEVELS, LEVELS[1:] + [1.68]):
            fill_shelf(bm, cl, y0 + 0.02, y1 - 0.02, cx + s * 0.49, cx + s * 0.06, z, top - z - 0.05, axis='y')
    mesh_from(bm, f'Stock_{gi}', [M['stock']])

# ---------------------------------------------------------------- tills
for ti, it in enumerate([i for i in F['furniture'] if i['type'] == 'checkout']):
    x, y = it['x'], it['z']
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    add_box(bm, x - 0.35, y - 0.95, 0, x + 0.35, y + 0.95, 0.88, (1, 1, 1), 0, cl)
    add_box(bm, x - 0.3, y - 0.4, 0.88, x + 0.2, y + 0.95, 0.9, (1, 1, 1), 1, cl)
    add_box(bm, x + 0.05, y - 0.85, 0.9, x + 0.35, y - 0.55, 1.05, (1, 1, 1), 1, cl)
    add_box(bm, x + 0.15, y - 0.75, 1.05, x + 0.18, y - 0.72, 1.3, (1, 1, 1), 1, cl)
    add_box(bm, x + 0.05, y - 0.82, 1.28, x + 0.3, y - 0.65, 1.46, (1, 1, 1), 2, cl)
    add_box(bm, x + 0.5, y - 0.6, 0, x + 0.9, y - 0.2, 0.55, (1, 1, 1), 1, cl)                 # cashier seat
    add_box(bm, x - 0.02, y + 0.95, 0, x + 0.02, y + 0.99, 2.2, (1, 1, 1), 1, cl)               # lane pole
    add_box(bm, x - 0.12, y + 0.92, 2.2, x + 0.12, y + 1.02, 2.45, (1, 1, 1), 3, cl)            # lane number light
    mesh_from(bm, f'Till_{ti}', [M['wood'], M['belt'], M['screen'], M['tilllight']])
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')                                    # impulse rack
    add_box(bm, x - 0.65, y - 0.6, 0, x - 0.4, y + 0.6, 1.2, (0.9, 0.9, 0.9), 0, cl)
    for z in (0.3, 0.6, 0.9): fill_shelf(bm, cl, y - 0.58, y + 0.58, x - 0.66, x - 0.42, z, 0.18, axis='y', bottles=0.1)
    mesh_from(bm, f'TillRack_{ti}', [M['stock']])

# ---------------------------------------------------------------- multideck chillers on the east wall
for ci, it in enumerate([i for i in F['furniture'] if i['type'] == 'chiller']):
    x, y, W = it['x'] + 0.2, it['z'], 2.45
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    add_box(bm, x - 0.85, y - W / 2, 0, x + 0.25, y + W / 2, 0.35, (1, 1, 1), 0, cl)             # base
    add_box(bm, x - 0.1, y - W / 2, 0.35, x + 0.25, y + W / 2, 2.1, (1, 1, 1), 0, cl)             # back
    add_box(bm, x - 0.95, y - W / 2, 2.1, x + 0.25, y + W / 2, 2.35, (1, 1, 1), 0, cl)            # canopy
    add_box(bm, x - 0.96, y - W / 2, 2.12, x - 0.93, y + W / 2, 2.33, (1, 1, 1), 2, cl)            # canopy light face
    add_box(bm, x - 0.09, y - W / 2, 0.36, x - 0.08, y + W / 2, 2.09, (1, 1, 1), 1, cl)            # lit back wall
    for e in (y - W / 2, y + W / 2 - 0.04):
        add_box(bm, x - 0.85, e, 0.35, x + 0.25, e + 0.04, 2.1, (1, 1, 1), 0, cl)
    for z in (0.45, 0.85, 1.2, 1.55, 1.85):
        d = 0.75 - (z - 0.45) * 0.25
        add_box(bm, x - 0.1 - d, y - W / 2 + 0.04, z - 0.02, x - 0.1, y + W / 2 - 0.04, z, (1, 1, 1), 1, cl)
    mesh_from(bm, f'Chiller_{ci}', [M['chillbody'], M['chillin'], M['signwhite']])
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    pal = [(0.95, 0.95, 0.95), (0.2, 0.45, 0.85), (0.95, 0.85, 0.3), (0.85, 0.2, 0.2), (0.3, 0.7, 0.35), (0.98, 0.98, 0.9)]
    for z, top in zip((0.45, 0.85, 1.2, 1.55, 1.85), (0.85, 1.2, 1.55, 1.85, 2.08)):
        d = 0.75 - (z - 0.45) * 0.25
        fill_shelf(bm, cl, y - W / 2 + 0.06, y + W / 2 - 0.06, x - 0.1 - d + 0.03, x - 0.12, z, top - z - 0.04, axis='y', pal=pal, bottles=0.55)
    mesh_from(bm, f'ChillerStock_{ci}', [M['stock']])
    ld = bpy.data.lights.new(f'ChillLight_{ci}', 'AREA'); ld.shape = 'RECTANGLE'; ld.size = 0.08; ld.size_y = W - 0.2; ld.energy = 60; ld.color = (0.92, 0.96, 1)
    lo = bpy.data.objects.new(f'ChillLight_{ci}', ld); lo.location = (x - 0.85, y, 2.08); LIGHTS.objects.link(lo)

# ---------------------------------------------------------------- produce stands near the entrance
def produce_table(x, y, name, fruits):
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    add_box(bm, x - 0.7, y - 1.2, 0, x + 0.7, y + 1.2, 0.7, (1, 1, 1), 0, cl)
    mesh_from(bm, name, [M['wood']])
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    for k, (col, r) in enumerate(fruits):
        bx0, bx1 = (x - 0.68, x) if k % 2 == 0 else (x, x + 0.68)
        by0 = y - 1.18 + (k // 2) * 0.8; by1 = by0 + 0.78
        add_box(bm, bx0, by0, 0.7, bx1, by1, 0.74, (0.45, 0.3, 0.18), 0, cl)
        for layer in range(3):
            nx, ny = int((bx1 - bx0) / (2 * r)), int((by1 - by0) / (2 * r))
            for i in range(nx - layer):
                for j in range(ny - layer):
                    cx = bx0 + r + i * 2 * r + layer * r + R.uniform(-.01, .01); cy = by0 + r + j * 2 * r + layer * r + R.uniform(-.01, .01)
                    cz = 0.74 + r + layer * r * 1.5
                    c = jitter(col, 0.05)
                    ico = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r * R.uniform(0.9, 1.05), matrix=Matrix.Translation((cx, cy, cz)))
                    for v in ico['verts']:
                        for f in v.link_faces:
                            for l in f.loops: l[cl] = (*c, 1)
    o = mesh_from(bm, name + '_Fruit', [M['stock']])
    for p in o.data.polygons: p.use_smooth = True
FRUIT = [((0.70, 0.06, 0.05), 0.04), ((0.95, 0.5, 0.05), 0.04), ((0.45, 0.7, 0.1), 0.04), ((0.95, 0.85, 0.15), 0.035), ((0.8, 0.12, 0.08), 0.03), ((0.3, 0.5, 0.15), 0.05)]
produce_table(-9.0, -5.0, 'Produce_1', FRUIT)
produce_table(-6.4, -5.0, 'Produce_2', FRUIT[::-1])
produce_table(-9.0, -10.0 + 7.6 - 0.0 - 10.0 + 10.0, 'Produce_3', FRUIT[2:] + FRUIT[:2]) if False else None

# ---------------------------------------------------------------- hall: benches and planters
def bench(x, y, rot, name):
    bm = bmesh.new(); cl = bm.loops.layers.color.new('Col')
    add_box(bm, -0.9, -0.22, 0.42, 0.9, 0.22, 0.47, (1, 1, 1), 0, cl)
    for sx in (-0.75, 0.75): add_box(bm, sx - 0.03, -0.2, 0, sx + 0.03, 0.2, 0.42, (1, 1, 1), 1, cl)
    o = mesh_from(bm, name, [M['bench'], M['frame']]); o.location = (x, y, 0); o.rotation_euler[2] = rot * math.pi / 2
def planter(x, y, name, r=0.38, h=0.55):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=r, depth=h, location=(x, y, h / 2))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(M['pot'])
    for cc in o.users_collection: cc.objects.unlink(o)
    FIT.objects.link(o)
    box(name + '_Soil', x - r * 0.7, y - r * 0.7, h - 0.04, x + r * 0.7, y + r * 0.7, h - 0.02, M['soil'], c=FIT)
    PLANTERS.append((x, y, h))
PLANTERS = []
for k, it in enumerate([i for i in F['furniture'] if i['type'] == 'bench']):
    if inpoly((it['x'], it['z']), hall): bench(it['x'], it['z'], it.get('rot', 0), f'Bench_{k}')
for k, it in enumerate([i for i in F['furniture'] if i['type'] == 'plant']):
    if inpoly((it['x'], it['z']), hall): planter(it['x'], it['z'], f'Planter_{k}')

# ---------------------------------------------------------------- signs
def text(body, loc, size, m, rot=(math.pi / 2, 0, 0), name='Sign', extrude=0.01):
    cu = bpy.data.curves.new(name, 'FONT'); cu.body = body; cu.size = size; cu.align_x = 'CENTER'; cu.extrude = extrude
    o = bpy.data.objects.new(name, cu); o.location = loc; o.rotation_euler = rot; FIT.objects.link(o); o.data.materials.append(m); return o
# supermarket name on the fascia over the open front (seen from the hall, facing north)
box('Brand_Panel', -10.6, 3.22, 3.25, -2.6, 3.26, 3.95, M['signred'], c=FIT)
text('СЭБОЦЭ МАРКЕТ', (-6.6, 3.27, 3.42), 0.42, M['signwhite'], rot=(math.pi / 2, 0, math.pi), name='Brand_Text')
# hanging aisle signs over the gondola rows
CATS = ['Хүнсний бүтээгдэхүүн', 'Ундаа', 'Сүү, сүүн бүтээгдэхүүн', 'Гэр ахуй', 'Талх, нарийн боов', 'Гоо сайхан', 'Хүүхдийн бараа', 'Амттан', 'Будаа, гурил', 'Цай, кофе', 'Консерв', 'Ариун цэвэр', 'Хөлдөөсөн']
for gi, it in enumerate([i for i in F['furniture'] if i['type'] == 'gondola']):
    x, y = it['x'], it['z'] + 3.05
    box(f'AisleSign_{gi}', x - 0.7, y - 0.02, 2.55, x + 0.7, y + 0.02, 2.9, M['signgreen'], c=FIT)
    for s, ry in ((1, math.pi), (-1, 0)):   # each face reads from its own side
        text(CATS[gi % len(CATS)], (x, y + s * 0.025, 2.66), 0.12, M['signwhite'], rot=(math.pi / 2, 0, ry), name=f'AisleText_{gi}_{s}', extrude=0.0)
    box(f'AisleWire_{gi}', x - 0.003, y - 0.003, 2.9, x + 0.003, y + 0.003, H_SHOP - 0.55, M['steel'], c=FIT)
text('Шинэ, хөргөсөн', (16.0, 10.0, 2.55), 0.3, M['signwhite'], rot=(math.pi / 2, 0, -math.pi / 2), name='Fresh_Text')
print('fit ok')
