"""Block A (podium), floors 2 and 3: the empty rental halls 201 / 120 for their 360° tours and rendered top views.

Site-plan metres as in src/data/podium.ts: Blender X = u east, Y = v north, Z up, floor 2 at 0 (4.5 m above
floor 1). The outline and grid come from interior/A1_floor.json; the cores are coreUpper() of podium.ts.
An empty shell to let: light porcelain floor, white ceiling at 3.0 m with LED panels, round columns on the
grid, a glass curtain wall all round, the escalators up from floor 1 through a void and on up to floor 3,
the stair, lift and toilet cores.

    python3 -I interior/tools/build_podium2.py interior/F.blend none interior [2|3]
Writes interior/A<floor>.blend and interior/A<floor>_cams.json (render: render_a2.bat [2|3]).
Floor 2 has the escalators up from floor 1 (through a void) and the pair on up to floor 3 (into a ceiling
opening); floor 3, under the roof, has that pair arriving through a void and a closed ceiling.
"""
import sys, os, json, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blockd_common import *  # noqa: F401,F403  (opens F.blend; OUT = sys.argv[3])
import bmesh

D = json.load(open(os.path.join(OUT, 'A1_floor.json')))
OUTLINE = [tuple(p) for p in D['floor2outline']]  # counter-clockwise
X1, X2, X3, X4, X5, X6 = D['grid']['u']
X7 = X6 + 7.2
Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8, Y9, Y10, Y11, Y12 = D['grid']['v']
H = 3.0          # suspended ceiling
STOREY = 3.6     # floor 2 -> floor 3
BELOW = 4.5      # floor 1 -> floor 2
FLOOR = int(sys.argv[4]) if len(sys.argv) > 4 else 2
GROUND = -(BELOW + STOREY * (FLOOR - 2))   # the street, below this floor

# ------------------------------------------------------------------ materials
MAT['hall_floor'] = tiles('A2_Porcelain', '#b9b3a8', '#8f897f', 1.2, 0.2)
MAT['lower_floor'] = tiles('A2_LowerFloor', '#cfc8bb', '#a9a397', 0.6, 0.18)
MAT['column'] = noisy('A2_Column', '#f1efea', 0.5, 4.0, 0.03)
MAT['core'] = noisy('A2_CoreWall', '#ebe8e2', 0.6, 4.0, 0.04)
MAT['skirting'] = principled('A2_Skirting', srgb('#4a4d50'), 0.45, 0.2)
MAT['door_wood'] = noisy('A2_DoorOak', '#9b7651', 0.45, 40.0, 0.12)
MAT['exit'] = principled('A2_Exit', srgb('#0f8a3c'), 0.4, emit=srgb('#19c75a'), strength=2.5)
MAT['sign_plate'] = principled('A2_SignPlate', srgb('#2d3136'), 0.35, 0.3)
MAT['esc_steps'] = principled('A2_EscSteps', srgb('#8d939a'), 0.4, 0.8)
MAT['esc_truss'] = principled('A2_EscTruss', srgb('#c9ccd0'), 0.28, 0.85)
MAT['handrail'] = principled('A2_Handrail', srgb('#121314'), 0.35)
MAT['grille'] = principled('A2_Grille', srgb('#d6d8da'), 0.4, 0.3)
MAT['grass'] = noisy('A2_Grass', '#5f7d3c', 0.9, 12.0, 0.25, 0.05)
MAT['extinguisher'] = principled('A2_Extinguisher', srgb('#b3171f'), 0.3, 0.1, 0.5)

