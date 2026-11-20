"""
Tenger Residence home-page film: a 38-second cinematic flight round the complex, rendered with EEVEE from the
site's own 3D model (public/models/complex.glb + public/models/blocks/environment.glb), so every building is
the one on the drawings. No text in the picture: the page lays its own titles over it, in three languages.

Six shots, hard cuts between them (24 fps):
  1  arrival     f   0-143   high from the main road (north-east), pushing in on both towers
  2  orbit       f 144-335   a slow arc round the west side: podium front, parking, both towers
  3  rise        f 336-479   from the street at tower C's south-west corner up its facade to the roof
  4  roof        f 480-623   a glide over the podium-roof playground between the towers
  5  street      f 624-767   eye level, walking up to the podium's glazed west entrance
  6  finale      f 768-911   pulling back and up from the west, the podium front, both towers and block D

Light: the sun over Ulaanbaatar (47.92 N, 106.92 E, UTC+8) on 15 June at 10:30, placed by the Sun Position
add-on when it is installed (otherwise a fixed sun from the same direction), and a sky image for ambient light
and reflections (--sky, e.g. Poly Haven's kloofendal_48d_partly_cloudy_puresky_2k.hdr; without it Blender's
own physical sky is used).

  blender -b -P scripts/build-film.py -- --stills 70,240,400,550,700,880 --out DIR [--res 960] [--samples 16]
  blender -b -P scripts/build-film.py -- --render --out DIR [--start 0] [--end 911] [--res 1920] [--samples 48]
  blender -b -P scripts/build-film.py -- --encode --out DIR --mp4 public/media/film.mp4
Options go after --, plus --sky PATH and --osm scripts/osm-surroundings.json (the real city round the site from
OpenStreetMap, made by scripts/fetch-osm.py, in place of the generated blocks; the film must then credit "Map data
© OpenStreetMap contributors"), and with it --facades DIR: photo facades on those buildings from ambientCG's
CC0 textures Facade018A, Facade019A, Facade020A and Facade006 (the 1K-JPG zips unpacked into DIR/<name>/; not in
the repo, like the sky). --render writes DIR/0000.jpg ... and skips frames already there, so an
interrupted render resumes. --encode joins DIR's frames into a silent H.264 MP4 (--crf: Blender's quality
names, default MEDIUM; --width: output width, default the frames'). The site's film: --crf LOW --width 1600.
"""
import bpy, addon_utils, math, os, sys, time
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FPS, LAST = 24, 911
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default

# ---- shots: frames, lens (mm), camera path and the point it looks at (site plan: x east, y north, z up, m) ----
SHOTS = [
    dict(name="arrival", f=(0, 143), lens=35, cam=[(92, 150, 112), (58, 98, 74)], aim=[(2, -6, 24), (2, -8, 26)]),
    dict(name="orbit", f=(144, 335), lens=32, orbit=dict(c=(2, -6), r=112, z=(42, 48), a=(208, 152)), aim=[(0, -4, 22), (0, -2, 26)]),
    dict(name="rise", f=(336, 479), lens=24, cam=[(-38, -52, 2.5), (-33, -47, 52)], aim=[(-6, -24, 16), (-2, -21, 56)]),
    dict(name="roof", f=(480, 623), lens=28, cam=[(-44, 3, 27), (-8, 1, 22)], aim=[(14, 0, 13), (24, -1, 12)]),
    dict(name="street", f=(624, 767), lens=30, cam=[(-62, 9, 1.7), (-40, 14, 1.7)], aim=[(-16, 17, 7), (-15, 18, 7)]),
    # from the west: from the south-west a real 15-storey slab just south of block D hides it (--osm)
    dict(name="finale", f=(768, 911), lens=35, cam=[(-97, -14, 48), (-202, -14, 96)], aim=[(1, -14, 24), (2, -16, 28)], ease=True),
]

# ---- photo facades for the real city (--facades): ambientCG texture, height of one tile in m (6 or 8 storeys of 3 m) ----
FACADES_LOW = [("Facade018A", 18), ("Facade019A", 18), ("Facade020A", 18)]   # brick and concrete, most buildings
FACADE_TALL = ("Facade006", 24)                                               # glass grid, buildings 30 m and up


