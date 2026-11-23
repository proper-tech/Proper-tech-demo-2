# Drone video → window-view sphere

For a drone that turned a full circle on the spot while filming (no Sphere mode photo).

1. Frames from the 4K original, only the seconds of one clean turn, 2 per second:
   `ffmpeg -ss 178 -t 60 -i DJI_….MP4 -vf fps=2 -q:v 2 frames\%03d.jpg`
2. Camera rotations (SIFT + bundle adjustment, loop closed by matching the last frames to the first;
   the argument is how many frames at the end to try against the start):
   `FRAMES=frames WORK=work python3 estimate.py 14`
3. Spherical warp with graph-cut seams and multi-band blending (seams instead of feathering: the drone drifts,
   so near things like the crane would ghost). Pass the frame list, every 2nd frame of one turn, skipping
   any stretch where the drone stopped turning:
   `FRAMES=frames WORK=work python3 seam.py 0,2,4,…,106 6144`
4. Full 2:1 sphere: sky above, blurred street below, facades cut by the frame top continued upward,
   then turned so the middle is true north:
   `WORK=work python3 finalize.py <horizon fix°> <theta of north°> sphere.jpg`
   North comes from the sun: find the sun's theta in the stitch and its true azimuth for the clip's
   time (DJI file name = local start time); horizon fix = true sun elevation − measured.
5. `python3 -I interior/tools/add_view.py <repo> <B|C> <floor> sphere.jpg`

2026-11-23 clip (`drone/2026-11-23` on the `drone-frames` branch): frames 0–106 minus 68–88, horizon fix 2.6°,
north at theta −49.7° (sun azimuth 191.6°, elevation 21.0° at 13:24).