def thin_glass(name):
    """Glass as a single pane: see-through with a Fresnel reflection. F's solid glass on a lone plane bends
    the view and mirrors the hall, so the curtain wall looked like glass partitions with more rooms beyond."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    mix = nt.nodes.new('ShaderNodeMixShader')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (0.88, 0.93, 0.92, 1.0)
    gl = nt.nodes.new('ShaderNodeBsdfAnisotropic')  # the Glossy BSDF
    gl.inputs['Roughness'].default_value = 0.03
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.45
    # a quarter of the Fresnel reflection: at a glancing angle full Fresnel turns the long curtain wall
    # into a mirror of the lit hall, which reads as more rooms behind glass partitions
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY'
    k.inputs[1].default_value = 0.25
    nt.links.new(fr.outputs['Fac'], k.inputs[0])
    nt.links.new(k.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    return m

MAT['glass'] = thin_glass('A2_ThinGlass')

# ------------------------------------------------------------------ plan helpers
def inpoly(p, poly):
    x, y = p
    ins = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            ins = not ins
        j = i
    return ins

def edge_dist(p, poly):
    best = 1e9
    for a, b in zip(poly, poly[1:] + poly[:1]):
        ax, ay = a
        dx, dy = b[0] - ax, b[1] - ay
        t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy + 1e-12)))
        best = min(best, math.dist(p, (ax + t * dx, ay + t * dy)))
    return best

def in_rect(p, r, pad=0.0):
    return r[0] - pad < p[0] < r[1] + pad and r[2] - pad < p[1] < r[3] + pad

def cut(o, rects, z0, z1):
    """Cut boxes (u0, u1, v0, v1) out of a mesh object and keep the result as its mesh."""
    cutters = []
    for i, (u0, u1, v0, v1) in enumerate(rects):
        c = box(f'Cutter_{o.name}_{i}', u0, u1, v0, v1, z0, z1, MAT['core'])
        md = o.modifiers.new(f'h{i}', 'BOOLEAN')
        md.object = c
        md.operation = 'DIFFERENCE'
        md.solver = 'EXACT'
        cutters.append(c)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    o.data = me
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    return o

def seg(name, a, b, z0, z1, thick, mat, off=0.0):
    """A wall piece from a to b (plan points), `thick` deep, centred `off` to the left of the line."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    if L < 1e-3:
        return None
    nx, ny = -dy / L, dx / L
    cx, cy = (a[0] + b[0]) / 2 + nx * off, (a[1] + b[1]) / 2 + ny * off
    return rbox(name, cx, cy, z0, L, thick, z1 - z0, mat, math.atan2(dy, dx))

def mesh_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    me.update()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    return o

# ------------------------------------------------------------------ cores (coreUpper in podium.ts)
STAIRS_W = (X2 + 0.8, X3 - 0.5, Y11 - 4.2, Y11 - 0.1)
LIFTS_B = (X5 + 2.1, X5 + 4.1, Y12 - 4.6, Y12 - 0.4)
STAIRS_B = (X5 + 4.1, X6, Y11, Y12)
STAIRS_C = (X4, X4 + 2.6, Y3, Y4 - 0.3)
LIFTS_C = (X4 + 2.6, X4 + 4.8, Y4 - 4.0, Y4 - 0.3)
WC_203 = (X4 + 4.8, X5, Y4 - 4.0, Y4 - 0.3)
WC_204 = (X4 + 2.6, X5, Y3, Y4 - 4.0)
CORES = [STAIRS_W, LIFTS_B, STAIRS_B, STAIRS_C, LIFTS_C, WC_203, WC_204]

# escalators: the pair up from floor 1 (as in the floor-1 scene: foot at v 8.7, top at v 2.5) rises
# southwards through a void in this floor; the pair on to floor 3 stands beside it, rising northwards
ESC_A = (-0.62, 2.58)                 # u of the pair from floor 1
VOID = (-0.92, 2.88, 2.41, 9.91)      # the slab opening around it
ESC_B = (-3.45, -1.05)                # u of the pair to floor 3
B_FOOT = -1.2                         # v where the pair to floor 3 starts to climb
B_TOP = B_FOOT + STOREY / math.tan(math.radians(30))
CEIL_OPEN = (-3.58, -0.85, -0.3, B_TOP + 1.45)  # floor 2's ceiling opening over it
VOID3 = (-3.58, -0.85, -0.3, B_TOP)              # floor 3's slab opening, where the pair arrives

def void_edge(r, below, rail_sides):
    """A slab opening's edge: a white fascia down to the ceiling below, glass balustrade on rail_sides."""
    u0, u1, v0, v1 = r
    sides = {'N': ((u0, v1), (u1, v1)), 'W': ((u0, v0), (u0, v1)), 'E': ((u1, v0), (u1, v1)), 'S': ((u0, v0), (u1, v0))}
    for nm, (a, b) in sides.items():
        seg(f'VoidFascia{nm}', a, b, below, 0.0, 0.04, MAT['column'])
        if nm in rail_sides:
            seg(f'VoidGlass{nm}', a, b, 0.05, 1.05, 0.015, MAT['glass'])
            seg(f'VoidRail{nm}', a, b, 1.05, 1.1, 0.06, MAT['steel'])
            seg(f'VoidShoe{nm}', a, b, 0.0, 0.08, 0.05, MAT['steel'])

