"""Build block D's car park floors for the rendered tours: B1 (floor 0), 2 and 3, from the block D data of the
site (src/data/blockD.ts): parking bays with cars, markings and numbers, the ramps and the opening over them,
strip windows (2, 3), the way into the main car park (B1), the store room (2, 3), services under the slab.

Run: python3 -I build_blockd_parking.py <F.blend> <car.glb> <out dir> <floor: 0 | 2 | 3>
Writes D<floor>.blend and D<floor>_cams.json, like build_blockd.py does for floor 1.
"""
import os, sys, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blockd_common import *  # noqa: F401,F403  (opens F.blend, materials, helpers, the car)
from mathutils import Matrix

FLOOR = int(sys.argv[4])
random.seed(100 + FLOOR)
STOREY = {0: 3.3, 2: 3.3, 3: 3.0}[FLOOR]
SLAB, BEAM, WALL = 0.25, 0.3, 0.45
CEIL = STOREY - SLAB
U1, V1 = 18.0, 30.0
VOID = (12.0, 18.0, 12.0, 24.0) if FLOOR in (2, 3) else None
LABEL = 'B1' if FLOOR == 0 else str(FLOOR)

# the ramps seen from this floor: (foot v, z at the foot) -> (top v, z at the top), heights from this floor
RAMPS = {
    0: [],
    2: [(27.8, -4.5, 12.3, 0.0), (24.0, 0.0, 12.3, 3.3)],
    3: [(27.8, -7.8, 12.3, -3.3), (24.0, -3.3, 12.3, 0.0)],
}[FLOOR]
RU0, RU1 = 12.25, 17.75

MAT['line'] = principled('D_LineWhite', srgb('#f2f2ee'), 0.5)
MAT['walkway'] = noisy('D_Walkway', '#3f7f5a', 0.45, 2.0, 0.08)
MAT['exit'] = principled('D_ExitSign', srgb('#1f9d55'), 0.4, emit=srgb('#2bd96f'), strength=3.0)
MAT['pipe'] = principled('D_Sprinkler', srgb('#b3171f'), 0.35, 0.3, 0.3)
MAT['tray'] = principled('D_CableTray', srgb('#9aa0a6'), 0.35, 0.8)
MAT['floor'] = noisy('D_ParkFloor', '#8d9295', 0.38, 1.2, 0.12, 0.0, coat=0.25)
MAT['wall_low'] = noisy('D_WallLow', '#6c7379', 0.5, 3.0, 0.06)

# ------------------------------------------------------------------ floor, ceiling, beams, columns
def slab_pieces(z0, z1, name, mat, void=VOID):
    if void:
        a, b, c, d = void
        parts = [(0, U1, 0, c), (0, a, c, d), (0, U1, d, V1)]
        if b < U1:
            parts.append((b, U1, c, d))
    else:
        parts = [(0, U1, 0, V1)]
    for n, (x0, x1, y0, y1) in enumerate(parts):
        box(f'{name}{n}', x0, x1, y0, y1, z0, z1, mat)

slab_pieces(-0.05, 0, 'Floor', MAT['floor'])
# the ceiling: floor 3's floor (open over the ramps) on floor 2; the roof, closed, on floors 3 and B1
slab_pieces(CEIL, STOREY, 'Slab', MAT['concrete'], void=VOID if FLOOR == 2 else None)
if VOID:         # under the opening: floor 1 at the bottom of the well
    box('Floor_Well', 12, 18, 12, 24, -({2: 4.5, 3: 7.8}[FLOOR]) - 0.05, -({2: 4.5, 3: 7.8}[FLOOR]), MAT['concrete_dark'])
    for n, (x0, x1) in enumerate(((11.8, 12.0), (18.0, 18.2))):
        box(f'Well_Wall{n}', x0, x1, 12, 24, -({2: 4.5, 3: 7.8}[FLOOR]), 0, MAT['concrete'])
