"""Real photographs for the window-view page: still frames of the drone video at the moments someone picked.

The spheres are stitched and partly completed by a model; a buyer also wants to see the plain photograph. Screenshots
taken while watching the flight (the 2026-11-25 clip, or the CapCut export of it) mark the moments to use. Each
screenshot is found in the video by matching it against small frames of the export (the bottom of the picture,
where the player's controls appear, is left out), the flight data gives its height and true compass heading, and
the sharpest 4K frame within 0.2 s of it is taken from the original clip, so the published photograph has neither
the player's controls nor the screen's lower resolution. Each photograph belongs to the floor whose eye level is
nearest the drone's height: the spiral at 29-36 m gives floors 9 to 12 a photograph of their own.

Writes public/views/photos/B-<floor>-<heading>.webp (2400 px wide) and a 480 px thumbnail beside it, and
public/views/photos.json: [{floor, src, thumb, heading, pitch, height, taken}], heading in degrees from true north.

  python3 interior/tools/drone/photos.py SCREENSHOTS_DIR ~/Desktop/videos/dji_fly_20261125_115900_0179_….MP4 \\
      --export "~/Movies/CapCut/1126 (1).mov" --offset 211.3
"""
import argparse
import bisect
import glob
import json
import os
import subprocess
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import telemetry  # noqa: E402

# src/data/building.ts and video_spheres.py
PODIUM_HEIGHT, FLOOR_MIN, FLOOR_MAX, FLOOR_HEIGHT, EYE = 11.7, 4, 16, 3.0, 1.5
NORTH_FIX = -12.83            # the flight's compass error, see README.md
GROUND = 1377.2               # the take-off point's barometric altitude (m), as for the spheres
MIN_APART = 10                # degrees between two photographs kept for one floor
SW, SH, FPS = 192, 108, 4     # the small frames the screenshots are matched against


def norm(a):
    a = cv2.GaussianBlur(a, (0, 0), 1.0)[: int(SH * 0.8)]     # without the player's controls
    a = a - a.mean()
    return (a / (a.std() + 1e-6)).reshape(-1)


def small_frames(video):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={FPS},scale={SW}:{SH},format=gray",
                          "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, SH, SW).astype(np.float32)
    return np.stack([norm(f) for f in frames])


def match(shots, frames):
    """Best frame (seconds into the matched video) per screenshot. The screenshots were taken in order, so a match
    far from its neighbours' is searched again between them."""
    qs = [norm(cv2.resize(cv2.imread(p, cv2.IMREAD_GRAYSCALE), (SW, SH), interpolation=cv2.INTER_AREA)
               .astype(np.float32)) for p in shots]
    n = frames.shape[1]
    best = [(int((frames @ q / n).argmax()), float((frames @ q / n).max())) for q in qs]
    for k in range(len(best)):
        around = [best[j][0] for j in (k - 2, k - 1, k + 1, k + 2) if 0 <= j < len(best)]
        mid = float(np.median(around))
        if abs(best[k][0] - mid) > 15 * FPS:
            lo, hi = int(max(0, mid - 12 * FPS)), int(mid + 12 * FPS)
            sc = frames[lo:hi] @ qs[k] / n
            best[k] = (lo + int(sc.argmax()), float(sc.max()))
    return [(i / FPS, s) for i, s in best]


def sharpest(video, t, w=2400):
    """The sharpest frame within 0.2 s of t, resized to w wide, and its time."""
    h = round(w * 9 / 16)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0, t - 0.2):.3f}", "-i", video, "-t", "0.4",
                          "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
                         capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
    score = [cv2.Laplacian(cv2.cvtColor(cv2.resize(f, (960, 540)), cv2.COLOR_BGR2GRAY), cv2.CV_32F).var()
             for f in frames]
    i = int(np.argmax(score))
    return frames[i], max(0, t - 0.2) + i / 30


def floor_for(height):
    return min(FLOOR_MAX, max(FLOOR_MIN, round((height - EYE - PODIUM_HEIGHT) / FLOOR_HEIGHT) + FLOOR_MIN))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shots")
    ap.add_argument("video", help="the original 4K clip with its flight data")
    ap.add_argument("--export", help="a smaller copy the screenshots were taken from (faster to match)")
    ap.add_argument("--offset", type=float, default=0.0, help="where the export starts in the original (s)")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--taken", default="2026-11-25T11:59+08:00", help="the clip's start, local time")
    args = ap.parse_args()

    shots = sorted(glob.glob(os.path.join(args.shots, "*.png")) + glob.glob(os.path.join(args.shots, "*.jpg")))
    print(f"{len(shots)} screenshots; decoding small frames…", flush=True)
    found = match(shots, small_frames(args.export or args.video))
    rows, _ = telemetry.load(args.video, os.path.join(os.path.expanduser("~"), ".cache", "drone-telemetry"))
    times = [r["t"] for r in rows]

    picks = []
    for p, (t, score) in zip(shots, found):
        t += args.offset if args.export else 0
        r = rows[min(bisect.bisect_left(times, t + 0.1), len(rows) - 1)]     # the data runs ~0.1 s ahead
        h = r["alt"] - GROUND
        picks.append(dict(shot=os.path.basename(p), t=t, score=score, height=h, floor=floor_for(h),
                          heading=(r["yaw"] + NORTH_FIX) % 360, pitch=r["pitch"]))
    # per floor, the best match among photographs closer than MIN_APART; one looking down per floor
    kept = []
    for f in sorted({p["floor"] for p in picks}):
        mine = sorted((p for p in picks if p["floor"] == f and p["score"] > 0.8), key=lambda p: -p["score"])
        level, down = [], []
        for p in mine:
            group = down if p["pitch"] < -15 else level
            if group is down and down:
                continue
            if all(abs((p["heading"] - q["heading"] + 180) % 360 - 180) >= MIN_APART for q in group):
                group.append(p)
        kept += level + down

    out = os.path.join(args.repo, "public", "views", "photos")
    os.makedirs(out, exist_ok=True)
    start = np.datetime64(args.taken[:16])
    index = []
    for p in sorted(kept, key=lambda p: (p["floor"], p["heading"])):
        img, t = sharpest(args.video, p["t"])
        name = f"B-{p['floor']:02d}-{round(p['heading']):03d}{'-down' if p['pitch'] < -15 else ''}"
        cv2.imwrite(os.path.join(out, name + ".webp"), img, [cv2.IMWRITE_WEBP_QUALITY, 78])
        cv2.imwrite(os.path.join(out, name + "-s.webp"), cv2.resize(img, (480, 270), interpolation=cv2.INTER_AREA),
                    [cv2.IMWRITE_WEBP_QUALITY, 70])
        taken = str(start + np.timedelta64(int(round(t)), "s"))[:16] + args.taken[16:]
        index.append(dict(floor=p["floor"], src=f"/views/photos/{name}.webp", thumb=f"/views/photos/{name}-s.webp",
                          heading=round(p["heading"], 1), pitch=round(p["pitch"], 1), height=round(p["height"], 1),
                          taken=taken))
        print(f"  floor {p['floor']:2d}  {p['heading']:5.1f}°  {p['height']:4.1f} m  {name}", flush=True)
    json.dump(index, open(os.path.join(args.repo, "public", "views", "photos.json"), "w"), indent=1)
    print(f"{len(index)} photographs for floors {sorted({i['floor'] for i in index})}")


if __name__ == "__main__":
    main()