# ------------------------------------------------------------------ slab, floor, ceiling
VOID_HERE = VOID if FLOOR == 2 else VOID3
slab = prism(f'Floor{FLOOR}_Slab', OUTLINE, -0.3, [0.0] * len(OUTLINE), MAT['hall_floor'])
cut(slab, [VOID_HERE], -1.0, 1.0)
ceil = prism('Slab_Ceiling', OUTLINE, H, [H + 0.05] * len(OUTLINE), MAT['ceiling'])
if FLOOR == 2:
    cut(ceil, [CEIL_OPEN], H - 1.0, H + 1.0)
    # the slab edge between the ceiling and floor 3 round the opening, and floor 3 seen through it
    u0, u1, v0, v1 = CEIL_OPEN
    for nm, a, b in (('S', (u0, v0), (u1, v0)), ('N', (u0, v1), (u1, v1)), ('W', (u0, v0), (u0, v1)), ('E', (u1, v0), (u1, v1))):
        seg(f'Head_Fascia{nm}', a, b, H, STOREY, 0.04, MAT['column'])
        if nm != 'N':
            seg(f'Head_UpGlass{nm}', a, b, STOREY + 0.05, STOREY + 1.05, 0.015, MAT['glass'])
            seg(f'Head_UpRail{nm}', a, b, STOREY + 1.05, STOREY + 1.1, 0.06, MAT['steel'])
    box('Head_UpFloorW', u0 - 6, u0, v0 - 6, v1 + 6, STOREY - 0.01, STOREY, MAT['hall_floor'])
    box('Head_UpFloorE', u1, u1 + 6, v0 - 6, v1 + 6, STOREY - 0.01, STOREY, MAT['hall_floor'])
    box('Head_UpFloorS', u0, u1, v0 - 6, v0, STOREY - 0.01, STOREY, MAT['hall_floor'])
    box('Head_UpFloorN', u0, u1, v1, v1 + 6, STOREY - 0.01, STOREY, MAT['hall_floor'])
    box('Head_UpCeil', u0 - 7, u1 + 7, v0 - 7, v1 + 7, STOREY + H, STOREY + H + 0.05, MAT['ceiling'])
    for i, v in enumerate((v0 + 1.0, (v0 + v1) / 2, v1 - 1.0)):
        box(f'Head_UpPanel{i}', (u0 + u1) / 2 - 0.3, (u0 + u1) / 2 + 0.3, v - 0.3, v + 0.3, STOREY + H - 0.01, STOREY + H, MAT['panel_light'])
        area_light(f'UpL_{i}', (u0 + u1) / 2, v, STOREY + H - 0.03, 0.6, 0.6, 40)
    # floor 1 under the void: its floor; the underside of this slab is its ceiling
    prism('Lower_Floor', OUTLINE, -BELOW - 0.05, [-BELOW] * len(OUTLINE), MAT['lower_floor'])  # inside the walls only
    for i, (x, y) in enumerate(((-3.0, 5.0), (5.0, 5.0), (1.0, 12.5), (1.0, -1.5), (-6.0, 12.0), (8.0, 12.0))):
        area_light(f'LowL_{i}', x, y, -0.35, 0.3, 0.3, 140)
    # glass on the three sides the escalators don't arrive on
    void_edge(VOID, -0.3, 'NWE')
else:
    # floor 2 under the void: its porcelain floor, its ceiling 0.6 below this floor, its lights
    prism('Lower_Floor', OUTLINE, -STOREY - 0.05, [-STOREY] * len(OUTLINE), MAT['hall_floor'])  # inside the walls only
    lc = prism('Lower_Ceiling', OUTLINE, -0.62, [-0.6] * len(OUTLINE), MAT['ceiling'])
    cut(lc, [VOID3], -1.0, 0.0)
    for i, (x, y) in enumerate(((-5.72, -1.29), (-2.12, -4.89), (1.48, 2.31), (-5.72, 5.91), (-2.12, 9.51), (1.48, -1.29))):
        box(f'LowPanel_{i}', x - 0.3, x + 0.3, y - 0.3, y + 0.3, -0.612, -0.6, MAT['panel_light'])
        area_light(f'LowL_{i}', x, y, -0.64, 0.6, 0.6, 55)
    void_edge(VOID3, -0.6, 'SWE')