for u in (0, 6, 12, 18):
    box(f'BeamV{u}', u - 0.2, u + 0.2, 0, V1, CEIL - BEAM, CEIL, MAT['concrete'])
for v in (0, 6, 12, 18, 24, 30):
    x1 = 12 if (VOID and FLOOR == 2 and 12 < v < 24) else U1
    box(f'BeamU{v}', 0, x1, v - 0.2, v + 0.2, CEIL - BEAM, CEIL, MAT['concrete'])
for u in (0, 6, 12, 18):
    for v in (0, 6, 12, 18, 24, 30):
        box(f'Col_{u}_{v}', u - 0.225, u + 0.225, v - 0.225, v + 0.225, 0, CEIL - BEAM, MAT['concrete'])
        if 0 < u < 18 and 0 < v < 30:
            for k in range(4):
                box(f'ColGuard_{u}_{v}_{k}', u - 0.24, u + 0.24, v - 0.24, v + 0.24, k * 0.25, k * 0.25 + 0.25,
                    MAT['yellow'] if k % 2 == 0 else MAT['stripe_black'])

# ------------------------------------------------------------------ ramps, the opening's parapet and rails
def ramp(n, v_low, z_low, v_high, z_high):
    def quad(x0, x1, top_lo, top_hi, bot_lo, bot_hi, name, mat):
        v = [(x0, v_low, top_lo), (x1, v_low, top_lo), (x1, v_high, top_hi), (x0, v_high, top_hi),
             (x0, v_low, bot_lo), (x1, v_low, bot_lo), (x1, v_high, bot_hi), (x0, v_high, bot_hi)]
        f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        me = bpy.data.meshes.new(name)
        me.from_pydata(v, [], f)
        me.materials.append(mat)
        o = bpy.data.objects.new(name, me)
        coll.objects.link(o)
    quad(RU0, RU1, z_low, z_high, z_low - SLAB, z_high - SLAB, f'Ramp{n}', MAT['concrete_dark'])
    for side, (x0, x1) in enumerate(((RU0 - 0.2, RU0), (RU1, RU1 + 0.2))):
        quad(x0, x1, z_low + 1.0, z_high + 1.0, z_low, z_high, f'RampWall{n}{side}', MAT['concrete'])
        quad(x0 + 0.02, x1 - 0.02, z_low + 1.03, z_high + 1.03, z_low + 1.0, z_high + 1.0, f'RampCap{n}{side}', MAT['yellow'])
    # white arrows up the ramp
    for k in range(2):
        t = 0.3 + 0.4 * k
        v = v_low + (v_high - v_low) * t
        z = z_low + (z_high - z_low) * t + 0.005
        rbox(f'RampArrow{n}{k}', 15.0, v, z, 0.18, 1.6, 0.004, MAT['line'], 0.0)
for n, r in enumerate(RAMPS):
    ramp(n, *r)
if VOID:
    # parapet on the west edge of the opening; rails on its north edge on floor 3 (and seen from 2)
    box('Parapet_W', 11.8, 12.0, 12.0, 24.0, 0, 1.1, MAT['concrete'])
    box('ParapetCap_W', 11.78, 12.02, 12.0, 24.0, 1.1, 1.14, MAT['yellow'])
    rail_z = 0.0 if FLOOR == 3 else (STOREY if FLOOR == 2 else None)
    if rail_z is not None:
        box('Rail_N_Top', 12.0, 18.0, 23.96, 24.04, rail_z + 1.06, rail_z + 1.1, MAT['steel'])
        box('Rail_N_Mid', 12.0, 18.0, 23.98, 24.02, rail_z + 0.55, rail_z + 0.58, MAT['steel'])
        for k in range(13):
            box(f'Rail_N_Post{k}', 12.0 + k * 0.5 - 0.025, 12.0 + k * 0.5 + 0.025, 23.975, 24.025, rail_z, rail_z + 1.1, MAT['steel'])

