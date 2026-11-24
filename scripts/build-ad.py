"""
Sebotse listing commercial: about 55 s at 1080p, cut from the real drone flight over the site (2026-11-23), the film's
CG shots (scripts/build-film.py, with --assets for the furnished, real-material version) and a camera move through the
plan-D apartment (interior/D.blend, Cycles).

  1  drone   wide over the city                     title
  2  drone   panning across the neighbourhood       "In the heart of Ulaanbaatar"
  3  drone   top-down over the plot, pushing in ... dissolves into
  4  CG      descent: the same view from above, coming down to the towers
  5  CG      orbit round the west side
  6  CG      rise up tower C's facade
  7  CG      entrance: across the parking, through the curved glass into the hall
  8  CG      roof garden
  9  CG      the apartment, up to the window ... dissolves into
 10  drone   the real view from that height
 11  CG      finale, pulling back; end card

  blender -b -P scripts/build-ad.py -- --room --out DIR [--res 1920] [--samples 64] [--stills 0,72,143]
  blender -b -P scripts/build-ad.py -- --edit --film DIR --interior DIR --drone MP4 --mp4 OUT [--lang en|mn] [--phone '...']
--film is the film's frame folder holding frames 0-911 and 1000-1391 (build-film.py --render, twice: the default range,
then --start 1000 --end 1391). The drone video is the DJI original (DJI_20261123132136_0023_D.MP4, 3840x2160, 29.97 fps;
not in the repo): played frame for frame at 24 fps, so it runs at 0.8x, a calmer pace for aerials.
"""
import bpy, math, os, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FPS = 24
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return args[args.index(name) + 1] if name in args else default

# ---- the apartment move (plan-D scene, plan metres): from the room's back corner to the corner window ----
ROOM = dict(frames=60, lens=20, cam=[(15.4, -18.3, 1.45), (13.9, -19.5, 1.45)], aim=[(12.4, -20.5, 1.3), (13.8, -21.3, 1.6)])

# ---- the cut: (timeline frame, kind, source, first source frame, length); drone sources in video frames ----
CUT = [
    (0, "drone", None, 60, 120),          # wide over the city
    (120, "drone", None, 5035, 96),       # panning across the neighbourhood (2:48)
    (216, "drone", None, 2517, 108),      # top-down over the plot (1:24), pushing in
    (300, "film", None, 1000, 144),       # descent (24-frame dissolve from the drone's top-down)
    (444, "film", None, 144, 120),        # orbit
    (564, "film", None, 336, 144),        # rise
    (708, "film", None, 480, 144),        # roof
    (852, "film", None, 1200, 138),       # entrance, up to the shopfront glass (from 1338 the camera is inside the wall)
    (966, "room", None, 0, 60),           # the apartment, dissolving in through the glass
    (1002, "drone", None, 5874, 96),      # the real view (3:16), dissolving in over the window's last 24 frames
    (1098, "film", None, 768, 144),       # finale
]
DISSOLVES = {3: 24, 8: 24, 9: 24}   # cut index: frames it overlaps the one before
PUSH = {2: (1.0, 1.3)}       # slow zoom on a drone shot: scale at its start and end
END = 1242

TEXT = {   # the site's own copy (src/i18n), shown as (from, to, big line, small line)
    "en": [(14, 108, "SEBOTSE", "Chingeltei district, Ulaanbaatar"),
           (130, 210, "In the heart of Ulaanbaatar", ""),
           (470, 690, "Two towers", "16 storeys each"),
           (720, 848, "Podium and roof", "Shops and services below, a playground on the roof"),
           (972, 1060, "Your home", "Every apartment with a balcony"),
           (1138, 1242, "SEBOTSE", "Two 16-storey towers on a podium of shops and services")],
    "mn": [(14, 108, "СЭБОЦЭ", "Чингэлтэй дүүрэг, Улаанбаатар"),
           (130, 210, "Улаанбаатар хотын төвд", ""),
           (470, 690, "Хоёр цамхаг", "Тус бүр 16 давхар"),
           (720, 848, "Подиум, дээвэр", "Доор нь худалдаа үйлчилгээ, дээвэр дээр тоглоомын талбай"),
           (972, 1060, "Таны гэр", "Айл бүр тагттай"),
           (1138, 1242, "СЭБОЦЭ", "Худалдаа үйлчилгээний подиум дээрх 16 давхар хоёр цамхаг")],
}


