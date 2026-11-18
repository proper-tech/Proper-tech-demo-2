"""
Block A roof playground (4th floor terrace, level +11.7) for the Tenger Residence model.

Run inside Blender with A.blend (or A.glb imported) open:
    exec(open("scripts/build-roof-garden-A.py").read())

Data (site-plan coordinates u, v in metres; Blender X = u, Y = v, Z up):
    scripts/roof-garden-A.json          DWG playground block + sheet 17: outline, plants, rubber pads,
                                        slide area, fitness ovals and machines, pavilion, stair exit
    scripts/roof-garden-A-derived.json  paved area / planting band / climbing-bridge centre line,
                                        derived from the hedge lines of the same drawing
Everything is built into the collection "A_RoofGarden" (rebuilt on every run) with plain
Principled materials so it survives the glTF export used by the web viewer.
"""
import bpy, bmesh, json, math, os, random
from mathutils import Vector, Matrix, noise

ROOT = os.path.dirname(os.path.abspath(bpy.data.filepath))           # public/models/blocks
PROJ = os.path.abspath(os.path.join(ROOT, "..", "..", ".."))
D = bpy.data
ENV = json.load(open(os.path.join(PROJ, "scripts", "roof-garden-A.json")))
DER = json.load(open(os.path.join(PROJ, "scripts", "roof-garden-A-derived.json")))
Z = ENV["level"]                                                    # 11.7
rng = random.Random(4)

# ------------------------------------------------------------------ collection
COLL = D.collections.get("A_RoofGarden")
if COLL is None:
    COLL = D.collections.new("A_RoofGarden")
    bpy.context.scene.collection.children.link(COLL)
for o in list(COLL.objects):
    D.objects.remove(o)
for m in list(D.meshes):
    if m.users == 0 and m.name.startswith("RG_"):
        D.meshes.remove(m)


# ------------------------------------------------------------------ materials
def mat(name, color, rough=0.6, metal=0.0, emit=None):
    m = D.materials.get(name) or D.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 1.5
    m.diffuse_color = (*color, 1)
    return m


