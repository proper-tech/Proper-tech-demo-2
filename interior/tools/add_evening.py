"""Add a plan's evening panoramas to its self-contained tour, as keys D_<stop>@eve of window.__PANOS__ next to the
daytime D_<stop>. The tour's Өдөр / Орой button (add_mood_toggle.py) shows them; mirror_tour.py and split_tours.py
carry them along like any other picture.
Run: python3 -I add_evening.py <tour html> <plan D|E|F> <evening renders dir with <camera stop>.jpg>
"""
import sys, re, json, base64, io, os
from PIL import Image

dst, plan, rdir = sys.argv[1:4]
html = open(dst, encoding='utf-8').read()

# tour stop key -> camera stop name: the same for D; F and E reuse D's keys (build_tour.py's UNITS table)
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_tour.py'), encoding='utf-8').read()
keys = {}
if plan != 'D':
    block = src[src.index(f" '{plan}': dict("):]
    block = block[:block.index('nav=')]
    keys = dict(re.findall(r"\('(\w+)', '(\w+)', '", block))

def b64(im, **kw):
    buf = io.BytesIO(); im.save(buf, 'JPEG', **kw)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

i = html.index('window.__PANOS__ = ') + len('window.__PANOS__ = ')
j = html.index('; window.__PLAN__', i)
panos = json.loads(html[i:j])
n = 0
for k in [k for k in panos if k.startswith('D_') and '@' not in k]:
    stop = keys.get(k[2:], k[2:])
    f = os.path.join(rdir, f'{stop}.jpg')
    if not os.path.exists(f):
        print('missing', f); continue
    im = Image.open(f).convert('RGB')
    if im.size != (4096, 2048): im = im.resize((4096, 2048), Image.LANCZOS)
    panos[k + '@eve'] = {'lo': b64(im.resize((1280, 640), Image.LANCZOS), quality=82, optimize=True, progressive=True),
                         'hi': b64(im, quality=86, optimize=True, progressive=True)}
    n += 1
html = html[:i] + json.dumps(panos) + html[j:]
open(dst, 'w', encoding='utf-8').write(html)
print('evening', dst, n, 'stops')
