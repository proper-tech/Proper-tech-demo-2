# Drone frames — 2026-11-23

120 frames (3840×2160) from `DJI_20261123132136_0023_D.MP4`, 2:58–3:58, 2 fps:

```
ffmpeg -ss 178 -t 60 -i DJI_20261123132136_0023_D.MP4 -vf fps=2 -q:v 2 pano\%03d.jpg
```

A full 360° yaw rotation at one height next to the Sebotse plot — source for the
window-view panoramas (`interior/tools/add_view.py`).
