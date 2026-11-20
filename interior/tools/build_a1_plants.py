"""Block A, 1st floor: foliage in the hall planters, from the potted plant of the plan-D scene (E.blend)."""
import bpy, os, re, random
R = random.Random(3)
SRC = os.path.expanduser('~/Desktop/tenger-residence 2/interior/E.blend')
with bpy.data.libraries.load(SRC) as (src, dst):
    dst.meshes = [n for n in src.meshes if re.match(r'^leaves(\.\d+)?$', n)][:1]
me = dst.meshes[0]
lz = min(v.co.z for v in me.vertices)
fit = bpy.data.collections['A1_Fit']
for p in [o for o in fit.objects if o.name.startswith('Planter_') and not o.name.endswith('_Soil')]:
    for k in range(2):
        s = R.uniform(2.0, 2.6) if k == 0 else R.uniform(1.4, 1.8)
        o = bpy.data.objects.new(f'PlantLeaves_{p.name}_{k}', me); fit.objects.link(o)
        o.scale = (s, s, s * R.uniform(1.0, 1.25)); o.rotation_euler[2] = R.uniform(0, 6.28)
        o.location = (p.location.x + R.uniform(-.08, .08), p.location.y + R.uniform(-.08, .08), p.dimensions.z - 0.03 - lz * o.scale.z)
print('plants ok')