def tile_image(name, size=512, tiles=4, base=(0.80, 0.78, 0.74), joint=(0.62, 0.60, 0.57)):
    """A paving tile texture: tiles x tiles slabs with joints and a little colour variation."""
    img = D.images.get(name)
    if img is None:
        img = D.images.new(name, size, size)
    r = random.Random(1)
    t = size // tiles
    shade = [[r.uniform(-0.035, 0.035) for _ in range(tiles)] for _ in range(tiles)]
    px = []
    for y in range(size):
        for x in range(size):
            if x % t < 3 or y % t < 3:
                c = joint
            else:
                s = shade[y // t][x // t] + r.uniform(-0.012, 0.012)
                c = (base[0] + s, base[1] + s, base[2] + s)
            px.extend((c[0], c[1], c[2], 1.0))
    img.pixels[:] = px
    img.pack()
    return img


def tex_mat(name, img, rough=0.75):
    m = D.materials.get(name) or D.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    tn = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None) or nt.nodes.new("ShaderNodeTexImage")
    tn.image = img
    nt.links.new(tn.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (0.78, 0.76, 0.72, 1)
    return m


M = {
    "deck": tex_mat("RG_Deck_Tiles", tile_image("RG_DeckTiles")),
    "soil": mat("RG_Planting_Ground", (0.10, 0.17, 0.06), 0.95),
    "curb": mat("RG_Planter_Curb", (0.86, 0.85, 0.82), 0.6),
    "leaf1": mat("RG_Leaf_Dark", (0.05, 0.13, 0.03), 0.8),
    "leaf2": mat("RG_Leaf_Mid", (0.10, 0.24, 0.05), 0.8),
    "leaf3": mat("RG_Leaf_Light", (0.20, 0.36, 0.08), 0.8),
    "fl_pink": mat("RG_Flower_Pink", (0.85, 0.25, 0.45), 0.6),
    "fl_red": mat("RG_Flower_Red", (0.70, 0.06, 0.08), 0.6),
    "fl_white": mat("RG_Flower_White", (0.92, 0.92, 0.88), 0.6),
    "fl_yellow": mat("RG_Flower_Yellow", (0.95, 0.75, 0.10), 0.6),
    "rub_blue": mat("RG_Rubber_Blue", (0.10, 0.42, 0.80), 0.9),
    "rub_lblue": mat("RG_Rubber_LightBlue", (0.40, 0.68, 0.92), 0.9),
    "rub_red": mat("RG_Rubber_Terracotta", (0.78, 0.33, 0.20), 0.9),
    "wood": mat("RG_Wood", (0.55, 0.32, 0.15), 0.7),
    "corten": mat("RG_Corten", (0.62, 0.27, 0.10), 0.65, 0.3),
    "steel": mat("RG_Steel", (0.72, 0.73, 0.75), 0.35, 0.9),
    "dark": mat("RG_Dark_Metal", (0.05, 0.05, 0.06), 0.4, 0.7),
    "orange": mat("RG_Play_Orange", (0.95, 0.42, 0.08), 0.5),
    "yellow": mat("RG_Play_Yellow", (0.98, 0.78, 0.10), 0.5),
    "green": mat("RG_Play_Green", (0.25, 0.65, 0.20), 0.5),
    "blue": mat("RG_Play_Blue", (0.10, 0.45, 0.85), 0.5),
    "rope": mat("RG_Rope", (0.80, 0.72, 0.55), 0.9),
    "glass": mat("RG_Glass", (0.45, 0.55, 0.60), 0.08, 0.2),
    "white": mat("RG_White", (0.92, 0.92, 0.90), 0.5),
    "lamp": mat("RG_Lamp_Glow", (1.0, 0.95, 0.85), 0.3, 0.0, (1.0, 0.92, 0.75)),
}
ORDER = list(M.keys())
MI = {k: i for i, k in enumerate(ORDER)}


class Builder:
    """Collects geometry for one object; faces carry a material key."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()

    def _mark(self, faces, key):
        for f in faces:
            f.material_index = MI[key]

    def poly(self, pts, z, key, flip=False):
        vs = [self.bm.verts.new((x, y, z)) for x, y in pts]
        f = self.bm.faces.new(vs)
        if (f.normal.z < 0) != flip:
            f.normal_flip()
        self._mark([f], key)
        return f

    def prism(self, pts, z0, z1, key, top_key=None):
        bot = [self.bm.verts.new((x, y, z0)) for x, y in pts]
        top = [self.bm.verts.new((x, y, z1)) for x, y in pts]
        fs = [self.bm.faces.new(top), self.bm.faces.new(list(reversed(bot)))]
        n = len(pts)
        side = [self.bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i])) for i in range(n)]
        self._mark(side + fs[1:], key)
        self._mark(fs[:1], top_key or key)
        return fs + side

    def box(self, c, s, key, rot=0.0):
        m = Matrix.Translation(c) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Diagonal((*s, 1))
        r = bmesh.ops.create_cube(self.bm, size=1, matrix=m)
        self._mark({f for v in r["verts"] for f in v.link_faces}, key)

    def cyl(self, p0, p1, r0, key, r1=None, seg=10):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        m = Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, segments=seg, radius1=r0,
                                  radius2=r0 if r1 is None else r1, depth=d.length, matrix=m)
        self._mark({f for v in r["verts"] for f in v.link_faces}, key)

    def blob(self, c, rx, ry, rz, key, sub=2, wob=0.12):
        r = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1,
                                       matrix=Matrix.Translation(c) @ Matrix.Diagonal((rx, ry, rz, 1)))
        for v in r["verts"]:
            v.co += (v.co - Vector(c)).normalized() * wob * min(rx, rz) * noise.noise(v.co * 2.3)
        self._mark({f for v in r["verts"] for f in v.link_faces}, key)

    def finish(self, smooth=False):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        me = D.meshes.new("RG_" + self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        for k in ORDER:
            me.materials.append(M[k])
        if smooth:
            for p in me.polygons:
                p.use_smooth = True
        ob = D.objects.new("RG_" + self.name, me)
        COLL.objects.link(ob)
        # drop unused material slots so the glTF stays small
        used = {p.material_index for p in me.polygons}
        for i in reversed(range(len(me.materials))):
            if i not in used:
                me.materials.pop(index=i)       # pop() shifts the face indices above it
        return ob


def inside(pt, poly):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


def resample(line, step, closed=False):
    P = [Vector((x, y, 0)) for x, y in line] + ([Vector((line[0][0], line[0][1], 0))] if closed else [])
    out, acc = [], 0.0
    seg = list(zip(P, P[1:]))
    total = sum((b - a).length for a, b in seg)
    n = max(2, int(total / step))
    for i in range(n + (0 if closed else 1)):
        s = total * i / n
        acc = 0.0
        for a, b in seg:
            l = (b - a).length
            if acc + l >= s - 1e-9:
                out.append(a.lerp(b, (s - acc) / l if l else 0))
                break
            acc += l
    return out


def strip_line(B, pts, half, z0, z1, key, closed=True):
    """A continuous band along a polyline (planter curbs)."""
    P = [Vector((x, y, 0)) for x, y in pts]
    n = len(P)
    L, R = [], []
    for i in range(n):
        a = P[i - 1] if (closed or i > 0) else P[i]
        b = P[(i + 1) % n] if (closed or i < n - 1) else P[i]
        d = (b - a).normalized()
        nrm = Vector((-d.y, d.x, 0))
        L.append(P[i] + nrm * half)
        R.append(P[i] - nrm * half)
    rng_ = range(n) if closed else range(n - 1)
    for i in rng_:
        j = (i + 1) % n
        q = [L[i], L[j], R[j], R[i]]
        B.prism([(v.x, v.y) for v in q], z0, z1, key)


# ================================================================== 1. paving and planting
paved = DER["paved"][0]["ext"]
B = Builder("Deck")
f = B.poly(paved, Z + 0.012, "deck")
bmesh.ops.triangulate(B.bm, faces=[f], ngon_method="EAR_CLIP")
uv = B.bm.loops.layers.uv.new("UVMap")
for face in B.bm.faces:
    for l in face.loops:
        l[uv].uv = (l.vert.co.x / 2.4, l.vert.co.y / 2.4)       # 4 x 4 tiles of 0.6 m per texture
B.finish()

SOIL = Z + 0.40
B = Builder("Planting")
for t in DER["bandTris"]:
    B.poly(t, SOIL, "soil")
# planter curb along the paved edge: 0.18 m wide, 0.55 m above the deck
strip_line(B, DER["pavedEdge"][0], 0.09, Z, Z + 0.55, "curb")
B.finish()

# ================================================================== 2. lush planting (render: shrubs + flowers)
def in_band(p):
    return any(inside(p, g["ext"]) and not any(inside(p, h) for h in g["holes"]) for g in DER["band"])


plants = [tuple(p) for p in ENV["plants"]]                         # 76 drawn plants
# Only the shrubs drawn on sheet 17 (76 dots along the planting band); no filler.
filler = []
r2 = random.Random(9)

# Leafy clipped shrub, the same model as the street hedge in environment.blend: a dark inner
# mass covered with small leaf cards, lighter on top (vertex colour "Col", read by the material
# and exported to glTF as COLOR_0). One mesh, shared by every shrub object.
def leaf_material():
    m = D.materials.get("RG_Leaves") or D.materials.new("RG_Leaves")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    at = nt.nodes.new("ShaderNodeVertexColor")
    at.layer_name = "Col"
    nt.links.new(at.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.7
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    m.diffuse_color = (0.10, 0.22, 0.06, 1)
    return m


def leafy_shrub(name, seed, rx=0.6, rz=0.53):
    old = D.meshes.get(name)
    if old:
        old.name = name + "_old"
    r = random.Random(seed)
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    c = Vector((0, 0, rz))
    res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1,
                                     matrix=Matrix.Translation(c) @ Matrix.Diagonal((rx * 0.94, rx * 0.94, rz * 0.94, 1)))
    for v in res["verts"]:
        v.co.z = max(v.co.z, 0.03)
    for f in bm.faces:
        for l in f.loops:
            l[col] = (0.03, 0.07, 0.02, 1)
    for _ in range(int(2500 * rx * rx)):
        while True:
            d = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1)))
            if 0.2 < d.length <= 1:
                break
        d.normalize()
        if d.z < -0.5:
            continue
        p = c + Vector((d.x * rx, d.y * rx, d.z * rz)) * r.uniform(0.97, 1.06)
        nrm = (d + Vector((r.uniform(-.6, .6), r.uniform(-.6, .6), r.uniform(-.3, .6)))).normalized()
        t1 = nrm.orthogonal().normalized()
        t1.rotate(Matrix.Rotation(r.uniform(0, 6.283), 3, nrm))
        t2 = nrm.cross(t1)
        L = r.uniform(0.09, 0.14)
        W = L * 0.55
        f = bm.faces.new([bm.verts.new(p + t1 * L / 2), bm.verts.new(p + t2 * W / 2),
                          bm.verts.new(p - t1 * L / 2), bm.verts.new(p - t2 * W / 2)])
        sun = (d.z + 1) / 2
        g = r.uniform(.8, 1.15)
        for l in f.loops:
            l[col] = ((0.04 + 0.06 * sun) * g, (0.10 + 0.12 * sun) * g, (0.025 + 0.03 * sun) * g, 1)
    me = D.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(leaf_material())
    for p in me.polygons:
        p.use_smooth = True
    if old:
        D.meshes.remove(old)
    return me


SHRUBS = [leafy_shrub("RG_Shrub_Round", 9), leafy_shrub("RG_Shrub_Round_B", 17, 0.62, 0.5),
          leafy_shrub("RG_Shrub_Low", 23, 0.55, 0.38)]
spots = [(x, y, r2.uniform(0.95, 1.1)) for x, y in plants]
for i, (x, y, s) in enumerate(spots):
    me = SHRUBS[i % 3]
    ob = D.objects.new(f"RG_Shrub_{i + 1:03d}", me)
    ob.location = (x, y, SOIL - 0.05)
    ob.rotation_euler = (0, 0, r2.uniform(0, 6.283))
    ob.scale = (s, s, s * r2.uniform(0.92, 1.05))
    COLL.objects.link(ob)

# ================================================================== 3. rubber safety surfacing
B = Builder("Rubber")
for c in ENV["rubberPads"]:
    B.prism(c, Z, Z + 0.05, "rub_blue")
for k in ENV["slideArea"]:
    B.prism(k, Z, Z + 0.05, "rub_red")
for o in ENV["fitnessAreas"]:
    B.prism(o, Z, Z + 0.05, "rub_lblue")
B.finish()
Z1 = Z + 0.05

# ================================================================== 4. climbing bridge on the kidney (rope bridge between two towers + slide)
cl = resample(DER["kidneyCL"], 0.8)
B = Builder("ClimbingBridge")
H0, HB = 1.4, 1.1                                                   # tower deck, bridge deck heights


def tower(c, d, roof_key):
    nrm = Vector((-d.y, d.x, 0))
    corners = [c + d * sx * 0.65 + nrm * sy * 0.65 for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    for p in corners:
        B.cyl((p.x, p.y, Z1), (p.x, p.y, Z1 + 2.9), 0.06, "wood", seg=8)
    B.prism([(p.x, p.y) for p in corners], Z1 + H0 - 0.06, Z1 + H0, "wood")
    apex = (c.x, c.y, Z1 + 3.5)
    ring = [B.bm.verts.new((p.x + (p - c).x * 0.25, p.y + (p - c).y * 0.25, Z1 + 2.85)) for p in corners]
    top = B.bm.verts.new(apex)
    for i in range(4):
        f = B.bm.faces.new((ring[i], ring[(i + 1) % 4], top))
        B._mark([f], roof_key)
    # side panels on two sides
    for i in (1, 3):
        a, b = corners[i], corners[(i + 1) % 4]
        q = [(a.x, a.y), (b.x, b.y), (b.x + nrm.x * 0.02, b.y + nrm.y * 0.02), (a.x + nrm.x * 0.02, a.y + nrm.y * 0.02)]
        B.prism(q, Z1 + H0, Z1 + H0 + 0.75, "blue" if roof_key == "orange" else "green")


d0 = (cl[1] - cl[0]).normalized()
d1 = (cl[-1] - cl[-2]).normalized()
tower(cl[0] - d0 * 0.4, d0, "orange")
tower(cl[-1] + d1 * 0.4, d1, "green")
# bridge planks and rope rails following the curve, sagging slightly in the middle
n = len(cl)
for i in range(n - 1):
    a, b = cl[i], cl[i + 1]
    t = (i + 0.5) / (n - 1)
    zz = Z1 + HB - 0.25 * math.sin(math.pi * t)
    d = (b - a)
    m = (a + b) / 2
    B.box((m.x, m.y, zz), (d.length * 0.8, 0.85, 0.05), "wood", rot=math.atan2(d.y, d.x))
for i, p in enumerate(cl):
    if i % 2:
        continue
    d = ((cl[min(i + 1, n - 1)] - cl[max(i - 1, 0)])).normalized()
    nrm = Vector((-d.y, d.x, 0))
    t = i / (n - 1)
    zz = Z1 + HB - 0.25 * math.sin(math.pi * t)
    for s in (1, -1):
        q = p + nrm * 0.5 * s
        B.cyl((q.x, q.y, Z1), (q.x, q.y, zz + 0.95), 0.045, "orange" if (i // 2) % 2 else "yellow", seg=8)
for s in (1, -1):                                                   # hand ropes
    for h in (0.5, 0.9):
        for i in range(n - 1):
            ta, tb = i / (n - 1), (i + 1) / (n - 1)
            da = (cl[min(i + 1, n - 1)] - cl[max(i - 1, 0)]).normalized()
            db = (cl[min(i + 2, n - 1)] - cl[i]).normalized()
            pa = cl[i] + Vector((-da.y, da.x, 0)) * 0.5 * s
            pb = cl[i + 1] + Vector((-db.y, db.x, 0)) * 0.5 * s
            za = Z1 + HB - 0.25 * math.sin(math.pi * ta) + h
            zb = Z1 + HB - 0.25 * math.sin(math.pi * tb) + h
            B.cyl((pa.x, pa.y, za), (pb.x, pb.y, zb), 0.02, "rope", seg=5)
# slide from the first tower, away from the bridge
s0 = cl[0] - d0 * 1.05
s1 = cl[0] - d0 * 3.3
nrm = Vector((-d0.y, d0.x, 0))
steps = 8
for i in range(steps):
    t0, t1 = i / steps, (i + 1) / steps
    a = s0.lerp(s1, t0)
    b = s0.lerp(s1, t1)
    za = Z1 + H0 * (1 - t0) ** 1.4 + 0.15
    zb = Z1 + H0 * (1 - t1) ** 1.4 + 0.15
    q = [(a + nrm * 0.3), (b + nrm * 0.3), (b - nrm * 0.3), (a - nrm * 0.3)]
    vs = [B.bm.verts.new((v.x, v.y, z)) for v, z in zip(q, (za, zb, zb, za))]
    f = B.bm.faces.new(vs)
    B._mark([f], "yellow")
    for sgn in (1, -1):
        e = [B.bm.verts.new((v.x, v.y, z)) for v, z in
             ((a + nrm * 0.3 * sgn, za), (b + nrm * 0.3 * sgn, zb), (b + nrm * 0.3 * sgn, zb + 0.25), (a + nrm * 0.3 * sgn, za + 0.25))]
        B._mark([B.bm.faces.new(e)], "yellow")
B.finish(smooth=False)

# ================================================================== 5. spring riders in the blue circles
B = Builder("SpringRiders")
for (cx, cy), col in zip(ENV["playsets"][:2], ("orange", "green")):
    for k, (dx, dy, yaw) in enumerate(((-0.6, 0.2, 0.3), (0.6, -0.3, 2.2))):
        x, y = cx + dx, cy + dy
        B.cyl((x, y, Z1), (x, y, Z1 + 0.05), 0.25, "dark", seg=12)
        for j in range(8):                                          # coil spring
            a0, a1 = j * 1.6, (j + 1) * 1.6
            B.cyl((x + 0.09 * math.cos(a0), y + 0.09 * math.sin(a0), Z1 + 0.05 + j * 0.045),
                  (x + 0.09 * math.cos(a1), y + 0.09 * math.sin(a1), Z1 + 0.05 + (j + 1) * 0.045), 0.018, "dark", seg=5)
        B.blob((x, y, Z1 + 0.62), 0.38, 0.14, 0.17, col if k == 0 else "yellow", sub=2, wob=0)  # body
        hx, hy = x + 0.3 * math.cos(yaw), y + 0.3 * math.sin(yaw)
        B.blob((hx, hy, Z1 + 0.85), 0.14, 0.12, 0.15, col if k == 0 else "yellow", sub=2, wob=0)  # head
        B.cyl((hx - 0.05, hy - 0.2, Z1 + 0.8), (hx - 0.05, hy + 0.2, Z1 + 0.8), 0.02, "steel", seg=6)
B.finish(smooth=True)

# ================================================================== 6. outdoor fitness machines (8, from the drawing)
B = Builder("Fitness")
for x, y, a in ENV["fitness"]:
    yaw = math.radians(a)
    d = Vector((math.cos(yaw), math.sin(yaw), 0))
    nrm = Vector((-d.y, d.x, 0))
    p = Vector((x, y, 0))
    l, r = p + nrm * 0.45, p - nrm * 0.45
    for q in (l, r):
        B.cyl((q.x, q.y, Z1), (q.x, q.y, Z1 + 1.55), 0.055, "green", seg=10)
    B.cyl((l.x, l.y, Z1 + 1.5), (r.x, r.y, Z1 + 1.5), 0.05, "green", seg=10)
    for s in (1, -1):                                               # pendulum arms with foot plates
        q = p + nrm * 0.18 * s
        B.cyl((q.x, q.y, Z1 + 1.5), (q.x + d.x * 0.1, q.y + d.y * 0.1, Z1 + 0.35), 0.03, "yellow", seg=8)
        B.box((q.x + d.x * 0.12, q.y + d.y * 0.12, Z1 + 0.33), (0.32, 0.16, 0.03), "dark", rot=yaw)
        B.cyl((q.x, q.y, Z1 + 1.45), (q.x - d.x * 0.25, q.y - d.y * 0.25, Z1 + 1.05), 0.022, "yellow", seg=6)
B.finish(smooth=False)

# ================================================================== 7. hexagonal timber play pavilion
hexp = [Vector((x, y, 0)) for x, y in ENV["pavilion"][0]]
c = sum(hexp, Vector()) / 6
B = Builder("Pavilion")
inner = [c + (p - c) * 0.93 for p in hexp]
B.prism([(p.x, p.y) for p in inner], Z1, Z1 + 0.25, "wood")                       # base deck
B.prism([(p.x, p.y) for p in [c + (p - c) * 0.55 for p in hexp]], Z1 + 1.6, Z1 + 1.7, "wood")  # upper level
for i, p in enumerate(inner):
    B.cyl((p.x, p.y, Z1 + 0.25), (p.x, p.y, Z1 + 3.3), 0.1, "corten", seg=6)
    q = c + (p - c) * 0.55
    B.cyl((q.x, q.y, Z1 + 0.25), (q.x, q.y, Z1 + 1.6), 0.07, "wood", seg=6)
for i in range(6):                                                  # slatted corten panels on 4 sides, 2 open
    if i in (1, 4):
        continue
    a, b = inner[i], inner[(i + 1) % 6]
    d = (b - a)
    for k in range(9):
        t = (k + 0.5) / 9
        m = a.lerp(b, t)
        B.box((m.x, m.y, Z1 + 1.35), (0.07, 0.07, 2.1), "corten" if k % 2 else "wood", rot=math.atan2(d.y, d.x))
    m = (a + b) / 2
    B.box((m.x, m.y, Z1 + 2.45), (d.length, 0.08, 0.12), "wood", rot=math.atan2(d.y, d.x))
# low hexagonal roof with timber ribs
rim = [B.bm.verts.new((c.x + (p - c).x * 1.08, c.y + (p - c).y * 1.08, Z1 + 3.3)) for p in hexp]
apex = B.bm.verts.new((c.x, c.y, Z1 + 4.1))
for i in range(6):
    B._mark([B.bm.faces.new((rim[i], rim[(i + 1) % 6], apex))], "corten")
for p in hexp:
    q = c + (p - c) * 1.08
    B.cyl((q.x, q.y, Z1 + 3.32), (c.x, c.y, Z1 + 4.12), 0.06, "wood", seg=6)
# a small climbing ladder at one open side
a, b = inner[1], inner[2]
m = (a + b) / 2
d = (b - a).normalized()
out = (m - c).normalized()
for s in (-0.25, 0.25):
    q = m + d * s + out * 0.3
    B.cyl((q.x, q.y, Z1), (m.x + d.x * s, m.y + d.y * s, Z1 + 1.7), 0.035, "yellow", seg=6)
for k in range(5):
    t = (k + 1) / 6
    q0 = (m + d * -0.25 + out * 0.3).lerp(m + d * -0.25, t)
    q1 = (m + d * 0.25 + out * 0.3).lerp(m + d * 0.25, t)
    B.cyl((q0.x, q0.y, Z1 + 1.7 * t), (q1.x, q1.y, Z1 + 1.7 * t), 0.025, "steel", seg=6)
B.finish()

# ================================================================== 8. glazed stair exit next to tower C
ex = ENV["exitBox"][0][:-1]
B = Builder("StairExit")
B.prism(ex, Z, Z + 3.0, "glass", top_key="glass")
xs = [p[0] for p in ex]
ys = [p[1] for p in ex]
B.box(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, Z + 3.08), (max(xs) - min(xs) + 0.3, max(ys) - min(ys) + 0.3, 0.16), "white")
for x in (min(xs), max(xs)):
    for y in (min(ys), max(ys)):
        B.box((x, y, Z + 1.5), (0.1, 0.1, 3.0), "dark")
for k in range(1, 6):
    x = min(xs) + (max(xs) - min(xs)) * k / 6
    B.box((x, max(ys), Z + 1.5), (0.05, 0.06, 3.0), "dark")
B.finish()

# ================================================================== 9. garden lamps and benches along the paths
B = Builder("LampsBenches")
ring = resample(DER["pavedEdge"][0], 6.5, closed=True)
lamp_pts = []
for i, p in enumerate(ring):
    a = ring[i - 1]
    b = ring[(i + 1) % len(ring)]
    d = (b - a).normalized()
    nrm = Vector((-d.y, d.x, 0))
    q = p + nrm * 0.45
    if not inside((q.x, q.y), paved):
        q = p - nrm * 0.45
    lamp_pts.append(q)
    B.cyl((q.x, q.y, Z1), (q.x, q.y, Z1 + 3.2), 0.045, "dark", seg=8)
    B.cyl((q.x, q.y, Z1 + 3.2), (q.x, q.y, Z1 + 3.45), 0.11, "lamp", r1=0.07, seg=10)
    B.cyl((q.x, q.y, Z1 + 3.45), (q.x, q.y, Z1 + 3.5), 0.13, "dark", seg=10)
    if i % 2 == 0:                                                  # bench next to every other lamp
        bq = q + d * 1.4
        yaw = math.atan2(d.y, d.x)
        B.box((bq.x, bq.y, Z1 + 0.42), (1.6, 0.42, 0.05), "wood", rot=yaw)
        for s in (-0.65, 0.65):
            lq = bq + d * s
            B.box((lq.x, lq.y, Z1 + 0.2), (0.06, 0.4, 0.4), "dark", rot=yaw)
B.finish()

print("A_RoofGarden:", {o.name: len(o.data.polygons) for o in COLL.objects},
      "plants", len(plants), "filler", len(filler), "lamps", len(lamp_pts))
