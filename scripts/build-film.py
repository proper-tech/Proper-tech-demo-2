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
names, default MEDIUM; --width: output width, default the frames'). The site's film: --crf VERYLOW --width 1280 (720p, about 5 MB).
  blender -b -P scripts/build-film.py -- --city-glb public/models/blocks/city.glb --osm ... --facades DIR
writes the same city for the website's 3D view.
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
    # the listing commercial's own shots (scripts/build-ad.py), after the film's frames: render with --start 1000 --end 1391
    # descent: from straight above, where the drone's top-down shot of the plot dissolves in, down to the towers
    dict(name="descent", f=(1000, 1143), lens=35, cam=[(4, -12, 380), (-70, -105, 120)], aim=[(2, -6, 0), (1, -6, 22)], ease=True),
    # entrance: eye level across the parking, through the curved glass into the hall
    dict(name="entrance", f=(1200, 1391), lens=26, cam=[(-50, 30, 2.4), (-9, 18.5, 1.7)], aim=[(-18, 18.5, 3.4), (6, 17, 1.8)]),
]

# ---- photo facades for the real city (--facades): ambientCG texture, height of one tile in m (6 or 8 storeys of 3 m) ----
FACADES_LOW = [("Facade018A", 18), ("Facade019A", 18), ("Facade020A", 18)]   # brick and concrete, most buildings
FACADE_TALL = ("Facade006", 24)                                               # glass grid, buildings 30 m and up

# ---- real buildings that overlap the street model by a few metres (the drawing's east street is 17 m wide, the map's
# 5 m), so they would be left out: cut back along a line instead, keeping the part left of p -> q (site plan u, v) ----
CLIP = {
    219982200: ((36.90, 37.80), (43.14, -79.79)),   # Гэрэл төв: 4 m back from the east street's kerb
}
# ---- streets the map lacks, so that no street runs into a wall: the drawing's east street, which stops at v = -80, carried
# on 31 m and round the corner into the street behind it, out to the secondary street (along a map service lane, made a
# 7 m street). Any building a street's middle line runs through is left out (here Керамик Арт Студи and one more) ----
EXTRA_ROADS = [
    {"w": 10.5, "lanes": 2, "line": [(33.9, -80.0), (35.6, -111.2)]},   # the east street's last metres, as wide as drawn
    {"w": 7, "line": [(30.0, -107.0), (44.6, -108.7), (81.4, -106.9), (96.8, -105.8)]},
]
# ---- tidying round the site: map buildings within CLEAR m of the site or street model are left out (they crowd it; the
# cut-back ones in CLIP stay), and so are the service lanes (driveways, parking aisles: the narrowest streets) within
# SERVICE_CLEAR m of the site, which mostly ran into the plot. Bits of street shorter than MIN_RUN m, left where the model
# cuts a street, are dropped too. Service lanes further out are drawn without sidewalks. ----
CLEAR, SERVICE_W, SERVICE_CLEAR, SITE, MIN_RUN = 6.0, 5, 150.0, (0.0, -15.0), 25.0


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


