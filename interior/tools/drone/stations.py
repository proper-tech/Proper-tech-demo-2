"""Find "view stations": moments where the drone hovers over the building site and
turns the camera around at one height. Each station becomes one window-view panorama.
"""
import math
from collections import defaultdict

from telemetry import ground_distance


def _yaw_bins(rows, width=10):
    return {int(r["yaw"] // width) for r in rows if r["yaw"] is not None}


def find_sites(videos_rows, cell_m=15.0):
    """Rank hover locations by how much 'spinning in place' happens there.
    videos_rows: {video_name: rows}. Returns [{lat, lon, score, videos}] best first."""
    cells = defaultdict(lambda: {"score": 0.0, "lat": 0.0, "lon": 0.0, "n": 0, "videos": set()})
    for name, rows in videos_rows.items():
        for a, b in zip(rows[::30], rows[30::30]):              # ~0.5 s steps at 60 fps
            dt = b["t"] - a["t"]
            if dt <= 0 or a["yaw"] is None or b["yaw"] is None:
                continue
            speed = ground_distance(a, b) / dt
            dyaw = abs((b["yaw"] - a["yaw"] + 180) % 360 - 180)
            if speed > 0.6 or dyaw < 0.5 or abs(a["pitch"]) > 30:
                continue
            ky = round(a["lat"] * 111320 / cell_m)
            kx = round(a["lon"] * 111320 * math.cos(math.radians(a["lat"])) / cell_m)
            c = cells[(ky, kx)]
            c["score"] += dyaw
            c["lat"] += a["lat"]; c["lon"] += a["lon"]; c["n"] += 1
            c["videos"].add(name)
    sites = [dict(lat=c["lat"] / c["n"], lon=c["lon"] / c["n"], score=round(c["score"]),
                  videos=sorted(c["videos"])) for c in cells.values() if c["n"]]
    return sorted(sites, key=lambda s: -s["score"])


def find_stations(rows, site, radius_m=8.0, alt_tol=1.5, max_pitch=30, min_cover=180):
    """Group consecutive frames near `site` at a near-constant height into stations."""
    groups, cur = [], []

    def close():
        if cur:
            cover = len(_yaw_bins(cur)) * 10
            if cover >= min_cover and cur[-1]["t"] - cur[0]["t"] > 4:
                alts = sorted(r["alt"] for r in cur)
                pitches = sorted(r["pitch"] for r in cur)
                groups.append(dict(t0=cur[0]["t"], t1=cur[-1]["t"], cover=min(cover, 360),
                                   alt=alts[len(alts) // 2], pitch=pitches[len(pitches) // 2],
                                   lat=cur[0]["lat"], lon=cur[0]["lon"]))

    for r in rows:
        ok = (r["yaw"] is not None and abs(r["pitch"]) <= max_pitch
              and ground_distance(r, site) <= radius_m)
        if ok and cur and (abs(r["alt"] - cur[0]["alt"]) > alt_tol or r["t"] - cur[-1]["t"] > 1.0):
            close(); cur = []
        if ok:
            cur.append(r)
        elif cur:
            close(); cur = []
    close()
    # Several groups at about the same height: keep the one with the widest coverage.
    groups.sort(key=lambda g: (-g["cover"], g["t0"]))
    kept = []
    for g in groups:
        if all(abs(g["alt"] - k["alt"]) > alt_tol for k in kept):
            kept.append(g)
    return sorted(kept, key=lambda g: g["alt"])
