"""Build the furnished interior of block D, floor 1 (car parts shop, repair shop, office, waiting and staff
rooms) for the rendered 360° tour and top view, from the block D data of the site (src/data/blockD.ts).

Block metres as on the site: u east from axis X1, v north from axis Y1. Blender X = u, Y = v, Z up, floor
at 0. Materials, the sky light and furniture pieces (plants, sofa, armchair) come from the plan-F scene
(interior/F.blend); the car is the site's own (public/models/blocks/environment.glb, extracted to car.glb).
Panorama stops go to D1_cams.json as [x, y, z] with y south (= -v), as render_panos.py expects.

Run: python3 -I build_blockd.py <F.blend> <car.glb> <out dir>
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blockd_common import *  # noqa: F401,F403  (opens F.blend, materials, helpers, the car)
from mathutils import Matrix

# ------------------------------------------------------------------ block D, floor 1 (blockD.ts)
H = 4.5          # floor to floor
SLAB = 0.25
CEIL = H - SLAB  # underside of the floor-2 slab
BEAM = 0.3
WALL = 0.45
U1, V1 = 18.0, 30.0
RAMP = dict(u0=12.25, u1=17.75, low=27.8, high=12.3)

def ramp_top(v):
    """Top of ramp 1 at v (0 at its foot, 4.5 at the top), clamped."""
    t = (RAMP['low'] - v) / (RAMP['low'] - RAMP['high'])
    return max(0.0, min(1.0, t)) * H

def under_ramp(u, v):
    """Headroom at (u, v): the ramp's underside where it runs overhead, else the slab."""
    if RAMP['u0'] - 0.25 <= u <= RAMP['u1'] + 0.25 and v < RAMP['low']:
        return min(CEIL, ramp_top(v) - 0.3)
    return CEIL

# floors: shop and office tiles, repair shop epoxy, the rest polished concrete / wet-room tiles
box('Floor_Shop_E', 6, U1, 0, 12, -0.05, 0, MAT['shop_floor'])
box('Floor_Shop_W', 0, 6, 6, 12, -0.05, 0, MAT['shop_floor'])
box('Floor_Office', 0, 6, 0, 6, -0.05, 0, MAT['shop_floor'])
# the repair shop around the inspection pit (3.65, 14.66), 1.16 x 4.57 m, long side along u
PIT = (3.65 - 4.57 / 2, 3.65 + 4.57 / 2, 14.66 - 0.58, 14.66 + 0.58)
box('Floor_Work_S', 0, 12, 12, PIT[2], -0.05, 0, MAT['epoxy'])
box('Floor_Work_N', 0, 12, PIT[3], V1, -0.05, 0, MAT['epoxy'])
box('Floor_Work_W', 0, PIT[0], PIT[2], PIT[3], -0.05, 0, MAT['epoxy'])
box('Floor_Work_E', PIT[1], 12, PIT[2], PIT[3], -0.05, 0, MAT['epoxy'])
box('Floor_Rooms', 12, U1, 12, 22.66, -0.05, 0, MAT['concrete'])
box('Floor_Ramp_Foot', 12, U1, 22.66, V1, -0.05, 0, MAT['concrete_dark'])
box('Floor_WC', 14.44, 16.56, 14.08, 16.57, -0.049, 0.002, MAT['wet_floor'])
# the pit: walls, floor, steps, safety edge
box('Pit_Floor', PIT[0], PIT[1], PIT[2], PIT[3], -1.55, -1.5, MAT['concrete_dark'])
for n, (a, b, c, d) in enumerate([(PIT[0] - 0.1, PIT[0], PIT[2] - 0.1, PIT[3] + 0.1), (PIT[1], PIT[1] + 0.1, PIT[2] - 0.1, PIT[3] + 0.1),
                                   (PIT[0], PIT[1], PIT[2] - 0.1, PIT[2]), (PIT[0], PIT[1], PIT[3], PIT[3] + 0.1)]):
    box(f'Pit_Wall{n}', a, b, c, d, -1.55, 0, MAT['paint_white'])
for i in range(int((PIT[1] - PIT[0]) / 0.2) + 1):
    x = PIT[0] + i * 0.2
    box(f'Pit_Edge{i}', x, min(x + 0.1, PIT[1]), PIT[2] - 0.08, PIT[2], 0, 0.004, MAT['yellow'])
    box(f'Pit_EdgeN{i}', x, min(x + 0.1, PIT[1]), PIT[3], PIT[3] + 0.08, 0, 0.004, MAT['yellow'])
for i in range(4):
    box(f'Pit_Step{i}', PIT[0], PIT[0] + 0.3, PIT[2], PIT[3], -1.5 + i * 0.37, -1.5 + i * 0.37 + 0.05, MAT['steel'])
