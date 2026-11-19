"""Render the furnished top view of a block D floor scene: everything above CUT is cut away (like a floor plan),
cut walls get a light cap, no sun. Writes <out>.png (transparent outside the building) and <out>.json with the
rectangle it covers in block metres: [u0, v0, u1, v1] (u east, v north).

With Blender:  blender -b interior/D1.blend -P interior/render_top.py -- interior/renders/D1/top 60 64
Python bpy:    python3 -I interior/render_top.py interior/D1.blend out/top 30 16
"""
import sys, os, json, math
import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
if not bpy.data.filepath:
    bpy.ops.wm.open_mainfile(filepath=args.pop(0))
out = args[0]
ppm = float(args[1]) if len(args) > 1 else 40
samples = int(args[2]) if len(args) > 2 else 32
CUT = 2.4
RECT = [-0.6, -0.6, 21.4, 30.6]  # the block, its walls and the stair core, in block metres

sc = bpy.context.scene
gpu = None
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        devs = [d for d in prefs.devices if d.type == kind]
        if devs:
            for d in prefs.devices:
                d.use = d.type == kind
            gpu = kind
            break
except Exception as e:
    print('GPU check failed:', e)
sc.cycles.device = 'GPU' if gpu else 'CPU'

# what lies above the cut goes; walls, columns and racks that reach through it are cut by the camera
UP = ('Slab', 'Beam', 'ShopCeiling', 'RoomCeiling', 'Panel_', 'Batten', 'Down', 'ShopSign', 'Ground', 'Pavement')
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith(UP):
        bpy.data.objects.remove(o, do_unlink=True)
    elif o.type == 'LIGHT' and o.data.type == 'SUN':
        o.hide_render = True
# cut what reaches above the plan's cut height down to it, so the cut tops are lit from above like a model;
# the ramp, which runs over the small rooms, goes
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('Ramp'):
        bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name.startswith(('Car', 'plant', 'sofa', 'armchair')) or o.parent is not None:
        continue
    mw = o.matrix_world
    zs = [(mw @ v.co).z for v in o.data.vertices]
    if not zs or max(zs) <= CUT:
        continue
    if min(zs) >= CUT:
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    if o.data.users > 1:
        o.data = o.data.copy()
    inv = mw.inverted()
    for v in o.data.vertices:
        w = mw @ v.co
        if w.z > CUT:
            w.z = CUT
            v.co = inv @ w
# lights light the room but are not seen in the glossy floors from above
for o in bpy.data.objects:
    if o.type == 'LIGHT':
        o.visible_glossy = False
cam_d = bpy.data.cameras.new('Top')
cam_d.type = 'ORTHO'
w, h = RECT[2] - RECT[0], RECT[3] - RECT[1]
cam_d.ortho_scale = max(w, h)
cam_d.clip_start = 1
cam_d.clip_end = 40
cam = bpy.data.objects.new('TopCam', cam_d)
cam.location = ((RECT[0] + RECT[2]) / 2, (RECT[1] + RECT[3]) / 2, 20)
sc.collection.objects.link(cam)
sc.camera = cam
r = sc.render
r.resolution_x, r.resolution_y, r.resolution_percentage = round(w * ppm), round(h * ppm), 100
r.film_transparent = True
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
sc.cycles.samples = samples
sc.cycles.use_adaptive_sampling = True
sc.cycles.use_denoising = True
r.filepath = out + '.png'
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
bpy.ops.render.render(write_still=True)
json.dump({'rect': RECT}, open(out + '.json', 'w'))
print('top view', r.resolution_x, 'x', r.resolution_y, 'device', gpu or 'CPU', flush=True)