# ------------------------------------------------------------------ outside walls: strip windows, the stair door, the way north (B1)
STAIR_DOOR = {0: 25.1, 2: 26.7, 3: 26.2}[FLOOR]
FACADE = [('E', STAIR_DOOR - 0.5, STAIR_DOOR + 0.5, 0, 2.1, 'door')]
if FLOOR == 0:
    FACADE.append(('N', 5.8, 11.7, 0, 2.6, 'open'))
else:
    z0, z1 = (1.97, 2.6) if FLOOR == 2 else (1.7, 2.35)
    for side in ('E', 'N', 'S'):
        for c in (3, 9, 15):
            a0, a1 = c - 1.965, c + 1.965
            if side == 'E' and a0 < STAIR_DOOR + 0.6 and a1 > STAIR_DOOR - 0.6:
                continue
            FACADE.append((side, a0, a1, z0, z1, 'window'))
SIDES = {
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

def window(side, a0, a1, z0, z1, name):
    c0, c1 = SIDES[side]['across']
    mid, fw = (c0 + c1) / 2, 0.06
    def piece(nm, b0, b1, y0, y1, mat, depth=0.1):
        if side in ('E', 'W'):
            box(nm, mid - depth / 2, mid + depth / 2, b0, b1, y0, y1, mat)
        else:
            box(nm, b0, b1, mid - depth / 2, mid + depth / 2, y0, y1, mat)
    piece(f'{name}_Glass', a0, a1, z0, z1, MAT['glass'], 0.02)
    for nm, b0, b1, y0, y1 in (('FB', a0, a1, z0, z0 + fw), ('FT', a0, a1, z1 - fw, z1), ('FL', a0, a0 + fw, z0, z1), ('FR', a1 - fw, a1, z0, z1),
                               ('FM', (a0 + a1) / 2 - fw / 2, (a0 + a1) / 2 + fw / 2, z0, z1)):
        piece(f'{name}_{nm}', b0, b1, y0, y1, MAT['frame'])

for side in SIDES:
    ops = sorted([o for o in FACADE if o[0] == side], key=lambda o: o[1])
    lo, hi = SIDES[side]['along']
    a = lo
    for n, (_, f0, f1, z0, z1, kind) in enumerate(ops):
        wall_piece(side, a, f0, 0, STOREY, MAT['plaster'], f'Wall_{side}_{n}')
        wall_piece(side, f0, f1, 0, z0, MAT['plaster'], f'Wall_{side}_{n}_low')
        wall_piece(side, f0, f1, z1, STOREY, MAT['plaster'], f'Wall_{side}_{n}_top')
        nm = f'Open_{side}_{n}'
        if kind == 'window':
            window(side, f0, f1, z0, z1, nm)
        elif kind == 'door':
            wall_piece(side, f0, f1, z0, z1, MAT['steel_door'], nm, inset=(0.17, 0.2))
            c0 = SIDES[side]['across'][0]
            box(nm + '_Exit', c0 - 0.06, c0 - 0.02, (f0 + f1) / 2 - 0.2, (f0 + f1) / 2 + 0.2, z1 + 0.15, z1 + 0.35, MAT['exit'])
            box(nm + '_Handle', c0 - 0.06, c0 - 0.03, f0 + 0.1, f0 + 0.15, 0.95, 1.1, MAT['steel'])
        a = f1
    wall_piece(side, a, hi, 0, STOREY, MAT['plaster'], f'Wall_{side}_end')
# a grey band low on the inside of the walls, as car parks have; it stops at doors and openings
BAND = 1.0
for side in SIDES:
    lo, hi = 0.0, (V1 if side in ('E', 'W') else U1)
    cuts = sorted((o[1], o[2]) for o in FACADE if o[0] == side and o[3] < BAND)
    a = lo
    for k, (f0, f1) in enumerate(cuts + [(hi, hi)]):
        if f0 - a > 1e-3:
            c0, c1 = SIDES[side]['across']
            inner = c0 if side in ('E', 'N') else c1
            t0, t1 = (inner - 0.012, inner) if side in ('E', 'N') else (inner, inner + 0.012)
            if side in ('E', 'W'):
                box(f'Band_{side}{k}', t0, t1, a, f0, 0, BAND, MAT['wall_low'])
            else:
                box(f'Band_{side}{k}', a, f0, t0, t1, 0, BAND, MAT['wall_low'])
        a = f1
box('Core_Wall', U1 + WALL, 21.2, 19.6, V1 + WALL, 0, STOREY, MAT['plaster'])

if FLOOR == 0:
    # the main car park under the complex, through the opening in the north wall
    box('Main_Floor', -6, 26, V1 + WALL, 50, -0.05, 0, MAT['floor'])
    box('Main_Slab', -6, 26, V1 + WALL, 50, CEIL, STOREY, MAT['concrete'])
    box('Main_Wall', -6, 26, 50, 50.3, 0, STOREY, MAT['plaster'])
    box('Main_WallW', -6.3, -6, V1, 50, 0, STOREY, MAT['plaster'])
    box('Main_WallE', 26, 26.3, V1, 50, 0, STOREY, MAT['plaster'])
    for u in (0, 6, 12, 18, 24):
        for v in (36, 42, 48):
            box(f'MainCol_{u}_{v}', u - 0.225, u + 0.225, v - 0.225, v + 0.225, 0, CEIL, MAT['concrete'])

# ------------------------------------------------------------------ the store room in the south-west corner (2, 3)
if FLOOR in (2, 3):
    PT = 0.12
    prism('Part0a', [(6 - PT / 2, 0), (6 + PT / 2, 0), (6 + PT / 2, 2.25), (6 - PT / 2, 2.25)], 0, [CEIL] * 4, MAT['plaster'])
    prism('Part0b', [(6 - PT / 2, 3.15), (6 + PT / 2, 3.15), (6 + PT / 2, 6), (6 - PT / 2, 6)], 0, [CEIL] * 4, MAT['plaster'])
    prism('Part0_head', [(6 - PT / 2, 2.25), (6 + PT / 2, 2.25), (6 + PT / 2, 3.15), (6 - PT / 2, 3.15)], 2.1, [CEIL] * 4, MAT['plaster'])
    prism('Part1', [(0, 6 - PT / 2), (6, 6 - PT / 2), (6, 6 + PT / 2), (0, 6 + PT / 2)], 0, [CEIL] * 4, MAT['plaster'])
    rbox('StoreDoor', 6.5, 2.27, 0.01, 0.04, 0.86, 2.07, MAT['steel_door'], 0.0)
    for n, (cx, cy, l, rot) in enumerate(((3.0, 0.45, 5.0, 0.0), (0.45, 3.2, 4.2, math.pi / 2), (3.0, 3.2, 3.0, 0.0))):
        wall_rack(f'StoreRack{n}', cx, cy, l, rot, height=2.2, levels=4)

# ------------------------------------------------------------------ bays: lines, numbers, wheel stops and cars
PAINTS_PARK = ['#f4f4f2', '#1d1f22', '#b9bdc2', '#6d7378', '#1f3a5f', '#8e1b1b', '#e9e6dc', '#2f4f3f', '#3b3f46', '#c9c9c4']
def bays(u, v, rot, one=False):
    """blockD.ts bay(): cars side by side, 2.45 x 5.0 m each, noses `rot` (1 east, 2 north, 3 west)."""
    across = [0.0] if one else [-1.225, 1.225]
    out = []
    for d in across:
        out.append((u + d, v, rot) if rot == 2 else (u, v + d, rot))
    return out
SPACES = {
    0: bays(14.85, 28.3, 3, True) + [b for v in (20.9, 14.9, 8.9, 3.1) for b in bays(14.85, v, 3)]
       + [b for v in (27.0, 20.9, 14.9, 8.9, 3.1) for b in bays(3.0, v, 1)],
    2: [b for v in (27.0, 20.8, 14.85, 8.9) for b in bays(3.0, v, 1)] + bays(8.85, 3.05, 2) + bays(15.1, 3.05, 2),
    3: [b for v in (27.0, 20.8, 14.85, 8.9) for b in bays(3.0, v, 1)] + bays(8.85, 3.05, 2) + bays(15.1, 3.05, 2) + bays(14.0, 26.95, 3),
}[FLOOR]
HEAD = {1: 0.0, 2: math.pi / 2, 3: math.pi}

def text(name, body, x, y, size, rot, mat, z=0.004):
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name, cu)
    o.location = (x, y, z)
    o.rotation_euler = (0, 0, rot)
    o.data.materials.append(mat)
    coll.objects.link(o)
    return o

