"""Flat 16:9 window views: what each apartment sees through its window, for every floor, facing and season.

The spheres (video_spheres.py) let a visitor look round; these are the plain pictures a buyer compares: one per
floor (4-16), per facing (the six apartment directions of src/data/building.ts) and per season, all framed the same
way, so stepping through floors or seasons changes only the height or the season.

  masters   For each floor the drone turned a circle at (4, 5, 7, 11, 14, 16) and each facing, the 4K video frames
            around that heading are placed by the flight data, corrected against each other (refine.py) and drawn
            into one level picture: true heading of the facing, 5° below the horizon, 72° wide, 3840 x 2160.
            Each pixel comes from the frame whose centre is nearest, so moving cars don't ghost. Written to
            interior/views/window/masters/ with masters.json (height, time, frames, how much was photographed).
  finals    Every floor 4-16 and facing, 64° wide and 6° down, 2560 x 1440 WebP, into public/views/window/<facing>/
            floor-NN/<season>.webp with public/views/window/manifest.json. A photographed floor is its master cut
            to 64°. Any other floor takes the master photographed nearest its eye level for that facing and moves
            the ground as the ground would move (a ground point seen at elevation e from height h is seen at
            -atan(h' tan(-e) / h) from height h'; above the horizon nothing moves); a floor below its master tilts
            up as little as keeps it inside the master (fit_pitch: floor 4 looks 3.4° down). Winter is the photograph
            (25 November: light snow, bare trees); spring, summer and autumn come from the master's season edits
            in interior/views/window/seasons/<master>-<season>.png (PROMPTS below, GPT Image 2.6 on
            Higgsfield), moved the same way, so every floor shows the same edit and only the height changes.

All views are from the drone's hover spot, 14 m west of block B's west face. For the east-facing apartments the
windows are 25-35 m further east, so near things sit a little differently; the skyline does not. Tower C uses
tower B's views, as the spheres do.

  python3 interior/tools/drone/window_views.py masters ~/Desktop/videos/dji_fly_20261125_115900_0179_….MP4
  python3 interior/tools/drone/window_views.py finals
"""
import argparse
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import camera  # noqa: E402
import refine  # noqa: E402
import telemetry  # noqa: E402
import video_spheres as vs  # noqa: E402

# The 2026-11-25 flight (README.md): compass 12.83° east of true north, ground at the take-off point.
NORTH_FIX = -12.83
GROUND = 1377.2
# Seconds of clip 0179 each circle was flown in; floor 11 is the spiral (35.9 m sinking to 29.4 m). The floor-4
# circle (438-466 s, 10.8 m) is not used: 2.4 m under the floor's eye level, beside a street hoarding and the
# containers on the site, which fill its views and which no window will see; floor 4 is moved down from floor 5.
STATIONS = {5: (388, 416), 7: (350, 384), 11: (305, 333), 14: (268, 294), 16: (221, 253)}
# The gimbal's pitch through each circle (the flight data's median), which sets how high above the horizon it saw.
FRAME_PITCH = {5: -4.5, 7: -4.5, 11: -8.0, 14: -8.0, 16: -1.1}
# src/data/building.ts and views.ts: plan headings of the six facings, and the plan's north 8.89° west of true.
FACINGS = {"NE": 45, "E": 90, "SE": 135, "SW": 225, "W": 270, "NW": 315}
PLAN_NORTH = -8.89
SEASONS = ("spring", "summer", "autumn")
# The season edits: each master (16:9) goes to GPT Image 2.6 on Higgsfield with one of these, 16:9, 4K, quality
# high, the master as the only reference image (3.25 credits). Check each with `check` before using it.
PROMPTS = {
    "spring": (
        "Edit this photo: change the season from early winter to late spring (late May) in Ulaanbaatar. Keep every building, window, road, car, sign, crane and the camera framing exactly where they are, pixel-aligned, same perspective, same field of view and same image size. Only change seasonal things: remove all snow from roofs and ground, give the trees and bushes fresh light-green young leaves (not too many flowers), put thin new green grass on bare ground patches, make the sky a clear pale spring blue with a few light clouds and soft, slightly cool bright daylight, and thin the winter haze. Keep every sign, logo and piece of lettering exactly as it is. Keep the distant hills on the horizon where they are (only clearer), add no new hills or buildings. Natural, true-to-life colours, not oversaturated. Photorealistic, like a real photograph, no new objects."
    ),
    "summer": (
        "Edit this photo: change the season from early winter to mid-summer (July) in Ulaanbaatar. Keep every building, window, road, car, sign, crane and the camera framing exactly where they are, pixel-aligned, same perspective, same field of view and same image size. Only change seasonal things: remove all snow from roofs and ground, make the trees and bushes full and green with summer leaves, put green grass on bare ground patches, make the sky a clear deep summer blue with a few soft white clouds and bright, natural midday sunlight, and clear the winter haze. Keep every sign, logo and piece of lettering exactly as it is. Keep the distant hills on the horizon where they are (only clearer), add no new hills or buildings. Natural, true-to-life colours, not oversaturated. Photorealistic, like a real photograph, no new objects."
    ),
    "autumn": (
        "Edit this photo: change the season from early winter to early autumn (late September) in Ulaanbaatar. Keep every building, window, road, car, sign, crane and the camera framing exactly where they are, pixel-aligned, same perspective, same field of view and same image size. Only change seasonal things: remove all snow from roofs and ground, give the trees and bushes yellow, orange and brown autumn leaves with a few fallen leaves on the ground, make bare ground patches dry straw-coloured grass, make the sky a crisp clear autumn blue with low, slightly warm afternoon sunlight, and thin the winter haze. Keep every sign, logo and piece of lettering exactly as it is. Keep the distant hills on the horizon where they are (only clearer), add no new hills or buildings. Natural, true-to-life colours, not oversaturated. Photorealistic, like a real photograph, no new objects."
    ),
}

