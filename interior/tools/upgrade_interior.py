"""Make an apartment scene (D, E, F) look photographic: real daylight through clear glass, open curtains, the city
outside, Poly Haven (CC0) textures and props.

    blender -b interior/F.blend -P interior/tools/upgrade_interior.py -- F [day|evening] [out.blend]
    python3 -I interior/tools/upgrade_interior.py F day /tmp/F_day.blend          (bpy as a module)

Reads interior/assets (interior\\fetch_assets.bat downloads it); without it the scene keeps its own materials and
only the light, glass and curtains change. Writes <plan>_<mood>.blend next to the plan's scene unless told otherwise.
"""
import sys, os, math, json, random
import bpy, bmesh
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
plan = args[0]
mood = args[1] if len(args) > 1 else 'day'
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # interior/
out_path = args[2] if len(args) > 2 else os.path.join(here, f'{plan}_{mood}.blend')
assets = os.path.join(here, 'assets')
if not bpy.data.filepath or os.path.basename(bpy.data.filepath) != f'{plan}.blend':
    bpy.ops.wm.open_mainfile(filepath=os.path.join(here, f'{plan}.blend'))
sc = bpy.context.scene
random.seed(7)


def asset(*p):
    f = os.path.join(assets, *p)
    return f if os.path.exists(f) else None


def bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def mat_of(o):
    return o.data.materials[0].name if o.type == 'MESH' and o.data.materials and o.data.materials[0] else ''


# ---------------------------------------------------------------- glass: thin architectural glass that lets the sun in
def thin_glass():
    m = bpy.data.materials.get('Window_Glass')
    if not m:
        return
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs['Color'].default_value = (0.93, 0.96, 0.97, 1)
    gl = nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.0
    fr = nt.nodes.new('ShaderNodeFresnel')
    fr.inputs['IOR'].default_value = 1.52
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fr.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])


# ---------------------------------------------------------------- curtains: gathered at both ends of the rod
def open_curtains():
    for o in bpy.data.objects:
        if o.type != 'MESH' or mat_of(o) != 'Sheer_Linen':
            continue
        vs = o.data.vertices
        xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]
        ax = 0 if (max(xs) - min(xs)) >= (max(ys) - min(ys)) else 1
        lo = min(v.co[ax] for v in vs); hi = max(v.co[ax] for v in vs)
        span = hi - lo
        keep = min(0.42, 0.16 * span + 0.12)  # metres of gathered cloth at each end
        bm = bmesh.new()
        bm.from_mesh(o.data)
        side = {}
        for v in bm.verts:
            t = (v.co[ax] - lo) / span
            side[v.index] = t < 0.5
            v.co[ax] = lo + t * 2 * keep if t < 0.5 else hi - (1 - t) * 2 * keep
        # the faces that joined the two halves would now stretch across the window
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if len({side[v.index] for v in f.verts}) > 1], context='FACES')
        bmesh.ops.delete(bm, geom=[e for e in bm.edges if side[e.verts[0].index] != side[e.verts[1].index]], context='EDGES')
        bm.to_mesh(o.data)
        bm.free()
        o.data.update()


# ---------------------------------------------------------------- the sky and the city outside
def world(m):
    w = sc.world
    nt = w.node_tree
    env = next(n for n in nt.nodes if n.type == 'TEX_ENVIRONMENT')
    bg = next(n for n in nt.nodes if n.type == 'BACKGROUND')
    mp = next((n for n in nt.nodes if n.type == 'MAPPING'), None)
    name = {'day': 'canary_wharf_4k.hdr', 'evening': 'rooftop_night_4k.hdr'}[m]
    f = asset('hdri', name) or os.path.join(here, 'hdri', 'modern_buildings_2_4k.hdr')
    env.image = bpy.data.images.load(f, check_existing=True)
    bg.inputs['Strength'].default_value = 1.5 if m == 'day' else 1.6
    if mp:
        mp.inputs['Rotation'].default_value[2] = math.radians(120)


# ---------------------------------------------------------------- light
def sun_rotation():
    """Afternoon sun from the south-south-west when the flat has south windows, else morning sun from the
    east-south-east (Ulaanbaatar: +y is north)."""
    floor = [o for o in bpy.data.objects if o.type == 'MESH' and mat_of(o) == 'Oak_Floor']
    lo = Vector((min(bbox(o)[0].x for o in floor), min(bbox(o)[0].y for o in floor), 0))
    hi = Vector((max(bbox(o)[1].x for o in floor), max(bbox(o)[1].y for o in floor), 0))
    south = east = 0.0
    for o in bpy.data.objects:
        if o.type == 'MESH' and mat_of(o) == 'Window_Glass':
            a, b = bbox(o)
            if b.y - a.y < 0.1 and abs(a.y - lo.y) < 0.6:
                south += b.x - a.x
            if b.x - a.x < 0.1 and abs(b.x - hi.x) < 0.6:
                east += b.y - a.y
    if south >= 1.0:
        return (math.radians(62), 0, math.radians(-28))  # 28° high
    return (math.radians(68), 0, math.radians(68))  # 22° high, morning


def lights(m):
    sun = bpy.data.objects.get('Sun')
    for o in bpy.data.objects:
        if o.type != 'LIGHT':
            continue
        n = o.name
        if n.startswith('WinFill'):
            # soft skylight from each window (the HDRI sky alone is too weak through small openings)
            o.data.energy = o.data.energy * (0.28 if m == 'day' else 0.0)
            o.data.color = (0.92, 0.95, 1.0)
        elif n.startswith('pointlight_firefly') or n == 'Key Light':
            o.hide_render = True
        elif n.startswith('Downlight'):
            o.data.energy = 10 if m == 'day' else 30
            o.data.color = (1.0, 0.84, 0.66)
        elif n.startswith('LampPt'):
            o.data.energy = 0 if m == 'day' else o.data.energy * 1.6
            o.data.color = (1.0, 0.76, 0.52)
        elif n.endswith('_ceiling_fill'):  # bathrooms have no window: keep their light
            o.data.energy = 30 if m == 'day' else 40
    if sun:
        sun.hide_render = m != 'day'
        sun.data.energy = 4.2
        sun.data.angle = math.radians(1.2)
        sun.data.color = (1.0, 0.93, 0.84)
        sun.rotation_euler = sun_rotation()
    # lamp shades and LED strips glow in the evening only
    for mn in ('Warm_Light', 'Revision_MirrorGlow'):
        mm = bpy.data.materials.get(mn)
        if not mm:
            continue
        p = next((n for n in mm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if p:
            p.inputs['Emission Color'].default_value = (1.0, 0.72, 0.45, 1)
            p.inputs['Emission Strength'].default_value = 1.5 if m == 'day' else 9.0


def render_settings(m):
    vs = sc.view_settings
    vs.view_transform = 'AgX'
    vs.look = 'AgX - Medium High Contrast'
    vs.exposure = 1.7 if m == 'day' else 0.9
    cy = sc.cycles
    cy.max_bounces = 10
    cy.diffuse_bounces = 5
    cy.glossy_bounces = 4
    cy.transparent_max_bounces = 16
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.sample_clamp_indirect = 8.0


thin_glass()
open_curtains()
world(mood)
lights(mood)
render_settings(mood)

# textures and props (only with interior/assets)
if os.path.isdir(assets):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import upgrade_dress
    upgrade_dress.run(plan, mood, assets)

bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=True)
print('saved', out_path)