def matte(name, rgb, rough=0.95):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def facade(name, wall):
    """Plain walls with a grid of dark windows (1.8 m wide, 3 m storeys) on the sides, flat roofs."""
    m = matte(name, wall, 0.85)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    coord = nt.nodes.new("ShaderNodeTexCoord")
    xyz = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Object"], xyz.inputs[0])
    run = nt.nodes.new("ShaderNodeMath"); run.operation = "ADD"   # along either wall direction
    nt.links.new(xyz.outputs["X"], run.inputs[0]); nt.links.new(xyz.outputs["Y"], run.inputs[1])
    vec = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(run.outputs[0], vec.inputs["X"]); nt.links.new(xyz.outputs["Z"], vec.inputs["Y"])
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.offset, brick.squash = 0.0, 1.0
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Brick Width"].default_value = 1.8
    brick.inputs["Row Height"].default_value = 3.0
    brick.inputs["Mortar Size"].default_value = 0.55
    brick.inputs["Color1"].default_value = brick.inputs["Color2"].default_value = (0.07, 0.09, 0.11, 1)
    brick.inputs["Mortar"].default_value = (*wall, 1)
    nt.links.new(vec.outputs[0], brick.inputs["Vector"])
    # roofs (normal pointing up) stay plain wall colour
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nz = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], nz.inputs[0])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    nt.links.new(nz.outputs["Z"], mix.inputs["Factor"])
    nt.links.new(brick.outputs["Color"], mix.inputs[6])
    mix.inputs[7].default_value = (*wall, 1)
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return m


def city():
    """A plain city round the site: 40 m blocks between 14 m streets, out to 700 m, kept clear of the street
    model (x -120..140, y -130..150). Mostly 4-9 storeys with a few towers, in light concrete and beige."""
    import random
    rng = random.Random(11)
    mats = [facade(f"Film City {i}", c) for i, c in enumerate([(0.62, 0.6, 0.56), (0.7, 0.66, 0.58), (0.55, 0.55, 0.55), (0.68, 0.62, 0.52)])]
    pitch, block = 54, 40
    for i in range(-13, 14):
        for j in range(-13, 14):
            cx, cy = i * pitch + 10, j * pitch + 10
            if -120 - block < cx < 140 + block and -130 - block < cy < 150 + block:
                continue
            if math.hypot(cx, cy) > 720:
                continue
            for k in range(rng.choice((1, 2, 2, 3))):
                w, d = rng.uniform(14, 34), rng.uniform(12, 30)
                h = rng.choice((12, 15, 18, 21, 24, 27)) if rng.random() > 0.12 else rng.uniform(40, 75)
                x = cx + rng.uniform(-(block - w) / 2, (block - w) / 2)
                y = cy + rng.uniform(-(block - d) / 2, (block - d) / 2)
                bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, h / 2))
                ob = bpy.context.object
                ob.name = "Film City"
                ob.scale = (w, d, h)
                bpy.ops.object.transform_apply(scale=True)
                ob.data.materials.append(rng.choice(mats))


def photo_facade(folder, asset):
    """A wall material from an unpacked ambientCG facade: colour, roughness, metalness and normal maps on UVs
    measured in tiles (osm_city sets them). Only the JPEG maps are read, never the zip's .blend."""
    m = bpy.data.materials.new("Film Facade " + asset)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")

    def tex(kind, colour=False):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(os.path.join(folder, asset, f"{asset}_1K-JPG_{kind}.jpg"))
        if not colour:
            t.image.colorspace_settings.name = "Non-Color"
        return t

    nt.links.new(tex("Color", True).outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex("Roughness").outputs["Color"], b.inputs["Roughness"])
    nt.links.new(tex("Metalness").outputs["Color"], b.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tex("NormalGL").outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def camera_path():
    """Points along every shot's camera path (x, y, z), to keep real buildings out of the cameras' way."""
    pts = []
    for s in SHOTS:
        for k in range(41):
            t = k / 40
            if "orbit" in s:
                o = s["orbit"]
                a = math.radians(o["a"][0] + (o["a"][1] - o["a"][0]) * t)
                pts.append((o["c"][0] + o["r"] * math.cos(a), o["c"][1] + o["r"] * math.sin(a), o["z"][0] + (o["z"][1] - o["z"][0]) * t))
            else:
                (x0, y0, z0), (x1, y1, z1) = s["cam"]
                pts.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t))
    return pts


