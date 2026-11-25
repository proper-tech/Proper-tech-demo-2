"""Real windows: replace the plain posts around each pane (Frame*) by a built window — outer frame with head and
bottom rail, mullions, one tilt-and-turn sash with its handle, glazing beads and black gaskets — with softened edges
so the profiles catch the light. Runs from upgrade_interior.py after the dressing; idempotent.

Every Glass* object is one opening (build_unit.py): a 2 cm pane in the middle of the wall, from the sill to the head.
"""
import bpy, bmesh
from mathutils import Vector

FRAME = 0.065      # outer frame face width
DEPTH = 0.072      # outer frame depth (across the wall)
MULL = 0.084       # mullion face width
SASH = 0.058       # sash face width
SASH_D = 0.078     # sash depth, stands 8 mm proud of the frame on the room side
BEAD = 0.018       # glazing bead
GASKET = 0.005


def material(name, color, rough, metal=0.0, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.25
    return m


def bounds(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


class Builder:
    """Boxes in the window's own frame: u along the pane, v across the wall (+v = room side), z up."""

    def __init__(self, origin, along_x, room_sign):
        self.o, self.ax, self.s = origin, along_x, room_sign
        self.parts = {}

    def world(self, u, v, z):
        v *= self.s
        return Vector((self.o.x + u, self.o.y + v, z)) if self.ax else Vector((self.o.x + v, self.o.y + u, z))

    def box(self, key, u0, u1, v0, v1, z0, z1):
        bm = self.parts.setdefault(key, bmesh.new())
        vs = [bm.verts.new(self.world(u, v, z)) for u in (u0, u1) for v in (v0, v1) for z in (z0, z1)]
        for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            bm.faces.new([vs[i] for i in f])

    def rect(self, key, u0, u1, z0, z1, w, v0, v1):
        """A rectangular ring of face width w (head, bottom, two sides)."""
        self.box(key, u0, u1, v0, v1, z1 - w, z1)
        self.box(key, u0, u1, v0, v1, z0, z0 + w)
        self.box(key, u0, u0 + w, v0, v1, z0 + w, z1 - w)
        self.box(key, u1 - w, u1, v0, v1, z0 + w, z1 - w)

    def objects(self, name, mats, bevel):
        out = []
        for key, bm in self.parts.items():
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            me = bpy.data.meshes.new(f'{name}_{key}')
            bm.to_mesh(me)
            bm.free()
            ob = bpy.data.objects.new(f'{name}_{key}', me)
            me.materials.append(mats[key])
            if bevel.get(key):
                md = ob.modifiers.new('Bevel', 'BEVEL')
                md.width, md.segments, md.limit_method = bevel[key], 2, 'ANGLE'
                md.harden_normals = True
                for p in me.polygons:
                    p.use_smooth = True
            out.append(ob)
        return out


def room_side(glass, along_x):
    """+1 when the room is on the +y (or +x) side of the pane, judged from the middle of the flat's floor."""
    a, b = bounds(glass)
    c = (a + b) / 2
    floors = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Floor')]
    if not floors:
        return 1
    fa, fb = bounds(max(floors, key=lambda o: o.dimensions.x * o.dimensions.y))
    ctr = (fa + fb) / 2
    d = (ctr.y - c.y) if along_x else (ctr.x - c.x)
    return 1 if d > 0 else -1


def overhang_sill(glass, along_x, side):
    """The window board stood flush with the wall (a dark seam along it); let it overhang the wall by 3.5 cm."""
    a, b = bounds(glass)
    for o in bpy.data.objects:
        if o.type != 'MESH' or not o.name.startswith('Sill') or o.get('overhang'):
            continue
        sa, sb = bounds(o)
        k = 0 if along_x else 1
        if sb[k] < a[k] + 0.05 or sa[k] > b[k] - 0.05 or abs(sb.z - a.z) > 0.06:
            continue
        j = 1 if along_x else 0
        edge = sb[j] if side > 0 else sa[j]
        mw, mi = o.matrix_world, o.matrix_world.inverted()
        for v in o.data.vertices:
            w = mw @ v.co
            if abs(w[j] - edge) < 1e-4:
                w[j] += 0.035 * side
                v.co = mi @ w
        o['overhang'] = True


def build(glass, mats):
    a, b = bounds(glass)
    along_x = (b.x - a.x) > (b.y - a.y)
    u0, u1 = (a.x, b.x) if along_x else (a.y, b.y)
    z0, z1 = a.z, b.z
    width = u1 - u0
    origin = Vector(((a.x + b.x) / 2, (a.y + b.y) / 2, 0))
    origin_u = (u0 + u1) / 2
    if along_x:
        origin.x = origin_u
    else:
        origin.y = origin_u
    side = room_side(glass, along_x)
    W = Builder(origin, along_x, side)
    overhang_sill(glass, along_x, side)
    L, R = -width / 2, width / 2
    hv = DEPTH / 2
    # outer frame
    W.rect('frame', L, R, z0, z1, FRAME, -hv, hv)
    # panes: about 0.9 m each, the first one opens (tilt-and-turn)
    n = 1 if width < 1.25 else (2 if width < 2.05 else 3)
    inner_l, inner_r = L + FRAME, R - FRAME
    span = (inner_r - inner_l - (n - 1) * MULL) / n
    panes = []
    x = inner_l
    for i in range(n):
        panes.append((x, x + span))
        x += span
        if i < n - 1:
            W.box('frame', x, x + MULL, -hv, hv, z0 + FRAME, z1 - FRAME)
            x += MULL
    zi0, zi1 = z0 + FRAME, z1 - FRAME
    for i, (p0, p1) in enumerate(panes):
        opening = (i == 0) if n > 1 else True
        if opening:
            # sash ring overlapping the frame rebate by 8 mm, standing proud on the room side
            s0, s1, t0, t1 = p0 - 0.008, p1 + 0.008, zi0 - 0.008, zi1 + 0.008
            W.rect('sash', s0, s1, t0, t1, SASH, -hv + 0.01, hv + 0.008)
            g0, g1, h0, h1 = s0 + SASH, s1 - SASH, t0 + SASH, t1 - SASH
            # handle on the side away from the hinge (towards the mullion, or the right for a single sash)
            hu = s1 - SASH / 2
            hz = max(t0 + 0.9, min(t0 + (t1 - t0) * 0.5, 1.45))
            W.box('handle', hu - 0.016, hu + 0.016, hv + 0.008, hv + 0.02, hz - 0.042, hz + 0.042)
            W.box('handle', hu - 0.008, hu + 0.008, hv + 0.02, hv + 0.045, hz - 0.012, hz + 0.012)
            W.box('handle', hu - 0.009, hu + 0.009, hv + 0.035, hv + 0.05, hz - 0.15, hz + 0.01)
        else:
            g0, g1, h0, h1 = p0, p1, zi0, zi1
        # glazing beads on the room side and black gaskets against the glass
        W.rect('frame', g0, g1, h0, h1, BEAD, 0.012, 0.034)
        W.rect('gasket', g0 + BEAD, g1 - BEAD, h0 + BEAD, h1 - BEAD, GASKET, 0.009, 0.016)
        W.rect('gasket', g0 + BEAD, g1 - BEAD, h0 + BEAD, h1 - BEAD, GASKET, -0.016, -0.009)
    return W.objects(f'Win_{glass.name}', mats, {'frame': 0.0025, 'sash': 0.004, 'handle': 0.003})


def run():
    if any(o.name.startswith('Win_Glass') for o in bpy.data.objects):
        return
    old = bpy.data.materials.get('Window_Frame')
    mats = {
        'frame': old or material('Window_Frame', (0.03, 0.031, 0.033), 0.42),
        'sash': None,
        'gasket': material('Window_Gasket', (0.012, 0.012, 0.012), 0.6),
        'handle': material('Window_Handle', (0.78, 0.78, 0.76), 0.32, metal=1.0),
    }
    # anthracite powder coat: not a mirror-like metal, a satin paint with a thin clear coat
    f = mats['frame']
    p = next(n for n in f.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = (0.032, 0.033, 0.035, 1)
    p.inputs['Metallic'].default_value = 0.0
    p.inputs['Roughness'].default_value = 0.42
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = 0.25
        p.inputs['Coat Roughness'].default_value = 0.3
    mats['sash'] = f
    coll = bpy.data.collections.get('Windows') or bpy.data.collections.new('Windows')
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Frame')
              and o.data.materials and o.data.materials[0] and o.data.materials[0].name == 'Window_Frame']:
        bpy.data.objects.remove(o, do_unlink=True)
    count = 0
    for g in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Glass')]:
        for ob in build(g, mats):
            coll.objects.link(ob)
        count += 1
    print('windows built:', count)


if __name__ == '__main__':
    run()