FONT = None   # a serif for the titles when the system has Georgia (Latin and Cyrillic), else Blender's own


def load_font():
    global FONT
    p = "/System/Library/Fonts/Supplemental/Georgia.ttf"
    if os.path.exists(p):
        FONT = bpy.data.fonts.load(p)


def interior(out):
    """Render the apartment move from interior/D.blend with its own lights and materials (Cycles)."""
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "interior", "D.blend"))
    scene = bpy.context.scene
    cam = bpy.data.objects.new("Ad Cam", bpy.data.cameras.new("Ad Cam"))
    cam.data.lens = ROOM["lens"]
    scene.collection.objects.link(cam)
    aim = bpy.data.objects.new("Ad Aim", None)
    scene.collection.objects.link(aim)
    t = cam.constraints.new("TRACK_TO")
    t.target, t.track_axis, t.up_axis = aim, "TRACK_NEGATIVE_Z", "UP_Y"
    last = ROOM["frames"] - 1
    for ob, key in ((cam, "cam"), (aim, "aim")):
        for fr, loc in zip((0, last), ROOM[key]):
            ob.location = loc
            ob.keyframe_insert("location", frame=fr)
        for fc in ob.animation_data.action.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation, kp.easing = "SINE", "EASE_IN_OUT"
    scene.camera = cam
    res = int(arg("--res", 1920))
    r = scene.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = res, round(res * 9 / 16), 100
    r.image_settings.file_format, r.image_settings.quality = "JPEG", 92
    try:   # the Mac's GPU, several times faster than its CPU cores
        pr = bpy.context.preferences.addons["cycles"].preferences
        pr.compute_device_type = "METAL"
        pr.get_devices()
        for d in pr.devices:
            d.use = d.type != "CPU"
        scene.cycles.device = "GPU"
        print("AD cycles devices:", [(d.name, d.use) for d in pr.devices], flush=True)
    except Exception as e:
        print("AD no GPU:", e)
    scene.cycles.samples = int(arg("--samples", 64))
    scene.cycles.use_denoising = True
    os.makedirs(out, exist_ok=True)
    frames = [int(x) for x in arg("--stills").split(",")] if arg("--stills") else range(ROOM["frames"])
    for f in frames:
        path = os.path.join(out, f"{f:04d}.jpg")
        if os.path.exists(path):
            continue
        t0 = time.time()
        scene.frame_set(f)
        r.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"AD room frame {f} {time.time() - t0:.1f}s", flush=True)