empty = set(random.sample(range(len(SPACES)), max(1, len(SPACES) // 5)))
for i, (cx, cy, rot) in enumerate(SPACES):
    h = HEAD[rot]
    c, s = math.cos(h), math.sin(h)
    # side lines (both sides; neighbours share one), a stop at the wall end, the number at the aisle end
    for side in (-1, 1):
        rbox(f'BayLine{i}{side}', cx - s * side * 1.225, cy + c * side * 1.225, 0, 5.0, 0.1, 0.003, MAT['line'], h)
    rbox(f'WheelStop{i}', cx - c * 1.85, cy - s * 1.85, 0, 0.15, 1.6, 0.12, MAT['concrete'], h)
    text(f'BayNo{i}', f'{LABEL}-{i + 1:02d}', cx + c * 1.9, cy + s * 1.9, 0.38, h - math.pi / 2, MAT['line'])
    if i not in empty:
        car(f'Car{i}', cx, cy, h, paint=random.choice(PAINTS_PARK))
if FLOOR == 0:
    for k, (cx, cy) in enumerate(((3.0, 34.0), (3.0, 39.0), (15.0, 36.5), (21.0, 34.0))):
        car(f'MainCar{k}', cx, cy, 0.0 if k % 2 else math.pi, paint=random.choice(PAINTS_PARK))

# aisle arrows (blockDWalk arrows, 0 = north) and the walkway to the stair door (B1)
ARROWS = {0: [(9, 22, math.pi), (9, 12, math.pi)], 2: [(8.8, 9, 0.0), (8.8, 19, 0.0)], 3: [(9.0, 14, 0.0)]}[FLOOR]
for k, (x, y, d) in enumerate(ARROWS):
    h = math.pi / 2 - d          # compass to Blender heading
    rbox(f'ArrowShaft{k}', x, y, 0, 1.6, 0.25, 0.004, MAT['line'], h)
    for sgn in (-1, 1):
        rbox(f'ArrowHead{k}{sgn}', x + math.cos(h) * 0.65 - math.sin(h) * sgn * 0.22, y + math.sin(h) * 0.65 + math.cos(h) * sgn * 0.22,
             0, 0.8, 0.22, 0.004, MAT['line'], h + sgn * math.radians(-35))
if FLOOR == 0:
    box('Walkway', 12.4, U1, STAIR_DOOR - 0.55, STAIR_DOOR + 0.55, 0, 0.003, MAT['walkway'])
    for k in range(9):
        box(f'Zebra{k}', 12.6 + k * 0.6, 12.9 + k * 0.6, STAIR_DOOR - 0.5, STAIR_DOOR + 0.5, 0.003, 0.005, MAT['line'])
# the level painted large on the walls, and on the columns
for k, (x, y, rot) in enumerate(((0.02, 18.0, -math.pi / 2), (17.98, 9.0, math.pi / 2), (9.0, 0.02, 0.0))):
    o = text(f'LevelSign{k}', LABEL, x, y, 1.1, rot, MAT['yellow'], z=1.6)
    o.rotation_euler = (math.pi / 2, 0, rot + math.pi)   # facing into the car park, reading left to right
for u in (6, 12):
    for v in (6, 12, 18, 24):
        if VOID and u == 12 and 12 <= v <= 24:
            continue
        o = text(f'ColSign_{u}_{v}', LABEL, u, v - 0.23, 0.32, 0.0, MAT['line'], z=1.55)
        o.rotation_euler = (math.pi / 2, 0, 0.0)   # on the column's south face, facing south

# ------------------------------------------------------------------ floor 2: floor 3 above it, seen up the ramp and through the opening
if FLOOR == 2:
    UP0, UPH = STOREY, 3.0
    slab_pieces(UP0, UP0 + 0.004, 'Up_Floor', MAT['floor'])
    box('Up_Roof', 0, U1, 0, V1, UP0 + UPH - SLAB, UP0 + UPH, MAT['concrete'])
    for u in (0, 6, 12, 18):
        box(f'Up_BeamV{u}', u - 0.2, u + 0.2, 0, V1, UP0 + UPH - SLAB - BEAM, UP0 + UPH - SLAB, MAT['concrete'])
        for v in (0, 6, 12, 18, 24, 30):
            box(f'Up_Col_{u}_{v}', u - 0.225, u + 0.225, v - 0.225, v + 0.225, UP0, UP0 + UPH - SLAB - BEAM, MAT['concrete'])
    for v in (0, 6, 12, 18, 24, 30):
        box(f'Up_BeamU{v}', 0, U1, v - 0.2, v + 0.2, UP0 + UPH - SLAB - BEAM, UP0 + UPH - SLAB, MAT['concrete'])
    w0, w1 = UP0 + 1.7, UP0 + 2.35
    for side in SIDES:
        lo, hi = SIDES[side]['along']
        wins = [] if side == 'W' else [(c - 1.965, c + 1.965) for c in (3, 9, 15)]
        if side == 'E':
            wins = [w for w in wins if not (w[0] < 26.8 and w[1] > 25.6)]
        a = lo
        for k, (f0, f1) in enumerate(wins):
            wall_piece(side, a, f0, UP0, UP0 + UPH, MAT['plaster'], f'Up_Wall_{side}{k}')
            wall_piece(side, f0, f1, UP0, w0, MAT['plaster'], f'Up_Wall_{side}{k}_low')
            wall_piece(side, f0, f1, w1, UP0 + UPH, MAT['plaster'], f'Up_Wall_{side}{k}_top')
            window(side, f0, f1, w0, w1, f'Up_Win_{side}{k}')
            a = f1
        wall_piece(side, a, hi, UP0, UP0 + UPH, MAT['plaster'], f'Up_Wall_{side}_end')
    box('Up_Parapet_W', 11.8, 12.0, 12.0, 24.0, UP0, UP0 + 1.1, MAT['concrete'])
    box('Up_ParapetCap_W', 11.78, 12.02, 12.0, 24.0, UP0 + 1.1, UP0 + 1.14, MAT['yellow'])
    for u in (3.0, 7.6, 10.4, 15.0):
        for v in [2.4 + 3.0 * k for k in range(10)]:
            if u > 12 and 12 < v < 24:
                continue
            z = UP0 + UPH - SLAB - BEAM - 0.05
            box(f'Up_BattenL_{u}_{v:.1f}', u - 0.05, u + 0.05, v - 0.68, v + 0.68, z - 0.055, z - 0.05, MAT['tube_light'])
            area_light(f'Up_L_{u}_{v:.1f}', u, v, z - 0.08, 0.2, 1.4, 120, (0.97, 0.98, 1.0))
    # floor 3's cars at the top of the ramp (its south row and west row)
    for k, (cx, cy, rot) in enumerate(bays(8.85, 3.05, 2) + bays(15.1, 3.05, 2) + bays(3.0, 8.9, 1) + bays(3.0, 14.85, 1)):
        if k % 4 != 3:
            car(f'Up_Car{k}', cx, cy, {1: 0.0, 2: math.pi / 2, 3: math.pi}[rot], z=UP0, paint=random.choice(['#f4f4f2', '#1d1f22', '#b9bdc2', '#1f3a5f', '#8e1b1b']))

# ------------------------------------------------------------------ services under the slab and the lights
z_pipe = CEIL - BEAM - 0.12
for u in (4.6, 10.8, 16.4):   # off the tour spots (u 9 and 15), so no pipe runs right overhead
    if VOID and u == 16.4:
        segs = [(0, 12), (24, V1)]
    else:
        segs = [(0, V1)]
    for a, b in segs:
        o = cyl(f'Pipe_{u}_{a}', 0, 0, 0, 1, 0.05, MAT['pipe'], 12)
        o.matrix_world = Matrix.Translation((u, a, z_pipe)) @ Matrix.Rotation(-math.pi / 2, 4, 'X') @ Matrix.Translation((-0.05, -0.05, 0)) @ Matrix.Diagonal((0.1, 0.1, b - a, 1))
        for v in range(int(a) + 1, int(b), 3):
            cyl(f'Head_{u}_{v}', u, v, z_pipe - 0.12, 0.12, 0.012, MAT['steel'], 8)
box('Tray', 6.4, 6.7, 0, V1, z_pipe + 0.02, z_pipe + 0.07, MAT['tray'])
LIGHT_ROWS = [3.0, 7.6, 10.4] + ([14.85] if not VOID else [15.0])
for u in LIGHT_ROWS:
    for v in [2.4 + 3.0 * k for k in range(10)]:
        if VOID and u > 12 and 12 < v < 24:
            continue
        z = CEIL - BEAM - 0.05
        box(f'Batten_{u}_{v:.1f}', u - 0.07, u + 0.07, v - 0.7, v + 0.7, z - 0.05, z, MAT['shelf'])
        box(f'BattenL_{u}_{v:.1f}', u - 0.05, u + 0.05, v - 0.68, v + 0.68, z - 0.055, z - 0.05, MAT['tube_light'])
        area_light(f'L_{u}_{v:.1f}', u, v, z - 0.08, 0.2, 1.4, 120, (0.97, 0.98, 1.0))
if FLOOR == 0:
    for u in (3.0, 15.0):
        for v in (35.0, 41.0, 47.0):
            box(f'MainBatten_{u}_{v}', u - 0.05, u + 0.05, v - 0.7, v + 0.7, CEIL - 0.06, CEIL - 0.05, MAT['tube_light'])
            area_light(f'ML_{u}_{v}', u, v, CEIL - 0.1, 0.2, 1.4, 90, (0.97, 0.98, 1.0))
if VOID:   # the well over the ramps is lit from the floors around it
    for v in (14.0, 18.0, 22.0):
        area_light(f'Well_{v}', 15.0, v, CEIL - 0.1, 3.0, 1.0, 160, (0.97, 0.98, 1.0))

# ------------------------------------------------------------------ outside
box('Ground', -40, 60, -40, 70, -0.25 - (0 if FLOOR else 0), -0.06, MAT['asphalt']) if FLOOR else None

STOPS = {
    0: {'north': (9.0, 27.0), 'middle': (9.0, 18.0), 'south': (9.0, 6.5), 'stair': (15.4, STAIR_DOOR)},
    2: {'north': (9.0, 27.0), 'middle': (9.0, 18.0), 'south': (9.0, 8.5), 'ramp': (15.0, 8.0), 'ramp_up': (15.0, 26.6)},
    3: {'north': (9.0, 27.0), 'middle': (9.0, 18.0), 'south': (9.0, 8.5), 'ramp': (15.0, 8.0)},
}[FLOOR]
# outside light: floors 2 and 3 see the sky through the strips; B1 has none, so no sun or sky light inside
finish(f'D{FLOOR}', STOPS, exposure=-0.9 if FLOOR else -0.8)