def uv_per_metre(ob):
    """How finely a street-model surface's texture is laid: UV units per metre along its edges (the median)."""
    me, r = ob.data, []
    uv = me.uv_layers.active.data
    for p in me.polygons:
        li = list(p.loop_indices)
        for a, b in zip(li, li[1:] + li[:1]):
            d = (me.vertices[me.loops[a].vertex_index].co - me.vertices[me.loops[b].vertex_index].co).length
            if d > 0.5:
                r.append((uv[a].uv - uv[b].uv).length / d)
    return sorted(r)[len(r) // 2]


def clip(ring, p, q):
    """The part of an outline left of the line p -> q (one half-plane of Sutherland-Hodgman)."""
    side = lambda a: (q[0] - p[0]) * (a[1] - p[1]) - (q[1] - p[1]) * (a[0] - p[0])
    out = []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        sa, sb = side(a), side(b)
        if sa >= 0:
            out.append(a)
        if (sa >= 0) != (sb >= 0):
            t = sa / (sa - sb)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


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
    cell = 25.0

    def road_grid(rs):
        """The streets' segments by 25 m square, to find the streets near a point."""
        g = {}
        for k, r in enumerate(rs):
            hw = r["w"] / 2
            for p, q in zip(r["line"], r["line"][1:]):
                for i in range(math.floor((min(p[0], q[0]) - hw) / cell), math.floor((max(p[0], q[0]) + hw) / cell) + 1):
                    for j in range(math.floor((min(p[1], q[1]) - hw) / cell), math.floor((max(p[1], q[1]) + hw) / cell) + 1):
                        g.setdefault((i, j), []).append((k, p, q, hw))
        return g

    def on_road(x, y, skip=-1):
        """Does (x, y) lie on a street's asphalt (any but street number `skip`)?"""
        for k, p, q, hw in grid.get((math.floor(x / cell), math.floor(y / cell)), ()):
            vx, vy = q[0] - p[0], q[1] - p[1]
            t = max(0, min(1, ((x - p[0]) * vx + (y - p[1]) * vy) / (vx * vx + vy * vy or 1)))
            if k != skip and math.hypot(x - p[0] - t * vx, y - p[1] - t * vy) < hw:
                return True
        return False

    def model_street(x, y):
        """Is (x, y) on one of the street model's roads?"""
        hit, _, _, i, ob, _ = scene.ray_cast(depsgraph, Vector((x, y, 300)), Vector((0, 0, -1)))
        m = hit and ob.material_slots and ob.material_slots[ob.data.polygons[i].material_index].material
        return bool(m) and m.name.startswith("Env Street Asphalt")

    def dead_end_at_site(k, r):
        """Does the street stop near the site without meeting another street or one of the model's roads (it ran
        into the plot)?"""
        for x, y in (r["line"][0], r["line"][-1]):
            if on_road(x, y, skip=k) or model_street(x, y):
                continue
            if any(modelled(x + rad * math.cos(a * math.pi / 8), y + rad * math.sin(a * math.pi / 8))
                   for rad in (5, 10, 15, 20, 25) for a in range(16)):
                return True
        return False

    service_near = lambda r: r["w"] <= SERVICE_W and any(math.dist(p, SITE) < SERVICE_CLEAR for p in r["line"])
    roads = [r for r in data["roads"] if not service_near(r)]
    grid = road_grid(roads + EXTRA_ROADS)
    roads = [r for k, r in enumerate(roads) if not dead_end_at_site(k, r)] + EXTRA_ROADS
    grid = road_grid(roads)
    # points every 2 m along every street's middle line, by 25 m square: a building with one inside stands on a street
    mids = {}
    for r in roads:
        for p, q in zip(r["line"], r["line"][1:]):
            for x, y in along(p, q, 2.0):
                mids.setdefault((math.floor(x / cell), math.floor(y / cell)), []).append((x, y))

    def on_street(ring):
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        return any(inside(x, y, ring)
                   for i in range(math.floor(min(xs) / cell), math.floor(max(xs) / cell) + 1)
                   for j in range(math.floor(min(ys) / cell), math.floor(max(ys) / cell) + 1)
                   for x, y in mids.get((i, j), ()))

    def crowds_site(ring):
        """Is the site or street model within CLEAR metres outside this outline?"""
        ccw = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1])) > 0
        for p, q in zip(ring, ring[1:] + ring[:1]):
            d = math.dist(p, q)
            if d < 0.1:
                continue
            nx, ny = (q[1] - p[1]) / d, -(q[0] - p[0]) / d   # outward for a counter-clockwise outline
            if not ccw:
                nx, ny = -nx, -ny
            for x, y in along(p, q, 2.0):
                if any(modelled(x + nx * o, y + ny * o) for o in (CLEAR / 3, CLEAR * 2 / 3, CLEAR)):
                    return True
        return False

    bm, kept, dropped = bmesh.new(), 0, {"on the model": 0, "on a street": 0, "against the site": 0, "in a camera's way": 0}
    uv = bm.loops.layers.uv.new("UVMap")
    for b in data["buildings"]:
        ring = [tuple(p) for i, p in enumerate(b["ring"]) if p != b["ring"][i - 1]]   # no repeated points
        if b["id"] in CLIP:
            ring = clip(ring, *CLIP[b["id"]])
        if len(ring) < 3:
            continue
        edge_pts = [pt for p, q in zip(ring, ring[1:] + ring[:1]) for pt in along(p, q)]
        cx, cy = sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
        if any(modelled(x, y) for x, y in edge_pts + [(cx, cy)]):
            dropped["on the model"] += 1
            continue
        if on_street(ring):
            dropped["on a street"] += 1
            continue
        if b["id"] not in CLIP and math.dist((cx, cy), SITE) < 300 and crowds_site(ring):
            dropped["against the site"] += 1
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

    # streets, made like the street model's roads so they carry on past its edges: its asphalt in 4 m pieces of
    # flat ribbon (round discs at the bends), a sidewalk each side and dashed lane lines; each piece left out
    # where the model already is or where it would lie on another street's asphalt (junctions)
    road_mat, walk_mat, paint_mat = (bpy.data.materials[n] for n in ("Env Street Asphalt", "Env Sidewalk", "Env Road Paint"))
    s_road, s_walk = uv_per_metre(bpy.data.objects["Env_MainRoad"]), uv_per_metre(bpy.data.objects["Env_PublicSidewalk"])
    bm, pieces = bmesh.new(), {"asphalt": 0, "sidewalk": 0, "dash": 0}
    uv = bm.loops.layers.uv.new("UVMap")

    def face(pts, z, mat, s):
        """A flat face at height z (counter-clockwise, so it faces up), with UVs at s per metre."""
        f = bm.faces.new([bm.verts.new((x, y, z)) for x, y in pts])
        for loop, (x, y) in zip(f.loops, pts):
            loop[uv].uv = (x * s, y * s)
        f.material_index = mat

    def strip(a, c, n, o0, o1):
        """The corners of the band from offset o0 to o1 (o0 < o1) beside the line a -> c, n its unit left normal."""
        return [(a[0] + n[0] * o1, a[1] + n[1] * o1), (a[0] + n[0] * o0, a[1] + n[1] * o0),
                (c[0] + n[0] * o0, c[1] + n[1] * o0), (c[0] + n[0] * o1, c[1] + n[1] * o1)]

    # heights: sidewalks under the asphalt (which hides them where they reach into a junction), paint on top
    Z_WALK, Z_ROAD, Z_PAINT, WALK, DASH, GAP = 0.03, 0.08, 0.12, 2.5, 3.0, 6.0
    for k, r in enumerate(roads):
        hw = r["w"] / 2
        lanes = r.get("lanes") or max(2, round(r["w"] / 3.5))   # lane lines between lanes about 3.5 m wide, on streets 7 m and wider
        dividers = [(j - lanes / 2) * r["w"] / lanes for j in range(1, lanes)] if r["w"] >= 7 else []
        # the street's 4 m pieces in order along it, each [a, c, unit left normal, drawn?]: drawn where the model isn't
        segs, parts = [], []
        for p, q in zip(r["line"], r["line"][1:]):
            d = math.dist(p, q)
            if d < 0.05:
                continue
            n = (-(q[1] - p[1]) / d, (q[0] - p[0]) / d)
            pts = along(p, q)
            segs.append((p, q, d, n, len(parts), len(pts) - 1))
            parts += [[a, c, n, not modelled((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)] for a, c in zip(pts, pts[1:])]
        i = 0   # a run of drawn pieces shorter than MIN_RUN is a scrap the model cut off a street: not drawn
        while i < len(parts):
            j = i
            while j < len(parts) and parts[j][3]:
                j += 1
            if j > i and sum(math.dist(pc[0], pc[1]) for pc in parts[i:j]) < MIN_RUN:
                for pc in parts[i:j]:
                    pc[3] = False
            i = j + 1
        for a, c, n, drawn in parts:
            if not drawn:
                continue
            face(strip(a, c, n, -hw, hw), Z_ROAD, 0, s_road)
            pieces["asphalt"] += 1
            if r["w"] <= SERVICE_W:
                continue   # service lanes: no sidewalks
            mx, my = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
            for o0, o1 in ((hw, hw + WALK), (-hw - WALK, -hw)):
                ox, oy = mx + n[0] * (o0 + o1) / 2, my + n[1] * (o0 + o1) / 2
                if not modelled(ox, oy) and not on_road(ox, oy):
                    face(strip(a, c, n, o0, o1), Z_WALK, 1, s_walk)
                    pieces["sidewalk"] += 1
        run = 0.0   # distance along the street, so the dashes keep their rhythm round the bends
        for p, q, d, n, first, count in segs:
            t = (-run) % (DASH + GAP)   # the first dash on this stretch
            while dividers and t + DASH <= d:
                if parts[first + min(count - 1, int((t + DASH / 2) / (d / count)))][3]:   # only on drawn asphalt
                    a = (p[0] + (q[0] - p[0]) * t / d, p[1] + (q[1] - p[1]) * t / d)
                    c = (p[0] + (q[0] - p[0]) * (t + DASH) / d, p[1] + (q[1] - p[1]) * (t + DASH) / d)
                    for o in dividers:
                        ox, oy = (a[0] + c[0]) / 2 + n[0] * o, (a[1] + c[1]) / 2 + n[1] * o
                        if not modelled(ox, oy) and not on_road(ox, oy, skip=k):
                            face(strip(a, c, n, o - 0.075, o + 0.075), Z_PAINT, 2, 0)
                            pieces["dash"] += 1
                t += DASH + GAP
            run += d
        for (_, (x, y), _, _, first, count), nxt in zip(segs, segs[1:]):   # round discs at the bends, where drawn both sides
            if parts[first + count - 1][3] and parts[nxt[4]][3]:
                face([(x + hw * math.cos(j * math.pi / 4), y + hw * math.sin(j * math.pi / 4)) for j in range(8)], Z_ROAD, 0, s_road)
    me = bpy.data.meshes.new("Film OSM Streets")
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("Film OSM Streets", me)
    scene.collection.objects.link(ob)
    for m in (road_mat, walk_mat, paint_mat):
        me.materials.append(m)
    print(f"FILM OSM streets: {pieces}")

    # the street model's lawn east of the east street is really a building (Гэрэл төв, put back above, see CLIP):
    # paved like the sidewalks instead, its texture scaled to theirs. After the rest, which takes it for open ground.
    far = bpy.data.objects.get("Env_EastStreet_FarLawn")
    if far:
        k = s_walk / uv_per_metre(far)
        for loop in far.data.uv_layers.active.data:
            loop.uv *= k
        far.data.materials[0] = walk_mat


# ---- listing finish (--assets DIR): real materials and exterior furnishing, warm modern luxury. DIR holds Poly Haven
# CC0 assets (scripts/fetch-film-assets.py): tex/<id>/<id>_{diff,rough,nor}.jpg and models/<id>/<id>_1k.gltf ----
# material: (texture, tile size m, how, tint, roughness low..high, bump) - "multiply" keeps the model's own panel joints and
# baked shadows under the texture, "replace" drops them, "swap" puts the texture into the material's own image slots
FINISH = {
    # (the street model's lawn, pavers and sidewalks already wear real textures: left as they are)
    "Facade White PodiumAO": ("marble_01", 3.0, "multiply", (2.2, 2.1, 1.95), (0.3, 0.55), 0.15),   # warm limestone podium
    "Facade White": ("marble_01", 3.0, "multiply", (2.2, 2.1, 1.95), (0.3, 0.55), 0.15),
    "TB Panel White": ("plastered_wall_02", 3.0, "multiply", (1.4, 1.33, 1.2), (0.45, 0.7), 0.1),   # warm render, towers
    "TB Panel White.001": ("plastered_wall_02", 3.0, "multiply", (1.4, 1.33, 1.2), (0.45, 0.7), 0.1),
    "TB Slab Edge": ("marble_01", 3.0, "replace", (1.2, 1.15, 1.1), (0.3, 0.55), 0.1),
    "TB Slab Edge.001": ("marble_01", 3.0, "replace", (1.2, 1.15, 1.1), (0.3, 0.55), 0.1),
    "D Cladding": ("teak_veneer", 1.6, "replace", (0.8, 0.7, 0.62), (0.35, 0.6), 0.2),               # block D in teak
    "Pavers": ("marble_01", 2.0, "replace", (1.1, 1.08, 1.05), (0.35, 0.75), 0.3),                   # stone paving
    "RG_Deck_Tiles": ("hinoki_planks", 2.0, "replace", (0.95, 0.85, 0.75), (0.45, 0.8), 0.3),
    "RG_Wood": ("teak_veneer", 1.0, "replace", (0.85, 0.75, 0.65), (0.35, 0.6), 0.2),
    "Bench_Timber": ("teak_veneer", 1.0, "replace", (0.85, 0.75, 0.65), (0.35, 0.6), 0.2),
    "Env Street Asphalt": ("asphalt_02", 5.0, "replace", (0.3, 0.3, 0.3), (0.6, 0.95), 0.2),
    "Env Asphalt": ("asphalt_02", 5.0, "replace", (0.33, 0.33, 0.33), (0.6, 0.95), 0.2),
}
GLASS = {"TB Glass Curtain", "TB Glass Curtain.001", "TB Glass Window", "TB Glass Window.001", "Glass", "Glass.001",
         "Glass Shopfront", "D Glass", "D Curtain Wall", "RG_Glass"}
METAL = {   # base colour, roughness: bronze frames, champagne trims
    "TB Mullion": ((0.2, 0.13, 0.08), 0.32), "TB Mullion.001": ((0.2, 0.13, 0.08), 0.32),
    "Dark Metal PodiumAO": ((0.1, 0.065, 0.04), 0.35), "Dark Metal": ((0.1, 0.065, 0.04), 0.35),
    "D Frame": ((0.2, 0.13, 0.08), 0.32), "D Railing": ((0.2, 0.13, 0.08), 0.32),
    "A Tri Silver PodiumAO": ((0.62, 0.53, 0.41), 0.3), "A Tri Silver": ((0.62, 0.53, 0.41), 0.3),
}
# furnishing: (asset, x, y, turn deg, scale); the ground under each is found by ray, and a piece whose footprint isn't clear
# paving, deck or lawn at one height is left out (and said so), so nothing lands in a wall, a car or a hedge
FURNITURE = [
    # north-west corner plaza on the main road, by the two benches
    ("modular_street_seating", -37.5, 36.6, 0, 1), ("planter_box_02", -43.0, 35.5, 0, 1.2), ("planter_box_02", -32.0, 35.5, 0, 1.2),
    ("tree_small_02", -44.0, 37.8, 30, 1.0), ("tree_small_02", -30.5, 37.8, 200, 0.9),
    # roof garden courtyard: cafe tables and big planters round the pavilion
    # (tower B overhangs the deck north of y 9.8 between x -4 and 18)
    ("outdoor_table_chair_set_01", -6.0, -6.0, 15, 1), ("outdoor_table_chair_set_01", -10.0, 10.0, -20, 1),
    ("outdoor_table_chair_set_01", 10.0, -6.0, 40, 1), ("outdoor_table_chair_set_01", -8.0, 18.0, 70, 1),
    ("planter_box_01", -15.5, 8.0, 90, 1.3), ("potted_plant_04", -8.5, 4.5, 0, 1.6), ("potted_plant_01", 6.0, -7.5, 0, 1.6),
]
BOLLARDS = [(-44 + 4 * i, 39.8) for i in range(12)] + [(-21.5, -14 + 3.5 * i) for i in range(9)]
BIKE_RACKS = [(-26.0 + 1.0 * i, 37.5) for i in range(5)]
CANOPY = dict(x=(-22.6, -18.3), y=(-24.0, -16.0), z=5.9)   # teak canopy over the market's west entrance pavilion
INTERIOR_LIGHTS = [(-13, 19), (-8, 21), (-8, 14), (-4, 6), (-3, -8), (6, 2), (8, -14), (12, 20)]   # hall and market ceilings
PLANTING = dict(per_m2=0.8, box=(-60, -90, 60, 60), kinds=["shrub_01", "shrub_02", "shrub_04", "grass_medium_01"])


def _img(path, colour=True):
    im = bpy.data.images.load(path, check_existing=True)
    if not colour:
        im.colorspace_settings.name = "Non-Color"
    return im


def pbr(m, folder, tid, size, how, tint, rough, bump):
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    f = lambda kind: os.path.join(folder, "tex", tid, f"{tid}_{kind}.jpg")
    if how == "swap":   # same UVs, real images
        for n in nt.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                normal = n.image.colorspace_settings.name == "Non-Color" or "nor" in n.image.name.lower()
                n.image = _img(f("nor"), False) if normal else _img(f("diff"))
        return
    geo = nt.nodes.new("ShaderNodeNewGeometry")   # world position: one scale in metres on every object
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / size,) * 3
    nt.links.new(geo.outputs["Position"], mp.inputs["Vector"])

    def tex(kind, colour=True):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image, t.projection, t.projection_blend = _img(f(kind), colour), "BOX", 0.25
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t

    d = tex("diff")
    col = d.outputs["Color"]
    if tint:
        mt = nt.nodes.new("ShaderNodeMix"); mt.data_type, mt.blend_type = "RGBA", "MULTIPLY"
        mt.inputs["Factor"].default_value = 1
        nt.links.new(col, mt.inputs[6]); mt.inputs[7].default_value = (*tint, 1)
        col = mt.outputs[2]
    if how == "multiply" and b.inputs["Base Color"].is_linked:
        prev = b.inputs["Base Color"].links[0].from_socket
        mm = nt.nodes.new("ShaderNodeMix"); mm.data_type, mm.blend_type = "RGBA", "MULTIPLY"
        mm.inputs["Factor"].default_value = 1
        nt.links.new(prev, mm.inputs[6]); nt.links.new(col, mm.inputs[7])
        col = mm.outputs[2]
    nt.links.new(col, b.inputs["Base Color"])
    if os.path.exists(f("rough")):
        mr = nt.nodes.new("ShaderNodeMapRange")
        nt.links.new(tex("rough", False).outputs["Color"], mr.inputs["Value"])
        mr.inputs["To Min"].default_value, mr.inputs["To Max"].default_value = rough
        nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])
    b.inputs["Metallic"].default_value = 0
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value, bp.inputs["Distance"].default_value = bump, 0.02
    nt.links.new(d.outputs["Color"], bp.inputs["Height"])
    if b.inputs["Normal"].is_linked:
        nt.links.new(b.inputs["Normal"].links[0].from_socket, bp.inputs["Normal"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])


