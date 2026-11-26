"""Per-frame drone telemetry: position, altitude and camera orientation.

Sources, in order of preference:
  1. A sidecar .SRT flight log next to the video (DJI format).
  2. DJI's embedded "djmd" protobuf metadata stream (DJI Fly, e.g. Mini 4/5 Pro).
  3. Nothing: returns None, and the caller falls back to evenly spaced timestamps.
"""
import json
import math
import os
import re
import subprocess

from _pb import parse


def _get(msg, *path):
    for p in path:
        msg = next((v for f, t, v in msg if f == p), None)
        if msg is None:
            return None
    return msg


def _quat_to_ypr(w, x, y, z):
    yaw = math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))) % 360
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, 2 * (w * y - z * x)))))
    roll = math.degrees(math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)))
    return yaw, pitch, roll


def probe(video):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", video],
        capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def _fps(info):
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    n, d = v["r_frame_rate"].split("/")
    return float(n) / float(d)


def from_djmd(video, cache_dir):
    info = probe(video)
    idx = next((s["index"] for s in info["streams"]
                if s.get("codec_tag_string") == "djmd"), None)
    if idx is None:
        return None
    raw = os.path.join(cache_dir, os.path.basename(video) + ".djmd")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-map", f"0:{idx}",
                    "-c", "copy", "-f", "data", raw], check=True)
    msgs = [v for f, t, v in parse(open(raw, "rb").read()) if f == 3 and isinstance(v, list)]
    os.remove(raw)
    fps = _fps(info)
    rows = []
    for i, m in enumerate(msgs):
        ll, alt, q = _get(m, 3, 4, 1), _get(m, 3, 4, 2), _get(m, 4, 4)
        if not ll or alt is None or not q:
            continue
        w, x, y, z = [(_get(q, k) or 0.0) for k in (1, 2, 3, 4)]
        yaw, pitch, roll = _quat_to_ypr(w, x, y, z)
        rows.append(dict(t=i / fps, lat=_get(ll, 2), lon=_get(ll, 3), alt=alt / 1000.0,
                         yaw=yaw, pitch=pitch, roll=roll, q=[w, x, y, z]))
    return rows or None


_SRT_NUM = r"(-?\d+(?:\.\d+)?)"


def from_srt(video):
    base = os.path.splitext(video)[0]
    path = next((p for p in (base + ".SRT", base + ".srt") if os.path.exists(p)), None)
    if not path:
        return None
    rows = []
    for block in re.split(r"\n\s*\n", open(path, encoding="utf-8", errors="ignore").read()):
        tm = re.search(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->", block)
        lat = re.search(r"latitude\s*:\s*" + _SRT_NUM, block)
        lon = re.search(r"longi?tude\s*:\s*" + _SRT_NUM, block)
        alt = re.search(r"abs_alt\s*:\s*" + _SRT_NUM, block) or re.search(r"rel_alt\s*:\s*" + _SRT_NUM, block)
        if not (tm and lat and lon and alt):
            continue
        h, mi, s, ms = map(int, tm.groups())
        yaw = re.search(r"gb_yaw\s*:\s*" + _SRT_NUM, block)
        pitch = re.search(r"gb_pitch\s*:\s*" + _SRT_NUM, block)
        roll = re.search(r"gb_roll\s*:\s*" + _SRT_NUM, block)
        rows.append(dict(t=h * 3600 + mi * 60 + s + ms / 1000, lat=float(lat[1]), lon=float(lon[1]),
                         alt=float(alt[1]),
                         yaw=float(yaw[1]) % 360 if yaw else None,
                         pitch=float(pitch[1]) if pitch else 0.0,
                         roll=float(roll[1]) if roll else 0.0, q=None))
    return rows or None


def load(video, cache_dir):
    """Returns (rows, source). Cached as JSON next to the other build files."""
    os.makedirs(cache_dir, exist_ok=True)
    cache = os.path.join(cache_dir, os.path.basename(video) + ".telemetry.json")
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(video):
        d = json.load(open(cache))
        return d["rows"], d["source"]
    rows, source = from_srt(video), "srt"
    if rows is None:
        rows, source = from_djmd(video, cache_dir), "djmd"
    if rows is None:
        source = "none"
    json.dump({"rows": rows, "source": source}, open(cache, "w"))
    return rows, source


def ground_distance(a, b):
    r = 6371000.0
    dy = math.radians(b["lat"] - a["lat"]) * r
    dx = math.radians(b["lon"] - a["lon"]) * r * math.cos(math.radians(a["lat"]))
    return math.hypot(dx, dy)
