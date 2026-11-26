"""Window-view spheres straight from DJI video, using the flight data recorded in the file.

For flights where the drone hovered beside the towers and turned a full circle at several heights (DJI Fly's
video, no Sphere mode photo). Newer DJI drones (Mini 4/5 Pro, Air 3) store GPS, barometric altitude and the gimbal's
attitude for every frame in the MP4's "djmd" stream; a .SRT flight log next to the video is used instead if there is
one. With those the frames can be placed on the sphere directly, with true north known, so no sun fix is needed:

  1. Finds the hover spot (where the drone turned most) and each height it turned a circle at (a "station").
  2. Keeps the sharpest frame per 8° of heading, decoded from the 4K original.
  3. Places the frames from the gimbal attitude, then corrects each by a fraction of a degree by matching SIFT
     features with its neighbours (refine.py), and draws each pixel from the frame whose centre is nearest
     (narrow seams: moving cars and the drone's drift would ghost in a feathered blend).
  4. Completes the 2:1 sphere: a heading the drone never faced is taken from the nearest other height, the sky is
     continued above, buildings cut by the frame top are continued upward, and the street is blurred below. Only the
     band the camera saw is real; the rest is there so the window glass never shows a hole.
  5. Writes public/views/<tower>-<floor>.jpg (4096 × 2048, true north in the middle, as add_view.py) and its line in
     public/views/manifest.json. A floor already in the manifest is left alone unless --overwrite.

Heights: the floor is the one whose eye level (floor level + 1.5 m) is nearest the drone's height above the
ground. Floor levels are from src/data/building.ts (floor 4 at +11.7 m, 3.0 m storeys). The ground is the drone's
take-off point unless --ground gives the site's ground altitude (the barometer's metres above sea level).

Needs numpy, opencv-python and pillow (pip install numpy opencv-python-headless pillow) and ffmpeg.
Run from the repo root:
  python3 interior/tools/drone/video_spheres.py --tower B ~/Desktop/videos/*.MP4 --dry-run   # list stations
  python3 interior/tools/drone/video_spheres.py --tower B ~/Desktop/videos/*.MP4
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
import stations as st  # noqa: E402
import telemetry  # noqa: E402

# src/data/building.ts
PODIUM_HEIGHT, FLOOR_MIN, FLOOR_MAX, FLOOR_HEIGHT = 11.7, 4, 16, 3.0
EYE = 1.5
# DJI Mini 5 Pro, 4K 16:9 video: horizontal field of view, measured on the 2026-11-25 footage.
HFOV = 70.0
SPHERE_W = 4096


def log(*a):
    print(*a, flush=True)


def floor_for(height):
    f = round((height - EYE - PODIUM_HEIGHT) / FLOOR_HEIGHT) + FLOOR_MIN
    return min(FLOOR_MAX, max(FLOOR_MIN, f))


def eye_height(floor):
    return PODIUM_HEIGHT + (floor - FLOOR_MIN) * FLOOR_HEIGHT + EYE


def row_at(rows, t):
    lo, hi = 0, len(rows) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if rows[mid]["t"] < t:
            lo = mid + 1
        else:
            hi = mid
    return rows[lo]


def sharpness(img):
    g = cv2.cvtColor(cv2.resize(img, (960, 540), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(g, cv2.CV_32F).var())


def sync_offset(video, rows, t0):
    """The metadata runs a frame or so ahead of the picture; find the offset that lines up neighbours best."""
    fr = list(camera.read_frames(video, t0, t0 + 6, 4, 960))
    if len(fr) < 5:
        return 0.0
    h, w = fr[0][1].shape[:2]
    K = camera.intrinsics(w, h, HFOV)
    G = [cv2.GaussianBlur(cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2) for _, f in fr]

    def err(off):
        es = []
        for a in range(0, len(fr) - 2, 2):
            H = camera.homography(row_at(rows, fr[a][0] + off), row_at(rows, fr[a + 2][0] + off), K)
            wb = cv2.warpPerspective(G[a + 2], H, (w, h), borderValue=-1)
            m = cv2.erode((wb >= 0).astype(np.uint8), None, iterations=8) > 0
            if m.mean() > 0.2:
                es.append(float(np.abs(G[a] - wb)[m].mean()))
        return np.mean(es) if es else 1e9
    return min((-0.2, -0.1, 0.0, 0.1, 0.2, 0.3), key=err)


def station_frames(video, rows, s):
    off = sync_offset(video, rows, s["t0"])
    best = {}
    for t, img in camera.read_frames(video, s["t0"], s["t1"], 6, 1920):
        r = row_at(rows, t + off)
        if abs(r["pitch"] - s["pitch"]) > 6:
            continue
        r2 = row_at(rows, t + off + 0.1)
        turn = abs((r2["yaw"] - r["yaw"] + 180) % 360 - 180) / 0.1   # deg/s: motion blur
        score = sharpness(img) / (1 + turn / 20)
        b = int(r["yaw"] // 8)
        if b not in best or score > best[b][0]:
            best[b] = (score, r, img)
    frames = [(r, img) for _, r, img in best.values()]
    log(f"    {len(frames)} frames, sync {off:+.1f} s")
    refined = refine.refine(frames, HFOV, log=log)
    return [(r, img) for r, (_, img) in zip(refined, frames)]


def render_sphere_band(frames, W, north_fix=0.0):
    """Equirectangular sphere W × W/2 with true north in the middle; only the band the camera saw is filled.
    north_fix (degrees) is how far clockwise of the drone's compass true north lies.
    Returns (image float32, mask of real pixels)."""
    H = W // 2
    h, w = frames[0][1].shape[:2]
    K = camera.intrinsics(w, h, HFOV)
    vfov = math.degrees(2 * math.atan(math.tan(math.radians(HFOV / 2)) * h / w))
    pitches = [r["pitch"] for r, _ in frames]
    el_top = min(90.0, max(p + vfov / 2 for p in pitches) + 1)
    el_bot = max(-90.0, min(p - vfov / 2 for p in pitches) - 1)
    y0 = int((90 - el_top) / 180 * H)
    y1 = int(math.ceil((90 - el_bot) / 180 * H))
    # Middle column = true north; the frames are placed by compass heading, hence the fix.
    az = np.radians((np.arange(W) + 0.5) / W * 360 - 180 + north_fix)
    el = np.radians(90 - (np.arange(y0, y1) + 0.5) / H * 180)
    AZ, EL = np.meshgrid(az, el)
    D = np.stack([np.cos(EL) * np.cos(AZ), np.cos(EL) * np.sin(AZ), -np.sin(EL)], -1)   # north, east, down
    acc = np.zeros((y1 - y0, W, 3))
    wsum = np.zeros((y1 - y0, W))
    hits = np.zeros((y1 - y0, W), bool)
    half = math.radians(HFOV / 2 + 6)
    for row, img in frames:
        dyaw = np.abs((az - math.radians(row["yaw"]) + math.pi) % (2 * math.pi) - math.pi)
        cols = np.where(dyaw < half)[0]
        if not len(cols):
            continue
        cam = D[:, cols] @ (camera.body_to_world(row) @ camera._P.T)
        z = np.maximum(cam[..., 2], 1e-3)
        ok = cam[..., 2] > 1e-3
        u = np.where(ok, K[0, 0] * cam[..., 0] / z + K[0, 2], -1).astype(np.float32)
        v = np.where(ok, K[1, 1] * cam[..., 1] / z + K[1, 2], -1).astype(np.float32)
        inside = ok & (u >= 0) & (u <= w - 1) & (v >= 0) & (v <= h - 1)
        samp = cv2.remap(img, u, v, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE).astype(np.float64)
        cx, cy = np.abs(u - w / 2) / (w / 2), np.abs(v - h / 2) / (h / 2)
        # Nearly all of each pixel from the frame whose centre is nearest (float64: the power doesn't underflow).
        wt = np.where(inside, np.clip(1 - np.maximum(cx, cy * 0.6), 1e-3, 1).astype(np.float64) ** 40, 0)
        acc[:, cols] += samp * wt[..., None]
        wsum[:, cols] += wt
        hits[:, cols] |= inside
    img = np.zeros((H, W, 3), np.float32)
    real = np.zeros((H, W), bool)
    img[y0:y1] = acc / np.where(wsum > 0, wsum, 1)[..., None]
    real[y0:y1] = hits & (wsum > 0)
    return img, real


def complete_sphere(img, real):
    """Sky above the real band, buildings cut by its top continued upward, a soft street below."""
    H, W = real.shape
    out = img.copy()
    cols_ok = real.any(0)
    top = np.where(cols_ok, np.argmax(real, 0), H // 2)
    bot = np.where(cols_ok, H - 1 - np.argmax(real[::-1], 0), H // 2)
    # Ragged edges where frames end: trim to a smooth line a little inside the real band.
    k = np.ones(41) / 41
    sm = lambda a: np.convolve(np.r_[a[-20:], a, a[:20]], k, "valid")
    top = np.maximum(np.ceil(sm(top)).astype(int), top) + 6
    bot = np.minimum(np.floor(sm(bot)).astype(int), bot) - 6
    edge = np.array([img[top[c]:top[c] + 8, c].mean(0) for c in range(W)])        # BGR at the band's top
    g = cv2.cvtColor(img.clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    grad = np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3))
    texture = np.array([grad[top[c]:top[c] + 24, c].mean() for c in range(W)])
    sat = edge.max(1) - edge.min(1)
    # Sky over Ulaanbaatar in winter is a pale, flat haze: bright, grey and without texture.
    is_sky = (edge.mean(1) > 150) & (sat < 40) & (texture < 6)
    is_sky = cv2.morphologyEx(is_sky.astype(np.uint8)[None], cv2.MORPH_OPEN, np.ones((1, 9), np.uint8))[0] > 0
    # Only a building at least 61 px wide is continued upward; narrower runs are poles, cranes and
    # stray columns, which would stand in the sky as floating slivers. 61 px is about 5°.
    built = cv2.morphologyEx((~is_sky).astype(np.uint8)[None], cv2.MORPH_OPEN, np.ones((1, 61), np.uint8))[0] > 0
    is_sky = ~built
    cols = np.arange(W)
    idx = np.where(is_sky)[0]
    if len(idx) < 20:      # no sky seen at all: take the brightest tops
        idx = np.argsort(edge.mean(1))[-W // 10:]
    sky = np.stack([np.interp(cols, np.sort(idx), edge[np.sort(idx), ch], period=W) for ch in range(3)], 1)
    sky = cv2.GaussianBlur(sky[None].astype(np.float32), (0, 0), 25)[0]
    zenith = sky.mean(0) * np.array([1.02, 0.97, 0.9])   # slightly bluer and darker overhead
    # Per pixel, sky-like: pale, grey and smooth. A facade is continued only with the rows from the band's top
    # down to its first sky pixel; a building that ends just inside the band is too short to repeat.
    sky_px = ((img.mean(2) > 150) & ((img.max(2) - img.min(2)) < 40)
              & (cv2.GaussianBlur(np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3)), (0, 0), 2) < 6))
    run = np.zeros(W, int)
    for c in np.where(~is_sky)[0]:
        col = sky_px[top[c]:top[c] + 120, c]
        run[c] = int(np.argmax(col)) if col.any() else len(col)
    short = cv2.morphologyEx((run < 30).astype(np.uint8)[None], cv2.MORPH_CLOSE, np.ones((1, 9), np.uint8))[0] > 0
    is_sky = is_sky | short
    facade_top = int(H * (0.5 - 40 / 180))             # continue cut facades up to 40° above the horizon
    for c in cols:
        t = top[c]
        a = (np.arange(t) / max(t, 1))[:, None] ** 1.3
        out[:t, c] = zenith * (1 - a) + sky[c] * a
        if not is_sky[c] and t > facade_top:
            band = img[t:t + max(run[c], 30), c]
            n = len(band)
            for i, y in enumerate(range(t - 1, facade_top - 1, -1)):
                j = i % n
                out[y, c] = band[j] if (i // n) % 2 else band[n - 1 - j]    # mirrored repeats, no seam
    fade = np.zeros((H, W), np.float32)          # soften the invented facade tops into the sky
    for c in np.where(~is_sky)[0]:
        if top[c] > facade_top:
            fade[facade_top:top[c], c] = 1
    fade = cv2.GaussianBlur(fade, (0, 0), 4)
    skyonly = out.copy()
    for c in cols:
        a = (np.arange(top[c]) / max(top[c], 1))[:, None] ** 1.3
        skyonly[:top[c], c] = zenith * (1 - a) + sky[c] * a
    upper = np.arange(H)[:, None] < top[None, :]
    out = np.where(upper[..., None], skyonly * (1 - fade[..., None]) + out * fade[..., None], out)
    # The street below: the lowest real rows stretched downward, blurred, darkening toward the nadir.
    nadir = np.array([84, 88, 92], np.float32)
    for c in cols:
        b = bot[c]
        n = H - 1 - b
        if n > 0:
            src = np.clip(b - (np.arange(1, n + 1) * 0.12).astype(int), 0, H - 1)
            out[b + 1:, c] = img[src, c]
    lower = np.arange(H)[:, None] > bot[None, :]
    blur = cv2.GaussianBlur(out, (0, 0), 20)
    a = np.clip((np.arange(H)[:, None] - bot[None, :]) / np.maximum(H - bot[None, :], 1), 0, 1) ** 0.7
    out = np.where(lower[..., None], blur * (1 - a[..., None]) + nadir * a[..., None], out)
    keep = np.zeros((H, W), np.float32)
    for c in cols:
        keep[top[c]:bot[c] + 1, c] = 1
    keep = cv2.GaussianBlur(keep, (0, 0), 3)[..., None]
    return img * keep + out * (1 - keep)


def fill_headings(spheres):
    """A heading one station never faced is taken from the nearest station in height that did."""
    for s in spheres:
        missing = ~s["real"].any(0)
        if not missing.any():
            continue
        others = sorted((o for o in spheres if o is not s), key=lambda o: abs(o["height"] - s["height"]))
        for o in others:
            cols = missing & o["real"].any(0)
            if cols.any():
                s["img"][:, cols] = o["img"][:, cols]
                s["real"][:, cols] = o["real"][:, cols]
                missing &= ~cols
                log(f"    floor {s['floor']}: {cols.sum() * 360 / len(cols):.0f}° of heading taken from "
                    f"{o['height']:.0f} m (never faced at {s['height']:.0f} m)")
            if not missing.any():
                break


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("videos", nargs="+")
    ap.add_argument("--tower", action="append", choices=["B", "C"], required=True,
                    help="tower(s) the spheres are for; give twice to use them for both")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--ground", type=float, help="the site's ground altitude (m, as the drone's barometer reads)")
    ap.add_argument("--site", help="lat,lon of the hover spot (default: where the drone turned most)")
    ap.add_argument("--north-fix", type=float, default=0.0,
                    help="degrees clockwise from the drone's compass north to true north (see the README)")
    ap.add_argument("--overwrite", action="store_true", help="replace floors already in the manifest")
    ap.add_argument("--dry-run", action="store_true", help="only list the stations and their floors")
    ap.add_argument("--preview", help="also save each sphere here, for checking")
    ap.add_argument("--masks", help="also save each station's band and its mask of real pixels here (PNG), "
                                    "for inspection")
    ap.add_argument("--station", action="append", default=[], metavar="T0-T1",
                    help="also use the seconds T0-T1 of the first video as a station, for a circle the search "
                         "misses because the drone climbed or sank while turning (a spiral)")
    args = ap.parse_args()

    cache = os.path.join(os.path.expanduser("~"), ".cache", "drone-telemetry")
    tel = {}
    for v in args.videos:
        rows, src = telemetry.load(v, cache)
        log(f"{os.path.basename(v)}: flight data from {src}")
        if rows:
            tel[v] = rows
    if not tel:
        sys.exit("No flight data in these videos (no .SRT and no DJI metadata stream).")
    if args.site:
        lat, lon = map(float, args.site.split(","))
        site = dict(lat=lat, lon=lon)
    else:
        site = st.find_sites({os.path.basename(v): r for v, r in tel.items()})[0]
    log(f"hover spot {site['lat']:.6f}, {site['lon']:.6f}")
    found = [(v, s) for v, rows in tel.items() for s in st.find_stations(rows, site)]
    for span in args.station:
        # A spiral is used whole: its height is the median, and the heights round the circle differ by as much
        # as the drone sank, which is what the seam where it began and ended shows.
        v = next(iter(tel))
        t0, t1 = map(float, span.split("-"))
        seg = [r for r in tel[v] if t0 <= r["t"] <= t1 and r["yaw"] is not None]
        if not seg:
            sys.exit(f"No flight data in {span} s of {os.path.basename(v)}.")
        alts = sorted(r["alt"] for r in seg)
        pitches = sorted(r["pitch"] for r in seg)
        found.append((v, dict(t0=t0, t1=t1, cover=min(len(st._yaw_bins(seg)) * 10, 360), alt=alts[len(alts) // 2],
                              pitch=pitches[len(pitches) // 2], lat=seg[0]["lat"], lon=seg[0]["lon"])))
        log(f"  station {span} s: {alts[-1] - alts[0]:.1f} m between its lowest and highest point")
    if not found:
        sys.exit("The drone never turned a full circle there.")
    ground = args.ground if args.ground is not None else min(tel[v][0]["alt"] for v, _ in found)
    log(f"ground {ground:.1f} m" + ("" if args.ground is not None else " (take-off point; --ground to set the site's)"))

    mf_path = os.path.join(args.repo, "public", "views", "manifest.json")
    manifest = json.load(open(mf_path)) if os.path.exists(mf_path) else {}
    plan = []
    for v, s in sorted(found, key=lambda x: x[1]["alt"]):
        h = s["alt"] - ground
        f = floor_for(h)
        taken = [t for t in args.tower if str(f) in manifest.get(t, {})]
        note = f"  (already in the manifest for {', '.join(taken)}: kept)" if taken and not args.overwrite else ""
        log(f"  {h:5.1f} m -> floor {f:2d} (eye level {eye_height(f):.1f} m, {h - eye_height(f):+.1f} m)  "
            f"{s['cover']}°  {os.path.basename(v)} {s['t0']:.0f}-{s['t1']:.0f} s{note}")
        plan.append(dict(video=v, station=s, height=h, floor=f, skip=bool(note)))
    if len({p["floor"] for p in plan}) < len(plan):
        log("  two stations fall on one floor: the one nearer its eye level is used")
        plan.sort(key=lambda p: abs(p["height"] - eye_height(p["floor"])))
        seen = set()
        plan = [p for p in plan if not (p["floor"] in seen or seen.add(p["floor"]))]
    if args.dry_run:
        return

    spheres = []
    for p in plan:   # every station is rendered: a skipped one can still lend headings to the others
        log(f"floor {p['floor']} ({p['height']:.1f} m)")
        img, real = render_sphere_band(station_frames(p["video"], tel[p["video"]], p["station"]), SPHERE_W,
                                       args.north_fix)
        spheres.append(dict(p, img=img, real=real))
    fill_headings(spheres)
    if args.masks:
        os.makedirs(args.masks, exist_ok=True)
        for s in spheres:
            cv2.imwrite(os.path.join(args.masks, f"{s['floor']:02d}-real.png"), s["real"].astype(np.uint8) * 255)
            cv2.imwrite(os.path.join(args.masks, f"{s['floor']:02d}-band.png"), s["img"].clip(0, 255).astype(np.uint8))
    os.makedirs(os.path.dirname(mf_path), exist_ok=True)
    for s in spheres:
        if s["skip"]:
            continue
        out = complete_sphere(s["img"], s["real"]).clip(0, 255).astype(np.uint8)
        name = f"{args.tower[0]}-{s['floor']:02d}.jpg"
        Image.fromarray(cv2.cvtColor(out, cv2.COLOR_BGR2RGB)).save(
            os.path.join(args.repo, "public", "views", name), "JPEG", quality=86, optimize=True, progressive=True)
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            cv2.imwrite(os.path.join(args.preview, name), out)
        for t in args.tower:
            manifest.setdefault(t, {})[str(s["floor"])] = {"src": f"/views/{name}", "yaw": 0.0}
        log(f"  -> public/views/{name} for {', '.join(args.tower)}")
    json.dump(manifest, open(mf_path, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
