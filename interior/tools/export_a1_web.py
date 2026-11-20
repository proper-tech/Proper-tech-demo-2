"""Export the Block A 1st-floor interior (A1.blend, the scene of the 360° tour) for the 3D floor view.

A cut-away "doll's house": no ceiling, lights or services, everything cut at CUT m; the procedural
floor tiles become small image textures, product models are decimated and their textures shrunk,
and the stock stays GPU-instanced (EXT_mesh_gpu_instancing). Writes public/models/interior/A1.glb.
Run: blender -b interior/A1.blend -P interior/tools/export_a1_web.py
"""
import bpy, bmesh, os, math, re
import numpy as np
from mathutils import Vector

ROOT = os.path.expanduser('~/Desktop/tenger-residence 2/')
OUT = ROOT + 'public/models/interior/A1.glb'
CUT = 2.6
sc = bpy.context.scene

# ---------------------------------------------------------------- drop what a floor plan doesn't show
DROP = re.compile(r'^(Ceiling_|Upper_|Void|Duct_|Tray_|Linear|Hanger_|Downlight_|Cove_|AisleSign_|AisleText_|AisleWire_|Brand_|Fresh_Text|Shop_Fascia|Pano|TopCam)')
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA') or DROP.match(o.name):
        bpy.data.objects.remove(o, do_unlink=True)

# ---------------------------------------------------------------- cut everything at CUT
def cut(o):
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me); bm.transform(o.matrix_world)
    if max(v.co.z for v in bm.verts) <= CUT + 1e-4: bm.free(); return
    if min(v.co.z for v in bm.verts) >= CUT: bm.free(); bpy.data.objects.remove(o, do_unlink=True); return
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, CUT), plane_no=(0, 0, 1), clear_outer=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if edges: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bm.transform(o.matrix_world.inverted()); bm.to_mesh(me); bm.free()

arch = [c for c in (bpy.data.collections.get('A1_Arch'), bpy.data.collections.get('A1_Fit')) if c]
for c in arch:
    for o in list(c.objects):
        if o.type == 'FONT':
            continue
        if o.type == 'MESH' and not o.modifiers:
            if o.data.users > 1: o.data = o.data.copy()
            cut(o)