# ------------------------------------------------------------------ escalators
def escalator(name, ua, ub, z0, v_foot, v_top, rise):
    """One escalator ua..ub wide, rising `rise` from (v_foot, z0) to v_top, with 1.3 m landings."""
    s = 1 if v_top > v_foot else -1
    L = abs(v_top - v_foot)
    V = lambda t: v_foot + s * t  # noqa: E731
    # truss: the side profile (t along the run, z) extruded across the width
    prof = [(-1.3, 0.02), (0, 0.02), (L, rise + 0.02), (L + 1.3, rise + 0.02), (L + 1.3, rise - 1.1),
            (L - 0.4, rise - 1.1), (0.6, -0.2), (-1.3, -0.2)]
    n = len(prof)
    verts = [(ua, V(t), z0 + z) for t, z in prof] + [(ub, V(t), z0 + z) for t, z in prof]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    o = mesh_obj(f'{name}_Truss', verts, faces, MAT['esc_truss'])
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    # treads: 0.4 m deep, flat on the landings, stepping up on the incline
    w0, w1 = ua + 0.12, ub - 0.12
    verts, faces = [], []
    t = -1.2
    while t < L + 1.2:
        nt = t + 0.4
        z = 0 if t < 0 else (rise if t >= L else rise * t / L)
        a, b = V(t), V(min(nt, L + 1.2))
        k = len(verts)
        verts += [(w0, a, z0 + z + 0.02), (w1, a, z0 + z + 0.02), (w1, b, z0 + z + 0.02), (w0, b, z0 + z + 0.02),
                  (w0, a, z0 + z + 0.06), (w1, a, z0 + z + 0.06), (w1, b, z0 + z + 0.06), (w0, b, z0 + z + 0.06)]
        faces += [(k, k + 3, k + 2, k + 1), (k + 4, k + 5, k + 6, k + 7), (k, k + 1, k + 5, k + 4), (k + 1, k + 2, k + 6, k + 5),
                  (k + 2, k + 3, k + 7, k + 6), (k + 3, k, k + 4, k + 7)]
        t = nt
    mesh_obj(f'{name}_Steps', verts, faces, MAT['esc_steps'])
    # glass balustrades and black handrails on both sides
    path = [(-1.0, 0.0), (0.0, 0.0), (L, rise), (L + 1.0, rise)]
    for side, x in (('L', ua + 0.06), ('R', ub - 0.06)):
        gv, gf, rv, rf = [], [], [], []
        for (ta, za), (tb, zb) in zip(path, path[1:]):
            k = len(gv)
            gv += [(x, V(ta), z0 + za + 0.12), (x, V(tb), z0 + zb + 0.12), (x, V(tb), z0 + zb + 0.92), (x, V(ta), z0 + za + 0.92)]
            gf.append((k, k + 1, k + 2, k + 3))
            k = len(rv)
            for dx, dz in ((-0.04, 0.92), (0.04, 0.92), (0.04, 1.0), (-0.04, 1.0)):
                rv.append((x + dx, V(ta), z0 + za + dz))
            for dx, dz in ((-0.04, 0.92), (0.04, 0.92), (0.04, 1.0), (-0.04, 1.0)):
                rv.append((x + dx, V(tb), z0 + zb + dz))
            rf += [(k, k + 1, k + 5, k + 4), (k + 1, k + 2, k + 6, k + 5), (k + 2, k + 3, k + 7, k + 6), (k + 3, k, k + 4, k + 7),
                   (k + 3, k + 2, k + 1, k), (k + 4, k + 5, k + 6, k + 7)]
        mesh_obj(f'{name}_Glass{side}', gv, gf, MAT['glass'])
        mesh_obj(f'{name}_Rail{side}', rv, rf, MAT['handrail'])
        # the steel deck along the steps, under the glass
        dv, df = [], []
        for (ta, za), (tb, zb) in zip(path, path[1:]):
            k = len(dv)
            for zz in (0.02, 0.12):
                dv += [(x - 0.06, V(ta), z0 + za + zz), (x + 0.06, V(ta), z0 + za + zz), (x + 0.06, V(tb), z0 + zb + zz), (x - 0.06, V(tb), z0 + zb + zz)]
            df += [(k + 4, k + 5, k + 6, k + 7), (k, k + 1, k + 5, k + 4), (k + 2, k + 3, k + 7, k + 6), (k + 1, k + 2, k + 6, k + 5), (k + 3, k, k + 4, k + 7)]
        mesh_obj(f'{name}_Deck{side}', dv, df, MAT['steel'])
    # comb plates at both ends
    for nm, ta, tb, z in (('Foot', -1.3, -1.0, 0.0), ('Top', L + 1.0, L + 1.3, rise)):
        box(f'{name}_Comb{nm}', ua + 0.02, ub - 0.02, V(ta), V(tb), z0 + z + 0.02, z0 + z + 0.03, MAT['steel'])

