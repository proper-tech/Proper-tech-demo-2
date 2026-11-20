"""Glass for the podium's (block A) curtain walls and shopfronts -> public/models/blocks/A-glass.glb.

In complex.glb the infill behind the glazing grid (dark metal mullions, and the frames of A-detail.glb)
is modelled in the facade material. This copies those facade faces 3.5 cm out, as a mesh with a
"Glass" material, which BuildingScene.tsx gives the interior glass of podiumGlass.ts.
A face counts when it is vertical, in the podium storeys, faces the outside (nothing in front of it
beyond the frames), every sample point on it is near the grid (1.5 m on the ground floor's wide
shopfront bays, 0.95 m above) and it is not next to a punched window's reveal.

  node gltf-decompress.mjs public/models/complex.glb /tmp/complex.glb
  node gltf-decompress.mjs public/models/blocks/A-detail.glb /tmp/A-detail.glb
  python3 scripts/podium-glass.py -- /tmp/complex.glb /tmp/A-detail.glb public/models/blocks/A-glass.glb
"""
import bpy, bmesh, sys, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
src, det, dst = sys.argv[sys.argv.index('--')+1:][:3]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
bpy.ops.import_scene.gltf(filepath=det)
detail=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('A Facade Detail')][0]
def mat_bvh(o, names):
    m=o.matrix_world; ps=[p for p in o.data.polygons if o.material_slots[p.material_index].name in names]
    vi=sorted({i for p in ps for i in p.vertices}); rm={v:k for k,v in enumerate(vi)}
    return BVHTree.FromPolygons([m@o.data.vertices[i].co for i in vi],[[rm[i] for i in p.vertices] for p in ps])
frames_d=mat_bvh(detail, {'A Frame Metal'}); reveals=mat_bvh(detail, {'A Reveal White'})
pod=bpy.data.objects['Podium']; me=pod.data; M=pod.matrix_world; R=M.to_3x3()
slot={s.name:i for i,s in enumerate(pod.material_slots)}
allv=[M@v.co for v in me.vertices]
bvh=BVHTree.FromPolygons(allv,[list(p.vertices) for p in me.polygons])
dmp=[p for p in me.polygons if p.material_index==slot['Dark Metal PodiumAO']]
dvi=sorted({i for p in dmp for i in p.vertices}); remap={v:k for k,v in enumerate(dvi)}
dbvh=BVHTree.FromPolygons([allv[i] for i in dvi],[[remap[i] for i in p.vertices] for p in dmp])
def free(q, d):
    o=q+d*0.03; tot=0
    for _ in range(8):
        h=bvh.ray_cast(o,d,300)
        if h[0] is None: return True
        tot+=h[3]
        if tot>0.6: return False
        o=h[0]+d*0.01
    return False
tris=[]
for p in me.polygons:
    if p.material_index!=slot['Facade White PodiumAO'] or abs(p.normal.z)>0.2: continue
    pts=[M@me.vertices[i].co for i in p.vertices]; c=sum(pts,Vector())/len(pts); n=(R@p.normal).normalized()
    if not (0.2 < c.z < 11.6): continue
    # behind the glazing grid: dark metal within reach, in front of the face
    samples=[c]+pts+[(pts[i]+pts[(i+1)%len(pts)])/2 for i in range(len(pts))]
    reach = 1.5 if c.z < 4.1 else 0.95   # shopfront bays are wider than the curtain walls' upstairs
    def framed(q): return dbvh.find_nearest(q,reach)[0] is not None or frames_d.find_nearest(q,reach)[0] is not None
    if not all(framed(q) for q in samples): continue
    if any(reveals.find_nearest(q,0.25)[0] is not None for q in samples): continue
    near=dbvh.find_nearest(c,1.6)
    if near[0] is None: near=frames_d.find_nearest(c,1.6)
    out=None
    for sgn in (1,-1):
        if free(c, n*sgn): out=sgn
    if out is None: continue
    if near[0] is None or (near[0]-c).dot(n*out) < -0.05: continue
    no=n*out
    tris.append(([q+no*0.035 for q in pts], no))
print('glass faces', len(tris))
nm=bpy.data.meshes.new('A Curtain Glass'); bm=bmesh.new()
for pts,no in tris:
    vs=[bm.verts.new(q) for q in pts]
    f=bm.faces.new(vs)
    bm.normal_update()
    if f.normal.dot(no)<0: f.normal_flip()
bm.to_mesh(nm); bm.free()
mat=bpy.data.materials.new('Glass'); nm.materials.append(mat)
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
ob=bpy.data.objects.new('A Curtain Glass', nm)
bpy.context.scene.collection.objects.link(ob)
print('area', round(sum(p.area for p in nm.polygons),1))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', use_selection=False, export_materials='EXPORT', export_texcoords=False)