def plain(name, rgb, rough, metal=0.0, emit=0.0):
    m = matte(name, rgb, rough)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (1.0, 0.72, 0.42, 1)   # 2700 K
        b.inputs["Emission Strength"].default_value = emit
    return m


def ground_at(x, y, top=80.0):
    """The first surface straight down at (x, y): (z, object, material name), or None."""
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, _n, idx, ob, _m = bpy.context.scene.ray_cast(dg, Vector((x, y, top)), Vector((0, 0, -1)))
    if not hit:
        return None
    ev = ob.evaluated_get(dg).data
    mats = ev.materials
    name = mats[ev.polygons[idx].material_index].name if mats and idx < len(ev.polygons) else ""
    return loc.z, ob, name


FLOOR = ("Pavers", "Paving", "Sidewalk", "Deck", "Lawn", "Concrete", "Rubber", "Planting")


def clear_spot(x, y, r):
    """Height of a level patch of floor of radius r round (x, y), or None if anything else is in the way."""
    zs = []
    for dx, dy in [(0, 0)] + [(r * math.cos(a), r * math.sin(a)) for a in (0, 1.57, 3.14, 4.71, 0.79, 2.36, 3.93, 5.5)]:
        g = ground_at(x + dx, y + dy)
        if not g or not any(k in g[2] for k in FLOOR):
            return None
        zs.append(g[0])
    return zs[0] if max(zs) - min(zs) < 0.25 else None