# ---------------------------------------------------------------- web materials
def image_tile(name, size_m, tile, c1, c2, grout, px=1024):
    """A square texture covering size_m metres of floor: tiles of tile=(w, h) m, running bond if w != h."""
    img = bpy.data.images.get(name) or bpy.data.images.new(name, px, px)
    rng = np.random.default_rng(3)
    a = np.zeros((px, px, 4), np.float32); a[..., 3] = 1
    k = px / size_m; tw, th = tile; g = max(1, int(0.004 * k))
    rows = int(round(size_m / th))
    for r in range(rows):
        y0, y1 = int(r * th * k), int((r + 1) * th * k)
        off = (tw / 2 if (tw != th and r % 2) else 0)
        x = -off
        while x < size_m:
            x0, x1 = max(0, int(x * k)), min(px, int((x + tw) * k))
            c = np.array(c1 if rng.random() < .5 else c2) * rng.uniform(0.97, 1.03)
            a[y0:y1, x0:x1, :3] = c
            x += tw
        a[y0:y0 + g, :, :3] = grout
    xs = np.arange(px)
    for r in range(rows):
        off = (tw / 2 if (tw != th and r % 2) else 0)
        x = -off
        while x < size_m + tw:
            xi = int(x * k)
            if 0 <= xi < px: a[int(r * th * k):int((r + 1) * th * k), xi:xi + g, :3] = grout
            x += tw
    # soft polish variation
    n = rng.normal(0, 0.012, (px // 16, px // 16)); n = np.kron(n, np.ones((16, 16)))
    a[..., :3] += n[..., None]
    img.pixels.foreach_set(np.clip(a, 0, 1).ravel()); img.pack()
    return img

def tex_mat(name, img, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    bs = nt.nodes['Principled BSDF']; t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    nt.links.new(t.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = rough
    return m
TILE = 2.4
hall = tex_mat('Web_HallFloor', image_tile('web_hall_floor', TILE, (1.2, 0.6), (0.78, 0.76, 0.72), (0.74, 0.72, 0.69), (0.55, 0.54, 0.52)), 0.18)
shop = tex_mat('Web_ShopFloor', image_tile('web_shop_floor', TILE, (0.6, 0.6), (0.72, 0.72, 0.71), (0.69, 0.69, 0.68), (0.5, 0.5, 0.5)), 0.3)
glass = bpy.data.materials.new('Web_Glass'); glass.use_nodes = True
gb = glass.node_tree.nodes['Principled BSDF']; gb.inputs['Base Color'].default_value = (0.75, 0.86, 0.92, 1)
gb.inputs['Alpha'].default_value = 0.22; gb.inputs['Roughness'].default_value = 0.05
glass.surface_render_method = 'BLENDED' if hasattr(glass, 'surface_render_method') else None

def world_uv(o, size):
    me = o.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    me.uv_layers.active = uv
    for li, l in enumerate(me.loops):
        co = o.matrix_world @ me.vertices[l.vertex_index].co
        uv.data[li].uv = (co.x / size, co.y / size)

for o in bpy.data.objects:
    if o.type != 'MESH': continue
    for i, s in enumerate(o.material_slots):
        n = s.material.name if s.material else ''
        if n.startswith('A1_HallPorcelain'): s.material = hall; world_uv(o, TILE)
        elif n.startswith('A1_ShopPorcelain'): s.material = shop; world_uv(o, TILE)
        elif n.startswith('Window_Glass'): s.material = glass
# procedural base colours the exporter can't read: give them their look as a flat colour
FLAT = {'Wall_WarmPlaster': (0.86, 0.83, 0.78), 'A1_ColumnWhite': (0.86, 0.85, 0.83), 'A1_WhitePaint': (0.88, 0.88, 0.87),
        'Detail_BrushedSteel': (0.72, 0.72, 0.72), 'Black_Metal': (0.05, 0.05, 0.05), 'Oak_Furniture': (0.62, 0.45, 0.28),
        'Walnut': (0.36, 0.23, 0.14), 'Ceramic_Pot': (0.75, 0.72, 0.68)}
for m in bpy.data.materials:
    if not m.use_nodes: continue
    bs = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bs: continue
    base = m.name.split('.')[0]
    if base in FLAT and bs.inputs['Base Color'].is_linked:
        for l in list(bs.inputs['Base Color'].links): m.node_tree.links.remove(l)
        bs.inputs['Base Color'].default_value = (*FLAT[base], 1)
    if base.startswith('A1_') and bs.inputs['Emission Strength'].default_value > 0:
        bs.inputs['Emission Strength'].default_value = min(bs.inputs['Emission Strength'].default_value, 1.0)

# ---------------------------------------------------------------- lighter products
lc = bpy.context.view_layer.layer_collection.children.get('A1_Products')
if lc: lc.exclude = False
bpy.context.view_layer.update()
for o in bpy.data.collections['A1_Products'].objects:
    if o.type != 'MESH': continue
    f = len(o.data.polygons)
    if f > 140:
        md = o.modifiers.new('dec', 'DECIMATE'); md.ratio = max(0.005, 140 / f)
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier='dec')
for img in bpy.data.images:
    if img.size[0] > 512 and img.name not in ('web_hall_floor', 'web_shop_floor') and img.source in ('FILE', 'GENERATED'):
        try:
            img.scale(512, max(1, int(512 * img.size[1] / img.size[0])))
        except Exception as e:
            print('scale fail', img.name, e)
# the stock is instanced from these: they must be in the view layer for the exporter to see the
# instances; the originals themselves wait below the floor
for o in bpy.data.collections['A1_Products'].objects: o.location.z = -50
bpy.context.view_layer.update()

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
for o in bpy.data.objects:
    if o.type == 'FONT': bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_visible=True, export_apply=True,
                          export_draco_mesh_compression_enable=True, export_image_format='WEBP',
                          export_gpu_instances=True, export_gn_mesh=True, export_lights=False, export_cameras=False, export_animations=False)
print('EXPORTED', OUT, os.path.getsize(OUT) // 1024, 'KB')
