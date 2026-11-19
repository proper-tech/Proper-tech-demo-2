"""Replace the furnished top view (all four palettes) of a tour file with a fresh top-view pass.
Run: python3 -I retop.py <tour html> <passes dir with top.png, top_ids.png, top.json, materials.json> <mapping.json>
"""
import sys, json, base64, io
import numpy as np, cv2
from PIL import Image
dst, pdir, mapping_path = sys.argv[1:4]
html = open(dst, encoding='utf-8').read()
mapping = json.load(open(mapping_path))
ids_of = json.load(open(f'{pdir}/materials.json'))
LEARNED = {'Mirror': 0.76, 'Revision_ShowerGlass': 0.85, 'Revision_BathMirror': 0.81, 'Detail_ChairSage': 0.92}
def b64(img, fmt, **kw):
    buf = io.BytesIO(); img.save(buf, fmt, **kw)
    return f"data:image/{'jpeg' if fmt == 'JPEG' else 'png'};base64," + base64.b64encode(buf.getvalue()).decode()
def gf(I, p, r, eps):
    k = (2 * r + 1, 2 * r + 1)
    mI = cv2.blur(I, k); mp = cv2.blur(p, k)
    a = (cv2.blur(I * p, k) - mI * mp) / (cv2.blur(I * I, k) - mI * mI + eps); b = mp - a * mI
    return cv2.blur(a, k) * I + cv2.blur(b, k)

def masks(id_png, guide_rgb):
    a = np.array(Image.open(id_png).convert('RGB')).astype(int)
    ids = a[..., 0] + a[..., 1] * 256
    m = np.zeros(ids.shape + (6,), np.float32)
    for name, ch in mapping.items():
        if ch < 0 or name not in ids_of: continue
        m[ids == ids_of[name], ch] = LEARNED.get(name, 1.0)
    H, W = guide_rgb.shape[:2]
    if m.shape[:2] != (H, W): m = cv2.resize(m, (W, H), interpolation=cv2.INTER_NEAREST)
    guide = cv2.cvtColor(guide_rgb.astype(np.float32) / 255, cv2.COLOR_RGB2GRAY)
    return np.stack([np.clip(gf(guide, m[..., c], 3, 1e-4), 0, 1) for c in range(6)], -1)

# top view: cream background, palettes applied with the tour's own formula (linear ratios per mask channel)
BASE = ['#eae8e1', '#cecec4', '#bbb5a5', '#c7bdab', '#747f6d', '#e0dacf']
PAL = {'neutral': BASE, 'navy': ['#364e69', '#31455e', '#8898a6', '#657f99', '#233d5d', '#c9d3dd'],
       'sage': ['#899882', '#7f8d7c', '#b7bbaa', '#a3b09a', '#536b55', '#dce2d5'],
       'charcoal': ['#4b5055', '#4a5058', '#999c9e', '#7d858b', '#39434e', '#d4d6d7']}
lin = lambda c: np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
srgb = lambda c: np.where(c <= .0031308, c * 12.92, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - .055)
hexlin = lambda h: lin(np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]))
top = Image.open(f'{pdir}/top.png').convert('RGBA')
bg = Image.new('RGBA', top.size, (246, 243, 236, 255)); bg.alpha_composite(top)
toprgb = np.array(bg.convert('RGB'))
_t = np.array(Image.open(f'{pdir}/top_ids.png').convert('RGB')).astype(int)
_wall = (_t[..., 0] + _t[..., 1] * 256) == ids_of['Wall_WarmPlaster']
toprgb[_wall] = (232, 229, 222)  # wall tops sit in the ceiling's shadow; draw them light like plan D's
tm = masks(f'{pdir}/top_ids.png', toprgb)
tm[_wall] = 0  # wall tops stay light in every palette
alpha = np.array(top)[..., 3:4] / 255.0
tl = lin(toprgb / 255.0)
tops = {}
for pid, cols in PAL.items():
    ratio = np.ones_like(tl)
    for i in range(6):
        ratio += tm[..., i:i + 1] * (hexlin(cols[i]) / hexlin(BASE[i]) - 1)
    out = tl * np.where(alpha > 0, np.maximum(ratio, 0), 1)
    img = Image.fromarray((np.clip(srgb(out), 0, 1) * 255 + .5).astype(np.uint8))
    tops[pid] = b64(img, 'JPEG', quality=88, optimize=True, progressive=True)
viewbox = json.load(open(f'{pdir}/top.json'))['viewBox']
i = html.index('window.__TOPDOWN__ = ') + len('window.__TOPDOWN__ = '); j = html.index('};', i) + 1
html = html[:i] + json.dumps({'viewBox': viewbox, 'images': tops}) + html[j:]
open(dst, 'w', encoding='utf-8').write(html)
print('top view replaced', dst, viewbox)