def edit(film, room, drone, mp4, lang):
    load_font()
    scene = bpy.context.scene   # keyframes on strips land in the active scene, so no new one
    scene.render.fps = FPS
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1920, 1080, 100
    scene.view_settings.view_transform = "Standard"   # the frames are already graded (AgX), the drone is Rec.709
    scene.frame_start, scene.frame_end = 0, END - 1
    se = scene.sequence_editor_create()
    strips = se.strips

    def effect(name, kind, channel, a, b, i1=None, i2=None):
        return strips.new_effect(name, kind, channel=channel, frame_start=a, frame_end=b, input1=i1, input2=i2)

    def images(folder, first, n, channel, at):
        names = [f"{f:04d}.jpg" for f in range(first, first + n)]
        missing = [x for x in names if not os.path.exists(os.path.join(folder, x))]
        assert not missing, f"{folder}: missing {missing[:3]}..."
        s = strips.new_image(f"{os.path.basename(folder)} {first}", os.path.join(folder, names[0]), channel=channel, frame_start=at, fit_method="FIT")
        for x in names[1:]:
            s.elements.append(x)
        return s

    made = []
    for i, (at, kind, _, src, n) in enumerate(CUT):
        channel = 1 + i % 2   # alternate channels so dissolves can overlap
        if kind == "drone":
            s = strips.new_movie(f"drone {src}", drone, channel=channel, frame_start=at - src, fit_method="FIT")
            s.frame_final_start, s.frame_final_end = at, at + n
        else:
            s = images(film if kind == "film" else room, src, n, channel, at)
        if i in DISSOLVES:   # the strip before runs on under this one's first frames
            prev = made[-1]
            d = DISSOLVES[i]
            if prev.type == "MOVIE":
                prev.frame_final_end = at + d
            else:
                assert prev.frame_final_end >= at + d, f"cut {i - 1} too short for the dissolve"
            effect(f"dissolve {i}", "CROSS", 3 + i % 2, at, at + d, prev, s)
        if i in PUSH:
            a, b = PUSH[i]
            fit = s.transform.scale_x   # the 4K video fitted to 1080p
            for fr, sc in ((at, a), (at + n, b)):
                s.transform.scale_x = s.transform.scale_y = sc * fit
                s.transform.keyframe_insert("scale_x", frame=fr)
                s.transform.keyframe_insert("scale_y", frame=fr)
        made.append(s)

    # titles: white, soft shadow, lower left, fading in and out over 12 frames
    for a, b, big, small in TEXT[lang]:
        for line, size, y in ((big, 84 if big.isupper() else 64, 0.16), (small, 34, 0.105)):
            if not line:
                continue
            t = effect(f"text {a} {size}", "TEXT", 7 if size > 40 else 8, a, b)
            t.text, t.font_size, t.color = line, size, (1, 1, 1, 1)
            t.use_shadow, t.shadow_color, t.shadow_blur = True, (0, 0, 0, 0.85), 0.01
            if FONT:
                t.font = FONT
            t.location, t.alignment_x, t.anchor_x = (0.07, y), "LEFT", "LEFT"
            for fr, alpha in ((a, 0), (a + 12, 1), (b - 12, 1), (b, 0)):
                t.blend_alpha = alpha
                t.keyframe_insert("blend_alpha", frame=fr)
    phone = arg("--phone")
    if phone:
        t = effect("phone", "TEXT", 9, CUT[-1][0] + 54, END)   # over the finale
        t.text, t.font_size, t.color, t.location, t.alignment_x, t.anchor_x = phone, 34, (1, 1, 1, 1), (0.07, 0.06), "LEFT", "LEFT"

    # fade up from black and down to black; the OpenStreetMap credit the CG city needs, small, at the end
    black = effect("black", "COLOR", 10, 0, END)
    black.color = (0, 0, 0)
    for fr, alpha in ((0, 1), (18, 0), (END - 24, 0), (END - 1, 1)):
        black.blend_alpha = alpha
        black.keyframe_insert("blend_alpha", frame=fr)
    osm = effect("osm", "TEXT", 11, CUT[-1][0], END)   # from the finale on
    osm.text, osm.font_size, osm.color = "Map data © OpenStreetMap contributors", 18, (1, 1, 1, 0.7)
    osm.location, osm.alignment_x, osm.anchor_x = (0.97, 0.03), "RIGHT", "RIGHT"

    r = scene.render
    if arg("--preview"):   # a few stills of the cut instead of the video
        r.image_settings.file_format = "JPEG"
        for f in [int(x) for x in arg("--preview").split(",")]:
            scene.frame_set(f)
            r.filepath = os.path.join(os.path.dirname(os.path.abspath(mp4)), f"cut-{f:04d}.jpg")
            bpy.ops.render.render(write_still=True, scene=scene.name)
        return
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format, r.ffmpeg.codec = "MPEG4", "H264"
    r.ffmpeg.constant_rate_factor, r.ffmpeg.ffmpeg_preset = arg("--crf", "HIGH"), "BEST"
    r.ffmpeg.gopsize, r.ffmpeg.audio_codec = FPS, "NONE"
    r.filepath = os.path.abspath(mp4)
    bpy.ops.render.render(animation=True, scene=scene.name)
    print("AD wrote", mp4, os.path.getsize(mp4) // 1024, "KB")


if "--room" in args:
    interior(arg("--out"))
elif "--edit" in args:
    edit(arg("--film"), arg("--interior"), os.path.expanduser(arg("--drone")), arg("--mp4"), arg("--lang", "en"))