def osm_city(path):
    """The real city round the site (scripts/osm-surroundings.json, from scripts/fetch-osm.py; map data
    © OpenStreetMap contributors): buildings extruded to their height, streets as flat asphalt. Left out: any
    building or bit of street on the site or the street model (the plot's old buildings, small misfits of the
    map), and buildings a camera would fly through. Call after the models and the ground are in the scene."""
    import json, bmesh
    data = json.load(open(path))
    scene = bpy.context.scene
    # the street model's big lawn round the site reads as a park (and tints nearby walls green): not here
    under = bpy.data.objects.get("Env_Grass_Underlay")
    if under:
        bpy.data.objects.remove(under)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def modelled(x, y):
        """Does the site or street model already cover this point (anything but lawn and the plain ground)?"""
        hit, _, _, i, ob, _ = scene.ray_cast(depsgraph, Vector((x, y, 300)), Vector((0, 0, -1)))
        if not hit or ob.name == "Film Ground":
            return False
        m = ob.material_slots[ob.data.polygons[i].material_index].material if ob.material_slots else None
        return not (m and "Lawn" in m.name)

    def along(p, q, step=4.0):
        """Points every `step` metres from p to q (both included)."""
        n = max(1, math.ceil(math.dist(p, q) / step))
        return [(p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n) for k in range(n + 1)]

    def inside(x, y, ring):
        c = False
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
                c = not c
        return c

    def near(x, y, ring, d):
        """Within d metres of the outline (or inside it)?"""
        if inside(x, y, ring):
            return True
        for p, q in zip(ring, ring[1:] + ring[:1]):
            vx, vy = q[0] - p[0], q[1] - p[1]
            t = max(0, min(1, ((x - p[0]) * vx + (y - p[1]) * vy) / (vx * vx + vy * vy or 1)))
            if math.hypot(x - p[0] - t * vx, y - p[1] - t * vy) < d:
                return True
        return False

    cams = camera_path()
    folder = arg("--facades")
    if folder:
        # photo facades (low ones brick or concrete, towers glass), then a plain roof as the last material
        looks = FACADES_LOW + [FACADE_TALL]
        mats = [photo_facade(folder, a) for a, _ in looks] + [matte("Film Roof", (0.42, 0.42, 0.4), 0.9)]
    else:
        mats = [facade(f"Film City {i}", c) for i, c in enumerate([(0.62, 0.6, 0.56), (0.7, 0.66, 0.58), (0.55, 0.55, 0.55), (0.68, 0.62, 0.52)])]
    bm, kept, dropped = bmesh.new(), 0, {"on the model": 0, "in a camera's way": 0}
    uv = bm.loops.layers.uv.new("UVMap")
    for b in data["buildings"]:
        ring = [tuple(p) for i, p in enumerate(b["ring"]) if p != b["ring"][i - 1]]   # no repeated points
        if len(ring) < 3:
            continue
        edge_pts = [pt for p, q in zip(ring, ring[1:] + ring[:1]) for pt in along(p, q)]
        cx, cy = sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
        if any(modelled(x, y) for x, y in edge_pts + [(cx, cy)]):
            dropped["on the model"] += 1
            continue
        if any(z < b["h"] + 3 and near(x, y, ring, 4) for x, y, z in cams):
            dropped["in a camera's way"] += 1
            continue
        if sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1])) < 0:
            ring.reverse()   # counter-clockwise, so the walls face out
        lo = [bm.verts.new((x, y, 0)) for x, y in ring]
        hi = [bm.verts.new((x, y, b["h"])) for x, y in ring]
        try:
            faces = [bm.faces.new((lo[i], lo[i - len(ring) + 1], hi[i - len(ring) + 1], hi[i])) for i in range(len(ring))]
            faces.append(bm.faces.new(hi))
        except ValueError:   # a self-touching outline; skip it
            continue
        if folder:
            k = len(FACADES_LOW) if b["h"] >= 30 else b["id"] % len(FACADES_LOW)
            tile = looks[k][1]
            run = 0.0   # walls: UVs in tiles, along the outline and up from the ground, so storeys stay 3 m
            for f, (p, q) in zip(faces, zip(ring, ring[1:] + ring[:1])):
                u0, u1, v1 = run / tile, (run + math.dist(p, q)) / tile, b["h"] / tile
                for loop, (u, v) in zip(f.loops, ((u0, 0), (u1, 0), (u1, v1), (u0, v1))):
                    loop[uv].uv = (u, v)
                f.material_index = k
                run += math.dist(p, q)
            faces[-1].material_index = len(mats) - 1   # the roof
        else:
            for f in faces:
                f.material_index = b["id"] % len(mats)
        kept += 1
    me = bpy.data.meshes.new("Film OSM Buildings")
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("Film OSM Buildings", me)
    scene.collection.objects.link(ob)
    for m in mats:
        me.materials.append(m)
    print(f"FILM OSM buildings: {kept} kept, left out {dropped}")

    # streets: 4 m pieces of flat ribbon (round discs at the bends), just above the plain ground
    bm, pieces = bmesh.new(), 0
    for r in data["roads"]:
        w, z = r["w"] / 2, 0.02
        for p, q in zip(r["line"], r["line"][1:]):
            d = math.dist(p, q)
            if d < 0.05:
                continue
            nx, ny = -(q[1] - p[1]) / d * w, (q[0] - p[0]) / d * w
            pts = along(p, q)
            for a, c in zip(pts, pts[1:]):
                if modelled((a[0] + c[0]) / 2, (a[1] + c[1]) / 2):
                    continue
                bm.faces.new([bm.verts.new(v) for v in ((a[0] + nx, a[1] + ny, z), (a[0] - nx, a[1] - ny, z), (c[0] - nx, c[1] - ny, z), (c[0] + nx, c[1] + ny, z))])
                pieces += 1
        for x, y in r["line"][1:-1]:
            if not modelled(x, y):
                bm.faces.new([bm.verts.new((x + w * math.cos(k * math.pi / 4), y + w * math.sin(k * math.pi / 4), z)) for k in range(8)])
    me = bpy.data.meshes.new("Film OSM Streets")
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("Film OSM Streets", me)
    scene.collection.objects.link(ob)
    me.materials.append(matte("Film Street", (0.05, 0.05, 0.05), 0.9))
    print(f"FILM OSM streets: {pieces} pieces")


