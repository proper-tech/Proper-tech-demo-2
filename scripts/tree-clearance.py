"""Street trees whose crowns run into the buildings -> TREE_FIX in src/components/three/BuildingScene.tsx.

Loads the environment and the complex (decompressed), and for each Env_Tree finds crown points inside
a building (a point is inside when rays up and in all four horizontal directions hit the building).
For a tree with such points it tries a move of up to 2.5 m along each axis, at crown scales 1, 0.85
and 0.72, and keeps the cheapest that clears it (a metre of move costs as much as a 20 % smaller
crown). Prints {name: {dx, dz, scale}} in three.js coordinates (x, z = -Blender y).

  node scripts/gltf-decompress.mjs public/models/blocks/environment.glb /tmp/env_raw.glb
  node scripts/gltf-decompress.mjs public/models/complex.glb /tmp/complex_raw.glb
  python3 scripts/tree-clearance.py
"""
import bpy, json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/tmp/env_raw.glb')
env=set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath='/tmp/complex_raw.glb')
cx=[o for o in bpy.data.objects if o not in env]
blds=[o for o in cx if o.type=='MESH' and o.name.split('.')[0] in ('Podium','Tower B','Tower C','Annex','Media Screen')]
V=[];P=[]
for o in blds:
    b=len(V); m=o.matrix_world; V+=[m@v.co for v in o.data.vertices]; P+=[[b+i for i in p.vertices] for p in o.data.polygons]
bvh=BVHTree.FromPolygons(V,P)
DIRS=[Vector((0,0,1)),Vector((1,0,0)),Vector((-1,0,0)),Vector((0,1,0)),Vector((0,-1,0))]
moves={}
def n_inside(pts, shift):
    c=0
    for p in pts:
        q=p+shift
        if all(bvh.ray_cast(q,d,80)[0] is not None for d in DIRS): c+=1
    return c
for t in [o for o in env if o.name.startswith('Env_Tree') and o.parent is None]:
    objs=[o for o in [t]+list(t.children_recursive) if o.type=='MESH']
    pts=[o.matrix_world@v.co for o in objs for v in list(o.data.vertices)[::6]]
    if n_inside(pts, Vector())==0: continue
    root=t.matrix_world.translation.copy()
    best=None
    for sc in (1.0, 0.85, 0.72):
        sp=[root+(p-root)*sc for p in pts]
        for away in (Vector((1,0,0)),Vector((-1,0,0)),Vector((0,1,0)),Vector((0,-1,0))):
            step=0.0
            while step<=2.5 and n_inside(sp, away*step)>0: step+=0.25
            if step>2.5: continue
            step+=0.2
            cost=step+5*(1-sc)
            if best is None or cost<best[0]: best=(cost, sc, away*step)
    if best is None: print(t.name,'NO FIX'); continue
    _,sc,sh=best
    moves[t.name]={'dx':round(sh.x,2),'dz':round(-sh.y,2),'scale':sc}
    print(t.name, moves[t.name])
json.dump(moves, open('/tmp/tree_moves.json','w'))
