# Builds the 3D model of the complex, one GLB per block, from the architect's site plan:
#   A.glb  podium (floors 1-3 under the whole complex) + roof playground + media screen
#   B.glb  north tower (floors 4-16, on the main road)     C.glb  south tower (floors 4-16)
#   D.glb  annex                                            site.glb  parked cars
#
#   blender --background --python scripts/build-model.py -- src/data/site.json public/models/blocks
#   then merge them into the single file the viewer loads (see scripts/merge-blocks.py):
#   blender --background --python scripts/merge-blocks.py -- public/models/blocks public/models/complex.glb
#
# Every block is exported with the same settings in the same coordinate frame, so blocks can be
# rebuilt or replaced one at a time and merged again. Footprints come from site.json, so the model
# sits exactly on the site plan drawn by three/BuildingScene.tsx (scene x = u, scene z = -v).
# Heights must match src/data/building.ts.
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector, Matrix

random.seed(7)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
SITE_JSON = ARGS[0] if len(ARGS) > 0 else "src/data/site.json"
OUT_DIR = ARGS[1] if len(ARGS) > 1 else "public/models/blocks"
bpy.ops.wm.read_factory_settings(use_empty=True)
ROOT = bpy.data.collections.new("Tower Complex")
bpy.context.scene.collection.children.link(ROOT)


# ---------------------------------------------------------------- materials
def mat(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        key = "Emission Color" if "Emission Color" in b.inputs else "Emission"
        b.inputs[key].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    m.diffuse_color = (*color, 1)
    return m


M = {
    "white":   mat("Facade White", (0.86, 0.85, 0.82), 0.55),
    "joint":   mat("Panel Joint", (0.55, 0.55, 0.54), 0.7),
    "glass":   mat("Glass", (0.13, 0.25, 0.36), 0.15, 0.1),
    "glass_l": mat("Glass Shopfront", (0.22, 0.36, 0.45), 0.15, 0.1),
    "roof":    mat("Roof Grey", (0.62, 0.62, 0.63), 0.8),
    "paver":   mat("Pavers", (0.72, 0.70, 0.67), 0.85),
    "asphalt": mat("Asphalt", (0.33, 0.31, 0.30), 0.9),
    "line":    mat("Road Marking", (0.92, 0.92, 0.90), 0.7),
    "grass":   mat("Grass", (0.20, 0.42, 0.10), 0.95),
    "hedge":   mat("Hedge", (0.10, 0.33, 0.07), 0.9),
    "leaf":    mat("Tree Leaves", (0.13, 0.36, 0.10), 0.9),
    "trunk":   mat("Trunk", (0.22, 0.14, 0.08), 0.9),
    "wood":    mat("Wood", (0.60, 0.33, 0.12), 0.7),
    "metal":   mat("Brushed Metal", (0.70, 0.71, 0.73), 0.3, 0.9),
    "dark":    mat("Dark Metal", (0.06, 0.06, 0.07), 0.5, 0.5),
    "blue":    mat("Play Blue", (0.10, 0.45, 0.80), 0.8),
    "orange":  mat("Play Orange", (0.90, 0.33, 0.08), 0.8),
    "pink":    mat("Flowers", (0.85, 0.20, 0.45), 0.8),
    "tire":    mat("Tire", (0.03, 0.03, 0.03), 0.9),
    "lamp":    mat("Lamp Head", (1, 1, 1), 0.4, 0, (1.0, 0.9, 0.7), 3.0),
}


def screen_material():
    """Emissive gradient for the media screen, baked to a small image so it survives glTF export."""
    w, h = 256, 96
    img = bpy.data.images.new("media-screen", w, h)
    stops = [(0.0, (0.25, 0.05, 0.55)), (0.35, (0.85, 0.10, 0.35)), (0.65, (1.0, 0.35, 0.05)), (1.0, (1.0, 0.78, 0.2))]
    px = []
    for y in range(h):
        for x in range(w):
            u, v = x / w, y / h
            t = 0.5 + 0.5 * math.sin(6.0 * u + 3.0 * math.sin(4.0 * v + 2.0 * u) + 1.5 * math.cos(5.0 * u * v))
            for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
                if t <= p1:
                    k = (t - p0) / (p1 - p0)
                    px += [c0[i] + (c1[i] - c0[i]) * k for i in range(3)] + [1.0]
                    break
    img.pixels = px
    img.pack()
    m = bpy.data.materials.new("Media Screen")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    key = "Emission Color" if "Emission Color" in b.inputs else "Emission"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], b.inputs[key])
    b.inputs["Emission Strength"].default_value = 1.0
    return m


M["screen"] = screen_material()


