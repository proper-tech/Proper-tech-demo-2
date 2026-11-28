"""Put the real street round the podium into an open podium scene (A2.blend, A3.blend) before its panoramas are
rendered: through the glass one sees the site's streets, pavements, trees and cars (public/models/blocks/
environment.glb), the city round it (city.glb: OpenStreetMap buildings, map data © OpenStreetMap contributors) and
block D (D.glb), all in site metres like the podium scenes. The scene's own stand-in ground (flat grass and two
roads, Ground_* and Pavement_*) goes. Nothing is saved: run it before render_panos.py in the same Blender,
    blender -b A2.blend -P tools/add_city.py -P render_panos.py -- A2
(render_a2.bat does). CITY_MODELS=<dir> takes the three files from another folder (a Blender without Draco
needs copies made by scripts/gltf-decompress.mjs).
"""
import bpy, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DIR = os.environ.get("CITY_MODELS") or os.path.join(ROOT, "public", "models", "blocks")
sc = bpy.context.scene
# The street sits in this scene's frame (build_podium2.py puts floor 2 at 0, so the street is at -4.5, and
# floor 3's street at -8.1). It goes 2 cm lower still, because the floor below the escalator void lies on
# the street's plane and two coplanar faces would render with black shadow artefacts.
gz = float(sc.get("ground_z", -4.5)) - 0.02

for o in [o for o in bpy.data.objects if o.name.startswith(("Ground_", "Pavement_"))]:
    bpy.data.objects.remove(o, do_unlink=True)

for name in ("environment.glb", "city.glb", "D.glb"):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(DIR, name))
    for o in set(bpy.data.objects) - before:
        if o.parent is None:
            o.location.z += gz
        # a camera or light that came with a model would replace the scene's own
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o, do_unlink=True)

# The big lawn under the site model would read as a park, so it is removed; the real city stands there,
# as it does on the website.
for n in ("Env_Grass_Underlay",):
    o = bpy.data.objects.get(n)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
# The street model's paving is given real tones (as in scripts/build-film.py), and the city's streets use the
# street model's materials, because city.glb carries stand-ins named "City Sidewalk" and so on.
tones = {"Env Asphalt": (0.055,) * 3, "Env Street Asphalt": (0.05,) * 3, "Env Sidewalk": (0.32, 0.32, 0.31),
         "Env Pavers": (0.36, 0.35, 0.34), "Env Concrete": (0.4, 0.4, 0.39), "Env Lawn": (0.1, 0.17, 0.055)}
for name, rgb in tones.items():
    m = bpy.data.materials.get(name)
    b = m and m.node_tree and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b:
        b.inputs["Base Color"].default_value = (*rgb, 1)
for o in bpy.data.objects:
    if o.type == "MESH":
        for slot in o.material_slots:
            m = slot.material
            if m and m.name.startswith("City "):
                own = bpy.data.materials.get(m.name.replace("City ", "Env ", 1))
                if own:
                    slot.material = own
# The scene camera must stay the podium's own, because the imported files bring cameras of their own.
cam = bpy.data.objects.get("Pano_D1")
if cam:
    sc.camera = cam
print("add_city: street, city and block D in at z", round(gz, 2), flush=True)
