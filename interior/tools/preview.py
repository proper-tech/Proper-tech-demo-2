"""Quick checks: top view without the ceiling, and low-res panoramas.
python3 -I preview.py <blend> <cams.json> <outdir> top|<room,room> [W] [samples]"""
import sys, json, math, bpy
from mathutils import Vector
blend, camsf, out, what = sys.argv[1:5]
W = int(sys.argv[5]) if len(sys.argv) > 5 else 1024
S = int(sys.argv[6]) if len(sys.argv) > 6 else 8
bpy.ops.wm.open_mainfile(filepath=blend)
sc = bpy.context.scene; r = sc.render
sc.cycles.samples = S; sc.cycles.use_denoising = True
try: sc.cycles.device = 'CPU'
except Exception: pass
cams = json.load(open(camsf))
cam = sc.camera
if what == 'top':
    for o in bpy.data.objects:
        if o.name.startswith('Ceiling') or o.name.startswith('Downlight') or o.name.startswith('Cylinder.009'): o.hide_render = True
    xs = [o.location.x for o in bpy.data.objects if o.name.startswith('Wall')]
    ys = [o.location.y for o in bpy.data.objects if o.name.startswith('Wall')]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    w, h = max(xs) - min(xs) + 0.6, max(ys) - min(ys) + 0.6
    cd = bpy.data.cameras.new('Top'); cd.type = 'ORTHO'; cd.ortho_scale = max(w, h)
    c = bpy.data.objects.new('Top', cd); sc.collection.objects.link(c); c.location = (cx, cy, 30); sc.camera = c
    r.resolution_x = W; r.resolution_y = int(W * h / w) if w >= h else W
    if h > w: r.resolution_x = int(W * w / h)
    r.filepath = f'{out}/top.png'; r.image_settings.file_format = 'PNG'
    bpy.ops.render.render(write_still=True)
else:
    r.resolution_x, r.resolution_y = W, W // 2
    for room in what.split(','):
        x, y, z = cams[room]; cam.location = (x, -y, z); cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
        r.filepath = f'{out}/{room}.jpg'; r.image_settings.file_format = 'JPEG'
        bpy.ops.render.render(write_still=True)
        print('ok', room)