if FLOOR == 2:
    mid = (ESC_A[0] + ESC_A[1]) / 2
    escalator('EscA_Up', ESC_A[0], mid - 0.05, -BELOW, 8.7, 2.5, BELOW)
    escalator('EscA_Down', mid + 0.05, ESC_A[1], -BELOW, 8.7, 2.5, BELOW)
mid = (ESC_B[0] + ESC_B[1]) / 2
zb = 0.0 if FLOOR == 2 else -STOREY  # floor 2 -> 3: starts here on floor 2, arrives here on floor 3
escalator('EscB_Up', ESC_B[0], mid - 0.05, zb, B_FOOT, B_TOP, STOREY)
escalator('EscB_Down', mid + 0.05, ESC_B[1], zb, B_FOOT, B_TOP, STOREY)

# ------------------------------------------------------------------ cores: walls, doors, signs
def core(name, r, doors=(), sign=None):
    """Walls inside the rectangle r = (u0, u1, v0, v1), up to the ceiling. doors: (side, centre, width, kind)."""
    u0, u1, v0, v1 = r
    t = 0.2
    sides = {'S': ((u0, v0 + t / 2), (u1, v0 + t / 2)), 'N': ((u1, v1 - t / 2), (u0, v1 - t / 2)),
             'W': ((u0 + t / 2, v1), (u0 + t / 2, v0)), 'E': ((u1 - t / 2, v0), (u1 - t / 2, v1))}
    for side, (a, b) in sides.items():
        L = math.dist(a, b)
        dx, dy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        P = lambda s: (a[0] + dx * s, a[1] + dy * s)  # noqa: E731
        cuts = sorted((c - w / 2, c + w / 2, kind) for sd, c, w, kind in doors if sd == side)
        s = 0.0
        for c0, c1, kind in cuts:
            # c is measured along the side from its first corner (S, E: from the west/south; N, W: from the east/north)
            seg(f'{name}_{side}_wall{s:.1f}', P(s), P(c0), 0, H, t, MAT['core'])
            seg(f'{name}_{side}_head{c0:.1f}', P(c0), P(c1), 2.15, H, t, MAT['core'])
            # the door leaf, closed, and its frame; on the outside face
            # outward normal: to the right of a->b (the sides run clockwise round the core)
            nx, ny = dy, -dx
            leaf = MAT['steel_door'] if kind == 'steel' else MAT['door_wood']
            seg(f'{name}_{side}_door{c0:.1f}', P(c0 + 0.05), P(c1 - 0.05), 0.0, 2.1, 0.05, leaf, off=0.0)
            for e in (c0, c1 - 0.05):
                seg(f'{name}_{side}_jamb{e:.1f}', P(e), P(e + 0.05), 0.0, 2.15, t + 0.04, MAT['skirting'])
            seg(f'{name}_{side}_lintel{c0:.1f}', P(c0), P(c1), 2.1, 2.15, t + 0.04, MAT['skirting'])
            mx, my = P((c0 + c1) / 2)
            hx, hy = mx + nx * (t / 2 + 0.03), my + ny * (t / 2 + 0.03)
            ang = math.atan2(dy, dx)
            if kind == 'steel':
                rbox(f'{name}_{side}_exit{c0:.1f}', hx, hy, 2.3, 0.36, 0.04, 0.14, MAT['exit'], ang)
                rbox(f'{name}_{side}_handle{c0:.1f}', mx + nx * 0.06 + dx * (c1 - c0) * 0.35, my + ny * 0.06 + dy * (c1 - c0) * 0.35,
                     1.0, (c1 - c0) * 0.6, 0.04, 0.04, MAT['steel'], ang)
            elif sign:
                plate = rbox(f'{name}_{side}_sign{c0:.1f}', mx + nx * (t / 2 + 0.01) + dx * ((c1 - c0) / 2 + 0.35),
                             my + ny * (t / 2 + 0.01) + dy * ((c1 - c0) / 2 + 0.35), 1.45, 0.22, 0.02, 0.22, MAT['sign_plate'], ang)
            s = c1
        seg(f'{name}_{side}_wall{s:.1f}', P(s), P(L), 0, H, t, MAT['core'])
        # skirting on the outside
        seg(f'{name}_{side}_skirt', a, b, 0.0, 0.08, 0.012, MAT['skirting'], off=-(t / 2 + 0.006))

