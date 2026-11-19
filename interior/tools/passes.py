"""Extra passes for the tour of one plan.
  ids  <blend> <cams.json> <outdir> <W> <H> [stops]   material-ID panoramas (R,G = material index) -> outdir/ids/<stop>.png
  top  <blend> <outdir> <px_per_m> <samples>          top view without the ceiling (transparent background) + its ID pass
                                                     -> outdir/top.png, outdir/top_ids.png, outdir/top.json (viewBox)
Material indices are written to outdir/materials.json.
"""
import sys, json, math, os
import bpy
from mathutils import Vector

mode, blend = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene; r = sc.render
sc.cycles.device = 'CPU'

def id_materials(out):
    mats = sorted(m.name for m in bpy.data.materials)
    idx = {n: i + 1 for i, n in enumerate(mats)}
    emis = {}
    for n, i in idx.items():
        m = bpy.data.materials.new('ID_' + n); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        e = nt.nodes.new('ShaderNodeEmission'); e.inputs['Color'].default_value = ((i % 256) / 255, (i // 256) / 255, 0, 1)
        o = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(e.outputs[0], o.inputs['Surface']); emis[n] = m
    for ob in bpy.data.objects:
        if ob.type not in ('MESH', 'CURVE') or not ob.material_slots: continue
        for s in ob.material_slots:
            if s.material and s.material.name in emis: s.material = emis[s.material.name]
    for ob in bpy.data.objects:
        if ob.type == 'LIGHT': ob.hide_render = True
    w = bpy.data.worlds.new('black'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0; sc.world = w
    sc.cycles.samples = 1; sc.cycles.use_denoising = False; sc.cycles.use_adaptive_sampling = False
    sc.cycles.max_bounces = 0; sc.cycles.transparent_max_bounces = 0
    sc.cycles.filter_width = 0.01; sc.cycles.pixel_filter_type = 'BOX'
    sc.view_settings.view_transform = 'Raw'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0; sc.view_settings.gamma = 1
    r.dither_intensity = 0; r.film_transparent = False
    r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGB'; r.image_settings.color_depth = '8'
    json.dump(idx, open(f'{out}/materials.json', 'w'))

def hide_ceiling():
    for o in bpy.data.objects:
        if o.name.startswith('Ceiling'): o.visible_camera = False
        elif o.type == 'MESH' and min((o.matrix_world @ Vector(c)).z for c in o.bound_box) > 2.6:
            o.visible_camera = False  # downlight trims, curtain rods: things on the ceiling

if mode == 'ids':
    cams, out, W, H = json.load(open(sys.argv[3])), sys.argv[4], int(sys.argv[5]), int(sys.argv[6])
    stops = sys.argv[7].split(',') if len(sys.argv) > 7 else list(cams)
    os.makedirs(f'{out}/ids', exist_ok=True)
    id_materials(out)
    r.resolution_x, r.resolution_y = W, H
    cam = sc.camera
    for s in stops:
        x, y, z = cams[s]; cam.location = (x, -y, z); cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
        r.filepath = f'{out}/ids/{s}.png'; bpy.ops.render.render(write_still=True); print('ok', s, flush=True)
else:
    out, ppm, S = sys.argv[3], float(sys.argv[4]), int(sys.argv[5])
    walls = [o for o in bpy.data.objects if o.name.startswith('Wall')]
    xs = [v for o in walls for v in (o.location.x - o.dimensions.x / 2, o.location.x + o.dimensions.x / 2)]
    ys = [-v for o in walls for v in (o.location.y - o.dimensions.y / 2, o.location.y + o.dimensions.y / 2)]
    left, north = min(xs) - 0.3, min(ys) - 0.3
    w, h = max(xs) - min(xs) + 0.6, max(ys) - min(ys) + 0.6
    cd = bpy.data.cameras.new('Top'); cd.type = 'ORTHO'; cd.ortho_scale = max(w, h); cd.clip_end = 100
    c = bpy.data.objects.new('Top', cd); sc.collection.objects.link(c)
    c.location = (left + w / 2, -(north + h / 2), 20); sc.camera = c
    r.resolution_x, r.resolution_y, r.resolution_percentage = round(w * ppm), round(h * ppm), 100
    hide_ceiling()
    for o in bpy.data.objects:
        if o.type == 'LIGHT': o.visible_camera = False
        if o.type == 'LIGHT' and o.data.type == 'SPOT': o.hide_render = True  # no downlight pools on the floor
    json.dump({'viewBox': [left, north, w, h]}, open(f'{out}/top.json', 'w'))
    sc.cycles.samples = S; sc.cycles.use_denoising = True; r.film_transparent = True
    r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
    r.filepath = f'{out}/top.png'; bpy.ops.render.render(write_still=True); print('ok top', flush=True)
    id_materials(out)
    r.filepath = f'{out}/top_ids.png'; bpy.ops.render.render(write_still=True); print('ok top ids', flush=True)
