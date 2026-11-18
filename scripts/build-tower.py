"""
Towers B (north) and C (south) of the Tenger Residence, rebuilt to match the architect's renders:
white aluminium panel cladding with a fine joint grid, recessed two-pane windows between
white pilasters, a full-height glass strip on the long faces, fully glazed rounded corners
with a white slab edge at every floor, a white parapet band and the white technical floor
on the roof.

Run inside Blender with TOWER = "B" or "C" set in the exec globals; it builds the object
"Tower B"/"Tower C" in the collection "Tower_B"/"Tower_C" and, when EXPORT is True, writes
public/models/blocks/B.glb or C.glb next to the open .blend.

Geometry (site-plan coordinates, metres; Blender X = u, Y = v, Z up):
  footprints    buildings_su.json outlines (corner radius 2.2):
                B u -4.42..18.18, v 9.81..31.81;  C u -11.62..10.98, v -31.59..-9.59
  floors 4-16   z 11.7 .. 50.7, 3.0 m each (src/data/building.ts)
  technical     z 50.7 .. 54.7 on the tech rectangle of each tower (roof.ts)
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

D = bpy.data
# Which tower to build: set TOWER before exec(), or edit here. Footprints from buildings_su.json.
TOWERS = {
    "B": dict(fp=(-4.42, 18.18, 9.81, 31.81), tech=(0.08, 13.68, 14.31, 27.31)),
    "C": dict(fp=(-11.62, 10.98, -31.59, -9.59), tech=(-7.12, 6.48, -27.09, -14.09)),
}
TOWER = globals().get("TOWER", "B")
U0, U1, V0, V1 = TOWERS[TOWER]["fp"]
R = 2.2
Z_BASE, FLOOR_H, N_FLOORS = 11.7, 3.0, 13
Z_ROOF = Z_BASE + N_FLOORS * FLOOR_H              # 50.7
PARAPET = 1.3
TECH = (*TOWERS[TOWER]["tech"], Z_ROOF, Z_ROOF + 4.0)
SPANDREL = 0.9                                    # white band under each window
INSET = 0.22                                      # window recess depth
CORNER_RUN = 1.7                                  # straight glazing either side of each rounded corner
EXPORT = globals().get("EXPORT", True)


# ------------------------------------------------------------------ materials
def tex(name, w, h, draw):
    img = D.images.get(name) or D.images.new(name, w, h)
    if tuple(img.size) != (w, h):
        img.scale(w, h)
    px = [0.0] * (w * h * 4)
    for y in range(h):
        for x in range(w):
            c = draw(x, y)
            i = (y * w + x) * 4
            px[i:i + 4] = (c[0], c[1], c[2], 1.0)
    img.pixels[:] = px
    img.pack()
    return img


def srgb(h):
    def ch(v):
        v = v / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(ch(int(h[i:i + 2], 16)) for i in (1, 3, 5))


PANEL = srgb("#EEF0F1")
JOINT = srgb("#AFB5BB")


def panel_draw(x, y):                              # 512 px = 3.0 m; joints every 1.5 m
    if x % 256 < 3 or y % 256 < 3:
        return JOINT
    return PANEL


def mat(name, color, rough, metal=0.0, image=None):
    m = D.materials.get(name) or D.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = False
    nt = m.node_tree
    b = nt.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    for n in [n for n in nt.nodes if n.type == "TEX_IMAGE"]:
        nt.nodes.remove(n)
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image
        t.interpolation = "Linear"
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    m.diffuse_color = (*color, 1)
    return m


MATS = [
    mat("TB Panel White", PANEL, 0.45, 0.05, tex("TB_PanelGrid", 512, 512, panel_draw)),
    mat("TB Glass Window", srgb("#3F6CA3"), 0.12, 0.0),
    mat("TB Glass Curtain", srgb("#4A78B0"), 0.10, 0.0),
    mat("TB Mullion", srgb("#9DA6AF"), 0.4, 0.3),
    mat("TB Slab Edge", srgb("#F3F4F4"), 0.5, 0.0),
    mat("TB Roof", srgb("#D7DADC"), 0.85, 0.0),
]
PANEL_M, GLASS_W, GLASS_C, MULL, SLAB, ROOF = range(6)

# ------------------------------------------------------------------ outline (CCW) with arc length
def outline(arc_seg=10):
    pts = []                                        # (point, kind) kind: 'S' straight end, 'A' arc
    corners = [((U1 - R, V1 - R), 0), ((U0 + R, V1 - R), 90), ((U0 + R, V0 + R), 180), ((U1 - R, V0 + R), 270)]
    for (cx, cy), a0 in corners:
        for i in range(arc_seg + 1):
            a = math.radians(a0 + 90 * i / arc_seg)
            pts.append(Vector((cx + R * math.cos(a), cy + R * math.sin(a), 0)))
    return pts


P = outline()
N = len(P)


def seg(i):
    a, b = P[i], P[(i + 1) % N]
    d = (b - a)
    L = d.length
    d = d / L
    n = Vector((d.y, -d.x, 0))                      # outward for a CCW outline
    return a, b, d, n, L


bm = bmesh.new()
uv = bm.loops.layers.uv.new("UVMap")
S_TOT = [0.0]
for i in range(N):
    S_TOT.append(S_TOT[-1] + seg(i)[4])


def quad(vs, mi, s0=None, s1=None):
    """vs: 4 Vectors in order; UV from (arc length, z) when s0/s1 are given."""
    f = bm.faces.new([bm.verts.new(v) for v in vs])
    f.material_index = mi
    if s0 is not None:
        ss = (s0, s1, s1, s0)
        for l, s in zip(f.loops, ss):
            l[uv].uv = (s / 3.0, l.vert.co.z / 3.0)
    else:
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x + l.vert.co.y) / 3.0, l.vert.co.z / 3.0)
    return f


def wall(a, b, z0, z1, mi, s0, s1, off=Vector()):
    quad([a + off + Vector((0, 0, z0)), b + off + Vector((0, 0, z0)),
          b + off + Vector((0, 0, z1)), a + off + Vector((0, 0, z1))], mi, s0, s1)


def box(c, d, n, sx, sy, sz, mi):
    """A box centred at c, sx along d, sy along n (depth), sz up."""
    m = Matrix((
        (d.x * sx, n.x * sy, 0, c.x),
        (d.y * sx, n.y * sy, 0, c.y),
        (0, 0, sz, c.z),
        (0, 0, 0, 1)))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    for f in {f for v in r["verts"] for f in v.link_faces}:
        f.material_index = mi
        for l in f.loops:
            l[uv].uv = ((l.vert.co.x + l.vert.co.y) / 3.0, l.vert.co.z / 3.0)


# ------------------------------------------------------------------ facade layout per straight face
def face_layout(L, long_face):
    """Intervals (t0, t1, kind) along a straight face of length L, between the corner glazing."""
    out = [(0.0, CORNER_RUN, "curtain")]
    mid0, mid1 = CORNER_RUN, L - CORNER_RUN
    m = mid1 - mid0
    if long_face:
        # pil | win | pil | win | pil | STRIP | pil | win | pil | win | pil   (renders, long faces)
        units = [("pil", 0.9), ("win", 2.0), ("pil", 0.9), ("win", 2.0), ("pil", 0.9), ("strip", 2.6),
                 ("pil", 0.9), ("win", 2.0), ("pil", 0.9), ("win", 2.0), ("pil", 0.9)]
    else:
        # narrower punched windows on the short faces
        units = [("pil", 0.9)]
        for _ in range(5):
            units += [("win", 1.5), ("pil", 0.9)]
    k = m / sum(w for _, w in units)
    t = mid0
    for kind, w in units:
        out.append((t, t + w * k, kind))
        t += w * k
    out.append((mid1, L, "curtain"))
    return out


straight = [i for i in range(N) if seg(i)[4] > 5]           # the four straight sides
for floor in range(N_FLOORS):
    z0 = Z_BASE + floor * FLOOR_H
    z1 = z0 + FLOOR_H
    zw = z0 + SPANDREL
    for i in range(N):
        a, b, d, n, L = seg(i)
        s_a = S_TOT[i]
        if i not in straight:                                  # rounded corner: curtain glazing
            wall(a, b, z0 + 0.22, z1, GLASS_C, s_a, s_a + L, -n * 0.06)
            wall(a, b, z0, z0 + 0.22, SLAB, s_a, s_a + L)
            box(a + Vector((0, 0, (z0 + 0.22 + z1) / 2)) - n * 0.03, d, n, 0.05, 0.08, z1 - z0 - 0.22, MULL)
            continue
        long_face = abs(d.x) > 0.5                              # north and south faces run along u
        for t0, t1, kind in face_layout(L, long_face):
            A, B = a + d * t0, a + d * t1
            s0, s1 = s_a + t0, s_a + t1
            if kind == "pil":
                wall(A, B, z0, z1, PANEL_M, s0, s1)
            elif kind == "win":
                wall(A, B, z0, zw, PANEL_M, s0, s1)              # spandrel
                Ai, Bi = A - n * INSET, B - n * INSET
                wall(Ai, Bi, zw, z1 - 0.12, GLASS_W, s0, s1)     # recessed glass
                wall(Ai, Bi, z1 - 0.12, z1, PANEL_M, s0, s1)     # head panel inside the recess top
                v = Vector((0, 0, 1))
                quad([A + v * zw, B + v * zw, Bi + v * zw, Ai + v * zw], SLAB, s0, s1)        # sill
                quad([Ai + v * z1, Bi + v * z1, B + v * z1, A + v * z1], PANEL_M, s0, s1)      # soffit
                quad([Ai + v * zw, A + v * zw, A + v * z1, Ai + v * z1], PANEL_M, s0, s0 + INSET)  # left reveal
                quad([B + v * zw, Bi + v * zw, Bi + v * z1, B + v * z1], PANEL_M, s1 - INSET, s1)  # right reveal
                c = (Ai + Bi) / 2 + n * 0.03
                box(c + v * ((zw + z1) / 2), d, n, 0.06, 0.06, z1 - zw, MULL)                 # centre mullion
                box(c + v * (z1 - 0.75), d, n, (B - A).length, 0.05, 0.05, MULL)              # transom
                for e in (Ai + d * 0.03, Bi - d * 0.03):
                    box(e + n * 0.03 + v * ((zw + z1) / 2), d, n, 0.06, 0.06, z1 - zw, MULL)   # side frames
            elif kind == "strip":
                wall(A, B, z0 + 0.18, z1, GLASS_C, s0, s1, -n * 0.06)
                wall(A, B, z0, z0 + 0.18, SLAB, s0, s1)
                c = (A + B) / 2 - n * 0.02
                box(c + Vector((0, 0, (z0 + z1) / 2)), d, n, 0.06, 0.08, FLOOR_H, MULL)
            elif kind == "curtain":
                wall(A, B, z0 + 0.22, z1, GLASS_C, s0, s1, -n * 0.06)
                wall(A, B, z0, z0 + 0.22, SLAB, s0, s1)
                for k in range(int((t1 - t0) / 0.9) + 1):
                    c = A + d * (k * 0.9) - n * 0.02
                    box(c + Vector((0, 0, (z0 + z1) / 2)), d, n, 0.05, 0.08, FLOOR_H, MULL)

# ------------------------------------------------------------------ parapet band, roof, technical floor
zp = Z_ROOF + PARAPET
for i in range(N):
    a, b, d, n, L = seg(i)
    wall(a, b, Z_ROOF, zp, PANEL_M, S_TOT[i], S_TOT[i] + L)
    ai, bi = a - n * 0.3, b - n * 0.3
    v = Vector((0, 0, zp))
    quad([a + v, b + v, bi + v, ai + v], SLAB)                        # coping
    wall(bi, ai, Z_ROOF, zp, PANEL_M, S_TOT[i], S_TOT[i] + L)         # inner face
roof = bm.faces.new([bm.verts.new(p - (p - Vector(((U0 + U1) / 2, (V0 + V1) / 2, 0))).normalized() * 0.3
                                  + Vector((0, 0, Z_ROOF + 0.05))) for p in P])
roof.material_index = ROOF
tu0, tu1, tv0, tv1, tz0, tz1 = TECH
corners = [Vector((tu1, tv0, 0)), Vector((tu1, tv1, 0)), Vector((tu0, tv1, 0)), Vector((tu0, tv0, 0))]
s = 0.0
for i in range(4):
    a, b = corners[i], corners[(i + 1) % 4]
    L = (b - a).length
    wall(a, b, tz0, tz1, PANEL_M, s, s + L)
    s += L
top = bm.faces.new([bm.verts.new(c + Vector((0, 0, tz1))) for c in corners])
top.material_index = ROOF

# ------------------------------------------------------------------ object
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
NAME = "Tower " + TOWER
coll = D.collections.get("Tower_" + TOWER) or D.collections.new("Tower_" + TOWER)
if coll.name not in [c.name for c in bpy.context.scene.collection.children]:
    bpy.context.scene.collection.children.link(coll)
old = D.objects.get(NAME)
if old:
    om = old.data
    D.objects.remove(old)
    if om and om.users == 0:
        D.meshes.remove(om)
me = D.meshes.new(NAME)
bm.to_mesh(me)
bm.free()
for m in MATS:
    me.materials.append(m)
ob = D.objects.new(NAME, me)
coll.objects.link(ob)
print(NAME + ":", len(me.polygons), "faces, z", Z_BASE, "-", TECH[5])

if EXPORT and bpy.data.filepath:
    out = os.path.join(os.path.dirname(bpy.data.filepath), TOWER + ".glb")
    vl = bpy.context.view_layer
    vl.update()                                     # drop the object removed above from the layer
    for o in bpy.context.scene.objects:
        if o is not None:
            o.select_set(o is ob)
    vl.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_apply=True, export_yup=True,
                              use_selection=True, export_cameras=False, export_lights=False)
    print("Wrote", out, os.path.getsize(out) // 1024, "KB")