PITCH = -5.0                     # the masters: a person at the window looks a little down, as the drone did
# The views themselves look 6° down: the circles at floors 11 and 14 were flown 8° down, so their frames reach only
# 13.5° above the horizon; a 64° view at -6° stops at 13.4° and so shows no sky or rooftop the camera never saw.
FINAL_PITCH = -6.0
MASTER_W, MASTER_H, MASTER_FOV = 3840, 2160, 72.0
FINAL_W, FINAL_H, FINAL_FOV = 2560, 1440, 64.0
REACH = 32.0                     # degrees either side of the heading that frames are taken from

ROOT = os.path.join("interior", "views", "window")
MASTERS = os.path.join(ROOT, "masters")
EDITS = os.path.join(ROOT, "seasons")
PUBLIC = os.path.join("public", "views", "window")


# The six facings are not evenly spaced (south-east to south-west and north-west to north-east are 90° apart) and a
# master is 72° wide, so the 360° spheres also need these two, due plan north and south; no apartment faces them.
GAP_HEADINGS = {"N": 0, "S": 180}
SPHERE_SECTORS = ("NE", "E", "SE", "S", "SW", "W", "NW", "N")


def heading(facing):
    return ({**FACINGS, **GAP_HEADINGS}[facing] + PLAN_NORTH) % 360


def view_rotation(hdg, pitch):
    """Camera (OpenCV axes) to world (north, east, down) for a level camera at this heading and pitch."""
    return camera.euler_matrix(hdg, pitch, 0.0) @ camera._P.T


def view_rays(w, h, fov, hdg, pitch):
    """World direction of every pixel of a pinhole view."""
    K = camera.intrinsics(w, h, fov)
    u, v = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    c = np.stack([(u - K[0, 2]) / K[0, 0], (v - K[1, 2]) / K[1, 1], np.ones_like(u)], -1)
    d = c @ view_rotation(hdg, pitch).T
    return d / np.linalg.norm(d, axis=-1, keepdims=True)


def project(d, w, h, fov, R):
    """Pixel coordinates of world directions d in a pinhole view (camera-to-world R); -1 where behind."""
    K = camera.intrinsics(w, h, fov)
    cam = d @ R
    z = cam[..., 2]
    ok = z > 1e-3
    z = np.where(ok, z, 1)
    u = np.where(ok, K[0, 0] * cam[..., 0] / z + K[0, 2], -1).astype(np.float32)
    v = np.where(ok, K[1, 1] * cam[..., 1] / z + K[1, 2], -1).astype(np.float32)
    return u, v


def true_rotation(row):
    """The frame's camera-to-world rotation with true north (the flight data's is by compass)."""
    return camera.euler_matrix(NORTH_FIX, 0, 0) @ camera.body_to_world(row) @ camera._P.T


def ang(a, b):
    return abs((a - b + 180) % 360 - 180)


def pick_frames(video, rows, t0, t1, hdg, off):
    """The sharpest frame per 5° of heading and 6° of pitch within REACH of the heading, at full resolution."""
    best = {}
    for t, img in camera.read_frames(video, t0, t1, 10, 960):
        r = vs.row_at(rows, t + off)
        yaw = (r["yaw"] + NORTH_FIX) % 360
        if ang(yaw, hdg) > REACH:
            continue
        r2 = vs.row_at(rows, t + off + 0.1)
        turn = ang(r2["yaw"], r["yaw"]) / 0.1
        score = vs.sharpness(img) / (1 + turn / 20)
        k = (round(((yaw - hdg + 180) % 360 - 180) / 5), round(r["pitch"] / 6))
        if k not in best or score > best[k][0]:
            best[k] = (score, t)
    out = []
    for _, t in sorted(best.values(), key=lambda x: x[1]):
        img = camera.grab(video, t)
        if img is not None:
            out.append((dict(vs.row_at(rows, t + off)), img))
    return out


