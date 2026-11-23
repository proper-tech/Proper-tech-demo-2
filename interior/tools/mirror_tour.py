"""Make the tour of a mirrored plan (C from D, E from B, F from A) out of the source plan's self-contained tour.

Mirror plane: the vertical line x = c through the middle of the tour's plan view (its __TOPDOWN__ viewBox),
so every plan coordinate keeps fitting the same view box.
- plan points (cameras, hotspots, fixtures): x -> 2c - x
- headings: h -> 180 - h. The photo sphere maps yaw to image column u = yaw/360, and the navigation code
  computes heading = 180 - atan2(dz, dx); mirroring x turns that into 180 - h, so each panorama is flipped
  left-right and then rolled by half a turn (yaw -> 180 - yaw) to match.
- colour masks: the same flip + roll; top-view pictures: flipped left-right only.
- visible labels: '<src> айл' -> '<dst> айл', room numbers D3 -> C3, etc.
Run: python3 -I mirror_tour.py <src html> <dst html> <src letter> <dst letter>
"""
import sys, re, json, base64, io
import numpy as np
from PIL import Image

src, dst, A, B = sys.argv[1:5]
html = open(src, encoding='utf-8').read()

tb = json.loads(re.search(r'window\.__TOPDOWN__ = (\{.*?\});\n', html, re.S).group(1))
x0, _, w, _ = tb['viewBox']; C = x0 + w / 2
mx = lambda x: round(2 * C - x, 4)
mh = lambda h: ((180 - h + 180) % 360) - 180

def dec(u):
    head, data = u.split(',', 1)
    return head, Image.open(io.BytesIO(base64.b64decode(data)))
def enc(head, im):
    buf = io.BytesIO()
    if 'jpeg' in head: im.convert('RGB').save(buf, 'JPEG', quality=86, optimize=True, progressive=True)
    else: im.save(buf, 'PNG', optimize=True)
    return head + ',' + base64.b64encode(buf.getvalue()).decode()
def pano(u):
    head, im = dec(u); a = np.array(im)
    a = np.roll(a[:, ::-1], a.shape[1] // 2, axis=1)
    return enc(head, Image.fromarray(a))
def flip(u):
    head, im = dec(u); return enc(head, im.transpose(Image.FLIP_LEFT_RIGHT))

def block(var, end):
    i = html.index(f'window.{var} = ') + len(f'window.{var} = ')
    j = html.index(end, i) + (1 if end == '};' else 0)
    return i, j, json.loads(html[i:j])
def put(i, j, obj):
    global html
    html = html[:i] + json.dumps(obj, ensure_ascii=False) + html[j:]

i, j, p = block('__PANOS__', '; window.__PLAN__')
for k, v in p.items():
    for q in list(v): v[q] = pano(v[q])
put(i, j, p)
if 'window.__WINDOW_MASKS__ = ' in html:  # window glass, for the real view (add_window_masks.py)
    i, j, w = block('__WINDOW_MASKS__', '};')
    put(i, j, {k: pano(u) for k, u in w.items()})
i, j, m = block('__PALETTE_MASKS__', '};')
for k in m: m[k] = [pano(u) for u in m[k]]
put(i, j, m)
i, j, t = block('__TOPDOWN__', '};')
for k in t['images']: t['images'][k] = flip(t['images'][k])
put(i, j, t)
i, j, n = block('__NAVIGATION__', '};')
for links in n.values():
    for l in links: l['point'][0] = mx(l['point'][0])
put(i, j, n)

def sub_re(pat, fn, count=1):
    global html
    html, k = re.subn(pat, fn, html, flags=re.S)
    assert k == count, (pat, k)

# camera points: vf={"D":{"pts":{...}
def pts_fn(mo):
    d = json.loads(mo.group(2))
    return mo.group(1) + json.dumps({r: [mx(x), y] for r, (x, y) in d.items()}, separators=(',', ':'))
sub_re(r'(vf=\{"D":\{"pts":)(\{[^}]*\})', pts_fn)
# arrival headings (two tables) and the bath default
sub_re(r'Mx=(\{[^}]*\})', lambda mo: 'Mx=' + json.dumps({k: mh(v) for k, v in json.loads(mo.group(1)).items()}, separators=(',', ':')))
def heads_fn(mo):
    pairs = re.findall(r'(\w+):(-?\d+(?:\.\d+)?)', mo.group(1))
    return 'tourArrivalHeadings = {' + ','.join(f'{k}:{mh(float(v)):g}' for k, v in pairs) + '}'
sub_re(r'tourArrivalHeadings = \{([^}]*)\}', heads_fn)
sub_re(r"\(room === 'bath_d5' \? (-?\d+) :", lambda mo: f"(room === 'bath_d5' ? {mh(float(mo.group(1))):g} :")
# fixtures [name,[x,y,z]]
def fix_fn(mo):
    body = re.sub(r"\[(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\.?\d+(?:\.\d+)?)\]", lambda q: f"[{mx(float(q.group(1)))},{q.group(2)},{q.group(3)}]", mo.group(1))
    return 'const TOUR_FIXTURES={' + body + '};'
sub_re(r'const TOUR_FIXTURES=\{(.*?)\};', fix_fn)

# labels
for d in '23456':
    html = html.replace(f' {A}{d}"', f' {B}{d}"').replace(f' {A}{d}<', f' {B}{d}<')
    html = html.replace(f'Унтлагын {A}{d}', f'Унтлагын {B}{d}').replace(f'АЦӨ {A}{d}', f'АЦӨ {B}{d}')
html = html.replace(f'{A} айл', f'{B} айл').replace(f'{A} · Top view', f'{B} · Top view').replace(f'apartment {A}"', f'apartment {B}"')
open(dst, 'w', encoding='utf-8').write(html)
print('written', dst, round(len(html) / 1e6, 1), 'MB', 'mirror x =', round(C, 3))
