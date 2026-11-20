"""Rebuild the whole Block A 1st-floor tour scene in the open A1.blend (camera 'Pano' is kept)."""
import os, bpy
T = os.path.expanduser('~/Desktop/tenger-residence 2/interior/tools/')
ns = {}
for f in ('build_a1_arch.py', 'build_a1_fit.py', 'build_a1_plants.py', 'build_a1_stock.py'):
    exec(open(T + f).read(), ns)
for b in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights):
    for x in list(b):
        if x.users == 0 and not x.use_fake_user: b.remove(x)