box('Pit_Lamp', PIT[0] + 0.5, PIT[1] - 0.5, PIT[3] - 0.04, PIT[3], -0.7, -0.62, MAT['tube_light'])

# floor markings in the repair shop: walkway lines and the bays of the two lifts
def line(name, x0, y0, x1, y1, w=0.1, mat=None):
    if abs(x1 - x0) > abs(y1 - y0):
        box(name, x0, x1, y0 - w / 2, y0 + w / 2, 0, 0.003, mat or MAT['yellow'])
    else:
        box(name, x0 - w / 2, x0 + w / 2, y0, y1, 0, 0.003, mat or MAT['yellow'])
line('Mark_Walk_W', 8.6, 12.2, 8.6, 29.6)
line('Mark_Walk_E', 10.8, 12.2, 10.8, 29.6)
for i, (cy, h) in enumerate([(26.68, 3.2), (20.65, 3.2)]):
    line(f'Mark_Bay{i}_S', 1.3, cy - h / 2 - 0.2, 7.3, cy - h / 2 - 0.2)
    line(f'Mark_Bay{i}_N', 1.3, cy + h / 2 + 0.2, 7.3, cy + h / 2 + 0.2)
    line(f'Mark_Bay{i}_E', 7.3, cy - h / 2 - 0.2, 7.3, cy + h / 2 + 0.2)

# ceiling: the floor-2 slab, beams on the grid, an opening over the ramp (to floor 2)
for n, (a, b, c, d) in enumerate([(0, U1, 0, 12), (0, 12, 12, V1), (12, U1, 24, V1)]):
    box(f'Slab{n}', a, b, c, d, CEIL, H, MAT['concrete'])
for u in (0, 6, 12, 18):
    box(f'BeamV{u}', u - 0.2, u + 0.2, 0, V1 if u <= 12 else 12, CEIL - BEAM, CEIL, MAT['concrete'])
    if u > 12:
        box(f'BeamV{u}b', u - 0.2, u + 0.2, 24, V1, CEIL - BEAM, CEIL, MAT['concrete'])
for v in (0, 6, 12, 18, 24, 30):
    box(f'BeamU{v}', 0, 12 if 12 < v < 24 else U1, v - 0.2, v + 0.2, CEIL - BEAM, CEIL, MAT['concrete'])

