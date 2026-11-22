"""Render the 360° panoramas (4096 x 2048) of one apartment plan.

With Blender (uses the graphics card when it finds one):
    blender -b interior/F.blend -P interior/render_panos.py -- F
    blender -b interior/F.blend -P interior/render_panos.py -- F 128 entry,living     (samples, only some stops)
Writes interior/renders/<plan>/<stop>.jpg next to this script.
"""
import sys, os, json, math, time
import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
plan = args[0]
here = os.path.dirname(os.path.abspath(__file__))
if not bpy.data.filepath:  # run as a Python module: open the file ourselves
    bpy.ops.wm.open_mainfile(filepath=os.path.join(here, f'{plan}.blend'))

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
            for d in prefs.devices: d.use = d.type == kind
            gpu = kind
            break
except Exception as e:
    print('GPU check failed:', e)
sc.cycles.device = 'GPU' if gpu else 'CPU'

samples = int(args[1]) if len(args) > 1 and args[1].isdigit() else (128 if gpu else 10)
cams = json.load(open(os.path.join(here, f'{plan}_cams.json')))
stops = args[2].split(',') if len(args) > 2 else (args[1].split(',') if len(args) > 1 and not args[1].isdigit() else list(cams))
mood = os.environ.get('MOOD', 'day')  # evening renders go to renders/<plan>_evening
out = os.path.join(here, 'renders', plan if mood == 'day' else f'{plan}_{mood}')
os.makedirs(out, exist_ok=True)

r = sc.render
r.resolution_x, r.resolution_y, r.resolution_percentage = 4096, 2048, 100
sc.cycles.samples = samples
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.02 if gpu else 0.03
sc.cycles.use_denoising = True
r.use_persistent_data = bool(gpu)
sc.cycles.use_auto_tile = True
sc.cycles.tile_size = 2048 if gpu else 512
r.image_settings.file_format = 'JPEG'
r.image_settings.quality = 92
cam = sc.camera
print(f'Plan {plan}: {len(stops)} panoramas, {samples} samples, device {gpu or "CPU"}', flush=True)
for s in stops:
    x, y, z = cams[s]
    cam.location = (x, -y, z)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
    r.filepath = os.path.join(out, f'{s}.jpg')
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'ok {plan} {s} {round(time.time() - t)} s', flush=True)
print('DONE', plan, flush=True)