core('StairsW', STAIRS_W, doors=[('S', 1.9, 1.1, 'steel')])
core('LiftsB', LIFTS_B)
core('StairsB', STAIRS_B, doors=[('W', 6.2, 1.1, 'steel')])
core('StairsC', STAIRS_C, doors=[('S', 1.3, 1.1, 'steel')])
core('LiftsC', LIFTS_C)
core('WC203', WC_203, doors=[('N', 1.2, 0.9, 'wood')], sign=True)
core('WC204', WC_204, doors=[('E', 1.3, 0.9, 'wood')], sign=True)
# what the cores hold, seen in the top view: stair flights, lift cars, toilet cubicles
MAT['wc_white'] = principled('A2_Sanitary', srgb('#f4f4f2'), 0.15, 0.0, 0.6)
MAT['partition'] = principled('A2_Partition', srgb('#6f7a84'), 0.35, 0.1)
MAT['lift_car'] = principled('A2_LiftCar', srgb('#a9aeb3'), 0.3, 0.8)
MAT['pit'] = noisy('A2_Pit', '#3a3b3c', 0.9, 3.0, 0.2)

def stair_core(name, r):
    u0, u1, v0, v1 = r[0] + 0.2, r[1] - 0.2, r[2] + 0.2, r[3] - 0.2
    along_u = (u1 - u0) >= (v1 - v0)
    a0, a1, b0, b1 = (u0, u1, v0, v1) if along_u else (v0, v1, u0, u1)
    P = (lambda a, b: (a, b)) if along_u else (lambda a, b: (b, a))  # noqa: E731
    def bx(nm, aa0, aa1, bb0, bb1, z0, z1, mat):
        (x0, y0), (x1, y1) = P(aa0, bb0), P(aa1, bb1)
        box(nm, x0, x1, y0, y1, z0, z1, mat)
    bx(f'{name}_Floor', a0, a1, b0, b1, 0.0, 0.005, MAT['concrete'])
    n, tread, rise = 9, 0.25, 1.8 / 9
    run = n * tread
    land = max(0.9, (a1 - a0 - run) / 2)
    bm = (b0 + b1) / 2
    for k in range(n):
        a = a0 + land + k * tread
        bx(f'{name}_StepA{k}', a, a + tread, b0, bm - 0.06, 0.0, (k + 1) * rise, MAT['concrete'])
        a = a0 + land + run - (k + 1) * tread
        bx(f'{name}_StepB{k}', a, a + tread, bm + 0.06, b1, 1.8, 1.8 + (k + 1) * rise, MAT['concrete'])
    bx(f'{name}_Landing', a0 + land + run, a1, b0, b1, 1.6, 1.8, MAT['concrete'])
    bx(f'{name}_Divider', a0 + land, a0 + land + run, bm - 0.06, bm + 0.06, 0.0, H, MAT['core'])
    bx(f'{name}_Nosing', a0 + land, a0 + land + run, bm - 0.09, bm - 0.06, 0.9, 1.0 + 1.8, MAT['handrail'])

def lift_core(name, r):
    u0, u1, v0, v1 = r[0] + 0.2, r[1] - 0.2, r[2] + 0.2, r[3] - 0.2
    box(f'{name}_Pit', u0, u1, v0, v1, 0.0, 0.005, MAT['pit'])
    if (u1 - u0) < (v1 - v0):
        m = (v0 + v1) / 2
        cars = [(u0 + 0.1, u1 - 0.1, v0 + 0.1, m - 0.1), (u0 + 0.1, u1 - 0.1, m + 0.1, v1 - 0.1)]
    else:
        m = (u0 + u1) / 2
        cars = [(u0 + 0.1, m - 0.1, v0 + 0.1, v1 - 0.1), (m + 0.1, u1 - 0.1, v0 + 0.1, v1 - 0.1)]
    for i, (a, b, c, d) in enumerate(cars):
        box(f'{name}_Car{i}', a, b, c, d, 0.3, 2.6, MAT['lift_car'])