def compose(frames, hdg):
    """The master view from placed frames; returns (image uint8, mask of photographed pixels).

    The frame that looks most nearly along the view covers nearly all of it on its own; the others only fill what
    it misses, each under the ones before it, blended over a narrow edge. A blend of every frame by distance from
    its centre (as the spheres do) leaves a seam every few degrees, and each seam through a moving car ghosts it."""
    h, w = frames[0][1].shape[:2]
    D = view_rays(MASTER_W, MASTER_H, MASTER_FOV, hdg, PITCH)
    order = sorted(frames, key=lambda f: ang((f[0]["yaw"] + NORTH_FIX) % 360, hdg) + abs(f[0]["pitch"] - PITCH))
    out = np.zeros((MASTER_H, MASTER_W, 3))
    cover = np.zeros((MASTER_H, MASTER_W))
    edge = 0.03                                    # feather: 3% of the frame's half-width
    for row, img in order:
        if cover.min() > 0.999:
            break
        u, v = project(D, w, h, vs.HFOV, row["Rt"])
        inside = (u >= 0) & (u <= w - 1) & (v >= 0) & (v <= h - 1)
        if not inside.any():
            continue
        samp = cv2.remap(img, u, v, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE).astype(np.float64)
        margin = np.minimum(1 - np.abs(u - w / 2) / (w / 2), 1 - np.abs(v - h / 2) / (h / 2))
        a = np.where(inside, np.clip(margin / edge, 0, 1), 0)
        add = (1 - cover) * a
        out += samp * add[..., None]
        cover += add
    img = out / np.where(cover > 0, cover, 1)[..., None]
    return img.clip(0, 255).astype(np.uint8), cover > 0.5


