"""Pinhole camera model driven by the gimbal attitude in the telemetry.

World frame is NED (x north, y east, z down). The gimbal quaternion maps camera-body
(x forward, y right, z down) into NED. Image axes: u right, v down.
"""
import math
import subprocess

import numpy as np

# body (fwd, right, down) -> OpenCV camera (right, down, fwd)
_P = np.array([[0, 1, 0], [0, 0, 1], [1, 0, 0]], dtype=np.float64)


def quat_matrix(q):
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


def euler_matrix(yaw, pitch, roll):
    y, p, r = map(math.radians, (yaw, pitch, roll))
    rz = np.array([[math.cos(y), -math.sin(y), 0], [math.sin(y), math.cos(y), 0], [0, 0, 1]])
    ry = np.array([[math.cos(p), 0, math.sin(p)], [0, 1, 0], [-math.sin(p), 0, math.cos(p)]])
    rx = np.array([[1, 0, 0], [0, math.cos(r), -math.sin(r)], [0, math.sin(r), math.cos(r)]])
    return rz @ ry @ rx


def body_to_world(row):
    if row.get("R") is not None:
        return np.asarray(row["R"])
    if row.get("q"):
        return quat_matrix(row["q"])
    return euler_matrix(row["yaw"], row["pitch"], row.get("roll") or 0.0)


def intrinsics(w, h, hfov_deg):
    f = (w / 2) / math.tan(math.radians(hfov_deg) / 2)
    return np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]])


def homography(row_a, row_b, K):
    """Maps pixels of frame B into frame A (pure rotation between them)."""
    ra, rb = body_to_world(row_a), body_to_world(row_b)
    return K @ _P @ ra.T @ rb @ _P.T @ np.linalg.inv(K)


def read_frames(video, t0, t1, fps, width, hwaccel=True):
    """Yields (time, BGR uint8 image) for [t0, t1] at `fps`, scaled to `width`."""
    info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                           "stream=width,height", "-of", "csv=p=0", video],
                          capture_output=True, text=True, check=True).stdout.strip().split(",")
    sw, sh = int(info[0]), int(info[1])
    height = int(round(sh * width / sw / 2)) * 2
    cmd = ["ffmpeg", "-v", "error"] + (["-hwaccel", "videotoolbox"] if hwaccel else []) + [
        "-ss", f"{t0:.3f}", "-i", video, "-t", f"{t1 - t0:.3f}", "-map", "0:v:0",
        "-vf", f"fps={fps},scale={width}:{height}:flags=area", "-pix_fmt", "bgr24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    n = width * height * 3
    k = 0
    try:
        while True:
            buf = p.stdout.read(n)
            if len(buf) < n:
                break
            yield t0 + k / fps, np.frombuffer(buf, np.uint8).reshape(height, width, 3)
            k += 1
    finally:
        # Caller may stop early (e.g. grab() wants one frame): stop ffmpeg quietly.
        if p.poll() is None:
            p.kill()
        p.stdout.close(); p.stderr.close()
        p.wait()


def grab(video, t, width=None):
    """One frame at time t (full resolution unless width given)."""
    for _, img in read_frames(video, t, t + 0.05, 30, width or _src_width(video), hwaccel=True):
        return img
    return None


def _src_width(video):
    return int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                               "stream=width", "-of", "csv=p=0", video],
                              capture_output=True, text=True, check=True).stdout.strip())