# ---------------------------------------------------------------- mesh helpers
class Builder:
    """Collects geometry in one bmesh and turns it into a single object."""

    def __init__(self, name, mats):
        self.name, self.mats, self.bm = name, mats, bmesh.new()

    def idx(self, key):
        return self.mats.index(key)

    BOX_FACES = ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5))

    def box(self, c, s, key, rz=0.0):
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        rot = Matrix.Rotation(rz, 3, "Z")
        v = [self.bm.verts.new(Vector(c) + rot @ Vector((x * hx, y * hy, z * hz)))
             for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
        for q in self.BOX_FACES:
            self.bm.faces.new([v[i] for i in q]).material_index = self.idx(key)

    def beam(self, a, b, w, h, key):
        """A box running from 3D point a to b (a stair flight, a rail): w wide across, h thick."""
        a, b = Vector(a), Vector(b)
        d = b - a
        side = d.cross(Vector((0, 0, 1)))
        side = (side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))) * (w / 2)
        up = side.cross(d).normalized() * (h / 2)
        # same vertex order as box(): along d fastest, then across, then up
        v = [self.bm.verts.new(e + s * side + t * up) for t in (-1, 1) for s in (-1, 1) for e in (a, b)]
        for q in self.BOX_FACES:
            self.bm.faces.new([v[i] for i in q]).material_index = self.idx(key)

    def box2(self, x0, x1, y0, y1, z0, z1, key):
        self.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), key)

    def prism(self, pts, z0, z1, key, top_key=None):
        bot = [self.bm.verts.new((p[0], p[1], z0)) for p in pts]
        top = [self.bm.verts.new((p[0], p[1], z1)) for p in pts]
        n = len(pts)
        self.bm.faces.new(list(reversed(bot))).material_index = self.idx(key)
        self.bm.faces.new(top).material_index = self.idx(top_key or key)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((bot[i], bot[j], top[j], top[i])).material_index = self.idx(key)

    def fquad(self, a, b, z0, z1, off, key):
        """Vertical quad on the outside of footprint edge a->b (CCW footprint)."""
        d = Vector((b[0] - a[0], b[1] - a[1]))
        if d.length < 1e-6:
            return
        n = Vector((d.y, -d.x)).normalized() * off
        vs = [self.bm.verts.new((a[0] + n.x, a[1] + n.y, z0)), self.bm.verts.new((b[0] + n.x, b[1] + n.y, z0)),
              self.bm.verts.new((b[0] + n.x, b[1] + n.y, z1)), self.bm.verts.new((a[0] + n.x, a[1] + n.y, z1))]
        self.bm.faces.new(vs).material_index = self.idx(key)

    def strip(self, pts, half_w, z0, z1, key, closed=False):
        """A continuous mitred wall / band / hedge following a polyline."""
        P = [Vector(p[:2]) for p in pts]
        P = [p for i, p in enumerate(P) if i == 0 or (p - P[i - 1]).length > 1e-6]
        if closed and (P[0] - P[-1]).length < 1e-6:
            P.pop()
        n = len(P)
        rings = []
        for i in range(n):
            a = P[i - 1] if (closed or i > 0) else None
            c = P[(i + 1) % n] if (closed or i < n - 1) else None
            d1 = (P[i] - a).normalized() if a is not None else (c - P[i]).normalized()
            d2 = (c - P[i]).normalized() if c is not None else d1
            n1, n2 = Vector((d1.y, -d1.x)), Vector((d2.y, -d2.x))
            m = n1 + n2
            m = m.normalized() if m.length > 1e-6 else n1
            m *= half_w / max(m.dot(n1), 0.35)
            o, q = P[i] + m, P[i] - m
            rings.append([self.bm.verts.new((o.x, o.y, z0)), self.bm.verts.new((o.x, o.y, z1)),
                          self.bm.verts.new((q.x, q.y, z1)), self.bm.verts.new((q.x, q.y, z0))])
        mi = self.idx(key)
        for i in range(n if closed else n - 1):
            r, t = rings[i], rings[(i + 1) % n]
            for k in range(4):
                self.bm.faces.new((r[k], t[k], t[(k + 1) % 4], r[(k + 1) % 4])).material_index = mi
        if not closed:
            self.bm.faces.new(rings[0]).material_index = mi
            self.bm.faces.new(list(reversed(rings[-1]))).material_index = mi

    def cyl(self, c, r, h, key, seg=20, r2=None):
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r,
                                    radius2=r if r2 is None else r2, depth=h,
                                    matrix=Matrix.Translation(c))
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.material_index = self.idx(key)

    def blob(self, c, r, key, sz=1.0, jitter=0.12, sub=2):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=r,
                                         matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, 1, sz, 1)))
        for v in res["verts"]:
            v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * r * jitter
        for f in {f for v in res["verts"] for f in v.link_faces}:
            f.material_index = self.idx(key)
            f.smooth = True

    def finish(self, coll=None):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for k in self.mats:
            me.materials.append(M[k])
        ob = bpy.data.objects.new(self.name, me)
        (coll or ROOT).objects.link(ob)
        return ob