def fill_from_sphere(img, hits, sphere_path, hdg):
    """Fills what the frames missed. Below the horizon (a corner of street) from the floor's published sphere,
    whose band is the same flight; above it, where only sky is missing, by
    inpainting from the photograph round it (B-05's sphere is from another day, with other clouds). Blended over
    a soft edge."""
    sph = cv2.imread(sphere_path)
    sh, sw = sph.shape[:2]
    D = view_rays(MASTER_W, MASTER_H, MASTER_FOV, hdg, PITCH)
    az = np.degrees(np.arctan2(D[..., 1], D[..., 0]))
    el = np.degrees(np.arcsin(np.clip(-D[..., 2], -1, 1)))
    x = ((az + 180) / 360 * sw).astype(np.float32)          # true north in the middle column
    y = ((90 - el) / 180 * sh).astype(np.float32)
    fill = cv2.remap(sph, x, y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP)
    sky = el > 0                                             # the blend band too, or the sphere shows through it
    if (sky & ~hits).any():
        s = 4                                                # inpaint at quarter size: sky has no detail
        small = cv2.resize(img, (MASTER_W // s, MASTER_H // s), interpolation=cv2.INTER_AREA)
        hole = cv2.resize((~hits).astype(np.uint8), (MASTER_W // s, MASTER_H // s), interpolation=cv2.INTER_NEAREST)
        painted = cv2.inpaint(small, cv2.dilate(hole, None, iterations=2), 12, cv2.INPAINT_TELEA)
        painted = cv2.resize(painted, (MASTER_W, MASTER_H), interpolation=cv2.INTER_CUBIC)
        fill = np.where(sky[..., None], painted, fill)
    inner = cv2.erode(hits.astype(np.uint8), None, iterations=2)
    d = cv2.distanceTransform(inner, cv2.DIST_L2, 5)
    a = np.clip(d / 40.0, 0, 1)[..., None]
    return (img * a + fill * (1 - a)).clip(0, 255).astype(np.uint8)


def masters(args):
    video = args.video
    rows, _ = telemetry.load(video, os.path.join(os.path.expanduser("~"), ".cache", "drone-telemetry"))
    os.makedirs(MASTERS, exist_ok=True)
    meta_path = os.path.join(MASTERS, "masters.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    spheres = json.load(open(os.path.join("public", "views", "manifest.json")))
    floors = [int(f) for f in args.floors.split(",")] if args.floors else sorted(STATIONS)
    facings = args.facings.split(",") if args.facings else list(FACINGS)
    for floor in floors:
        t0, t1 = STATIONS[floor]
        off = vs.sync_offset(video, rows, t0)
        for facing in facings:
            hdg = heading(facing)
            frames = pick_frames(video, rows, t0, t1, hdg, off)
            near = [ang((r["yaw"] + NORTH_FIX) % 360, hdg) for r, _ in frames]
            if not frames or min(near) > 6:
                print(f"floor {floor} {facing}: the circle never faced {hdg:.0f}°, skipped", flush=True)
                continue
            if len(frames) > 1:
                refined = refine.refine(frames, vs.HFOV, log=lambda *a: None)
                frames = [(r, img) for r, (_, img) in zip(refined, frames)]
            for r, _ in frames:
                r["Rt"] = true_rotation(r)
            img, hits = compose(frames, hdg)
            if not hits.all():
                img = fill_from_sphere(img, hits, os.path.join("public", spheres["B"][str(floor)]["src"].lstrip("/")),
                                       hdg)
            name = f"B-{floor:02d}-{facing}"
            cv2.imwrite(os.path.join(MASTERS, name + ".jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 94])
            cv2.imwrite(os.path.join(MASTERS, name + "-real.png"), hits.astype(np.uint8) * 255)
            # Height of the frames nearest the heading: the spiral (floor 11) sank as it turned.
            close = sorted(frames, key=lambda f: ang((f[0]["yaw"] + NORTH_FIX) % 360, hdg))[:3]
            alt = float(np.median([r["alt"] for r, _ in close])) - GROUND
            meta[name] = dict(floor=floor, facing=facing, heading=round(hdg, 2), pitch=PITCH, fov=MASTER_FOV,
                              height=round(alt, 1), frames=len(frames), real=round(float(hits.mean()), 4),
                              real_final=round(float(final_mask(hits).mean()), 4),
                              t=round(close[0][0]["t"], 2))
            print(f"floor {floor} {facing}: {len(frames)} frames, {alt:.1f} m, photographed {hits.mean():.1%} "
                  f"of the master, {final_mask(hits).mean():.2%} of the 64° view", flush=True)
            json.dump(meta, open(meta_path, "w"), indent=1, sort_keys=True)


def final_mask(hits):
    """The part of a master mask the 64° view at the same height uses."""
    D = view_rays(FINAL_W // 4, FINAL_H // 4, FINAL_FOV, 0, FINAL_PITCH)
    u, v = project(D, MASTER_W, MASTER_H, MASTER_FOV, view_rotation(0, PITCH))
    return cv2.remap(hits.astype(np.uint8), u, v, cv2.INTER_NEAREST, borderValue=0) > 0


def eye_height(floor):
    return vs.eye_height(floor)


def derive_map(h_src, h_dst, pitch, w=FINAL_W, h=FINAL_H):
    """Where each pixel of the 64° view at height h_dst, looking `pitch` down, lies in a master photographed at
    h_src: the ground and everything below the horizon moves as the ground would (a ground point seen at elevation
    e from height h is seen at -atan(h' tan(-e) / h) from h'); above the horizon nothing moves. Returns the master
    pixel coordinates (u, v), and each pixel's relative azimuth and source elevation (radians)."""
    D = view_rays(w, h, FINAL_FOV, 0, pitch)
    el = np.arcsin(np.clip(-D[..., 2], -1, 1))
    az = np.arctan2(D[..., 1], D[..., 0])
    below = el < 0
    el_s = np.where(below, -np.arctan(h_src * np.tan(np.where(below, -el, 0)) / h_dst), el)
    Ds = np.stack([np.cos(el_s) * np.cos(az), np.cos(el_s) * np.sin(az), -np.sin(el_s)], -1)
    u, v = project(Ds, MASTER_W, MASTER_H, MASTER_FOV, view_rotation(0, PITCH))
    return u, v, az, el_s


def fit_pitch(h_src, h_dst, reach):
    """The view's pitch: FINAL_PITCH, or as little more as keeps it inside the master. Lower down the same street
    is seen more steeply, so a floor below its master would need ground under the master's lower edge (floor 4
    from floor 5: the bottom 8%), and no sphere taken from the hover spot shows that ground right: the cars, the
    fence and the containers there are too close. The view tilts up instead, but never so far that its top leaves
    what the camera saw (`reach`, degrees above the horizon)."""
    top = math.degrees(math.atan(math.tan(math.radians(FINAL_FOV / 2)) * FINAL_H / FINAL_W))
    pitch = FINAL_PITCH
    while pitch + top < reach - 0.3:
        u, v, _, _ = derive_map(h_src, h_dst, pitch, FINAL_W // 8, FINAL_H // 8)
        if (v.max() <= MASTER_H - 1) and (v.min() >= 0) and (u.min() >= 0) and (u.max() <= MASTER_W - 1):
            break
        pitch += 0.1
    return round(pitch, 1)


def derive(master, h_src, h_dst, pitch=FINAL_PITCH, sphere=None, hdg=0.0):
    """The view at h_dst from a master at h_src (derive_map). Whatever still falls outside the master (a strip under
    the floor-11 and floor-14 masters, where the view could not tilt further) comes from `sphere`, the source
    floor's published sphere of the same season, whose band there is the same flight's frames: moved the same way,
    matched in colour to the master along the edge and blended in. Returns (image, inside mask)."""
    u, v, az, el_s = derive_map(h_src, h_dst, pitch)
    mh, mw = master.shape[:2]
    inside = (u >= 0) & (u <= mw - 1) & (v >= 0) & (v <= mh - 1)
    out = cv2.remap(master, u, v, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    if sphere is None or inside.all():
        return out, inside
    sh, sw = sphere.shape[:2]
    x = (((np.degrees(az) + hdg + 180) % 360) / 360 * sw).astype(np.float32)
    y = ((90 - np.degrees(el_s)) / 180 * sh).astype(np.float32)
    fill = cv2.remap(sphere, x, y, cv2.INTER_CUBIC, borderMode=cv2.BORDER_WRAP).astype(np.float32)
    d = cv2.distanceTransform(inside.astype(np.uint8), cv2.DIST_L2, 5)
    band = inside & (d < 120)
    o = out.astype(np.float32)
    for c in range(3):
        a, b = o[..., c][band], fill[..., c][band]
        fill[..., c] = (fill[..., c] - b.mean()) * (a.std() / max(b.std(), 1e-3)) + a.mean()
    w = np.clip(d / 48.0, 0, 1)[..., None]
    return (o * w + fill * (1 - w)).clip(0, 255).astype(np.uint8), inside


def vs_reach(src):
    """Degrees above the horizon a master is photographed up to, from its frames' pitch (masters.json)."""
    vhalf = math.degrees(math.atan(math.tan(math.radians(vs.HFOV / 2)) * 9 / 16))
    return FRAME_PITCH[src["floor"]] + vhalf


def finals(args):
    meta = json.load(open(os.path.join(MASTERS, "masters.json")))
    by_facing = {}
    for name, m in meta.items():
        by_facing.setdefault(m["facing"], []).append(dict(m, name=name))
    spheres = json.load(open(os.path.join("public", "views", "manifest.json")))
    sphere_cache = {}
    manifest = {"fov": FINAL_FOV, "pitch": FINAL_PITCH, "width": FINAL_W, "height": FINAL_H,
                "facings": {f: round(heading(f), 2) for f in FACINGS}, "views": {}}
    for facing in FACINGS:
        shots = by_facing.get(facing, [])
        for floor in range(vs.FLOOR_MIN, vs.FLOOR_MAX + 1):
            own = next((s for s in shots if s["floor"] == floor), None)
            # A photographed floor keeps its photograph; any other takes the one nearest its eye level.
            src = own or min(shots, key=lambda s: (abs(s["height"] - eye_height(floor)), s["height"]))
            h_dst = src["height"] if own else eye_height(floor)
            # How high above the horizon the master is photographed: its frames' pitch plus half their height.
            reach = vs_reach(src)
            pitch = FINAL_PITCH if own else fit_pitch(src["height"], h_dst, reach)
            entry = dict(kind="photo" if own else "derived", height=round(h_dst, 1), pitch=pitch)
            if not own:
                entry.update({"from": src["floor"], "fromHeight": src["height"]})
            out_dir = os.path.join(PUBLIC, facing, f"floor-{floor:02d}")
            os.makedirs(out_dir, exist_ok=True)
            seasons = {}
            for season in ("winter",) + SEASONS:
                path = (os.path.join(MASTERS, src["name"] + ".jpg") if season == "winter"
                        else os.path.join(EDITS, f"{src['name']}-{season}.png"))
                if not os.path.exists(path):
                    continue
                m = cv2.imread(path)
                if m.shape[:2] != (MASTER_H, MASTER_W):
                    m = cv2.resize(m, (MASTER_W, MASTER_H), interpolation=cv2.INTER_LANCZOS4)
                sphere_entry = spheres["B"][str(src["floor"])]
                sphere_src = sphere_entry["src"] if season == "winter" else sphere_entry["seasons"][season]
                if sphere_src not in sphere_cache:
                    sphere_cache.clear()
                    sphere_cache[sphere_src] = cv2.imread(os.path.join("public", sphere_src.lstrip("/")))
                img, inside = derive(m, src["height"], h_dst, pitch, sphere_cache[sphere_src], heading(facing))
                if season == "winter":
                    entry["outside"] = round(float(1 - inside.mean()), 4)
                    # How much of the view the camera saw (the rest is the fill from the sphere or inpainting).
                    real = cv2.imread(os.path.join(MASTERS, src["name"] + "-real.png"), cv2.IMREAD_GRAYSCALE)
                    seen, _ = derive(cv2.merge([real] * 3), src["height"], h_dst, pitch)
                    entry["photographed"] = round(float(((seen[..., 0] > 127) & inside).mean()), 4)
                Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(
                    os.path.join(out_dir, season + ".webp"), "WEBP", quality=args.quality, method=6)
                seasons[season] = f"/views/window/{facing}/floor-{floor:02d}/{season}.webp"
            entry["seasons"] = seasons
            manifest["views"].setdefault(facing, {})[str(floor)] = entry
            print(f"{facing} {floor:2d}: {entry['kind']}"
                  + (f" from {src['floor']} ({src['height']} m -> {h_dst:.1f} m)" if not own else "")
                  + f", {len(seasons)} seasons", flush=True)
    json.dump(manifest, open(os.path.join(PUBLIC, "manifest.json"), "w"), indent=1)


def drift(master, edit, tiles=6):
    """How far an edit moved the picture against its master: the offset (pixels at master size) of each tile's
    edges, found by phase correlation, for the tiles with enough structure. Returns (median, worst)."""
    def edges(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        g = cv2.GaussianBlur(g, (0, 0), 2)
        return cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    a, b = edges(master), edges(edit)
    h, w = a.shape
    th, tw = h // tiles, w // tiles
    win = cv2.createHanningWindow((tw, th), cv2.CV_32F)
    shifts = []
    for y in range(tiles):
        for x in range(tiles):
            ta, tb = a[y * th:(y + 1) * th, x * tw:(x + 1) * tw], b[y * th:(y + 1) * th, x * tw:(x + 1) * tw]
            if ta.mean() < 4:                      # sky: nothing to measure
                continue
            (dx, dy), resp = cv2.phaseCorrelate(ta, tb, win)
            if resp > 0.05:
                shifts.append(math.hypot(dx, dy))
    if not shifts:
        return 0.0, 0.0
    return float(np.median(shifts)), float(np.max(shifts))


def check(args):
    for path in sorted(os.listdir(EDITS)):
        if not path.endswith(".png"):
            continue
        name = path.rsplit("-", 1)[0]
        m = cv2.imread(os.path.join(MASTERS, name + ".jpg"))
        e = cv2.imread(os.path.join(EDITS, path))
        if e.shape != m.shape:
            e = cv2.resize(e, (m.shape[1], m.shape[0]), interpolation=cv2.INTER_AREA)
        med, worst = drift(m, e)
        flag = "  <- check" if med > 3 or worst > 12 else ""
        print(f"{path:28s} drift median {med:5.1f} px, worst tile {worst:5.1f} px{flag}")


def source_for(shots, floor):
    """The master a floor's view of one facing comes from: its own, or the one photographed nearest its eye level
    (the same choice for the window view and the sphere, so the two never disagree)."""
    own = next((s for s in shots if s["floor"] == floor), None)
    src = own or min(shots, key=lambda s: (abs(s["height"] - eye_height(floor)), s["height"]))
    return src, (src["height"] if own else eye_height(floor))


SPHERE_W = 8192
SPHERES = os.path.join("interior", "views", "spheres")


def sector_maps(src_h, dst_h, hdg, rows, reach=42.0):
    """Where a master's pixels land in the equirectangular band (rows of a SPHERE_W x SPHERE_W/2 sphere, true north
    in the middle column), moved from its height to dst_h as the ground would move. Only the columns within `reach`
    degrees of its heading (a master is 72° wide). Returns (columns, u, v) for cv2.remap: the same for every season."""
    H = SPHERE_W // 2
    first = int(round(((hdg - reach + 180) % 360) / 360 * SPHERE_W))
    cols = (first + np.arange(int(2 * reach / 360 * SPHERE_W))) % SPHERE_W
    az = np.radians((cols + 0.5) / SPHERE_W * 360 - 180)
    el = np.radians(90 - (np.arange(*rows) + 0.5) / H * 180)
    AZ, EL = np.meshgrid(az, el)
    below = EL < 0
    EL = np.where(below, -np.arctan(src_h * np.tan(np.where(below, -EL, 0)) / dst_h), EL)
    D = np.stack([np.cos(EL) * np.cos(AZ), np.cos(EL) * np.sin(AZ), -np.sin(EL)], -1)
    u, v = project(D, MASTER_W, MASTER_H, MASTER_FOV, view_rotation(hdg, PITCH))
    ok = (u >= 0) & (u <= MASTER_W - 1) & (v >= 0) & (v <= MASTER_H - 1)
    return cols, np.where(ok, u, -1).astype(np.float32), np.where(ok, v, -1).astype(np.float32)


def sector_to_band(master, real, maps, shape):
    """One master drawn into the band through its maps (sector_maps). Returns (image, mask of the pixels the camera
    saw): what the masters filled (sphere, inpainting) stays out of the 360° view."""
    cols, u, v = maps
    img = np.zeros(shape + (3,), np.uint8)
    seen = np.zeros(shape, bool)
    img[:, cols] = cv2.remap(master, u, v, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    seen[:, cols] = (cv2.remap(real, u, v, cv2.INTER_NEAREST, borderValue=0) > 127) & (u >= 0)
    return img, seen


def gains(imgs, masks):
    """Per-sector colour gains that make neighbouring sectors agree where they overlap (each season edit was made
    on its own, so its colours drift a little), tied weakly to 1 so the whole stays as photographed."""
    n = len(imgs)
    G = np.ones((n, 3))
    for c in range(3):
        A, b = [], []
        for i in range(n):
            j = (i + 1) % n
            both = masks[i] & masks[j]
            if both.sum() < 1000:
                continue
            mi, mj = imgs[i][..., c][both].mean(), imgs[j][..., c][both].mean()
            row = np.zeros(n); row[i], row[j] = mi, -mj
            A.append(row); b.append(0.0)
        for i in range(n):
            row = np.zeros(n); row[i] = 20.0
            A.append(row); b.append(20.0)
        G[:, c] = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)[0]
    return G


def blend_band(imgs, masks, hdgs):
    """The sectors joined into one band: each pixel belongs to the sector whose heading is nearest among those
    that saw it, and the joins are blended band by band in frequency (multi-band), so colour changes spread wide
    while edges stay sharp; the band wraps round, so it is padded with its own ends while blending."""
    h, w = masks[0].shape
    az = (np.arange(w) + 0.5) / w * 360 - 180
    owner = np.full((h, w), -1, np.int8)
    best = np.full((h, w), 1e9, np.float32)
    for i, (m, hd) in enumerate(zip(masks, hdgs)):
        d = (np.abs((az - ((hd + 180) % 360 - 180) + 180) % 360 - 180)).astype(np.float32)[None, :]
        take = m & (d < best)
        owner[take] = i
        best = np.where(take, d, best)
    pad = 512
    bl = cv2.detail_MultiBandBlender(0, 6)
    bl.prepare((0, 0, w + 2 * pad, h))
    for i, img in enumerate(imgs):
        mask = (owner == i).astype(np.uint8) * 255
        im = np.concatenate([img[:, -pad:], img, img[:, :pad]], 1)
        mk = np.concatenate([mask[:, -pad:], mask, mask[:, :pad]], 1)
        bl.feed(im.astype(np.int16), mk, (0, 0))
    out, _ = bl.blend(None, None)
    return np.clip(out[:, pad:pad + w], 0, 255).astype(np.uint8), owner >= 0


BAND_ROWS = (int((90 - 22) / 180 * SPHERE_W // 2), int((90 + 38) / 180 * SPHERE_W // 2))   # +22° to -38°


def sphere_floor(floor, season, by_facing, maps):
    """A floor's sphere for a season: its eight sectors, each from the master the window view of that facing uses
    (`maps` keeps each sector's projection, which is the same for every season)."""
    rows = BAND_ROWS
    shape = (rows[1] - rows[0], SPHERE_W)
    imgs, masks, hdgs, srcs = [], [], [], []
    # One photographed floor for the whole sphere: the nearest one with all eight sectors. Sectors from circles
    # flown at different heights (floor 9 from 11 and 7, as the window views take them) tore the near towers
    # where they met: moving the ground to one height cannot reconcile buildings seen from 10 m apart. Floor 14's
    # circle missed the west, so its sphere is floor 16's.
    whole = {f for f in {s["floor"] for ss in by_facing.values() for s in ss}
             if all(any(s["floor"] == f for s in by_facing.get(k, [])) for k in SPHERE_SECTORS)}
    level = {f: np.median([s["height"] for ss in by_facing.values() for s in ss if s["floor"] == f]) for f in whole}
    source = floor if floor in whole else min(whole, key=lambda f: (abs(level[f] - eye_height(floor)), f))
    for facing in SPHERE_SECTORS:
        src = next(s for s in by_facing[facing] if s["floor"] == source)
        # Every sector at the floor's eye level, even on a photographed floor: the floor-11 circle was a spiral
        # (35.9 m sinking to 29.4 m), and sectors at different heights disagree on where the near ground is.
        h_dst = eye_height(floor)
        key = (src["name"], h_dst)
        if key not in maps:
            maps[key] = sector_maps(src["height"], h_dst, heading(facing), rows)
        path = (os.path.join(MASTERS, src["name"] + ".jpg") if season == "winter"
                else os.path.join(EDITS, f"{src['name']}-{season}.png"))
        m = cv2.imread(path)
        if m.shape[:2] != (MASTER_H, MASTER_W):
            m = cv2.resize(m, (MASTER_W, MASTER_H), interpolation=cv2.INTER_AREA)
        real = cv2.imread(os.path.join(MASTERS, src["name"] + "-real.png"), cv2.IMREAD_GRAYSCALE)
        img, seen = sector_to_band(m, real, maps[key], shape)
        imgs.append(img); masks.append(seen); hdgs.append(heading(facing)); srcs.append(src)
    G = gains(imgs, masks)
    # 8-bit, applied in place: eight full-width sectors in floats would need about 1 GB
    for im, g in zip(imgs, G):
        for c in range(3):
            im[..., c] = np.clip(im[..., c] * g[c], 0, 255).astype(np.uint8)
    band, seen = blend_band(imgs, masks, hdgs)
    return band, seen, rows, srcs


def finish_sphere(band, seen, rows):
    """The full 2:1 sphere: the band as photographed, plain sky above it and plain ground below, each one colour
    taken from the band's edge and faded in over 2°. Nothing is drawn there: no building tops, no street. The
    360° view never shows it (it stops at the band); it is there for the tours' window glass and the sphere's
    poles. Returns (sphere, top, bottom): the elevations (degrees) between which every heading was photographed."""
    H = SPHERE_W // 2
    cols = seen.any(0)
    top_row = np.array([np.argmax(seen[:, x]) if cols[x] else 0 for x in range(SPHERE_W)])
    bot_row = np.array([seen.shape[0] - 1 - np.argmax(seen[::-1, x]) if cols[x] else 0 for x in range(SPHERE_W)])
    if not cols.all():
        raise SystemExit(f"{(~cols).sum()} columns of the sphere have no photograph: build their masters first")
    # The edges the view may reach: every heading photographed there, short of the 2° fade into sky and ground.
    top = 90 - (rows[0] + top_row.max() + 1) / H * 180 - 2
    bottom = 90 - (rows[0] + bot_row.min()) / H * 180 + 2
    sky = np.median(np.stack([band[top_row[x] + 2, x] for x in range(0, SPHERE_W, 8)]), 0)
    ground = np.median(np.stack([band[bot_row[x] - 2, x] for x in range(0, SPHERE_W, 8)]), 0)
    out = np.empty((H, SPHERE_W, 3), np.uint8)
    out[:H // 2] = sky.astype(np.uint8)
    out[H // 2:] = ground.astype(np.uint8)
    fade = 2 / 180 * H
    y = np.arange(seen.shape[0])[:, None]
    a = np.clip(np.minimum(y - top_row[None] + 1, bot_row[None] - y + 1) / fade, 0, 1)
    a = np.where(seen, a, 0).astype(np.float32)[..., None]
    sky_or_ground = np.where((y < (top_row[None] + bot_row[None]) / 2)[..., None], sky, ground).astype(np.float32)
    out[rows[0]:rows[1]] = (band * a + sky_or_ground * (1 - a)).clip(0, 255).astype(np.uint8)
    return out, round(float(top), 1), round(float(bottom), 1)


def sphere_job(job):
    """All four seasons of one floor's sphere (run in a worker process); returns the floor's manifest line."""
    floor, preview = job
    meta = json.load(open(os.path.join(MASTERS, "masters.json")))
    by_facing = {}
    for name, m in meta.items():
        by_facing.setdefault(m["facing"], []).append(dict(m, name=name))
    maps = {}
    entry = {}
    for season in ("winter",) + SEASONS:
        band, seen, rows, srcs = sphere_floor(floor, season, by_facing, maps)
        sph, top, bottom = finish_sphere(band, seen, rows)
        name = f"B-{floor:02d}.jpg" if season == "winter" else f"B-{floor:02d}-{season}.webp"
        out = Image.fromarray(cv2.cvtColor(sph, cv2.COLOR_BGR2RGB))
        if season == "winter":
            out.save(os.path.join("public", "views", name), "JPEG", quality=88, optimize=True, progressive=True)
            froms = sorted({s["floor"] for s in srcs})
            entry = {"src": f"/views/{name}", "yaw": 0.0, "top": top, "bottom": bottom,
                     "height": round(eye_height(floor), 1)}
            # a photographed floor stays one even where a sector comes from another floor (14's west)
            if floor not in froms:
                entry.update({"kind": "derived", "from": min(froms, key=lambda f: abs(f - floor))})
            entry["seasons"] = {}
        else:
            out.save(os.path.join("public", "views", name), "WEBP", quality=82, method=4)
            entry["seasons"][season] = f"/views/{name}"
        if preview:
            cv2.imwrite(os.path.join(SPHERES, name.rsplit(".", 1)[0] + ".jpg"), sph, [cv2.IMWRITE_JPEG_QUALITY, 90])
        print(f"floor {floor:2d} {season}: band {bottom}° to {top}°, from floors "
              f"{','.join(str(s['floor']) for s in srcs)}", flush=True)
    return floor, entry


def spheres(args):
    """Every floor's 360° sphere, for every season, from the same masters and edits as the window views: written
    to public/views/B-NN.jpg and B-NN-<season>.webp, with both towers' lines in public/views/manifest.json. Three
    floors at a time by default (each needs about 1 GB)."""
    from multiprocessing import Pool
    os.makedirs(SPHERES, exist_ok=True)
    floors = [int(f) for f in args.floors.split(",")] if args.floors else list(range(vs.FLOOR_MIN, vs.FLOOR_MAX + 1))
    with Pool(args.jobs) as pool:
        entries = dict(pool.map(sphere_job, [(f, args.preview) for f in floors], chunksize=1))
    mf_path = os.path.join("public", "views", "manifest.json")
    manifest = json.load(open(mf_path))
    for t in ("B", "C"):
        manifest.setdefault(t, {})
        for f in sorted(entries):
            manifest[t][str(f)] = entries[f]
    json.dump(manifest, open(mf_path, "w"), indent=1)
    open(mf_path, "a").write("\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("masters")
    a.add_argument("video")
    a.add_argument("--floors", help="comma-separated, default all photographed floors")
    a.add_argument("--facings", help="comma-separated, default all six")
    b = sub.add_parser("finals")
    b.add_argument("--quality", type=int, default=80)
    sub.add_parser("check")
    c = sub.add_parser("spheres")
    c.add_argument("--floors", help="comma-separated, default 4-16")
    c.add_argument("--preview", action="store_true", help="also save each sphere in interior/views/spheres")
    c.add_argument("--jobs", type=int, default=2, help="floors built at once")
    args = ap.parse_args()
    {"masters": masters, "finals": finals, "check": check, "spheres": spheres}[args.cmd](args)


if __name__ == "__main__":
    main()
