"""Replace the panoramas and colour masks of a tour file with new renders, stop by stop (keys D_<stop>).
Run: python3 -I repanos.py <tour html> <renders dir with <stop>.jpg> <passes dir with ids/, materials.json> <mapping.json>
"""
import sys, json, base64, io
import numpy as np, cv2
from PIL import Image
dst, rdir, pdir, mapping_path = sys.argv[1:5]
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

def mask_pngs(m):
    return [b64(Image.fromarray((m[..., 3 * l:3 * l + 3] * 255 + .5).astype(np.uint8)), 'PNG', optimize=True) for l in (0, 1)]


def block(var, end):
    i = html.index(f'window.{var} = ') + len(f'window.{var} = ')
    j = html.index(end, i) + (1 if end == '};' else 0)
    return i, j, json.loads(html[i:j])
i, j, panos = block('__PANOS__', '; window.__PLAN__')
stops = [k[2:] for k in panos if k.startswith('D_')]
for st in stops:
    im = Image.open(f'{rdir}/{st}.jpg').convert('RGB')
    if im.size != (4096, 2048): im = im.resize((4096, 2048), Image.LANCZOS)
    panos[f'D_{st}'] = {'lo': b64(im.resize((1280, 640), Image.LANCZOS), 'JPEG', quality=82, optimize=True, progressive=True),
                        'hi': b64(im, 'JPEG', quality=86, optimize=True, progressive=True)}
    print('pano', st, flush=True)
html = html[:i] + json.dumps(panos) + html[j:]
i, j, pm = block('__PALETTE_MASKS__', '};')
for st in stops:
    im = np.array(Image.open(f'{rdir}/{st}.jpg').convert('RGB').resize((4096, 2048), Image.LANCZOS))
    pm[f'D_{st}'] = mask_pngs(masks(f'{pdir}/ids/{st}.png', im))
html = html[:i] + json.dumps(pm) + html[j:]
open(dst, 'w', encoding='utf-8').write(html)
print('updated', dst, len(stops), 'stops')