def build():
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    for f in ("public/models/complex.glb", "public/models/blocks/environment.glb"):
        bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, f))
    print(f"FILM imported {len(bpy.data.objects)} objects in {time.time() - t0:.0f} s")

    # the street model's paving is plain white (the website never shows it): real tones, for the film only
    tones = {"Env Asphalt": (0.055,) * 3, "Env Street Asphalt": (0.05,) * 3, "Env Sidewalk": (0.32, 0.32, 0.31),
             "Env Pavers": (0.36, 0.35, 0.34), "Env Concrete": (0.4, 0.4, 0.39), "Env Lawn": (0.1, 0.17, 0.055)}
    for name, rgb in tones.items():
        m = bpy.data.materials.get(name)
        b = m and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if b:
            b.inputs["Base Color"].default_value = (*rgb, 1)

    # ground out to the horizon, and a plain city round the site so the aerials aren't a model in a void
    # a grid of 400 m squares, not one 40 km quad: on two giant triangles the sun's shadows lose precision and
    # the ground speckles differently every frame (the twitching in the hero)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=100, y_subdivisions=100, size=40000, location=(0, 0, -0.05))
    ground = bpy.context.object
    ground.name = "Film Ground"
    ground.data.materials.append(matte("Film Ground", (0.15, 0.145, 0.13)))
    if arg("--osm"):
        osm_city(arg("--osm"))
    else:
        city()

    # sky: an HDRI if given, else Blender's physical sky
    world = bpy.data.worlds.new("Film Sky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    sky_path = arg("--sky")
    if sky_path and os.path.exists(sky_path):
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(sky_path)
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.8
    else:
        sky = nt.nodes.new("ShaderNodeTexSky")
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.35

    # the sun over Ulaanbaatar, mid-June mid-morning
    sun_data = bpy.data.lights.new("Film Sun", "SUN")
    sun_data.energy = 3.5
    sun_data.angle = math.radians(0.6)
    sun = bpy.data.objects.new("Film Sun", sun_data)
    scene.collection.objects.link(sun)
    mods = [m.__name__ for m in addon_utils.modules() if m.__name__.endswith("sun_position")]
    if mods:
        addon_utils.enable(mods[0], default_set=True)  # its handlers look up its own preferences entry
        p = scene.sun_pos_properties
        p.sun_object = sun
        p.latitude, p.longitude, p.UTC_zone = 47.918, 106.917, 8
        p.year, p.month, p.day, p.time = 2026, 6, 15, 10.5
        print("FILM sun from Sun Position: elevation", round(math.degrees(p.sun_elevation), 1), "azimuth", round(math.degrees(p.sun_azimuth), 1))
    else:
        sun.rotation_euler = (math.radians(32), 0, math.radians(-118))  # about the same: high, from the south-east
        print("FILM sun fixed (Sun Position add-on not installed)")

    # cameras, one per shot, switched by timeline markers
    for s in SHOTS:
        cam = bpy.data.objects.new("Cam " + s["name"], bpy.data.cameras.new("Cam " + s["name"]))
        cam.data.lens = s["lens"]
        cam.data.clip_start, cam.data.clip_end = 0.3, 4000
        scene.collection.objects.link(cam)
        aim = bpy.data.objects.new("Aim " + s["name"], None)
        scene.collection.objects.link(aim)
        track = cam.constraints.new("TRACK_TO")
        track.target, track.track_axis, track.up_axis = aim, "TRACK_NEGATIVE_Z", "UP_Y"
        f0, f1 = s["f"]
        if "orbit" in s:
            o = s["orbit"]
            steps = 8
            for k in range(steps + 1):
                t = k / steps
                a = math.radians(o["a"][0] + (o["a"][1] - o["a"][0]) * t)
                cam.location = (o["c"][0] + o["r"] * math.cos(a), o["c"][1] + o["r"] * math.sin(a), o["z"][0] + (o["z"][1] - o["z"][0]) * t)
                cam.keyframe_insert("location", frame=round(f0 + (f1 - f0) * t))
        else:
            for fr, loc in zip((f0, f1), s["cam"]):
                cam.location = loc
                cam.keyframe_insert("location", frame=fr)
        for fr, loc in zip((f0, f1), s["aim"]):
            aim.location = loc
            aim.keyframe_insert("location", frame=fr)
        # steady speed through a shot (the cuts carry the rhythm); the last shot eases to a stop
        for ob in (cam, aim):
            for fc in ob.animation_data.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "SINE" if s.get("ease") else "LINEAR"
                    if s.get("ease"):
                        kp.easing = "EASE_OUT"
        scene.timeline_markers.new(s["name"], frame=f0).camera = cam
    scene.camera = bpy.data.objects["Cam " + SHOTS[0]["name"]]

    # EEVEE, film look
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    ee = scene.eevee
    ee.taa_render_samples = int(arg("--samples", 48))
    for prop, value in (("use_raytracing", True), ("use_shadows", True), ("use_gtao", True)):
        if hasattr(ee, prop):
            setattr(ee, prop, value)
    vs = scene.view_settings
    try:
        vs.view_transform = "AgX"
        vs.look = "AgX - Medium High Contrast"
    except TypeError as e:
        print("FILM colour look not set:", e)
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end = 0, LAST
    res = int(arg("--res", 1920))
    scene.render.resolution_x, scene.render.resolution_y = res, round(res * 9 / 16)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92
    return scene


def render(scene, frames, out):
    os.makedirs(out, exist_ok=True)
    for f in frames:
        path = os.path.join(out, f"{f:04d}.jpg")
        if os.path.exists(path):
            continue
        t = time.time()
        scene.frame_set(f)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"FILM frame {f} {time.time() - t:.1f}s", flush=True)