def toilets(name, r, cub, vanity):
    """cub: (u0, u1, v0, v1, n, along) cubicles; vanity: (u0, u1, v0, v1)."""
    box(f'{name}_Floor', r[0] + 0.2, r[1] - 0.2, r[2] + 0.2, r[3] - 0.2, 0.0, 0.005, MAT['wet_floor'])
    u0, u1, v0, v1, n, wall = cub
    for k in range(n):
        a0, a1 = u0 + (u1 - u0) * k / n, u0 + (u1 - u0) * (k + 1) / n
        if k:
            box(f'{name}_Part{k}', a0 - 0.02, a0 + 0.02, v0, v1, 0.15, 2.0, MAT['partition'])
        door_v = v1 if wall == 'S' else v0
        box(f'{name}_CubDoor{k}', a0 + 0.08, a1 - 0.08, door_v - 0.02, door_v + 0.02, 0.15, 2.0, MAT['partition'])
        wv = v0 if wall == 'S' else v1
        cx = (a0 + a1) / 2
        box(f'{name}_Pan{k}', cx - 0.19, cx + 0.19, min(wv, wv + (0.62 if wall == 'S' else -0.62)), max(wv, wv + (0.62 if wall == 'S' else -0.62)), 0.0, 0.42, MAT['wc_white'])
    x0, x1, y0, y1 = vanity
    box(f'{name}_Vanity', x0, x1, y0, y1, 0.0, 0.85, MAT['marble'])
    long_u = (x1 - x0) >= (y1 - y0)
    for i, f in enumerate((0.3, 0.7)):
        cx, cy = (x0 + (x1 - x0) * f, (y0 + y1) / 2) if long_u else ((x0 + x1) / 2, y0 + (y1 - y0) * f)
        box(f'{name}_Basin{i}', cx - 0.2, cx + 0.2, cy - 0.17, cy + 0.17, 0.85, 0.88, MAT['wc_white'])

stair_core('StairsW', STAIRS_W)
stair_core('StairsB', STAIRS_B)
stair_core('StairsC', STAIRS_C)
lift_core('LiftsB', LIFTS_B)
lift_core('LiftsC', LIFTS_C)
toilets('WC203', WC_203, (1.08, 3.08, -14.19, -12.69, 2, 'S'), (1.08, 1.63, -12.3, -10.9))
toilets('WC204', WC_204, (-1.12, 1.88, -17.09, -15.59, 3, 'S'), (-1.0, 1.4, -15.14, -14.59))
for i, r in enumerate(CORES):
    area_light(f'CoreL_{i}', (r[0] + r[1]) / 2, (r[2] + r[3]) / 2, H - 0.05, 0.8, 0.8, 70)

# fire extinguisher cabinets by the stair doors
for i, (x, y, rot) in enumerate(((STAIRS_W[0] + 3.4, STAIRS_W[2] - 0.12, 0.0), (STAIRS_C[0] + 2.2, STAIRS_C[2] - 0.12, 0.0),
                                 (STAIRS_B[0] - 0.12, STAIRS_B[2] + 2.2, math.pi / 2))):
    rbox(f'Extinguisher_{i}', x, y, 0.6, 0.45, 0.06, 0.7, MAT['extinguisher'], rot)

# ------------------------------------------------------------------ columns on the structural grid
U = [X1, X2, X3, X4, X5, X6, X7]
V = [Y1, Y2, Y3, Y4, Y5, Y6, Y7, Y8, Y9, Y10, Y11, Y12]
cols = []
for u in U:
    for v in V:
        p = (u, v)
        if not inpoly(p, OUTLINE) or edge_dist(p, OUTLINE) < 0.35:
            continue
        if any(in_rect(p, r, 0.35) for r in CORES) or in_rect(p, VOID_HERE, 0.4) or (FLOOR == 2 and in_rect(p, VOID, 0.4)) or in_rect(p, (ESC_B[0], ESC_B[1], B_FOOT - 1.4, B_TOP + 1.4), 0.4):
            continue
        cyl(f'Column_{u:.1f}_{v:.1f}', u, v, 0.0, H, 0.3, MAT['column'], seg=48)
        cyl(f'ColumnBase_{u:.1f}_{v:.1f}', u, v, 0.0, 0.08, 0.305, MAT['skirting'], seg=48)
        cols.append(p)

# ------------------------------------------------------------------ curtain wall all round
gv, gf = [], []
mull = 0
for k, (a, b) in enumerate(zip(OUTLINE, OUTLINE[1:] + OUTLINE[:1])):
    L = math.dist(a, b)
    n = max(1, math.ceil(L / 1.5))
    dx, dy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    ang = math.atan2(dy, dx)
    i0 = len(gv)
    gv += [(a[0], a[1], 0.0), (b[0], b[1], 0.0), (b[0], b[1], H), (a[0], a[1], H)]
    gf.append((i0, i0 + 1, i0 + 2, i0 + 3))
    for j in range(n):
        x, y = a[0] + dx * L * j / n, a[1] + dy * L * j / n
        rbox(f'Mullion_{mull}', x, y, 0.0, 0.06, 0.16, H, MAT['frame'], ang)
        mull += 1
    for z0, z1, nm in ((0.0, 0.1, 'Sill'), (H - 0.06, H, 'Head')):
        seg(f'Facade{nm}_{k}', a, b, z0, z1, 0.14, MAT['frame'])
