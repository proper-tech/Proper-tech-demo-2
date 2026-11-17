# Builds public/models/complex.glb for the site's 3D viewer from the architect's site plan.
#
#   blender --background --python scripts/build-model.py -- src/data/site.json public/models/complex.glb
#   (or: pip install bpy; python3 scripts/build-model.py src/data/site.json public/models/complex.glb)
#
# Footprints come from site.json, so the model sits exactly on the site plan drawn by
# three/BuildingScene.tsx (scene x = u, scene z = -v). Heights must match src/data/building.ts.
import bpy, bmesh, json, math, os, random, sys
from mathutils import Vector, Matrix

random.seed(7)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
SITE_JSON = ARGS[0] if len(ARGS) > 0 else "src/data/site.json"
OUT_GLB = ARGS[1] if len(ARGS) > 1 else "public/models/complex.glb"
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

    def box(self, c, s, key, rz=0.0):
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        rot = Matrix.Rotation(rz, 3, "Z")
        v = [self.bm.verts.new(Vector(c) + rot @ Vector((x * hx, y * hy, z * hz)))
             for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
        for q in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
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
# Levels from sections 1-1 and 2-2 of the schematic design; keep in step with src/data/building.ts.
PODIUM_HEIGHT = 11.7               # floor 4: first apartment floor and the podium roof
FLOOR_HEIGHT = 3.0
TECH_FLOOR = 4.0                   # technical floor on top, roof at +54.7
FLOOR_MIN, FLOOR_MAX = 4, 16
FLOORS = FLOOR_MAX - FLOOR_MIN + 1
TOP = PODIUM_HEIGHT + FLOORS * FLOOR_HEIGHT
ANNEX_HEIGHT = 14.0
CHAMFER = 2.4                      # glazed tower corners; BuildingScene.tsx uses the same value
BANDS = ((0.35, 4.1, "glass_l"), (4.9, 7.7, "glass"), (8.5, 11.1, "glass"))   # podium glazing: floors at 0 / 4.5 / 8.1


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


def curtain_wall(b, run):
    """Glazing with mullions and projecting floor bands along an exposed ground-level facade."""
    d = densify(run, 1.5, closed=False)
    for p, q in zip(d, d[1:]):
        for z0, z1, k in BANDS:
            b.fquad(p, q, z0, z1, 0.06, k)
            t = Vector((q[0] - p[0], q[1] - p[1])).normalized() * 0.07
            b.fquad(p, (p[0] + t.x, p[1] + t.y), z0, z1, 0.12, "white")
    for z0, z1, w in ((4.15, 4.85, 0.28), (7.75, 8.45, 0.28)):
        b.strip(d, w, z0, z1, "white")
    return d


# ---------------------------------------------------------------- podium + roof terrace
def build_podium():
    b = Builder("Podium", ["white", "paver", "glass_l", "glass", "hedge", "pink", "blue", "orange", "wood", "metal", "dark"])
    z = PODIUM_HEIGHT
    b.prism(PODIUM, 0, z, "white", "paver")
    for run in open_runs(PODIUM, lambda p, q: not in_tower(outward(p, q, 0.3))):
        d = curtain_wall(b, run)
        b.strip(d, 0.42, 11.15, z + 1.0, "white")                      # terrace parapet
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
        b.box2(x + 0.05, x + 0.15, y0 - 0.2, y1 + 0.2, 5.8, 11.6, "dark")
        for i in range(int((y1 - y0) / s)):
            for j in range(6):
                ya, za = y0 + i * s, 6.0 + j * s
                c = [(ya, za), (ya + s, za), (ya + s, za + s), (ya, za + s)]
                for t in (((0, 1, 2), (0, 2, 3)) if (i + j) % 2 else ((0, 1, 3), (1, 2, 3))):
                    if random.random() < 0.14:
                        continue
                    vs = [b.bm.verts.new((x - random.uniform(0, 0.28), c[k][0], c[k][1])) for k in t]
                    b.bm.faces.new(vs).material_index = b.idx(random.choice(("white", "white", "metal", "metal", "dark")))
    return b.finish()


# ---------------------------------------------------------------- towers
def build_tower(name, rect):
    fp = tower_footprint(*rect)
    cx, cy = (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2
    b = Builder(name, ["white", "glass", "glass_l", "joint", "roof"])
    b.prism(fp, 0, TOP, "white", "roof")
    for run in open_runs(fp, lambda p, q: not inside(outward(p, q, 0.3), PODIUM)):     # street-level floors
        curtain_wall(b, run)
        b.strip(densify(run, 1.5, closed=False), 0.3, 11.15, PODIUM_HEIGHT, "white")
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
    b.prism(crown, TOP, TOP + 1.2, "white", "roof")              # parapet round the technical floor
    b.box((cx, cy, TOP + TECH_FLOOR / 2), (9.5, 8.0, TECH_FLOOR), "white")
    for s in (-1, 1):
        for g in range(5):
            b.box((cx - 3.8 + g * 1.9, cy + s * 4.02, TOP + TECH_FLOOR / 2), (1.6, 0.06, 2.8), "glass")
            b.box((cx + s * 4.77, cy - 3.0 + g * 1.5, TOP + TECH_FLOOR / 2), (0.06, 1.25, 2.8), "glass")
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
    z0, z1 = 4.9, PODIUM_HEIGHT - 0.3
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
    b.box2(lx0, lx1, y1, y1 + 0.25, 5.2, 11.2, "dark")
    for k in range(17):
        b.box(((lx0 + lx1) / 2, y1 + 0.38, 5.4 + k * 0.35), (lx1 - lx0, 0.28, 0.12), "white")
    for (fx, z, w, h) in ((0.27, 10.1, 1.8, 0.9), (0.73, 10.1, 1.6, 0.9), (0.27, 8.4, 1.5, 0.8), (0.73, 8.4, 1.5, 0.8), (0.5, 6.7, 2.6, 0.8)):
        b.box((lx0 + (lx1 - lx0) * fx, y1 + 0.56, z), (w, 0.08, h), "dark")
    b.box2(lx0 - 1, lx1 + 1, y1, y1 + 2.2, 4.2, 4.6, "white")            # entrance canopy
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


# ---------------------------------------------------------------- build + export
build_podium()
for i, rect in enumerate(TOWERS):
    build_tower("Tower " + "AB"[i], rect)
build_screen()
build_annex()
build_cars()
os.makedirs(os.path.dirname(os.path.abspath(OUT_GLB)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False)
print("Wrote", OUT_GLB, os.path.getsize(OUT_GLB) // 1024, "KB")
if "--blend" in sys.argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(os.path.abspath(OUT_GLB))[0] + ".blend")