# the ramp from floor 1 to 2, its kerbs and the slab edge round the opening
def ramp_slab():
    u0, u1, lo, hi = RAMP['u0'], RAMP['u1'], RAMP['low'], RAMP['high']
    v = [(u0, lo, 0), (u1, lo, 0), (u1, hi, H), (u0, hi, H), (u0, lo, -0.05), (u1, lo, -0.05), (u1, hi, H - SLAB), (u0, hi, H - SLAB)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    me = bpy.data.meshes.new('RampOverhead')
    me.from_pydata(v, [], f)
    me.materials.append(MAT['concrete_dark'])
    o = bpy.data.objects.new('RampOverhead', me)
    coll.objects.link(o)
    for x0, x1 in ((u0 - 0.2, u0), (u1, u1 + 0.2)):
        kv = [(x0, lo, 0), (x1, lo, 0), (x1, hi, H), (x0, hi, H), (x0, lo, 0.15), (x1, lo, 0.15), (x1, hi, H + 0.15), (x0, hi, H + 0.15)]
        k = bpy.data.meshes.new('RampOverheadKerb')
        k.from_pydata(kv, [], [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])
        k.materials.append(MAT['yellow'])
        ko = bpy.data.objects.new('RampOverheadKerb', k)
        coll.objects.link(ko)
ramp_slab()

# columns on the grid
for u in (0, 6, 12, 18):
    for v in (0, 6, 12, 18, 24, 30):
        top = under_ramp(u, v)
        box(f'Col_{u}_{v}', u - 0.225, u + 0.225, v - 0.225, v + 0.225, 0, top, MAT['concrete'])
        if 0 < u < 18 and 12 < v < 30:  # repair shop: yellow and black guards round the foot
            for k in range(4):
                box(f'ColGuard_{u}_{v}_{k}', u - 0.24, u + 0.24, v - 0.24, v + 0.24, k * 0.25, k * 0.25 + 0.25,
                    MAT['yellow'] if k % 2 == 0 else MAT['stripe_black'])

# ------------------------------------------------------------------ outside walls with the openings of floor 1
FACADE = [  # side, from, to, z0, z1, kind (blockDWalk[1].facade)
    ('E', 0.12, 2.3, 0, 4.1, 'window'), ('E', 2.3, 3.3, 0, 2.35, 'glassDoor'), ('E', 2.3, 3.3, 2.45, 4.1, 'window'),
    ('E', 3.3, 12.7, 0, 4.1, 'window'), ('E', 12.7, 13.9, 0, 2.35, 'door'), ('E', 13.9, 17.75, 0, 4.1, 'window'),
    ('N', 12.45, 17.45, 0, 3.5, 'garage'), ('N', 6.4, 11.5, 0, 3.5, 'garage'),
    ('N', 0.74, 2.56, 0.95, 2.58, 'window'), ('N', 3.36, 5.15, 0.95, 2.58, 'window'),
    ('S', 0.86, 2.6, 0.88, 2.5, 'window'), ('S', 3.42, 5.19, 0.88, 2.5, 'window'),
    ('S', 7.01, 10.99, 3.37, 4.0, 'window'), ('S', 13.0, 16.95, 3.37, 4.0, 'window'),
]
SIDES = {  # along-axis range, and the wall's slab across it
    'E': dict(along=(-WALL, V1 + WALL), across=(U1, U1 + WALL)),
    'W': dict(along=(-WALL, V1 + WALL), across=(-WALL, 0)),
    'N': dict(along=(-WALL, U1 + WALL), across=(V1, V1 + WALL)),
    'S': dict(along=(-WALL, U1 + WALL), across=(-WALL, 0)),
}

def wall_piece(side, a0, a1, z0, z1, mat, name, inset=(0.0, 0.0)):
    c0, c1 = SIDES[side]['across']
    c0, c1 = c0 + inset[0], c1 - inset[1]
    if side in ('E', 'W'):
        return box(name, c0, c1, a0, a1, z0, z1, mat)
    return box(name, a0, a1, c0, c1, z0, z1, mat)

def mullions(side, a0, a1, z0, z1, n_panes, name):
    """Window frame and glass in the middle of the wall: outer frame, mullions, a transom high up."""
    c0, c1 = SIDES[side]['across']
    mid = (c0 + c1) / 2
    fw = 0.06
    def piece(nm, b0, b1, y0, y1, mat, depth=0.1):
        if side in ('E', 'W'):
            box(nm, mid - depth / 2, mid + depth / 2, b0, b1, y0, y1, mat)
        else:
            box(nm, b0, b1, mid - depth / 2, mid + depth / 2, y0, y1, mat)
    piece(f'{name}_Glass', a0, a1, z0, z1, MAT['glass'], 0.02)
    piece(f'{name}_FB', a0, a1, z0, z0 + fw, MAT['frame'])
    piece(f'{name}_FT', a0, a1, z1 - fw, z1, MAT['frame'])
    piece(f'{name}_FL', a0, a0 + fw, z0, z1, MAT['frame'])
    piece(f'{name}_FR', a1 - fw, a1, z0, z1, MAT['frame'])
    for i in range(1, n_panes):
        a = a0 + (a1 - a0) * i / n_panes
        piece(f'{name}_M{i}', a - fw / 2, a + fw / 2, z0, z1, MAT['frame'])
    if z1 - z0 > 3.0:
        piece(f'{name}_T', a0, a1, z1 - 0.9, z1 - 0.9 + fw, MAT['frame'])

for side in SIDES:
    ops = sorted([o for o in FACADE if o[0] == side], key=lambda o: o[1])
    lo, hi = SIDES[side]['along']
    # solid wall between openings (openings grouped by their along-range)
    cuts = []
    for o in ops:
        if cuts and abs(cuts[-1][0] - o[1]) < 1e-6 and abs(cuts[-1][1] - o[2]) < 1e-6:
            cuts[-1][2].append(o)
        else:
            cuts.append([o[1], o[2], [o]])
    a = lo
    for n, (f0, f1, group) in enumerate(cuts):
        wall_piece(side, a, f0, 0, H, MAT['plaster'], f'Wall_{side}_{n}')
        zs = sorted(group, key=lambda o: o[3])
        z = 0.0
        for k, o in enumerate(zs):
            wall_piece(side, f0, f1, z, o[3], MAT['plaster'], f'Wall_{side}_{n}_{k}u')
            z = o[4]
        wall_piece(side, f0, f1, z, H, MAT['plaster'], f'Wall_{side}_{n}_top')
        for k, o in enumerate(zs):
            nm = f'Open_{side}_{n}_{k}'
            kind = o[5]
            if kind == 'window':
                panes = max(1, round((f1 - f0) / 1.25))
                mullions(side, f0, f1, o[3], o[4], panes, nm)
            elif kind == 'glassDoor':
                mullions(side, f0, f1, o[3], o[4], 2, nm)
                c0, c1 = SIDES[side]['across']
                box(nm + '_Handle', c0 - 0.06, c0 - 0.03, (f0 + f1) / 2 - 0.35, (f0 + f1) / 2 - 0.3, 0.6, 1.8, MAT['steel'])
            elif kind == 'door':
                wall_piece(side, f0, f1, o[3], o[4], MAT['steel_door'], nm, inset=(0.17, 0.2))
            elif kind == 'garage':
                wall_piece(side, f0, f1, o[3], o[4], MAT['garage'], nm, inset=(0.05, 0.32))
                c0, c1 = SIDES[side]['across']
                # guide rails and the drum box inside
                box(nm + '_RailL', f0 - 0.08, f0, c0 - 0.15, c0, 0, o[4] + 0.2, MAT['shelf_dark'])
                box(nm + '_RailR', f1, f1 + 0.08, c0 - 0.15, c0, 0, o[4] + 0.2, MAT['shelf_dark'])
                box(nm + '_Box', f0 - 0.1, f1 + 0.1, c0 - 0.5, c0, o[4] + 0.05, o[4] + 0.55, MAT['shelf'])
        a = f1
    wall_piece(side, a, hi, 0, H, MAT['plaster'], f'Wall_{side}_end')

# skirting-high grey dado in the repair shop, so the walls read as a workshop
box('Dado_W', 0, 0.01, 12.2, V1, 0, 1.2, MAT['paint_grey'])
box('Dado_N', 0, 6.3, V1 - 0.01, V1, 0, 1.2, MAT['paint_grey'])

# ------------------------------------------------------------------ inside walls (blockDWalk[1].partitions)
PT = 0.12
PARTS = [
    ((6, 0.05), (6, 6), [(2.7, 0.9)]),
    ((0.05, 6), (6, 6), []),
    ((0.05, 12), (12, 12), [(9.75, 1.0)]),
    ((12, 12), (12, 29.95), [(0.85, 0.9), (4.4, 0.9), (7.1, 0.9)]),
    ((12, 12), (17.95, 12), [(5.4, 0.9)]),
    ((12, 14.08), (16.65, 14.08), [(1.2, 0.9)]),
    ((16.65, 12), (16.65, 15.33), [(1.2, 0.8)]),
    ((16.56, 15.33), (17.95, 15.33), [(0.8, 0.8)]),
    ((14.44, 14.08), (14.44, 16.57), [(0.55, 0.6), (1.8, 0.6)]),
    ((16.56, 15.33), (16.56, 16.57), []),
    ((14.44, 15.15), (16.56, 15.15), []),
    ((14.44, 16.57), (16.56, 16.57), []),
    ((12, 18.24), (17.95, 18.24), []),
    ((12, 22.66), (17.95, 22.66), []),
]
DOOR_H = 2.1
DOORS = []  # (centre, along-unit-vector, width, wall normal) for door leaves

def part_wall(n, a, b, holes):
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay)
    dx, dy = (bx - ax) / L, (by - ay) / L
    nx, ny = -dy, dx
    spans, s = [], 0.0
    for at, w in sorted(holes):
        spans.append((s, at - w / 2, None))
        spans.append((at - w / 2, at + w / 2, 'door'))
        s = at + w / 2
    spans.append((s, L, None))
    for k, (s0, s1, kind) in enumerate(spans):
        if s1 - s0 < 1e-3:
            continue
        p0 = (ax + dx * s0, ay + dy * s0)
        p1 = (ax + dx * s1, ay + dy * s1)
        quad = [(p0[0] + nx * PT / 2, p0[1] + ny * PT / 2), (p1[0] + nx * PT / 2, p1[1] + ny * PT / 2),
                (p1[0] - nx * PT / 2, p1[1] - ny * PT / 2), (p0[0] - nx * PT / 2, p0[1] - ny * PT / 2)]
        tops = [under_ramp(x, y) for x, y in quad]
        if kind is None:
            prism(f'Part{n}_{k}', quad, 0, tops, MAT['plaster'])
        else:
            prism(f'Part{n}_{k}_head', quad, DOOR_H, tops, MAT['plaster'])
            DOORS.append(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (dx, dy), s1 - s0, (nx, ny)))
