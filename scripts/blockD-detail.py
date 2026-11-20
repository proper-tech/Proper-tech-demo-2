"""
Facade detail for block D (the service and parking building), so it reads like the podium and the
towers: a dark plinth, accent bands at the floor slabs, a metal coping on the parapet, framed windows
with reveals, sills and mullions, mullions, a transom and a lit canopy over the shopfront, a framed and
grooved pair of garage doors with a light over each, a faceted metal panel wall on the blank west side
(the podium's triangle panels), a lit name sign, and plant on the roof.

Reads the annex from complex.glb (decompressed: `node scripts/gltf-decompress.mjs in.glb out.glb`) and
writes only the new pieces to public/models/blocks/D-detail.glb, in the same frame; BuildingScene loads
it beside the complex. Material names match the podium's (A-detail.glb, complex.glb) so the night
lighting picks them up.

  python3 scripts/blockD-detail.py -- <complex.glb, decompressed> public/models/blocks/D-detail.glb
"""
import sys, math, random
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
SRC, OUT = ARGS[0], ARGS[1]
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
an = bpy.data.objects["Annex"]
me, mw = an.data, an.matrix_world
src = bmesh.new(); src.from_mesh(me); src.transform(mw)
BVH = BVHTree.FromBMesh(src)
q = src.copy()
bmesh.ops.join_triangles(q, faces=q.faces, angle_face_threshold=0.05, angle_shape_threshold=3.0, cmp_materials=True)
NAMES = [m.name for m in me.materials]


