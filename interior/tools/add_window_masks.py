"""Put the window-glass masks of a plan's 360° stops into its tour (window.__WINDOW_MASKS__, keys D_<stop>), for the
real view through the windows (add_window_views.py). Made from the material-ID passes (tools/passes.py ids).
Run: python3 -I add_window_masks.py <tour html> <plan D|E|F> <passes dir with ids/<camera stop>.png, materials.json>
"""
import sys, re, json, base64, io, os
import numpy as np
from PIL import Image, ImageFilter

# Glass between two rooms (inner_glass.py) carries the same material as the windows; it is taken out below.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I leaves the script's folder off the path
import inner_glass

dst, plan, pdir = sys.argv[1:4]
html = open(dst, encoding='utf-8').read()
ids_of = json.load(open(f'{pdir}/materials.json'))
glass = ids_of['Window_Glass']

src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_tour.py'), encoding='utf-8').read()
keys = {}
if plan != 'D':
    block = src[src.index(f" '{plan}': dict("):]
    keys = dict(re.findall(r"\('(\w+)', '(\w+)', '", block[:block.index('nav=')]))

i = html.index('window.__PANOS__ = ') + len('window.__PANOS__ = ')
j = html.index('; window.__PLAN__', i)
stops = [k[2:] for k in json.loads(html[i:j]) if k.startswith('D_') and '@' not in k]
masks = {}
for st in stops:
    a = np.array(Image.open(f'{pdir}/ids/{keys.get(st, st)}.png').convert('RGB')).astype(int)
    m = Image.fromarray(((a[..., 0] + a[..., 1] * 256) == glass).astype(np.uint8) * 255, 'L')
    m = m.filter(ImageFilter.GaussianBlur(0.8))  # soft edge against the frames
    m = inner_glass.clear(m, plan, st)
    buf = io.BytesIO(); m.save(buf, 'PNG', optimize=True)
    masks[f'D_{st}'] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    print('window mask', st, round(float(np.asarray(m).mean() / 2.55), 1), '%')

blob = 'window.__WINDOW_MASKS__ = ' + json.dumps(masks) + ';\n'
if 'window.__WINDOW_MASKS__ = ' in html:
    a = html.index('window.__WINDOW_MASKS__ = '); b = html.index(';\n', a) + 2
    html = html[:a] + blob + html[b:]
else:
    a = html.index('window.__PANOS__ = ')
    html = html[:a] + blob + html[a:]
open(dst, 'w', encoding='utf-8').write(html)
print('window masks', dst, len(masks))