for n, (a, b, holes) in enumerate(PARTS):
    part_wall(n, a, b, holes)

# door leaves, open 90° into the room on the normal's side; frames round the opening
for n, (cx, cy, (dx, dy), w, (nx, ny)) in enumerate(DOORS):
    hx, hy = cx - dx * w / 2, cy - dy * w / 2          # hinge
    ang = math.atan2(ny, nx)
    rbox(f'DoorLeaf{n}', hx + nx * (w - 0.08) / 2 + dx * 0.03, hy + ny * (w - 0.08) / 2 + dy * 0.03, 0.01, w - 0.08, 0.04, DOOR_H - 0.03,
         MAT['oak'] if w < 0.85 else MAT['steel_door'], ang)
    for s in (-1, 1):
        px, py = cx + dx * s * (w / 2 + 0.02), cy + dy * s * (w / 2 + 0.02)
        rbox(f'DoorFrame{n}_{s}', px, py, 0, 0.04, PT + 0.04, DOOR_H + 0.04, MAT['frame'], math.atan2(dy, dx))
    rbox(f'DoorFrame{n}_top', cx, cy, DOOR_H, w + 0.08, PT + 0.04, 0.04, MAT['frame'], math.atan2(dy, dx))

# ------------------------------------------------------------------ the stair and lift core east of the box (closed, seen from outside)
box('Core_Wall', U1 + WALL, 21.2, 19.6, V1 + WALL, 0, H, MAT['plaster'])

