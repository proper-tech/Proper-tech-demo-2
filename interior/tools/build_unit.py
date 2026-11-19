"""Build the interior of plan F or E (tower B, east side) from the realistic plan-D scene.

The plan-D scene (d4k/scene.blend) supplies every material, light set-up and piece of furniture; this script
- copies whole furniture groups ("kits") out of D's rooms and places them in the new rooms
  (moved, turned by 90° steps or mirrored),
- rebuilds the walls, floor, ceiling, windows, curtains, doors and window light for the new plan,
- deletes everything of D, adds one panorama camera per stop and saves <unit>.blend + <unit>_cams.json.
Plan coordinates as in the D scene: x east, y south (as drawn), metres; Blender X = x, Y = -y.
Run: python3 -I build_unit.py F|E outdir
"""
import sys, json, math, re
import bpy
from mathutils import Matrix, Vector

UNIT, OUT = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath='/home/claude/d4k/scene.blend')
ORIG = list(bpy.data.objects)
OBJ = bpy.data.objects
MAT = bpy.data.materials
coll = bpy.data.collections.new('Unit_' + UNIT)
bpy.context.scene.collection.children.link(coll)
KEEP = {'Sun'}

# ---------------------------------------------------------------- helpers
def B(x, y, z=0.0): return Vector((x, -y, z))

def xf(a, b, rot=0, mirror_y=False, mirror_x=False):
    """Matrix taking plan point a (in D) to plan point b, turned by rot degrees (counter-clockwise seen from above)."""
    m = Matrix.Identity(4)
    if mirror_y: m[1][1] = -1
    if mirror_x: m[0][0] = -1
    return Matrix.Translation(B(*b)) @ Matrix.Rotation(math.radians(rot), 4, 'Z') @ m @ Matrix.Translation(-B(*a))

def center(o):
    if o.type in ('MESH', 'CURVE'):
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        return (sum(v.x for v in bb) / 8, -sum(v.y for v in bb) / 8)
    t = o.matrix_world.translation; return (t.x, -t.y)

ARCH = re.compile(r'^(Wall|Glass|Frame|Sill|Trim|Skirting|Floor_Oak|Ceiling|Curtain|Rod|DoorV2|WinFill|Downlight|Pano|Sun|Key Light|pointlight|Cylinder\.0(09|1[0-3])$|Detail_Switch|Detail_HandleRosette)')

def kit(rect=None, names=None, exclude=None):
    x0, y0, x1, y1 = rect or (0, 0, 0, 0)
    out = []
    for o in ORIG:
        if o.parent is not None: continue
        n = o.name
        if names and re.search(names, n): out.append(o); continue
        if not rect or ARCH.match(n): continue
        if exclude and re.search(exclude, n): continue
        cx, cy = center(o)
        if x0 <= cx <= x1 and y0 <= cy <= y1: out.append(o)
    return out

def copy_tree(o, parent=None):
    n = o.copy(); coll.objects.link(n)
    if parent is not None:
        n.parent = parent; n.matrix_parent_inverse = o.matrix_parent_inverse.copy()
    for c in o.children: copy_tree(c, n)
    return n

def place(objs, m):
    for o in objs:
        n = copy_tree(o); n.matrix_world = m @ o.matrix_world