def material(name, color, metallic=0.0, roughness=0.5, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = roughness
    if emission:
        p.inputs["Emission Color"].default_value = (*emission, 1)
        p.inputs["Emission Strength"].default_value = 1.0
    return m


MATS = {
    "frame": material("A Frame Metal", (0.30, 0.33, 0.37), 0.6, 0.35),
    "reveal": material("A Reveal White", (0.86, 0.86, 0.85), 0.0, 0.5),
    "canopy": material("A Canopy", (0.16, 0.17, 0.19), 0.5, 0.4),
    "light": material("A Canopy Light", (1.0, 0.86, 0.66), 0.0, 0.5, emission=(1.0, 0.82, 0.58)),
    "plinth": material("D Plinth", (0.2, 0.21, 0.23), 0.1, 0.7),
    "band": material("D Band", (0.36, 0.39, 0.43), 0.5, 0.35),
    "tri1": material("A Tri Silver", (0.58, 0.62, 0.65), 0.6, 0.35),
    "tri2": material("A Tri Grey", (0.26, 0.30, 0.34), 0.6, 0.35),
    "tri3": material("A Tri Dark", (0.19, 0.23, 0.27), 0.6, 0.35),
    "plant": material("D Roof Plant", (0.62, 0.64, 0.66), 0.4, 0.5),
    "groove": material("D Groove", (0.12, 0.13, 0.14), 0.3, 0.6),
}
ORDER = list(MATS)
bm = bmesh.new()


def quad(ps, key):
    try:
        f = bm.faces.new([bm.verts.new(p) for p in ps])
        f.material_index = ORDER.index(key)
        return f
    except ValueError:
        return None


def box(o, t, n, a0, a1, d0, d1, z0, z1, key):
    """Box on a facade: along t from a0 to a1, out along n from d0 to d1, heights z0..z1."""
    vs = []
    for z in (z0, z1):
        for a, d in ((a0, d0), (a1, d0), (a1, d1), (a0, d1)):
            p = o + t * a + n * d
            vs.append(bm.verts.new((p.x, p.y, z)))
    for f in [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]:
        try:
            bm.faces.new([vs[i] for i in f]).material_index = ORDER.index(key)
        except ValueError:
            pass


_vs = [v.co for v in src.verts]
CENTRE = Vector((sum(v.x for v in _vs) / len(_vs), sum(v.y for v in _vs) / len(_vs), 0))


def outward(c, n):
    """The block is a near-rectangle: out is away from its middle."""
    return n if n.dot(Vector((c.x, c.y, 0)) - CENTRE) > 0 else -n


def frames(matname, vertical_only=True):
    out = []
    for f in q.faces:
        if NAMES[f.material_index] != matname or len(f.verts) != 4:
            continue
        n = f.normal.copy()
        if vertical_only and abs(n.z) > 0.1:
            continue
        vs = [v.co.copy() for v in f.verts]
        n = Vector((n.x, n.y, 0)).normalized()
        c = sum(vs, Vector()) / 4
        n = outward(c, n)
        a, b = sorted(vs, key=lambda v: v.z)[:2]
        t = Vector((b.x - a.x, b.y - a.y, 0))
        L = t.length
        if L < 0.3:
            continue
        t.normalize()
        # keep t so that t x n points up (consistent left-to-right seen from outside)
        if t.cross(n).z < 0:
            a, b = b, a
            t = -t
        out.append(dict(o=Vector((a.x, a.y, 0)), t=t, n=n, L=L, z0=min(v.z for v in vs), z1=max(v.z for v in vs), c=c))
    return out


walls = [w for w in frames("D Cladding") if w["L"] > 10]              # the four main walls
glass = frames("D Glass")
doors = frames("D Garage Door")
curtain = frames("D Curtain Wall")


def on_wall(w, g):
    """Interval of opening g along wall w, if g lies in w's plane."""
    rel = g["c"] - (w["o"] + Vector((0, 0, g["c"].z)))
    if abs(rel.dot(w["n"])) > 0.6 or abs(g["n"].dot(w["n"])) < 0.9:
        return None
    a = rel.dot(w["t"])
    return (a - g["L"] / 2, a + g["L"] / 2, g["z0"], g["z1"])


def free_runs(w, z0, z1, pad=0.12):
    """Stretches of wall w between openings that cross the heights z0..z1."""
    cuts = []
    for g in glass + doors + curtain:
        iv = on_wall(w, g)
        if iv and iv[2] < z1 and iv[3] > z0:
            cuts.append((iv[0] - pad, iv[1] + pad))
    cuts.sort()
    runs, a = [], 0.0
    for c0, c1 in cuts:
        if c0 > a:
            runs.append((a, min(c0, w["L"])))
        a = max(a, c1)
    if a < w["L"]:
        runs.append((a, w["L"]))
    return [r for r in runs if r[1] - r[0] > 0.3]


# --- plinth, slab bands, coping
for w in walls:
    for a0, a1 in free_runs(w, 0.0, 0.55):
        box(w["o"], w["t"], w["n"], a0, a1, 0.0, 0.05, 0.0, 0.55, "plinth")
    for zb in (4.5, 7.8):
        for a0, a1 in free_runs(w, zb - 0.15, zb + 0.15):
            box(w["o"], w["t"], w["n"], a0, a1, 0.0, 0.06, zb - 0.15, zb + 0.15, "band")
    box(w["o"], w["t"], w["n"], -0.12, w["L"] + 0.12, -0.25, 0.1, w["z1"] - 0.02, w["z1"] + 0.1, "band")   # coping

# --- windows: reveal, frame, mullions every ~1.3 m, sill
for g in glass:
    o, t, n, L, z0, z1 = g["o"], g["t"], g["n"], g["L"], g["z0"], g["z1"]
    if z1 - z0 > 3.0:                     # the shopfront, below
        continue
    r = 0.12
    box(o, t, n, -r, 0, 0.0, 0.14, z0 - r, z1 + r, "reveal")
    box(o, t, n, L, L + r, 0.0, 0.14, z0 - r, z1 + r, "reveal")
    box(o, t, n, 0, L, 0.0, 0.14, z1, z1 + r, "reveal")
    box(o, t, n, -r - 0.04, L + r + 0.04, 0.0, 0.2, z0 - 0.07, z0, "reveal")
    f = 0.05
    for a in (0, L - f):
        box(o, t, n, a, a + f, 0.0, 0.08, z0, z1, "frame")
    box(o, t, n, 0, L, 0.0, 0.08, z1 - f, z1, "frame")
    box(o, t, n, 0, L, 0.0, 0.08, z0, z0 + f, "frame")
    k = max(1, round(L / 1.3))
    for i in range(1, k):
        a = L * i / k
        box(o, t, n, a - 0.025, a + 0.025, 0.0, 0.07, z0, z1, "frame")

# --- shopfront: mullions every 1.5 m, transom, base rail, canopy with a light strip, lit sign above
for g in glass:
    o, t, n, L, z0, z1 = g["o"], g["t"], g["n"], g["L"], g["z0"], g["z1"]
    if z1 - z0 <= 3.0:
        continue
    k = max(1, round(L / 1.5))
    for i in range(k + 1):
        a = L * i / k
        box(o, t, n, a - 0.04, a + 0.04, 0.0, 0.12, z0, z1, "frame")
    zt = z0 + (z1 - z0) * 0.74
    box(o, t, n, 0, L, 0.0, 0.1, zt - 0.05, zt + 0.05, "frame")
    box(o, t, n, 0, L, 0.0, 0.1, z0, z0 + 0.12, "frame")
    zc = z1 + 0.04
    box(o, t, n, -0.3, L + 0.3, 0.0, 1.4, zc, zc + 0.18, "canopy")
    box(o, t, n, 0.0, L, 1.2, 1.3, zc - 0.012, zc, "light")
    box(o, t, n, 0.0, L, 0.05, 0.15, zc - 0.012, zc, "light")
    SHOP = g

# --- garage doors: frame, grooves, a light above each
for g in doors:
    o, t, n, L, z0, z1 = g["o"], g["t"], g["n"], g["L"], g["z0"], g["z1"]
    box(o, t, n, -0.18, 0, 0.0, 0.12, z0, z1 + 0.18, "frame")
    box(o, t, n, L, L + 0.18, 0.0, 0.12, z0, z1 + 0.18, "frame")
    box(o, t, n, -0.18, L + 0.18, 0.0, 0.12, z1, z1 + 0.18, "frame")
    z = z0 + 0.5
    while z < z1 - 0.1:
        box(o, t, n, 0.02, L - 0.02, 0.0, 0.015, z - 0.02, z + 0.02, "groove")
        z += 0.5
    box(o, t, n, L / 2 - 0.35, L / 2 + 0.35, 0.0, 0.25, z1 + 0.35, z1 + 0.45, "canopy")
    box(o, t, n, L / 2 - 0.3, L / 2 + 0.3, 0.05, 0.22, z1 + 0.34, z1 + 0.35, "light")

# --- the blank west wall: faceted metal panels like the podium's, on a 1.55 m grid
west = max(walls, key=lambda w: (sum(1 for g in glass if on_wall(w, g)) == 0, w["L"]))
o, t, n, L = west["o"], west["t"], west["n"], west["L"]
zb, zt, s = 0.75, west["z1"] - 0.45, 1.55
nu, nz = int((L - 0.6) // s), int((zt - zb) // s)
u0 = (L - nu * s) / 2
for i in range(nu):
    for j in range(nz):
        a, z = u0 + i * s, zb + j * s
        depth = 0.05 + 0.3 * random.random()
        cen = o + t * (a + s / 2) + n * depth
        cz = z + s / 2
        cs = [(a, z), (a + s, z), (a + s, z + s), (a, z + s)]
        for k in range(4):
            (a0, z0), (a1, z1) = cs[k], cs[(k + 1) % 4]
            p0 = o + t * a0 + n * 0.02
            p1 = o + t * a1 + n * 0.02
            quad([(p0.x, p0.y, z0), (p1.x, p1.y, z1), (cen.x, cen.y, cz), (cen.x, cen.y, cz)][:3] + [], random.choice(["tri1", "tri2", "tri3", "tri1"]))
# frame round the panel field
box(o, t, n, u0 - 0.1, u0 + nu * s + 0.1, 0.0, 0.12, zb - 0.1, zb, "band")
box(o, t, n, u0 - 0.1, u0 + nu * s + 0.1, 0.0, 0.12, zb + nz * s, zb + nz * s + 0.1, "band")

# --- name sign over the shopfront, lit
try:
    g = SHOP
    cu = bpy.data.curves.new("sign", "FONT")
    cu.body = "СЭБОЦЭ"
    cu.size = 1.0
    cu.extrude = 0.04
    cu.align_x = "CENTER"
    ob = bpy.data.objects.new("sign", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    tm = ob.evaluated_get(dg).to_mesh()
    # place: centred on the shopfront, 0.9 m above the canopy, standing on the wall, facing out
    zc = g["z1"] + 0.6
    mid = g["o"] + g["t"] * (g["L"] / 2)
    hit = BVH.ray_cast(Vector((mid.x, mid.y, zc + 0.4)) + g["n"] * 1.5, -g["n"], 4.0)[0]
    c = (Vector((hit.x, hit.y, 0)) if hit is not None else mid) + g["n"] * 0.04
    right = -g["t"]                      # reading direction, seen from outside
    for f in tm.polygons:
        ps = []
        for vi in f.vertices:
            v = tm.vertices[vi].co
            p = c + right * v.x + g["n"] * v.z
            ps.append((p.x, p.y, zc + v.y))
        quad(ps, "light")
    print("sign faces", len(tm.polygons))
except Exception as e:  # no font: no sign
    print("sign skipped", e)

# --- roof plant: two condensing units and a hatch, back from the parapet
roof_z = max(w["z1"] for w in walls) - 0.9
wN = max(walls, key=lambda w: w["o"].y)
for (a, d, sx, sy, h) in ((5.0, -4.0, 2.4, 1.2, 1.3), (9.0, -4.0, 2.4, 1.2, 1.3), (14.0, -9.0, 1.2, 1.2, 0.6)):
    box(wN["o"], wN["t"], wN["n"], a, a + sx, d - sy, d, roof_z, roof_z + h, "plant")
    box(wN["o"], wN["t"], wN["n"], a + 0.15, a + sx - 0.15, d - sy + 0.15, d - 0.15, roof_z + h, roof_z + h + 0.03, "groove")

mesh = bpy.data.meshes.new("D Facade Detail")
bm.normal_update()
bm.to_mesh(mesh)
bm.free()
for k in ORDER:
    mesh.materials.append(MATS[k])
for o2 in list(bpy.data.objects):
    bpy.data.objects.remove(o2)
ob = bpy.data.objects.new("D Facade Detail", mesh)
bpy.context.scene.collection.objects.link(ob)
print("walls", len(walls), "windows", len(glass), "doors", len(doors), "faces", len(mesh.polygons))
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=False, export_yup=True,
                          export_apply=True, export_cameras=False, export_lights=False, export_animations=False)
print("wrote", OUT)