# ------------------------------------------------------------------ ceilings and lights
SHOP_CEIL = 3.6
for n, (a, b, c, d) in enumerate([(6, U1, 0, 12), (0, 6, 6, 12), (0, 6, 0, 6)]):
    box(f'ShopCeiling{n}', a, b, c, d, SHOP_CEIL, SHOP_CEIL + 0.02, MAT['ceiling'])
# 60 x 60 LED panels every 2.4 m in the shop and office
LIGHTS = []
for u in [1.5 + 2.4 * i for i in range(7)]:
    for v in [1.5 + 2.4 * j for j in range(5)]:
        if (u < 6 and v < 6) or (u >= 6 or v >= 6):
            if u > 17.5 or v > 11.5:
                continue
            box(f'Panel_{u:.1f}_{v:.1f}', u - 0.3, u + 0.3, v - 0.3, v + 0.3, SHOP_CEIL - 0.01, SHOP_CEIL, MAT['panel_light'])
            LIGHTS.append(('panel', u, v, SHOP_CEIL - 0.02))
# small rooms (06-11) under the ramp: a ceiling at 2.7 m with downlights
for n, (a, b, c, d) in enumerate([(12, 16.65, 12, 14.08), (16.65, U1, 12, 15.33), (12, 14.44, 14.08, 18.24),
                                  (14.44, 16.56, 14.08, 16.57), (16.56, U1, 15.33, 18.24), (14.44, 16.56, 16.57, 18.24)]):
    box(f'RoomCeiling{n}', a, b, c, d, 2.7, 2.72, MAT['ceiling'])
    cx, cy = (a + b) / 2, (c + d) / 2
    cyl(f'Down{n}', cx, cy, 2.69, 0.01, 0.07, MAT['panel_light'])
    LIGHTS.append(('down', cx, cy, 2.68))
# repair shop: rows of hanging LED battens
for u in (2.0, 5.5, 9.7):
    for v in (14.5, 18.5, 22.5, 26.5):
        box(f'Batten_{u}_{v}', u - 0.08, u + 0.08, v - 0.75, v + 0.75, 3.55, 3.6, MAT['shelf'])
        box(f'BattenL_{u}_{v}', u - 0.06, u + 0.06, v - 0.72, v + 0.72, 3.545, 3.55, MAT['tube_light'])
        for s in (-0.6, 0.6):
            box(f'BattenW_{u}_{v}_{s}', u - 0.003, u + 0.003, v + s, v + s + 0.006, 3.6, CEIL - BEAM, MAT['black'])
        LIGHTS.append(('batten', u, v, 3.5))
# storage 04 and the ramp foot: battens on the ramp's underside / slab
for v in (20.4, 26.5):
    box(f'Batten04_{v}', 14.2, 15.8, v - 0.08, v + 0.08, under_ramp(15, v) - 0.06, under_ramp(15, v) - 0.02, MAT['tube_light'])
    LIGHTS.append(('batten', 15.0, v, under_ramp(15, v) - 0.1))

for kind, x, y, z in LIGHTS:
    if kind == 'panel':
        area_light(f'L_{x:.1f}_{y:.1f}', x, y, z, 0.6, 0.6, 38)
    elif kind == 'down':
        area_light(f'L_{x:.1f}_{y:.1f}', x, y, z, 0.3, 0.3, 45)
    else:
        area_light(f'L_{x:.1f}_{y:.1f}', x, y, z, 0.25, 1.5, 160, (0.97, 0.98, 1.0))

# ------------------------------------------------------------------ outside: pavement, road, the sky
box('Ground', -40, 60, -40, 70, -0.25, -0.06, MAT['asphalt'])
box('Pavement_E', U1 + WALL, U1 + 6, -6, V1 + 6, -0.06, -0.04, MAT['pavement'])
box('Pavement_S', -6, U1 + 6, -6, -WALL, -0.06, -0.04, MAT['pavement'])

