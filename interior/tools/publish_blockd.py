"""Put rendered tour pictures on the site: interior/renders/<scene>/<stop>.jpg -> public/tour-<block>/<floor>/<stop>.jpg
(4096 x 2048) and <stop>-lo.jpg (1280 x 640, loads first and fills the strip of spots), top.png -> top.webp.
Run: python3 -I publish_blockd.py <repo root> <floor>   block D (scene D<floor> -> public/tour-d/<floor>)
     python3 -I publish_blockd.py <repo root> A2        the podium's floor 2 (scene A2 -> public/tour-a/2)
"""
import sys, os, json
from PIL import Image

root, floor = sys.argv[1], sys.argv[2]
scene = floor if floor[0].isalpha() else f'D{floor}'
block, floor = scene[0].lower(), scene[1:]
src = os.path.join(root, 'interior', 'renders', scene)
dst = os.path.join(root, 'public', f'tour-{block}', floor)
os.makedirs(dst, exist_ok=True)
stops = list(json.load(open(os.path.join(root, 'interior', f'{scene}_cams.json'))))
for s in stops:
    p = os.path.join(src, f'{s}.jpg')
    if not os.path.exists(p):
        print('missing', p)
        continue
    im = Image.open(p).convert('RGB')
    hi = im if im.width >= 4096 else im
    hi.save(os.path.join(dst, f'{s}.jpg'), 'JPEG', quality=85, optimize=True, progressive=True)
    im.resize((1280, 640), Image.LANCZOS).save(os.path.join(dst, f'{s}-lo.jpg'), 'JPEG', quality=80, optimize=True, progressive=True)
    print('pano', s, im.size)
top = os.path.join(src, 'top.png')
if os.path.exists(top):
    im = Image.open(top).convert('RGBA')
    if im.width > 1600:
        im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
    im.save(os.path.join(dst, 'top.webp'), 'WEBP', quality=88, method=6)
    print('top', im.size)