def model(folder, aid):
    """A Poly Haven model, loaded once into a hidden collection with its base at z 0, for instancing."""
    coll = bpy.data.collections.get("PH " + aid)
    if coll:
        return coll
    coll = bpy.data.collections.new("PH " + aid)
    before = set(bpy.data.objects)
    path = next(os.path.join(folder, "models", aid, n) for n in os.listdir(os.path.join(folder, "models", aid)) if n.endswith(".gltf"))
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        for c in o.users_collection:
            c.objects.unlink(o)
        coll.objects.link(o)
    pts = [o.matrix_world @ Vector(v) for o in new if o.type == "MESH" for v in o.bound_box]
    coll.instance_offset = (sum(p.x for p in pts) / len(pts), sum(p.y for p in pts) / len(pts), min(p.z for p in pts))
    coll["radius"] = max(max(p.x for p in pts) - min(p.x for p in pts), max(p.y for p in pts) - min(p.y for p in pts)) / 2
    return coll


def place(scene, coll, x, y, z, turn, scale):
    e = bpy.data.objects.new("Film " + coll.name, None)
    e.instance_type, e.instance_collection = "COLLECTION", coll
    e.location, e.rotation_euler, e.scale = (x, y, z), (0, 0, math.radians(turn)), (scale,) * 3
    scene.collection.objects.link(e)