# ------------------------------------------------------------------ furniture
def gondola(name, cx, cy, length, rot=0.0, depth=0.9, height=1.8, shelves=5):
    """A double-sided shop shelf `length` long along `rot`, stocked on both sides."""
    c, s = math.cos(rot), math.sin(rot)
    def at(a, b):
        return cx + c * a - s * b, cy + s * a + c * b
    rbox(name + '_Spine', cx, cy, 0, length, 0.04, height, MAT['shelf_dark'], rot)
    rbox(name + '_Base', cx, cy, 0, length, depth, 0.12, MAT['shelf_dark'], rot)
    for e in (-1, 1):
        x, y = at(e * (length / 2 - 0.02), 0)
        rbox(f'{name}_End{e}', x, y, 0, 0.04, depth, height, MAT['shelf_dark'], rot)
    for k in range(shelves):
        z = 0.15 + k * (height - 0.3) / (shelves - 1)
        for side in (-1, 1):
            x, y = at(0, side * depth / 4)
            rbox(f'{name}_Shelf{k}{side}', x, y, z, length - 0.06, depth / 2 - 0.04, 0.025, MAT['shelf'], rot)
            a = -length / 2 + 0.06
            while a < length / 2 - 0.12:
                w = random.choice([0.08, 0.1, 0.12, 0.16, 0.2, 0.25, 0.3])
                h = random.uniform(0.12, min(0.32, (height - 0.3) / (shelves - 1) - 0.04)) * (0.6 if k == shelves - 1 else 1)
                dd = random.uniform(0.18, depth / 2 - 0.08)
                if random.random() < 0.88:
                    x, y = at(a + w / 2, side * (depth / 2 - 0.04 - dd / 2))
                    mat = random.choice(PRODUCT) if random.random() < 0.75 else MAT['cardboard']
                    if random.random() < 0.3:  # oil bottles: a row of cylinders
                        for b in range(max(1, int(w / 0.08))):
                            bx, by = at(a + 0.04 + b * 0.08, side * (depth / 2 - 0.1))
                            cyl(f'{name}_B{k}{side}{a:.2f}{b}', bx, by, z + 0.025, h, 0.035, mat, 12)
                    else:
                        rbox(f'{name}_P{k}{side}{a:.2f}', x, y, z + 0.025, w - 0.01, dd, h, mat, rot)
                a += w + 0.01

for i, v in enumerate([2.4, 5.0, 7.6]):
    gondola(f'Gondola{i}a', 8.4, v, 3.6)
    gondola(f'Gondola{i}b', 12.8, v, 3.6)

wall_rack('Rack01a', 1.4, 9.6, 2.4, 0)
wall_rack('Rack01b', 4.2, 9.6, 2.4, 0)
wall_rack('Rack01c', 1.0, 11.6, 2.0, 0, tyres=True)       # tyres on show in the shop
wall_rack('Rack04N', 15.0, 22.3, 5.2, 0, height=1.1, levels=2)
wall_rack('Rack04S', 15.0, 18.6, 5.2, 0, height=2.2, levels=4)
wall_rack('Rack04M', 15.4, 20.4, 3.4, 0, height=1.8, levels=3)
wall_rack('Rack05Tyres', 11.55, 27.6, 3.0, math.pi / 2, height=2.0, levels=3, tyres=True)

# the sales counter by the entrance, with a till and a screen; a display of oil by the door
rbox('Counter', 16.4, 6.6, 0, 2.4, 0.7, 1.05, MAT['walnut'], math.pi / 2)
rbox('Counter_Top', 16.4, 6.6, 1.05, 2.5, 0.8, 0.04, MAT['marble'], math.pi / 2)
rbox('Counter_Kick', 16.05, 6.6, 0, 2.4, 0.04, 0.1, MAT['black'], math.pi / 2)
rbox('Till_Screen', 16.5, 6.2, 1.25, 0.04, 0.45, 0.3, MAT['screen'], 0.0)
rbox('Till_Stand', 16.52, 6.2, 1.09, 0.06, 0.06, 0.2, MAT['black'], 0.0)
rbox('Till_Base', 16.5, 6.95, 1.09, 0.35, 0.3, 0.08, MAT['black'], 0.0)
rbox('Counter_Back', 17.75, 6.6, 0, 3.0, 0.4, 2.2, MAT['shelf'], math.pi / 2)
for k in range(4):
    for j in range(9):
        cyl(f'BackOil{k}_{j}', 17.7, 5.25 + j * 0.3, 0.3 + k * 0.5, 0.26, 0.06, PRODUCT[(k * 3 + j) % len(PRODUCT)], 12)
cyl('Stool', 17.0, 7.3, 0, 0.75, 0.2, MAT['black'])
rbox('ShopSign', 12.0, 11.9, 2.6, 4.0, 0.06, 0.6, MAT['sign'], 0.0)