def sub_collection(name):
    c = bpy.data.collections.new(name)
    ROOT.children.link(c)
    return c


def arc(cx, cy, r, a0, a1, n):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def catmull(ctrl, per=8):
    P = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = (Vector(p) for p in P[i - 1:i + 3])
        for k in range(per):
            t = k / per
            out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)))
    out.append(tuple(ctrl[-1]))
    return out


def densify(pts, max_len=1.5, closed=True):
    out, n = [], len(pts)
    for i in range(n if closed else n - 1):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % n])
        k = max(1, math.ceil((b - a).length / max_len))
        out += [tuple(a.lerp(b, j / k)) for j in range(k)]
    if not closed:
        out.append(tuple(pts[-1]))
    return out


def inset(pts, d):
    """Offset an open CCW polyline towards the inside by d."""
    out = []
    for i, p in enumerate(pts):
        a, b = Vector(pts[max(i - 1, 0)]), Vector(pts[min(i + 1, len(pts) - 1)])
        t = (b - a).normalized()
        out.append((p[0] - t.y * d, p[1] + t.x * d))
    return out


# ---------------------------------------------------------------- site plan + dimensions (metres)
SITE = json.load(open(SITE_JSON))
# Levels from the architect's sections (metres above the 1st-floor slab). Keep in step with
# src/data/building.ts. Podium: 1st floor 4.5 m, 2nd and 3rd 3.6 m; playground roof at +11.7.
LEVELS = (0.0, 4.5, 8.1, 11.7)
PODIUM_HEIGHT = LEVELS[-1]
FLOOR_HEIGHT = 3.0                 # apartment floors 4-16
FLOOR_MIN, FLOOR_MAX = 4, 16
FLOORS = FLOOR_MAX - FLOOR_MIN + 1
TOP = PODIUM_HEIGHT + FLOORS * FLOOR_HEIGHT     # +50.7, roof of the 16th floor
TECH_TOP = TOP + 4.0                             # +54.7, roof of the technical floor (section 1-1)
ANNEX_HEIGHT = 14.0
CHAMFER = 2.4                      # glazed tower corners; BuildingScene.tsx uses the same value


def ccw(pts):
    area = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))
    return list(pts) if area > 0 else list(reversed(pts))


def inside(pt, poly):
    x, y, hit = pt[0], pt[1], False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def outward(a, b, d):
    t = Vector((b[0] - a[0], b[1] - a[1])).normalized()
    return ((a[0] + b[0]) / 2 + t.y * d, (a[1] + b[1]) / 2 - t.x * d)


def open_runs(pts, exposed):
    """Split a closed outline into polylines made only of the segments for which exposed(a, b) is true."""
    n = len(pts)
    flags = [exposed(pts[i], pts[(i + 1) % n]) for i in range(n)]
    if all(flags):
        return [list(pts) + [pts[0]]]
    start = next(i for i in range(n) if flags[i] and not flags[i - 1]) if any(flags) else 0
    runs, cur = [], []
    for k in range(n):
        i = (start + k) % n
        if flags[i]:
            cur = cur or [pts[i]]
            cur.append(pts[(i + 1) % n])
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return runs


PODIUM = ccw([tuple(p) for p in SITE["podium"]])
PODIUM = [p for i, p in enumerate(PODIUM) if (Vector(p) - Vector(PODIUM[i - 1])).length > 0.01]
ANNEX = ccw([tuple(p) for p in SITE["annex"]])
TOWERS = [(t["u0"], t["v0"], t["u1"], t["v1"]) for t in SITE["towers"]]
STREET = max(range(len(TOWERS)), key=lambda i: TOWERS[i][3])     # the tower on the main road (largest v)


def in_tower(p, grow=0.15):
    return any(x0 - grow < p[0] < x1 + grow and y0 - grow < p[1] < y1 + grow for x0, y0, x1, y1 in TOWERS)


def tower_footprint(x0, y0, x1, y1, c=CHAMFER):
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c),
            (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]


# ---------------------------------------------------------------- block A facades (architect's elevations)
# Block A is the three podium floors under the whole complex, including under each tower, plus the
# playground on its roof; towers B and C stand on that roof. Elevations: glazed shopfronts on the
# 1st floor, white wall with punched windows on the 2nd and 3rd, the rounded north-west end glazed
# full height.
def is_lobe(p, q):
    """Segment on the rounded north-west end (glazed full height on the west and north elevations)."""
    return (p[0] + q[0]) / 2 < -8.0 and (p[1] + q[1]) / 2 > 3.0


