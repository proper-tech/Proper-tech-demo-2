"""Flat panoramas for the window-view page: the band round the horizon the drone actually photographed, as one strip.

The page's Panorama view pans this strip sideways under the finger, like a long photograph. It is the same band the
spheres are made from (video_spheres.py places the frames by the flight data and corrects them by their matches)
drawn at twice the sphere's resolution, 8192 px for the full circle, and cut to the rows the camera saw all round.
Nothing in it is generated, with one exception: a heading a circle never faced (24° to the north-west at floor 14)
is taken from the completed sphere, as the 360° view shows it.

Writes public/views/pano/B-<floor>.webp and public/views/panoramas.json: {floor: {src, width, height, top,
bottom, metres, taken}}, top and bottom in degrees of elevation; the middle column looks true north.

  python3 interior/tools/drone/panoramas.py ~/Desktop/videos/dji_fly_20261125_115900_0179_….MP4
"""
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stations as st  # noqa: E402
import telemetry  # noqa: E402
import video_spheres as vs  # noqa: E402

W, H = 8192, 4096
NORTH_FIX = -12.83
SPIRAL = (305, 333)            # the turn the station search misses (README.md)
START = np.datetime64("2026-11-25T11:59")
# the published sphere of each photographed floor (window_views.py spheres), for headings a circle missed
SPHERE = {4: "B-04.jpg", 5: "B-05.jpg", 7: "B-07.jpg", 11: "B-11.jpg", 14: "B-14.jpg", 16: "B-16.jpg"}


def main():
    video = sys.argv[1]
    repo = sys.argv[2] if len(sys.argv) > 2 else "."
    rows, _ = telemetry.load(video, os.path.join(os.path.expanduser("~"), ".cache", "drone-telemetry"))
    site = st.find_sites({"v": rows})[0]
    found = st.find_stations(rows, site)
    seg = [r for r in rows if SPIRAL[0] <= r["t"] <= SPIRAL[1]]
    found.append(dict(t0=SPIRAL[0], t1=SPIRAL[1], cover=360, alt=float(np.median([r["alt"] for r in seg])),
                      pitch=float(np.median([r["pitch"] for r in seg])), lat=seg[0]["lat"], lon=seg[0]["lon"]))
    ground = rows[0]["alt"]
    out = os.path.join(repo, "public", "views", "pano")
    os.makedirs(out, exist_ok=True)
    index = {}
    for s in sorted(found, key=lambda s: s["alt"]):
        h = s["alt"] - ground
        f = vs.floor_for(h)
        print(f"floor {f} ({h:.1f} m)", flush=True)
        img, real = vs.render_sphere_band(vs.station_frames(video, rows, s), W, NORTH_FIX)
        base = cv2.resize(cv2.imread(os.path.join(repo, "public", "views", SPHERE[f])), (W, H),
                          interpolation=cv2.INTER_CUBIC).astype(np.float32)
        cols = real.any(0)
        top = np.where(cols, np.argmax(real, 0), H)
        bot = np.where(cols, H - 1 - np.argmax(real[::-1], 0), 0)
        # the rows nearly every column saw; the few ragged ends, and missed headings, come from the sphere
        r0, r1 = int(np.percentile(top[cols], 92)), int(np.percentile(bot[cols], 8))
        keep = cv2.GaussianBlur(cv2.erode(real.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32),
                                (0, 0), 2)[..., None]
        pano = (img * keep + base * (1 - keep))[r0:r1 + 1].clip(0, 255).astype(np.uint8)
        name = f"B-{f:02d}.webp"
        cv2.imwrite(os.path.join(out, name), pano, [cv2.IMWRITE_WEBP_QUALITY, 80])
        el = lambda r: round(90 - (r + 0.5) / H * 180, 2)
        index[str(f)] = dict(src=f"/views/pano/{name}", width=W, height=int(pano.shape[0]), top=el(r0),
                             bottom=el(r1), metres=round(h, 1),
                             taken=str(START + np.timedelta64(int(s["t0"]), "s"))[:16] + "+08:00",
                             missed=round(float((~cols).mean() * 360), 1))
        print(f"  {name}: {pano.shape[1]} x {pano.shape[0]}, {el(r0)}° to {el(r1)}°, "
              f"{index[str(f)]['missed']}° of heading from the sphere", flush=True)
    json.dump(index, open(os.path.join(repo, "public", "views", "panoramas.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