# office 02: two pairs of desks back to back, chairs, screens, cupboards
for u in (4.55, 1.75):
    for v, face in ((1.75, -1), (0.85, 1)):
        rbox(f'Desk{u}{v}', u, v, 0.72, 1.8, 0.78, 0.03, MAT['oak'], 0.0)
        for lx in (-0.85, 0.85):
            rbox(f'DeskLeg{u}{v}{lx}', u + lx, v, 0, 0.05, 0.7, 0.72, MAT['black'], 0.0)
        rbox(f'Monitor{u}{v}', u, v + face * 0.25, 0.85, 0.55, 0.03, 0.33, MAT['screen'], 0.0)
        rbox(f'MonitorStand{u}{v}', u, v + face * 0.27, 0.75, 0.06, 0.06, 0.12, MAT['black'], 0.0)
        cv = v - face * 0.6
        cyl(f'ChairBase{u}{v}', u, cv, 0.0, 0.08, 0.28, MAT['black'], 5)
        cyl(f'ChairPost{u}{v}', u, cv, 0.08, 0.38, 0.03, MAT['steel'], 12)
        rbox(f'ChairSeat{u}{v}', u, cv, 0.46, 0.48, 0.48, 0.07, MAT['chair_shell'], 0.0)
        rbox(f'ChairBack{u}{v}', u, cv - face * 0.24, 0.5, 0.46, 0.05, 0.55, MAT['chair_shell'], 0.0)
rbox('Cupboard02N', 2.95, 5.75, 0, 3.9, 0.45, 2.0, MAT['paint_white'], 0.0)
rbox('Cupboard02E', 5.75, 4.5, 0, 1.8, 0.45, 2.0, MAT['paint_white'], math.pi / 2)
place('plant_mid', 0.5, 5.4)

# waiting room 06: sofa, armchair, a low table, a plant, a screen on the wall
place('sofa', 14.3, 13.65, 0.0, s=0.95)
place('armchair', 12.55, 12.6, -math.pi / 2)
cyl('WaitTable', 14.3, 12.75, 0, 0.42, 0.35, MAT['oak'], 32)
place('plant_small', 16.2, 12.45)
rbox('WaitTV', 14.3, 12.07, 1.35, 1.2, 0.04, 0.7, MAT['screen'], 0.0)

# changing room 08: lockers and two benches; toilets 07 and 09: WC and basin each
for i in range(5):
    rbox(f'Locker{i}', 12.45 + i * 0.4, 17.95, 0, 0.38, 0.5, 1.9, MAT['locker'], 0.0)
for v in (15.7, 14.65):
    rbox(f'Bench{v}', 13.1, v, 0.42, 1.8, 0.35, 0.04, MAT['oak'], 0.0)
    for lx in (-0.75, 0.75):
        rbox(f'BenchLeg{v}{lx}', 13.1 + lx, v, 0, 0.05, 0.3, 0.42, MAT['black'], 0.0)
for v, vb in ((15.9, 16.35), (14.6, 14.35)):
    rbox(f'WC{v}', 16.2, v, 0, 0.55, 0.38, 0.4, MAT['porcelain'], 0.0)
    rbox(f'WCTank{v}', 16.48, v, 0.4, 0.16, 0.38, 0.38, MAT['porcelain'], 0.0)
    rbox(f'Basin{v}', 15.3, vb, 0.78, 0.45, 0.35, 0.1, MAT['porcelain'], 0.0)
    rbox(f'Mirror{v}', 15.3, vb + (0.2 if vb > 15 else -0.2), 1.05, 0.5, 0.01, 0.7, MAT['mirror'], 0.0)

# repair shop 05: lifts, cars, benches, chests, drums, extinguishers
def lift(name, cx, cy, heading, raised):
    """Two-post lift (5.0 x 3.2 m bay): posts either side of the car, a beam across the top, arms under the sills."""
    c, s = math.cos(heading), math.sin(heading)
    def at(a, b):
        return cx + c * a - s * b, cy + s * a + c * b
    for side in (-1, 1):
        x, y = at(0.2, side * 1.45)
        rbox(f'{name}_Post{side}', x, y, 0, 0.32, 0.32, 3.8, MAT['red'], heading)
        rbox(f'{name}_Plate{side}', x, y, 0, 0.6, 0.6, 0.02, MAT['shelf_dark'], heading)
        rbox(f'{name}_Carriage{side}', x, y, (raised or 0) + 0.1, 0.38, 0.38, 0.5, MAT['shelf_dark'], heading)
        for a in (-1, 1):
            ax, ay = at(0.2 + a * 0.55, side * 0.95)
            o = rbox(f'{name}_Arm{side}{a}', ax, ay, (raised or 0) + 0.12, 1.2, 0.1, 0.08, MAT['shelf_dark'], heading + a * side * 0.45 + math.pi / 2)
            px, py = at(0.2 + a * 1.1, side * 0.75)
            cyl(f'{name}_Pad{side}{a}', px, py, (raised or 0) + 0.12, 0.08, 0.07, MAT['rubber'], 12)
    x, y = at(0.2, 0)
    rbox(f'{name}_Top', x, y, 3.8, 0.25, 3.24, 0.16, MAT['red'], heading)
    rbox(f'{name}_Label', *at(0.2, 1.45 + 0.17), 2.6, 0.2, 0.01, 0.3, MAT['yellow'], heading)

