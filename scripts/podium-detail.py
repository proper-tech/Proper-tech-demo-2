"""
Facade detail for block A (the podium), so it reads like the towers: framed two-pane windows with white
reveals and sills on the 2nd and 3rd floors, metal mullions and transoms on the shopfronts and on the
glazed north-west end, and a canopy with a warm downlight strip over the shopfronts.

It reads the podium's glass from public/models/blocks/A.glb (decompressed: Blender's glTF importer here
may lack Draco; `node scripts/gltf-decompress.mjs in.glb out.glb`) and writes only the new pieces to
public/models/blocks/A-detail.glb, in the same site-plan frame, so the podium model itself (baked
occlusion, media screen, roof garden, people) stays as it is. BuildingScene loads the two side by side.

  blender --background --python scripts/podium-detail.py -- <A.glb, decompressed> public/models/blocks/A-detail.glb
"""
import sys
import bpy, bmesh
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
SRC, OUT = ARGS[0], ARGS[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
pod = bpy.data.objects["Podium"]
me, mw = pod.data, pod.matrix_world
from mathutils.bvhtree import BVHTree
_bm = bmesh.new(); _bm.from_mesh(me); _bm.transform(mw)
BVH = BVHTree.FromBMesh(_bm)
# glTF stores triangles: join them back into the facade's quads
_q = _bm.copy()
bmesh.ops.join_triangles(_q, faces=_q.faces, angle_face_threshold=0.05, angle_shape_threshold=3.0, cmp_materials=True)


def outward(c, n):
    """The glass's normal may face in or out; out is the side with no wall within 1.5 m."""
    hit = BVH.ray_cast(c + n * 0.03, n, 1.5)[0]
    return -n if hit is not None else n


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
    "frame": material("A Frame Metal", (0.30, 0.33, 0.37), 0.6, 0.35),      # like the towers' mullions
    "reveal": material("A Reveal White", (0.86, 0.86, 0.85), 0.0, 0.5),
    "canopy": material("A Canopy", (0.16, 0.17, 0.19), 0.5, 0.4),
    "light": material("A Canopy Light", (1.0, 0.86, 0.66), 0.0, 0.5, emission=(1.0, 0.82, 0.58)),
}
ORDER = list(MATS)
bm = bmesh.new()


def box(o, t, n, a0, a1, d0, d1, z0, z1, key):
    """Box on a facade: along t from a0 to a1, out along n from d0 to d1, heights z0..z1 (o on the facade line)."""
    vs = []
    for z in (z0, z1):
        for a, d in ((a0, d0), (a1, d0), (a1, d1), (a0, d1)):
            p = o + t * a + n * d
            vs.append(bm.verts.new((p.x, p.y, z)))
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    for f in faces:
        try:
            face = bm.faces.new([vs[i] for i in f])
            face.material_index = ORDER.index(key)
        except ValueError:
            pass


def glass_quads(name):
    out = []
    idx = [i for i, m in enumerate(me.materials) if m.name == name]
    for f in _q.faces:
        if f.material_index not in idx or len(f.verts) != 4:
            continue
        vs = [v.co.copy() for v in f.verts]
        n = f.normal.copy()
        if abs(n.z) > 0.1:
            continue
        n = Vector((n.x, n.y, 0)).normalized()
        c = sum(vs, Vector()) / 4
        n = outward(c, n)
        low = sorted(vs, key=lambda v: v.z)[:2]
        a, b = low
        t = Vector((b.x - a.x, b.y - a.y, 0))
        L = t.length
        if L < 0.2:
            continue
        t.normalize()
        z0, z1 = min(v.z for v in vs), max(v.z for v in vs)
        out.append(dict(o=Vector((a.x, a.y, 0)), t=t, n=n, L=L, z0=z0, z1=z1))
    return out


# --- 2nd/3rd-floor punched windows: reveal, frame, centre mullion, transom, sill
win = [g for g in glass_quads("Glass") if 1.6 < g["z1"] - g["z0"] < 2.4]
for g in win:
    o, t, n, L, z0, z1 = g["o"], g["t"], g["n"], g["L"], g["z0"], g["z1"]
    r = 0.14                                                       # white reveal round the window
    box(o, t, n, -r, 0, 0.0, 0.16, z0 - r, z1 + r, "reveal")
    box(o, t, n, L, L + r, 0.0, 0.16, z0 - r, z1 + r, "reveal")
    box(o, t, n, 0, L, 0.0, 0.16, z1, z1 + r, "reveal")
    box(o, t, n, -r - 0.04, L + r + 0.04, 0.0, 0.22, z0 - 0.08, z0, "reveal")   # sill
    f = 0.06                                                       # metal frame
    box(o, t, n, 0, f, 0.0, 0.09, z0, z1, "frame")
    box(o, t, n, L - f, L, 0.0, 0.09, z0, z1, "frame")
    box(o, t, n, 0, L, 0.0, 0.09, z1 - f, z1, "frame")
    box(o, t, n, 0, L, 0.0, 0.09, z0, z0 + f, "frame")
    box(o, t, n, L / 2 - 0.03, L / 2 + 0.03, 0.0, 0.08, z0, z1, "frame")           # two panes
    zt = z0 + (z1 - z0) * 0.72
    box(o, t, n, 0, L, 0.0, 0.08, zt - 0.03, zt + 0.03, "frame")                  # top-light transom

# --- glazed north-west end and glazed volume: metal mullions at every panel edge, transoms every 1.8 m
tall = [g for g in glass_quads("Glass") if g["z1"] - g["z0"] > 8]
for g in tall:
    o, t, n, L, z0, z1 = g["o"], g["t"], g["n"], g["L"], g["z0"], g["z1"]
    for a in (0, L):
        box(o, t, n, a - 0.04, a + 0.04, 0.0, 0.14, z0, z1, "frame")
    z = z0 + 1.8
    while z < z1 - 0.3:
        box(o, t, n, 0, L, 0.0, 0.1, z - 0.04, z + 0.04, "frame")
        z += 1.8

# --- 1st-floor shopfronts: mullions, a transom under the clerestory, and a canopy with a light strip
shop = glass_quads("Glass Shopfront")
for g in shop:
    o, t, n, L, z0, z1 = g["o"], g["t"], g["n"], g["L"], g["z0"], g["z1"]
    for a in (0, L):
        box(o, t, n, a - 0.04, a + 0.04, 0.0, 0.12, z0, z1, "frame")
    zt = z0 + (z1 - z0) * 0.74
    box(o, t, n, 0, L, 0.0, 0.1, zt - 0.05, zt + 0.05, "frame")
    box(o, t, n, 0, L, 0.0, 0.1, z0, z0 + 0.12, "frame")                          # base rail
    zc = z1 + 0.02                                                                 # canopy over the shopfront
    box(o, t, n, -0.02, L + 0.02, 0.0, 1.25, zc, zc + 0.16, "canopy")
    box(o, t, n, 0.05, L - 0.05, 1.05, 1.15, zc - 0.012, zc, "light")

mesh = bpy.data.meshes.new("A Facade Detail")
bm.to_mesh(mesh)
bm.free()
for k in ORDER:
    mesh.materials.append(MATS[k])
ob = bpy.data.objects.new("A Facade Detail", mesh)
bpy.context.scene.collection.objects.link(ob)
print("windows", len(win), "tall panels", len(tall), "shopfront panels", len(shop), "faces", len(mesh.polygons))

for o in bpy.context.scene.objects:
    o.select_set(o is ob)
bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True,
                          export_apply=True, export_cameras=False, export_lights=False, export_animations=False)
print("wrote", OUT)