def box(x0, y0, z0, x1, y1, z1, mat, name):
    x0, x1 = sorted((x0, x1)); y0, y1 = sorted((y0, y1)); z0, z1 = sorted((z0, z1))
    if min(x1 - x0, y1 - y0, z1 - z0) < 1e-4: return None
    hx, hy, hz = (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2
    v = [(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    me = bpy.data.meshes.new(name); me.from_pydata(v, [], f); me.update()
    me.uv_layers.new(name='UVMap')
    me.materials.append(MAT[mat])
    o = OBJ.new(name, me); coll.objects.link(o)
    o.location = ((x0 + x1) / 2, -(y0 + y1) / 2, (z0 + z1) / 2)
    return o

CEIL, SILL, HEAD, DOOR_H = 2.75, 0.6, 2.45, 2.1
DIRS = {'N': (0, -1), 'S': (0, 1), 'E': (1, 0), 'W': (-1, 0)}  # plan direction (dx, dy)
WINDOWS, DOORWAYS = [], []

def wall(x0, y0, x1, y1, ops=()):
    """Wall box; ops = [(kind, a, b, room_side)] along its long axis. kind: win | door | open."""
    along_x = (x1 - x0) >= (y1 - y0)
    lo, hi = (x0, x1) if along_x else (y0, y1)
    def seg(a, b, z0, z1, mat='Wall_WarmPlaster', name='Wall'):
        return box(a, y0, z0, b, y1, z1, mat, name) if along_x else box(x0, a, z0, x1, b, z1, mat, name)
    cur = lo
    for kind, a, b, side in sorted(ops, key=lambda o: o[1]):
        seg(cur, a, 0, CEIL); cur = b
        if kind == 'win':
            seg(a, b, 0, SILL); seg(a, b, HEAD, CEIL)
            seg(a, b, SILL - 0.04, SILL, 'Marble_Warm', 'Sill')
            mid = (y0 + y1) / 2 if along_x else (x0 + x1) / 2
            if along_x: box(a, mid - 0.01, SILL, b, mid + 0.01, HEAD, 'Window_Glass', 'Glass')
            else: box(mid - 0.01, a, SILL, mid + 0.01, b, HEAD, 'Window_Glass', 'Glass')
            n = max(1, round((b - a) / 0.9))
            for i in range(n + 1):
                p = a + (b - a) * i / n; p = min(max(p, a + 0.03), b - 0.03)
                if along_x: box(p - 0.03, mid - 0.04, SILL, p + 0.03, mid + 0.04, HEAD, 'Window_Frame', 'Frame')
                else: box(mid - 0.04, p - 0.03, SILL, mid + 0.04, p + 0.03, HEAD, 'Window_Frame', 'Frame')
            face = (y0 if side == 'N' else y1) if along_x else (x0 if side == 'W' else x1)
            WINDOWS.append(dict(along_x=along_x, a=a, b=b, face=face, side=side))
        else:
            seg(a, b, DOOR_H, CEIL)
            DOORWAYS.append(dict(along_x=along_x, a=a, b=b, line=((y0 + y1) / 2 if along_x else (x0 + x1) / 2), kind=kind))
            if kind == 'open':  # oak trims on both jambs
                for p in (a, b):
                    if along_x: box(p - 0.03, y0 - 0.02, 0, p + 0.03, y1 + 0.02, DOOR_H, 'Door_Oak', 'Trim')
                    else: box(x0 - 0.02, p - 0.03, 0, x1 + 0.02, p + 0.03, DOOR_H, 'Door_Oak', 'Trim')
    seg(cur, hi, 0, CEIL)

def window_dressing(curtains=True, fill=45.0):
    for w in WINDOWS:
        a, b, face, side = w['a'], w['b'], w['face'], w['side']
        d = DIRS[side]
        inward = Vector((d[0], -d[1], 0))
        mid_along = (a + b) / 2
        if w['along_x']: c = B(mid_along, face + d[1] * 0.3, 1.5)
        else: c = B(face + d[0] * 0.3, mid_along, 1.5)
        L = bpy.data.lights.new('WinFill', 'AREA'); L.shape = 'RECTANGLE'; L.size = b - a; L.size_y = 1.8
        L.energy = fill * (b - a) * 1.8
        src = OBJ['WinFill.003'].data
        for k in ('color', 'use_shadow'):
            try: setattr(L, k, getattr(src, k))
            except Exception: pass
        lo = OBJ.new('WinFill', L); coll.objects.link(lo); lo.location = c
        lo.rotation_euler = inward.to_track_quat('-Z', 'Z').to_euler()
        if not curtains or w.get('nocurtain'): continue
        span0, span1 = a - 0.15, b + 0.15
        if w['along_x']:
            src_c, src_r = OBJ['Curtain'], OBJ['Rod']
            ctr = B((span0 + span1) / 2, face + d[1] * 0.125, 0)
            sx = (span1 - span0) / src_c.dimensions.x
            scale = Matrix.Diagonal((sx, 1, 1, 1))
        else:
            src_c, src_r = OBJ['Curtain.002'], OBJ['Rod.002']
            ctr = B(face + d[0] * 0.125, (span0 + span1) / 2, 0)
            sy = (span1 - span0) / src_c.dimensions.y
            scale = Matrix.Diagonal((1, sy, 1, 1))
        for src, z in ((src_c, None), (src_r, None)):
            bb = [src.matrix_world @ Vector(v) for v in src.bound_box]
            oc = Vector((sum(v.x for v in bb) / 8, sum(v.y for v in bb) / 8, 0))
            n = src.copy(); coll.objects.link(n)
            n.matrix_world = Matrix.Translation(Vector((ctr.x, ctr.y, 0))) @ scale @ Matrix.Translation(-oc) @ src.matrix_world

def door(kitname, cx, cy, along_x, into, open_=True, hinge=-1):
    """DoorV2 kit (casing + leaf) centred on the wall line at (cx, cy); 'into' = side of the room it belongs to."""
    cas, leaf = OBJ['DoorV2_Casing_' + kitname], OBJ['DoorV2_Leaf_' + kitname]
    d = DIRS[into]; n = Vector((d[0], -d[1], 0))
    ang = math.atan2(n.y, n.x)
    C = B(cx, cy)
    frame = Matrix.Translation(C) @ Matrix.Rotation(ang - math.pi / 2, 4, 'Z')
    # local x of that frame is (cos(ang-90), sin(ang-90)) = (n.y, -n.x)
    ux = Vector((math.cos(ang - math.pi / 2), math.sin(ang - math.pi / 2), 0))
    c = copy_tree(cas); c.matrix_world = frame
    l = copy_tree(leaf)
    if not open_: l.matrix_world = frame; return
    hw = max(abs(ch.location.x) for ch in leaf.children if 'HingeKnuckle' in ch.name)
    side = -1 if hinge < 0 else 1
    pos = C + ux * side * (hw - 0.012) + n * (hw + 0.013)
    l.matrix_world = Matrix.Translation(pos) @ Matrix.Rotation(ang, 4, 'Z')

def skirting(rooms, gaps):
    for (x0, y0, x1, y1) in rooms:
        for side in 'NSEW':
            if side in 'NS':
                yy = y0 if side == 'N' else y1; lo, hi = x0, x1
                cut = sorted((g['a'], g['b']) for g in gaps if g['along_x'] and abs(g['line'] - yy) < 0.25 and g['b'] > lo and g['a'] < hi)
            else:
                xx = x0 if side == 'W' else x1; lo, hi = y0, y1
                cut = sorted((g['a'], g['b']) for g in gaps if not g['along_x'] and abs(g['line'] - xx) < 0.25 and g['b'] > lo and g['a'] < hi)
            cur = lo
            for a, b in cut + [(hi, hi)]:
                if a - cur > 0.05:
                    if side == 'N': box(cur, y0, 0, a, y0 + 0.025, 0.08, 'Ceiling', 'Skirting')
                    if side == 'S': box(cur, y1 - 0.025, 0, a, y1, 0.08, 'Ceiling', 'Skirting')
                    if side == 'W': box(x0, cur, 0, x0 + 0.025, a, 0.08, 'Ceiling', 'Skirting')
                    if side == 'E': box(x1 - 0.025, cur, 0, x1, a, 0.08, 'Ceiling', 'Skirting')
                cur = max(cur, b)

def ceiling_fill(x, y, w, d, energy):
    L = bpy.data.lights.new('CeilFill', 'AREA'); L.shape = 'RECTANGLE'; L.size = w; L.size_y = d; L.energy = energy
    L.color = OBJ['Bath_D5_ceiling_fill'].data.color
    o = OBJ.new('CeilFill', L); coll.objects.link(o); o.location = B(x, y, CEIL - 0.06)

def downlight(x, y):
    for src in (OBJ['Downlight'], OBJ['Cylinder.009']):
        n = src.copy(); coll.objects.link(n)
        t = src.matrix_world.translation
        n.matrix_world = Matrix.Translation(B(x, y, t.z) - t) @ src.matrix_world

# ---------------------------------------------------------------- D kits
K = dict(
    living=kit((10.9, 17.85, 13.92, 21.05), exclude=r'^(Chair|ChairLeg|SheenChair|Leg|DiffuseTransmissionPlant)'),
    plant=kit(names=r'^DiffuseTransmissionPlant_root$'),
    plant2=kit(names=r'^DiffuseTransmissionPlant_root\.001$'),
    dining=kit((13.9, 18.0, 15.6, 20.1), exclude=r'^(DiffuseTransmissionPlant|Art)'),
    kitchen=kit((12.1, 14.05, 14.8, 16.65), exclude=r'^(Island|Stool|Cone|Cord|LampPt|SheenChair|Detail_(IslandFlute|Stool))'),
    bedD4=kit((18.0, 14.05, 21.9, 17.8), exclude=r'^(Wardrobe|Detail_Wardrobe|SheenChair)'),
    bedD3=kit((17.5, 17.85, 20.4, 21.05), exclude=r'^(Desk|Detail_DeskChair)'),
    bedD3np=kit((17.5, 17.85, 20.4, 21.05), exclude=r'^(Desk|Detail_DeskChair|DiffuseTransmissionPlant)'),
    wardrobe=kit(names=r'^(Wardrobe_D4|Detail_Wardrobe)'),
    bathD5=kit(names=r'^(Bath_D5_(?!towel_rail|cotton_towel|paper)|Floor_D5$|Wall_Tile\.001$)'),
    bathD2=kit(names=r'^(Bath_D2_|Floor_D2$|Wall_Tile$)'),
    balcony=kit((20.7, 17.85, 21.9, 21.05)),
    console=kit(names=r'^Detail_Entry(Console|Mirror)'),
)
for k, v in K.items(): print(k, len(v))

# ---------------------------------------------------------------- plans
if UNIT == 'F':
    X0, Y0, X1, Y1 = 12.8, -0.35, 22.2, 9.95
    rooms = dict(living=(13.95, 3.3, 21.85, 7.0), bed4=(13.95, 0.0, 17.25, 3.15), bed5=(17.4, 0.0, 20.3, 3.15),
                 hall=(13.0, 7.15, 15.4, 9.6))
    FLOORS = [(13.6, -0.35, 22.2, 7.15), (12.8, 7.0, 17.05, 9.95)]
    # exterior
    wall(13.6, -0.35, 22.2, 0.0, [('win', 15.0, 16.25, 'S'), ('win', 20.55, 21.75, 'S')])
    wall(21.85, 0.0, 22.2, 7.15, [('win', 0.2, 2.95, 'W'), ('win', 3.7, 6.05, 'W')])
    wall(13.6, 0.0, 13.95, 7.0)
    wall(12.8, 7.15, 13.0, 9.6, [('door', 8.6, 9.55, 'E')])
    wall(12.8, 9.6, 17.05, 9.95)
    wall(12.8, 7.0, 22.2, 7.15, [('open', 14.05, 15.3, 'N')])
    # interior
    wall(13.95, 3.15, 21.85, 3.3, [('door', 16.4, 17.2, 'N'), ('door', 17.5, 18.3, 'N')])
    wall(17.25, 0.0, 17.4, 3.15)
    wall(20.3, 0.0, 20.45, 3.15, [('win', 0.25, 1.1, 'W'), ('open', 1.35, 2.2, 'W')])
    wall(15.4, 7.15, 15.55, 9.6, [('door', 7.92, 8.72, 'E')])
    wall(16.9, 7.15, 17.05, 9.6)
    for w in WINDOWS:  # no curtains on the balcony glazing or the bedroom-to-balcony window
        if w['face'] == 20.45 or (w['along_x'] and w['a'] > 20) or (not w['along_x'] and w['b'] < 3.1): w['nocurtain'] = True
    door('Entry', 12.9, 9.075, False, 'E', open_=False)
    door('D3', 16.8, 3.225, True, 'N', open_=True, hinge=1)
    door('D4', 17.9, 3.225, True, 'N', open_=True, hinge=-1)
    door('D5', 15.475, 8.32, False, 'E', open_=False)
    # furniture
    place(K['kitchen'], xf((14.75, 14.1), (13.95, 3.3), rot=90))
    place(K['living'], xf((10.95, 19.4), (20.1, 3.3), rot=-90))
    place(K['dining'], xf((14.7, 19.05), (17.0, 5.45)))
    place(K['plant'], xf((11.5, 20.6), (21.45, 6.6)))
    place(K['plant2'], xf((15.4, 20.55), (13.35, 7.55)))
    place(K['bedD4'], xf((19.6, 14.1), (13.95, 1.575), rot=90))
    place(K['wardrobe'], xf((21.85, 17.75), (17.25, 0.0), mirror_y=True))
    place(K['bedD3'], xf((18.9, 17.9), (18.85, 0.0)))
    place(K['bathD5'], xf((17.225, 15.325), (16.225, 8.375), mirror_y=True))
    place(K['balcony'], xf((21.85, 19.45), (21.85, 1.575), mirror_y=True))
    place(K['console'], xf((10.95, 12.575), (14.25, 9.6), rot=90))
    for p in [(15.0, 4.6), (16.2, 4.3), (16.2, 6.2), (19.0, 6.4), (21.2, 6.4), (14.3, 8.4), (15.6, 1.6), (18.85, 2.6), (16.2, 8.6)]:
        downlight(*p)
    ceiling_fill(14.2, 8.4, 1.2, 1.2, 70)
    CAMS = dict(entry=(14.25, 8.3, 1.5), kitchen=(15.35, 5.0, 1.5), living=(17.95, 4.25, 1.5),
                bed_f4=(16.6, 2.15, 1.5), bed_f5=(19.35, 2.65, 1.5), bath_f3=(16.15, 8.25, 1.4), balcony=(21.1, 1.85, 1.5))
else:  # E
    X0, Y0, X1, Y1 = 12.1, 6.8, 22.2, 14.1
    rooms = dict(living=(14.1, 11.3, 21.85, 13.9), north=(13.0, 9.85, 21.85, 11.3), bed2=(17.45, 7.15, 20.2, 9.7))
    DOORWAYS.append(dict(along_x=True, a=14.1, b=21.85, line=11.3, kind='open'))
    FLOORS = [(17.3, 6.8, 22.2, 9.85), (12.8, 9.7, 22.2, 14.1), (12.1, 11.3, 14.1, 14.1)]
    wall(17.3, 6.8, 22.2, 7.15)
    wall(21.85, 7.15, 22.2, 14.1, [('win', 7.3, 9.5, 'W'), ('win', 10.6, 13.0, 'W')])
    wall(12.1, 13.9, 22.2, 14.1)
    wall(12.8, 9.7, 13.0, 11.3, [('door', 10.05, 11.0, 'E')])
    wall(12.8, 9.7, 22.2, 9.85, [('door', 17.55, 18.35, 'N')])
    wall(17.3, 7.15, 17.45, 9.7)
    wall(20.2, 7.15, 20.35, 9.7, [('win', 7.4, 8.3, 'W'), ('open', 8.65, 9.5, 'W')])
    wall(12.1, 11.3, 14.1, 11.45, [('door', 13.05, 13.85, 'S')])
    wall(12.1, 11.45, 12.45, 13.9)
    wall(13.95, 11.45, 14.1, 13.9)
    for w in WINDOWS:
        if w['face'] == 20.35 or (not w['along_x'] and w['b'] < 9.6): w['nocurtain'] = True
    door('Entry', 12.9, 10.525, False, 'E', open_=False)
    door('D3', 17.95, 9.775, True, 'N', open_=True, hinge=-1)
    door('D2', 13.45, 11.375, True, 'S', open_=False)
    m = Matrix.Identity(4); m[1][1] = -1
    # mirror about the plan line y = 13.9 after turning: north wall -> west, east wall -> south
    place(K['kitchen'], Matrix.Translation(B(0, 13.9)) @ m @ Matrix.Translation(-B(0, 13.9)) @ xf((14.75, 14.1), (14.1, 13.9), rot=90))
    place(K['living'], xf((10.95, 19.4), (20.2, 13.9), rot=90))
    place(K['dining'], xf((14.7, 19.05), (17.4, 12.15)))
    place(K['plant'], xf((11.5, 20.6), (21.45, 10.3)))
    place(K['bedD3np'], xf((18.9, 17.9), (18.825, 7.15)))
    place(K['bathD2'], xf((15.65, 15.325), (13.2, 12.675), rot=180))
    place(K['balcony'], xf((21.28, 19.45), (21.1, 8.45)))
    place(K['console'], xf((10.95, 12.575), (13.95, 9.85), rot=-90))
    for p in [(13.55, 10.5), (15.2, 12.3), (16.0, 10.6), (17.4, 12.2), (19.4, 10.6), (21.0, 12.8), (18.85, 8.6), (13.2, 12.6)]:
        downlight(*p)
    ceiling_fill(13.55, 10.55, 0.8, 1.0, 50)
    CAMS = dict(entry=(13.55, 10.55, 1.5), kitchen=(15.6, 11.9, 1.5), living=(18.45, 11.0, 1.5),
                bed_e2=(19.95, 8.75, 1.5), bath_e3=(13.25, 12.45, 1.4), balcony=(21.15, 8.2, 1.5))

window_dressing()
skirting(rooms.values(), DOORWAYS)
for i, (x0, y0, x1, y1) in enumerate(FLOORS):
    box(x0, y0, -0.05, x1, y1, 0.0, 'Oak_Floor', 'Floor_Oak')
box(X0, Y0, CEIL, X1, Y1, CEIL + 0.1, 'Ceiling', 'Ceiling')

cam = OBJ['Pano'].copy(); coll.objects.link(cam); cam.name = 'Pano_' + UNIT
x, y, z = CAMS['living']; cam.location = B(x, y, z)
bpy.context.scene.camera = cam

for o in ORIG:
    if o.name not in KEEP and o.name in OBJ: OBJ.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    if c is not coll and not c.objects and not c.children: bpy.data.collections.remove(c)
try: bpy.ops.outliner.orphans_purge(do_recursive=True)
except Exception as e: print('purge', e)
json.dump({k: list(v) for k, v in CAMS.items()}, open(f'{OUT}/{UNIT}_cams.json', 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=f'{OUT}/{UNIT}.blend', compress=True)
print('saved', UNIT, len(OBJ), 'objects')