def finish(scene, folder):
    t0 = time.time()
    for name, spec in FINISH.items():
        m = bpy.data.materials.get(name)
        if m:
            pbr(m, folder, *spec)
    for m in bpy.data.materials:
        b = m.node_tree and next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not b:
            continue
        if m.name in GLASS:   # dark warm-grey glass that reflects the sky and the city, no more flat blue
            b.inputs["Base Color"].default_value = (0.07, 0.09, 0.105, 1)
            b.inputs["Roughness"].default_value, b.inputs["Metallic"].default_value = 0.04, 0.0
            b.inputs["Specular IOR Level"].default_value = 0.7
            if "--hall" in args and m.name in ("Glass", "Glass Shopfront"):   # the podium's ground floor: see the lit hall through it
                b.inputs["Alpha"].default_value = 0.3
                m.use_transparent_shadow = True
        elif m.name in METAL:
            b.inputs["Base Color"].default_value = (*METAL[m.name][0], 1)
            b.inputs["Roughness"].default_value, b.inputs["Metallic"].default_value = METAL[m.name][1], 1.0


    # the hidden library collection for instancing lives outside the view layer's render
    lib = bpy.data.collections.new("Film Library")
    scene.collection.children.link(lib)
    skipped = []
    for aid, x, y, turn, scale in FURNITURE:
        coll = model(folder, aid)
        if coll.name not in lib.children:
            lib.children.link(coll)
        z = clear_spot(x, y, coll["radius"] * scale)
        if z is None:
            skipped.append(f"{aid}@{x},{y}")
            continue
        place(scene, coll, x, y, z, turn, scale)

    # planting: shrubs and grasses scattered over the site's lawns (not the far underlay), where a ray finds lawn
    import random
    rng = random.Random(7)
    kinds = [model(folder, k) for k in PLANTING["kinds"]]
    for c in kinds:
        if c.name not in lib.children:
            lib.children.link(c)
    lawn = bpy.data.objects.get("Env_Lawn")
    n_plants = 0
    if lawn:
        me = lawn.data
        x0, y0, x1, y1 = PLANTING["box"]
        for p in me.polygons:
            c = lawn.matrix_world @ p.center
            if not (x0 < c.x < x1 and y0 < c.y < y1):
                continue
            for _ in range(int(p.area * PLANTING["per_m2"] + rng.random())):
                # a random point on the face: a random vertex pair blend (good enough on the lawn's small faces)
                vs = [lawn.matrix_world @ me.vertices[i].co for i in p.vertices]
                a, b2 = rng.random(), rng.random()
                pt = vs[0].lerp(vs[1], a).lerp(vs[-1], b2 * (1 - a))
                g = ground_at(pt.x, pt.y)
                if g and g[1] == lawn:
                    place(scene, rng.choice(kinds), pt.x, pt.y, g[0], rng.uniform(0, 360), rng.uniform(0.7, 1.3))
                    n_plants += 1
    # the originals stay out of the view layer (hiding them from render would hide every instance too)
    scene.view_layers[0].layer_collection.children[lib.name].exclude = True

    # entrance canopy: a thin slab, bronze edge, teak soffit, warm downlights in the soffit
    teak = bpy.data.materials.new("Film Canopy Teak"); teak.use_nodes = True
    pbr(teak, folder, "teak_veneer", 1.2, "replace", (1.0, 0.9, 0.8), (0.35, 0.55), 0.2)
    bronze = plain("Film Bronze", (0.2, 0.13, 0.08), 0.32, 1.0)
    (cx0, cx1), (cy0, cy1), cz = CANOPY["x"], CANOPY["y"], CANOPY["z"]
    bpy.ops.mesh.primitive_cube_add(size=1, location=((cx0 + cx1) / 2, (cy0 + cy1) / 2, cz))
    can = bpy.context.object
    can.name, can.scale = "Film Canopy", (cx1 - cx0, cy1 - cy0, 0.3)
    bpy.ops.object.transform_apply(scale=True)
    can.data.materials.append(bronze); can.data.materials.append(teak)
    for p in can.data.polygons:
        p.material_index = 1 if p.normal.z < -0.5 else 0   # soffit in teak
    lamp = plain("Film Lamp", (1, 0.9, 0.8), 0.4, emit=12.0)
    for i in range(4):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.02, location=((cx0 + cx1) / 2, cy0 + (i + 0.5) * (cy1 - cy0) / 4, cz - 0.16))
        bpy.context.object.data.materials.append(lamp)

    # bollard lights along the main road's sidewalk and the parking edge: bronze posts with a lit band
    for x, y in BOLLARDS:
        g = ground_at(x, y)
        if not g or not any(k in g[2] for k in FLOOR):
            continue
        bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.85, location=(x, y, g[0] + 0.425))
        post = bpy.context.object; post.name = "Film Bollard"; post.data.materials.append(bronze)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.082, depth=0.08, location=(x, y, g[0] + 0.74))
        bpy.context.object.data.materials.append(lamp)
    # bike racks: bronze staples
    for x, y in BIKE_RACKS:
        g = ground_at(x, y)
        if not g:
            continue
        bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.025, location=(x, y, g[0]), rotation=(math.radians(90), 0, 0))
        bpy.context.object.data.materials.append(bronze)
    # last (its 16 000 objects would slow every ray above): the podium's ground floor fitted out (interior/A1: the hall and the market, in the site's own frame), lit warm
    # only with --hall (the entrance shot): its hundreds of shop materials take EEVEE half an hour to compile
    if "--hall" not in args:
        INTERIOR_LIGHTS.clear()
    else:
        bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "public/models/interior/A1.glb"))
    for x, y in INTERIOR_LIGHTS:
        light = bpy.data.lights.new("Film Hall Light", "AREA")
        light.energy, light.size, light.color = 900, 2.5, (1.0, 0.82, 0.62)
        ob = bpy.data.objects.new("Film Hall Light", light)
        ob.location = (x, y, 4.2)
        scene.collection.objects.link(ob)
    print(f"FILM finish: {len(FURNITURE) - len(skipped)} pieces, {n_plants} plants in {time.time() - t0:.0f} s; left out: {skipped}", flush=True)


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
    if arg("--assets"):
        finish(scene, arg("--assets"))

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
    hour = float(arg("--time", 10.5))   # local time on 15 June; ~20.3 is the golden hour before sunset
    golden = hour > 18                  # then the physical sky, which follows the low sun (the HDRI is a midday sky)
    if sky_path and os.path.exists(sky_path) and not golden:
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
        p.year, p.month, p.day, p.time = 2026, 6, 15, hour
        if golden:   # the sky's sun follows the light's; warm, low light
            sky.sky_type = "NISHITA"
            p.sky_texture = sky.name
            bg.inputs["Strength"].default_value = 0.25
            sun_data.color, sun_data.energy = (1.0, 0.62, 0.36), 4.0
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