mesh_obj('Facade_Glass', gv, gf, MAT['glass'])
# the slab edge outside the glass, white like the podium's bands
for k, (a, b) in enumerate(zip(OUTLINE, OUTLINE[1:] + OUTLINE[:1])):
    seg(f'Band_{k}', a, b, -0.9, 0.0, 0.3, MAT['column'], off=-0.2)
    seg(f'BandTop_{k}', a, b, H, STOREY + 0.6, 0.3, MAT['column'], off=-0.2)

# ------------------------------------------------------------------ ceiling: LED panels and air grilles on a 3.6 m grid
n = 0
gr = 0
def clear_spot(p, pad):
    return (inpoly(p, OUTLINE) and edge_dist(p, OUTLINE) > pad and not any(in_rect(p, r, pad) for r in CORES)
            and not (FLOOR == 2 and in_rect(p, CEIL_OPEN, pad)))
for i in range(-1, 12):
    for j in range(-1, 19):
        x, y = X1 + 1.8 + 3.6 * i, Y1 + 1.8 + 3.6 * j
        if clear_spot((x, y), 0.6):
            box(f'Panel_{n}', x - 0.3, x + 0.3, y - 0.3, y + 0.3, H - 0.012, H, MAT['panel_light'])
            box(f'Panel_Frame{n}', x - 0.33, x + 0.33, y - 0.33, y + 0.33, H - 0.006, H, MAT['grille'])
            area_light(f'L_{n}', x, y, H - 0.03, 0.6, 0.6, 55)
            n += 1
        gx, gy = x + 1.8, y
        if (i + j) % 2 == 0 and clear_spot((gx, gy), 0.6) and all(math.dist((gx, gy), c) > 0.6 for c in cols):
            box(f'Panel_Grille{gr}', gx - 0.3, gx + 0.3, gy - 0.3, gy + 0.3, H - 0.01, H, MAT['grille'])
            for q in range(1, 4):
                box(f'Panel_GrilleSlot{gr}_{q}', gx - 0.3 + q * 0.15 - 0.005, gx - 0.3 + q * 0.15 + 0.005, gy - 0.28, gy + 0.28, H - 0.014, H - 0.01, MAT['skirting'])
            gr += 1
print('panels', n, 'grilles', gr, 'columns', len(cols))

# ------------------------------------------------------------------ outside: the street below, pavement, road
# (no two tops in one plane: a shadow ray leaving one would start inside the other and see only black)
box('Ground_Grass', -300, 300, -300, 300, GROUND - 0.2, GROUND - 0.04, MAT['grass'])
box('Pavement_Apron', -28, 26, -42, 40, GROUND - 0.06, GROUND - 0.012, MAT['pavement'])
box('Ground_RoadW', -48, -30, -300, 300, GROUND - 0.06, GROUND - 0.03, MAT['asphalt'])
box('Ground_RoadS', -300, 300, -62, -46, GROUND - 0.06, GROUND - 0.03, MAT['asphalt'])
box('Ground_ParkE', 28, 60, -40, 40, GROUND - 0.06, GROUND - 0.03, MAT['asphalt'])

# ------------------------------------------------------------------ tour stops (u, v) and the top view's rectangle
STOPS = {
    'hall': (7.0, -4.6),
    # floor 2: south of the two pairs; floor 3: at the top of the pair arriving from floor 2
    'escalator': (1.0, -0.8) if FLOOR == 2 else (-2.2, 8.0),
    'west': (-12.6, 13.6),
    'north': (6.6, 17.6),
    'east': (13.8, 0.6),
    'south': (0.4, -24.4),
}
for k, p in STOPS.items():
    assert inpoly(p, OUTLINE) and all(math.dist(p, c) > 1.0 for c in cols), k
sc['top_rect'] = [-19.0, -32.2, 18.8, 32.4]
sc['ground_z'] = GROUND   # for tools/add_city.py, which puts the real street there at render time
# daylight outside brighter than the hall, as it is by day (F's sky alone left the street dimmer than the
# lit hall, so the glass showed the hall more than the street)
sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 3.0
finish(f'A{FLOOR}', STOPS, exposure=-1.1, sun_energy=4.5)