def encode(frames_dir, mp4):
    scene = bpy.data.scenes.new("film")
    se = scene.sequence_editor_create()
    strips = getattr(se, "strips", None) or se.sequences
    names = sorted(n for n in os.listdir(frames_dir) if n.endswith(".jpg"))
    strip = strips.new_image("frames", os.path.join(frames_dir, names[0]), channel=1, frame_start=1)
    for n in names[1:]:
        strip.elements.append(n)
    scene.frame_start, scene.frame_end = 1, len(names)
    scene.render.fps = FPS
    img = bpy.data.images.load(os.path.join(frames_dir, names[0]))
    w = int(arg("--width", img.size[0]))  # H.264 needs even sizes
    scene.render.resolution_x, scene.render.resolution_y = w, round(w * img.size[1] / img.size[0] / 2) * 2
    scene.render.resolution_percentage = 100
    r = scene.render
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format, r.ffmpeg.codec = "MPEG4", "H264"
    r.ffmpeg.constant_rate_factor = arg("--crf", "MEDIUM")
    r.ffmpeg.ffmpeg_preset = "BEST"
    r.ffmpeg.gopsize = FPS
    r.ffmpeg.audio_codec = "NONE"
    r.filepath = os.path.abspath(mp4)
    bpy.ops.render.render(animation=True, scene=scene.name)
    print("FILM wrote", mp4, os.path.getsize(mp4) // 1024, "KB")


out = arg("--out", os.path.join(ROOT, "film_frames"))
if "--encode" in args:
    encode(out, arg("--mp4", os.path.join(ROOT, "public", "media", "film.mp4")))
else:
    sc = build()
    if "--stills" in args:
        render(sc, [int(x) for x in arg("--stills").split(",")], out)
    elif "--render" in args:
        render(sc, range(int(arg("--start", 0)), int(arg("--end", LAST)) + 1), out)