def corners(run, same=lambda s, t: True):
    """Drop the points densify() added on straight stretches; keep real corners, curves, and the
    points where same(segment, next segment) says the facade changes."""
    out = [run[0]]
    for i in range(1, len(run) - 1):
        a, p, c = out[-1], run[i], run[i + 1]
        bend = abs((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) > 1e-3
        if bend or not same((run[i - 1], p), (p, c)):
            out.append(p)
    out.append(run[-1])
    return out


def glazing(b, p, q, z0, z1, key):
    """Glass panels with white mullions, roughly every 1.5 m, between heights z0 and z1."""
    p, q = Vector(p), Vector(q)
    k = max(1, round((q - p).length / 1.5))
    for i in range(k):
        a, c = p.lerp(q, i / k), p.lerp(q, (i + 1) / k)
        b.fquad(a, c, z0, z1, 0.06, key)
        b.fquad(a, a + (c - a).normalized() * 0.07, z0, z1, 0.12, "white")


def punched_windows(b, p, q, level, height):
    """One window about every 3 m, sill 0.8 m above the floor (2nd- and 3rd-floor elevations)."""
    p, q = Vector(p), Vector(q)
    L = (q - p).length
    if L < 1.5:
        return
    n = max(1, round(L / 3.0))
    t = (q - p).normalized() * min(0.75, L / n * 0.3)
    for i in range(n):
        m = p.lerp(q, (i + 0.5) / n)
        b.fquad(m - t, m + t, level + 0.8, level + min(2.8, height - 0.5), 0.05, "glass")


def podium_facade(b, run, open_ground=None):
    """Facade along one exposed run of block A. open_ground(p, q) marks segments with no 1st-floor wall."""
    run = corners(run, lambda s, t: not open_ground or open_ground(*s) == open_ground(*t))
    for p, q in zip(run, run[1:]):
        if is_lobe(p, q):
            glazing(b, p, q, 0.3, PODIUM_HEIGHT - 0.3, "glass")
            continue
        if not (open_ground and open_ground(p, q)):
            glazing(b, p, q, 0.3, LEVELS[1] - 0.35, "glass_l")
        for lo, hi in zip(LEVELS[1:-1], LEVELS[2:]):
            punched_windows(b, p, q, lo, hi - lo)
    d = densify(run, 1.5, closed=False)
    for z in LEVELS[1:-1]:                                              # slab edges at +4.5 and +8.1
        b.strip(d, 0.28, z - 0.4, z + 0.2, "white")
    return d


# ---------------------------------------------------------------- block A: podium + roof playground
BASES = [[(x0, y0), (x1, y0), (x1, y1), (x0, y1)] for x0, y0, x1, y1 in TOWERS]   # floors 1-3 under the towers: square corners
SOUTH = 1 - STREET                                     # tower C; site.json lists the towers south to north
GRID_U, GRID_V = SITE["grid"]["u"], SITE["grid"]["v"]  # axes X1-X6 and Y1-Y12 of the drawings
Y1, Y2 = GRID_V[0], GRID_V[1]
RECESS = Y2 + 2.4      # 1st-floor shopfront under tower C (1st-floor plan); same as GROUND_SOUTH in src/data/podium.ts


def outside_a(p, q):
    o = outward(p, q, 0.3)
    return not any(inside(o, part) for part in [PODIUM] + BASES)


def build_podium():
    b = Builder("Podium", ["white", "paver", "glass_l", "glass", "hedge", "pink", "blue", "orange", "wood", "metal", "dark"])
    z = PODIUM_HEIGHT

    # floors 1-3 under each tower; under tower C the 1st floor is an open walkway south of RECESS,
    # with columns on axes Y1 and Y2
    for i, (x0, y0, x1, y1) in enumerate(TOWERS):
        if i == SOUTH:
            b.prism([(x0, RECESS), (x1, RECESS), (x1, y1), (x0, y1)], 0, z, "white", "paver")
            b.prism([(x0, y0), (x1, y0), (x1, RECESS), (x0, RECESS)], LEVELS[1], z, "white", "paver")
            for u in GRID_U[1:]:
                for v in (Y1, Y2):
                    if x0 < u < x1:
                        b.box((u, v, LEVELS[1] / 2), (0.6, 0.6, LEVELS[1]), "white")
            glazing(b, (x0, RECESS), (x1, RECESS), 0.3, LEVELS[1] - 0.35, "glass_l")      # recessed shopfront
            outline = [(x0, y0), (x1, y0), (x1, RECESS), (x1, y1), (x0, y1), (x0, RECESS)]
            open_ground = lambda p, q: max(p[1], q[1]) <= RECESS + 0.01
        else:
            outline, open_ground = BASES[i], None
            b.prism(outline, 0, z, "white", "paver")
        for run in open_runs(densify(outline), outside_a):
            podium_facade(b, run, open_ground)

    # glazed volume west of tower C on axes X1-X2 (south elevation, section 1-1). Its length along
    # the building is not dimensioned; on the plans it stands over the basement ramp.
    gx0, gx1, gy0, gy1 = GRID_U[0], TOWERS[SOUTH][0], Y2 + 1.5, Y2 + 6.3
    b.box2(gx0, gx1, gy0, gy1, 0, z - 0.2, "glass")
    b.box2(gx0 - 0.3, gx1, gy0 - 0.3, gy1 + 0.3, z - 0.2, z + 0.3, "white")
    for p, q in (((gx0, gy0), (gx1, gy0)), ((gx1, gy1), (gx0, gy1)), ((gx0, gy1), (gx0, gy0))):
        p, q = Vector(p), Vector(q)
        k = max(1, round((q - p).length / 1.5))
        for j in range(k + 1):
            a = p.lerp(q, j / k)
            b.fquad(a, a + (q - p).normalized() * 0.07, 0, z - 0.2, 0.04, "white")
        for zz in LEVELS[1:-1]:
            b.fquad(p, q, zz - 0.08, zz + 0.08, 0.04, "white")

    # external steel stair east of tower C, 1st floor to the roof (section 1-1, plans of floors 1-3):
    # two flights per storey, side by side, with landings at each end
    sx0 = TOWERS[SOUTH][2] + 0.3
    sx1 = sx0 + 6.2
    vm = TOWERS[SOUTH][3] - 1.9
    lanes = ((vm - 1.8, vm), (vm, vm + 1.8))
    for z0, z1 in zip(LEVELS, LEVELS[1:]):
        zm = (z0 + z1) / 2
        for (va, vb), za, zb, xa, xb, rail in ((lanes[0], z0, zm, sx0 + 1.4, sx1 - 1.4, lanes[0][0]),
                                               (lanes[1], zm, z1, sx1 - 1.4, sx0 + 1.4, lanes[1][1])):
            b.beam((xa, (va + vb) / 2, za), (xb, (va + vb) / 2, zb), vb - va - 0.1, 0.22, "dark")
            b.beam((xa, rail, za + 1.0), (xb, rail, zb + 1.0), 0.05, 0.05, "dark")
        b.box2(sx1 - 1.4, sx1, lanes[0][0], lanes[1][1], zm - 0.22, zm, "dark")
        b.box2(sx0, sx0 + 1.4, lanes[0][0], lanes[1][1], z1 - 0.22, z1, "dark")
    for x in (sx0 + 0.07, sx1 - 0.07):
        for v in (lanes[0][0] + 0.07, lanes[1][1] - 0.07):
            b.box((x, v, (z + 1.1) / 2), (0.14, 0.14, z + 1.1), "dark")

    # the podium between the towers, with the roof playground
    b.prism(PODIUM, 0, z, "white", "paver")
    for run in open_runs(densify(PODIUM), outside_a):
        d = podium_facade(b, run)
        b.strip(d, 0.42, z - 0.4, z + 1.1, "white")                    # terrace parapet
        hedge = inset(d, 1.5)[2:-2]
        b.strip(hedge, 0.55, z, z + 0.95, "hedge")
        for i, p in enumerate(hedge):
            if i % 3 == 0:
                b.blob((p[0], p[1], z + 1.0), 0.75, "hedge", 0.8)
            if i % 7 == 3:
                b.blob((p[0], p[1], z + 1.25), 0.5, "pink", 0.7)

    # playground, laid out inside the plan's playground rectangle
    g = SITE["playground"]
    lobe = min(PODIUM, key=lambda p: p[0])                              # the rounded end of the podium
    cx = lobe[0] + 7.0
    cy = sum(p[1] for p in PODIUM if p[0] < lobe[0] + 3) / len([p for p in PODIUM if p[0] < lobe[0] + 3])
    for (x, y) in ((cx - 0.5, cy + 1.5), (cx + 3.2, cy - 2.6), (cx - 1.5, cy - 4.2)):
        b.cyl((x, y, z + 0.06), 2.0, 0.08, "blue", 32)
        for s in (-0.7, 0.7):
            b.box((x + s, y, z + 0.9), (0.1, 0.1, 1.6), "white")
        b.box((x, y, z + 1.7), (1.6, 0.1, 0.1), "white")
        b.box((x, y, z + 0.55), (1.3, 0.5, 0.08), "metal")
    mx, my = (g["u0"] + g["u1"]) / 2 + 4.0, (TOWERS[0][3] + TOWERS[1][1]) / 2      # between the towers
    for (x, y, k) in ((mx + 4, my + 4.5, "orange"), (mx + 8, my + 5.5, "blue"), (mx + 12, my + 4.5, "orange")):
        b.cyl((x, y, z + 0.06), 1.7, 0.08, k, 28)
    for x in (mx + 3, mx + 6, mx + 9, mx + 12):
        for y in (my + 3.2, my + 6.2):
            b.box((x, y, z + 1.5), (0.14, 0.14, 2.9), "white")
        b.box((x, my + 4.7, z + 2.9), (0.12, 3.0, 0.12), "wood")
    for y in (my + 3.2, my + 6.2):
        b.box((mx + 7.5, y, z + 2.9), (9.3, 0.12, 0.12), "wood")
    px, py = mx - 2.5, my - 1.5                                         # hexagonal timber pavilion
    for a in range(6):
        ang = math.radians(60 * a + 30)
        b.box((px + 2.8 * math.cos(ang), py + 2.8 * math.sin(ang), z + 1.4), (0.2, 0.2, 2.7), "wood")
        if a in (0, 1, 2):
            a2 = math.radians(60 * a + 60)
            for h in range(7):
                b.box((px + 2.42 * math.cos(a2), py + 2.42 * math.sin(a2), z + 0.4 + h * 0.36),
                      (2.8, 0.08, 0.2), "wood", a2 + math.pi / 2)
    b.cyl((px, py, z + 2.9), 3.5, 0.25, "white", 6)
    b.cyl((px, py, z + 0.1), 3.2, 0.12, "wood", 6)
    for (x, y, r) in ((mx + 2, my - 5.5, math.pi / 2), (mx + 9, my - 5.5, math.pi / 2), (cx + 5.5, cy + 2, 0.0)):
        b.box((x, y, z + 0.5), (0.6, 2.0, 0.1), "wood", r)
        b.box((x, y, z + 0.28), (0.4, 1.6, 0.4), "white", r)

    # triangle-pattern metal screen on the longest straight facade facing the car park
    segs = [(p, q) for p, q in zip(PODIUM, PODIUM[1:] + PODIUM[:1])
            if abs(q[0] - p[0]) < 0.3 and p[0] < 0 and not in_tower(outward(p, q, 0.3))]
    if segs:
        p, q = max(segs, key=lambda s: abs(s[1][1] - s[0][1]))
        y0, y1, x, s = min(p[1], q[1]) + 0.6, max(p[1], q[1]) - 0.6, p[0] - 0.2, 0.9
        zs = LEVELS[1] + 0.4                                            # over the 2nd and 3rd floors
        b.box2(x + 0.05, x + 0.15, y0 - 0.2, y1 + 0.2, zs - 0.2, z - 0.1, "dark")
        for i in range(int((y1 - y0) / s)):
            for j in range(int((z - 0.3 - zs) / s)):
                ya, za = y0 + i * s, zs + j * s
                c = [(ya, za), (ya + s, za), (ya + s, za + s), (ya, za + s)]
                for t in (((0, 1, 2), (0, 2, 3)) if (i + j) % 2 else ((0, 1, 3), (1, 2, 3))):
                    if random.random() < 0.14:
                        continue
                    vs = [b.bm.verts.new((x - random.uniform(0, 0.28), c[k][0], c[k][1])) for k in t]
                    b.bm.faces.new(vs).material_index = b.idx(random.choice(("white", "white", "metal", "metal", "dark")))
    return b.finish()


# ---------------------------------------------------------------- towers
def plate(rect):
    """The apartment floors (4-16), which overhang the podium. rect is the site plan's tower
    rectangle, the grid plus 0.5 m, which is the podium under the tower. The floor slab (PLATE in
    src/data/building.ts) runs 2.05 m past the end grid lines east and west, 0.15 m past the south
    one and 0.2 m past the north one. Keep in step with towerPlate() in src/data/building.ts."""
    x0, y0, x1, y1 = rect
    return x0 - 1.55, y0 + 0.35, x1 + 1.55, y1 - 0.3


def build_tower(name, rect):
    x0, y0, x1, y1 = plate(rect)
    fp = tower_footprint(x0, y0, x1, y1)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    b = Builder(name, ["white", "glass", "joint", "roof"])
    b.prism(fp, PODIUM_HEIGHT, TOP, "white", "roof")                   # floors 4-16, standing on block A
    for i in range(8):
        a, c = Vector(fp[i]), Vector(fp[(i + 1) % 8])
        L = (c - a).length
        corner = L < 6
        nb = 1 if corner else round(L / 3.2)
        for f in range(FLOORS):
            z = PODIUM_HEIGHT + f * FLOOR_HEIGHT
            b.fquad(a, c, z - 0.06, z + 0.06, 0.03, "joint")
            for k in range(nb):
                p, q = a.lerp(c, k / nb), a.lerp(c, (k + 1) / nb)
                if corner:
                    m = p.lerp(q, 0.5)
                    b.fquad(p.lerp(q, 0.03), m.lerp(p, 0.03), z + 0.25, z + FLOOR_HEIGHT - 0.3, 0.06, "glass")
                    b.fquad(m.lerp(q, 0.03), q.lerp(p, 0.03), z + 0.25, z + FLOOR_HEIGHT - 0.3, 0.06, "glass")
                elif k == nb - 2:
                    b.fquad(p.lerp(q, 0.06), q.lerp(p, 0.06), z + 0.2, z + FLOOR_HEIGHT - 0.25, 0.06, "glass")
                else:
                    b.fquad(p.lerp(q, 0.2), q.lerp(p, 0.2), z + 0.9, z + 2.55, 0.06, "glass")
        for k in range(nb + 1):
            p = a.lerp(c, k / nb)
            d = (c - a).normalized() * 0.04
            b.fquad(p - d, p + d, PODIUM_HEIGHT, TOP, 0.03, "joint")
    crown = [(cx + (p[0] - cx) * 1.045, cy + (p[1] - cy) * 1.045) for p in fp]
    b.prism(crown, TOP, TOP + 1.2, "white", "roof")                 # parapet round the roof
    # technical floor over the lift and stair core (roof plan and section 1-1): its walls stand on
    # the tower's grid lines X4-X5 and Y4-Y2 (X5-X6, Y12-Y10 for tower B), so the block is flush
    # with the north facade and the same on both towers. Same as BLOCK in src/data/roof.ts.
    gx, gy = rect[0] + 0.5, rect[3] - 0.5                              # grid crossing at the NW corner
    b.box2(gx + 6.95, gx + 14.65, gy - 14.05, gy + 0.25, TOP, TECH_TOP, "white")
    return b.finish()


# ---------------------------------------------------------------- media screen on the street corner
def build_screen():
    x0, y0, x1, y1 = TOWERS[STREET]
    sx = -1 if min(p[0] for p in PODIUM) > (x0 + x1) / 2 else 1          # corner away from the podium lobe
    ex, r = (x1 if sx > 0 else x0), CHAMFER + 1.0
    turn = arc(ex - sx * r, y1 - r, r + 0.45, 90, 0 if sx > 0 else 180, 14)
    path = [(ex - sx * 9.5, y1 + 0.45)] + turn + [(ex + sx * 0.45, y1 - 9.5)]
    b = Builder("Media Screen", ["screen", "white", "dark"])
    uv = b.bm.loops.layers.uv.new("UVMap")
    lengths = [0.0]
    for p, q in zip(path, path[1:]):
        lengths.append(lengths[-1] + (Vector(q) - Vector(p)).length)
    z0, z1 = LEVELS[1] + 0.8, PODIUM_HEIGHT - 0.2
    for i in range(len(path) - 1):
        p, q = path[i], path[i + 1]
        vs = [b.bm.verts.new((p[0], p[1], z0)), b.bm.verts.new((q[0], q[1], z0)),
              b.bm.verts.new((q[0], q[1], z1)), b.bm.verts.new((p[0], p[1], z1))]
        f = b.bm.faces.new(vs)
        f.material_index = 0
        for loop, (k, v) in zip(f.loops, ((i, 0), (i + 1, 0), (i + 1, 1), (i, 1))):
            loop[uv].uv = (lengths[k] / lengths[-1], v)
    frame = [(path[0][0] - sx * 0.4, y1 + 0.3)] + arc(ex - sx * r, y1 - r, r + 0.3, 90, 0 if sx > 0 else 180, 14) + [(ex + sx * 0.3, path[-1][1] - 0.4)]
    b.strip(frame, 0.55, 4.6, z0, "white")
    b.strip(frame, 0.55, z1, z1 + 0.9, "white")
    # louvred signage wall beside the screen (plain blocks stand in for tenant signs)
    a, c = ex - sx * 17.5, ex - sx * 10.2
    lx0, lx1 = min(a, c), max(a, c)
    top = PODIUM_HEIGHT - 0.4
    b.box2(lx0, lx1, y1, y1 + 0.25, LEVELS[1] + 1.3, top, "dark")
    for k in range(int((top - LEVELS[1] - 1.5) / 0.35)):
        b.box(((lx0 + lx1) / 2, y1 + 0.38, LEVELS[1] + 1.5 + k * 0.35), (lx1 - lx0, 0.28, 0.12), "white")
    for (fx, dz, w, h) in ((0.27, 1.4, 1.8, 0.9), (0.73, 1.4, 1.6, 0.9), (0.27, 3.2, 1.5, 0.8), (0.73, 3.2, 1.5, 0.8), (0.5, 5.0, 2.6, 0.8)):
        b.box((lx0 + (lx1 - lx0) * fx, y1 + 0.56, top - dz), (w, 0.08, h), "dark")
    b.box2(lx0 - 1, lx1 + 1, y1, y1 + 2.2, LEVELS[1] - 0.3, LEVELS[1] + 0.1, "white")   # entrance canopy
    return b.finish()


# ---------------------------------------------------------------- annex
def build_annex():
    b = Builder("Annex", ["white", "glass", "joint", "roof"])
    b.prism(ANNEX, 0, ANNEX_HEIGHT, "white", "roof")
    for i in range(len(ANNEX)):
        a, c = Vector(ANNEX[i]), Vector(ANNEX[(i + 1) % len(ANNEX)])
        nb = max(1, round((c - a).length / 6))
        for z in (2.8, 5.6, 8.4, 11.2):
            b.fquad(a, c, z - 0.03, z + 0.03, 0.03, "joint")
        for k in range(nb):
            p, q = a.lerp(c, k / nb), a.lerp(c, (k + 1) / nb)
            d = (c - a).normalized() * 0.03
            b.fquad(p - d, p + d, 0, ANNEX_HEIGHT, 0.03, "joint")
            for z in (4.6, 9.8):
                b.fquad(p.lerp(q, 0.15), q.lerp(p, 0.15), z, z + 0.95, 0.05, "glass")
    return b.finish()


# ---------------------------------------------------------------- parked cars (one per two bays, from the plan's bay lines)
def build_cars():
    paints = {"silver": (0.70, 0.71, 0.72), "white": (0.90, 0.90, 0.88), "black": (0.03, 0.03, 0.035), "graphite": (0.16, 0.17, 0.18)}
    for name, col in paints.items():
        M["car_" + name] = mat("Car " + name.title(), col, 0.3, 0.3)
    b = Builder("Cars", ["car_" + n for n in paints] + ["glass", "tire"])
    lines = sorted(SITE["parking"], key=lambda l: (round(l[0][0] / 6), l[0][1]))
    for l0, l1 in zip(lines, lines[1:]):
        a0, a1, b0, b1 = Vector(l0[0]), Vector(l0[-1]), Vector(l1[0]), Vector(l1[-1])
        gap = ((b0 + b1) / 2 - (a0 + a1) / 2).length
        if not 2.2 < gap < 3.3 or (a1 - a0).length < 4 or random.random() < 0.45:
            continue
        c = (a0 + a1 + b0 + b1) / 4
        d = a1 - a0
        rz = math.atan2(d.y, d.x) + random.choice((0, math.pi))
        paint = "car_" + random.choice(list(paints))
        rot = Matrix.Rotation(rz, 3, "Z")
        b.box((c.x, c.y, 0.62), (4.4, 1.8, 0.62), paint, rz)
        off = rot @ Vector((-0.15, 0, 0))
        b.box((c.x + off.x, c.y + off.y, 1.15), (2.5, 1.62, 0.5), "glass", rz)
        b.box((c.x + off.x, c.y + off.y, 1.42), (2.2, 1.5, 0.06), paint, rz)
        for sx in (-1.4, 1.4):
            for sy in (-0.82, 0.82):
                w = rot @ Vector((sx, sy, 0))
                b.box((c.x + w.x, c.y + w.y, 0.33), (0.66, 0.24, 0.66), "tire", rz)
    return b.finish()


# ---------------------------------------------------------------- build + export, one GLB per block
BLOCKS = {"A": [build_podium(), build_screen()], "D": [build_annex()], "site": [build_cars()]}
for i, rect in enumerate(TOWERS):
    k = "B" if i == STREET else "C"        # architect's block key: B on the main road (north), C to the south
    BLOCKS[k] = [build_tower("Tower " + k, rect)]

os.makedirs(os.path.abspath(OUT_DIR), exist_ok=True)
for k, objects in sorted(BLOCKS.items()):
    for ob in bpy.context.scene.objects:
        ob.select_set(ob in objects)
    path = os.path.join(OUT_DIR, k + ".glb")
    # Same exporter settings for every block (and for the merged file), so blocks always merge cleanly.
    bpy.ops.export_scene.gltf(filepath=path, use_selection=True, export_format="GLB", export_apply=True,
                              export_yup=True, export_cameras=False, export_lights=False)
    print("Wrote", path, os.path.getsize(path) // 1024, "KB")
if "--blend" in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.abspath(OUT_DIR), "complex.blend"))
