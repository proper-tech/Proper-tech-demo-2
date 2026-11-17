# Merges the per-block models (public/models/blocks/*.glb, from build-model.py or edited by hand)
# into public/models/complex.glb, the single file the 3D viewer loads.
#
#   blender --background --python scripts/merge-blocks.py -- public/models/blocks public/models/complex.glb
#
# Blocks must share the site-plan coordinate frame (no re-centring when exporting a block) and be
# exported with the same glTF settings used below. A block edited by hand in Blender: import its
# GLB, edit, export it back to the same file with "Selected objects" and Y-up, then run this script.
import bpy, glob, os, re, sys

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
SRC_DIR = ARGS[0] if len(ARGS) > 0 else "public/models/blocks"
OUT_GLB = ARGS[1] if len(ARGS) > 1 else "public/models/complex.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
files = sorted(glob.glob(os.path.join(SRC_DIR, "*.glb")))
if not files:
    sys.exit(f"No .glb files in {SRC_DIR}")
for f in files:
    bpy.ops.import_scene.gltf(filepath=f)
    print("Imported", os.path.basename(f))

# Every block brings its own copy of the shared materials, so the second import of "Glass" arrives
# as "Glass.001". Point every object back at the first copy and drop the duplicates.
for ob in bpy.data.objects:
    for slot in ob.material_slots:
        m = slot.material
        base = bpy.data.materials.get(re.sub(r"\.\d{3}$", "", m.name)) if m else None
        if base and base is not m:
            slot.material = base
for m in [m for m in bpy.data.materials if m.users == 0]:
    bpy.data.materials.remove(m)

os.makedirs(os.path.dirname(os.path.abspath(OUT_GLB)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", export_apply=True, export_yup=True,
                          export_cameras=False, export_lights=False)
print("Wrote", OUT_GLB, os.path.getsize(OUT_GLB) // 1024, "KB from", len(files), "blocks")