def export_city(path):
    """The film's city (--osm, --facades) for the website's 3D view (three/BuildingScene.tsx): only the buildings
    and streets, with only the colour maps, scaled to 512 px (the view never comes close enough to need more),
    Draco-compressed. Same frame as the site's other models."""
    obs = [bpy.data.objects["Film OSM Buildings"], bpy.data.objects["Film OSM Streets"]]
    for m in obs[0].data.materials:
        nt = m.node_tree
        b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        for n in list(nt.nodes):
            if n.type == "NORMAL_MAP" or (n.type == "TEX_IMAGE" and n.image.colorspace_settings.name == "Non-Color"):
                nt.nodes.remove(n)   # roughness, metalness and normal maps: not worth their weight on the web
            elif n.type == "TEX_IMAGE":
                n.image.scale(512, 512)
        b.inputs["Roughness"].default_value = 0.45 if FACADE_TALL[0] in m.name else 0.9   # glass a little glossy
    # the streets wear the street model's own materials: plain stand-ins named after them here ("City Sidewalk" for
    # "Env Sidewalk"), which the website swaps for the ones it already has from environment.glb (no second copy)
    me = obs[1].data
    for i, m in enumerate(me.materials):
        me.materials[i] = matte(m.name.replace("Env ", "City ", 1), tuple(m.diffuse_color[:3]))
    bpy.ops.object.select_all(action="DESELECT")
    for ob in obs:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(path), export_format="GLB", use_selection=True,
                              export_image_format="JPEG", export_jpeg_quality=80,
                              export_draco_mesh_compression_enable=True, export_draco_position_quantization=16,
                              export_draco_texcoord_quantization=16)   # street UVs run to ±200: finer, or the asphalt jumps between pieces
    print("FILM wrote", path, os.path.getsize(path) // 1024, "KB")


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
    names = sorted(n for n in os.listdir(frames_dir) if n.endswith(".jpg") and int(n[:4]) < 1000)   # 1000+ are the commercial's shots
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
    elif "--city-glb" in args:
        export_city(arg("--city-glb"))