lift('Lift1', 4.07, 26.68, 0.0, 1.6)
car('Car_Lift1', 4.0, 26.68, 0.0, z=1.6 + 0.2, paint='#2b2f36')
lift('Lift2', 4.07, 20.65, 0.0, 0.0)
car('Car_Lift2', 4.0, 20.65, 0.0, z=0.0, paint='#b8bcc2')
car('Car_Pit', 4.78, 14.66, 0.0, paint='#f2f2f0')

def workbench(name, cx, cy, length, rot):
    rbox(name + '_Top', cx, cy, 0.88, length, 0.75, 0.05, MAT['oak'], rot)
    rbox(name + '_Body', cx, cy, 0, length - 0.1, 0.7, 0.86, MAT['blue'], rot)
    c, s = math.cos(rot), math.sin(rot)
    # pegboard and a vice behind it
    bx, by = cx - s * 0.3, cy + c * 0.3  # in front of the wall behind the bench
    rbox(name + '_Peg', bx, by, 1.0, length, 0.03, 0.9, MAT['shelf_dark'], rot)
    for k in range(10):
        tx, ty = bx + c * (-length / 2 + 0.2 + k * (length - 0.4) / 9) - s * -0.03, by + s * (-length / 2 + 0.2 + k * (length - 0.4) / 9) + c * -0.03
        rbox(f'{name}_Tool{k}', tx, ty, 1.15 + (k % 3) * 0.22, 0.04, 0.02, random.uniform(0.15, 0.3), MAT['steel'] if k % 2 else MAT['red'], rot)
    vx, vy = cx + c * (length / 2 - 0.3), cy + s * (length / 2 - 0.3)
    rbox(name + '_Vice', vx, vy, 0.93, 0.25, 0.18, 0.14, MAT['shelf_dark'], rot)

def tool_chest(name, cx, cy, rot):
    rbox(name, cx, cy, 0.1, 0.7, 0.48, 1.0, MAT['red'], rot)
    for k in range(6):
        c, s = math.cos(rot), math.sin(rot)
        rbox(f'{name}_Drawer{k}', cx + -s * -0.245, cy + c * -0.245, 0.2 + k * 0.15, 0.6, 0.01, 0.02, MAT['steel'], rot)
    for a in (-0.28, 0.28):
        c, s = math.cos(rot), math.sin(rot)
        cyl(f'{name}_Wheel{a}', cx + c * a, cy + s * a, 0, 0.1, 0.05, MAT['rubber'], 12)

workbench('Bench05E', 11.6, 22.5, 2.4, -math.pi / 2)
tool_chest('Chest05E1', 11.55, 24.4, -math.pi / 2)
tool_chest('Chest05E2', 11.55, 20.8, -math.pi / 2)
workbench('Bench05W', 0.45, 17.4, 2.4, math.pi / 2)
tool_chest('Chest05W', 0.5, 19.3, math.pi / 2)
for v in (23.6, 22.9):
    cyl(f'Drum{v}', 0.5, v, 0, 0.88, 0.29, MAT['drum'], 32)
    cyl(f'DrumLid{v}', 0.5, v, 0.88, 0.01, 0.27, MAT['steel'], 32)
for (x, y) in ((11.85, 25.5), (0.2, 10.5), (17.75, 1.2)):
    cyl(f'Extinguisher{x}', x, y, 0.15, 0.55, 0.08, MAT['red'], 16)
    rbox(f'ExtSign{x}', x, y, 1.0, 0.25, 0.01, 0.25, MAT['sign'], 0.0 if x < 1 else math.pi / 2)
# a trolley jack and a few tyres by the lifts, an air hose reel
rbox('Jack', 7.0, 22.4, 0, 1.0, 0.35, 0.18, MAT['red'], 0.3)
for k in range(4):
    obj(f'LooseTyre{k}', shaped('tyre', MAT['rubber']), (6.6 - 0.33, 24.2 - 0.33, k * 0.22), (0.66, 0.66, 0.22))
cyl('HoseReel', 0.12, 25.5, 1.5, 0.15, 0.25, MAT['yellow'], 24).rotation_euler = (0, math.pi / 2, 0)

# plants at the shop front
place('plant_big', 17.2, 0.6)
place('plant_mid', 17.3, 11.3)

STOPS = {
    'entry': (16.0, 2.75),
    'aisle': (10.6, 3.7),
    'counter': (14.6, 9.4),
    'shop_west': (3.4, 8.4),
    'office': (3.0, 3.4),
    'waiting': (13.5, 13.2),
    'workshop': (9.7, 13.6),
    'pit': (7.5, 16.6),
    'lifts': (7.6, 23.7),
}
finish('D1', STOPS)
