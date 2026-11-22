"""Add a drone 360° sphere to the window views: public/views/<tower>-<floor>.jpg + its line in public/views/manifest.json.

The sphere is the stitched equirectangular picture (2:1) from DJI Fly's Sphere mode, taken at the tower's GPS point and
the floor's height with the drone's nose to true north (see the drone shooting guide). The tours show it in the window
glass of every flat of that tower within a floor or so (the nearest sphere wins). yaw (degrees, clockwise) turns a
sphere whose middle is not true north; check it in a tour: the Chinggis Square side is south-south-east.
Run: python3 -I interior/tools/add_view.py <repo root> <B|C> <floor> <sphere.jpg> [yaw]
"""
import sys, json, os
from PIL import Image

R, tower, floor, src = sys.argv[1:5]
yaw = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0
assert tower in ('B', 'C') and 4 <= int(floor) <= 16
im = Image.open(src).convert('RGB')
w, h = im.size
assert abs(w / h - 2) < 0.05, f'not an equirectangular sphere: {w}x{h}'
im = im.resize((4096, 2048), Image.LANCZOS)
name = f'{tower}-{int(floor):02d}.jpg'
os.makedirs(f'{R}/public/views', exist_ok=True)
im.save(f'{R}/public/views/{name}', 'JPEG', quality=86, optimize=True, progressive=True)
mf = f'{R}/public/views/manifest.json'
m = json.load(open(mf)) if os.path.exists(mf) else {}
m.setdefault(tower, {})[str(int(floor))] = {'src': f'/views/{name}', 'yaw': yaw}
json.dump(m, open(mf, 'w'), indent=1, sort_keys=True)
print('view', tower, floor, '->', name)
