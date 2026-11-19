"""Make the self-contained 360° tour of plan F or E from plan D's tour file.

Keeps D's page and code; swaps in this plan's panoramas, colour masks, furnished top view, stops, hotspots,
headings and labels. Internal stop keys reuse D's where the code treats a stop specially
(bath_d5 = bathroom with a tub, bath_d2 = shower room, bed_d3 / bed_d4 = bedrooms).
Run: python3 -I build_tour.py <D tour html> <plan> <renders dir> <passes dir> <mapping.json> <out html>
"""
import sys, re, json, base64, io, math
import numpy as np, cv2
from PIL import Image

src, PLAN, rdir, pdir, mapping_path, dst = sys.argv[1:7]
html = open(src, encoding='utf-8').read()
mapping = json.load(open(mapping_path))
ids_of = json.load(open(f'{pdir}/materials.json'))
LEARNED = {'Mirror': 0.76, 'Revision_ShowerGlass': 0.85, 'Revision_BathMirror': 0.81, 'Detail_ChairSage': 0.92}

def heading(c, t):
    return round(180 - math.degrees(math.atan2(-(t[1] - c[1]), t[0] - c[0])))

# ------------------------------------------------------------------ plans
UNITS = {
 'F': dict(
    area='67.9', rooms_text='3 өрөө · 2 унтлагын өрөө', rooms_short='3 өрөө',
    stops=[  # key, camera stop in <plan>_cams.json, full name, short name, look-at point on arrival
        ('entry', 'entry', 'Орох хаалга', 'Үүд', (14.6, 5.0)),
        ('kitchen', 'kitchen', 'Гал тогоо', 'Гал тогоо', (13.95, 6.4)),
        ('living', 'living', 'Зочны өрөө, хоолны хэсэг', 'Зочны өрөө', (14.5, 5.0)),
        ('bed_d4', 'bed_f4', 'Унтлагын өрөө F4', 'Унтлагын F4', (14.4, 1.4)),
        ('bed_d3', 'bed_f5', 'Унтлагын өрөө F5', 'Унтлагын F5', (18.6, 0.6)),
        ('bath_d5', 'bath_f3', 'Угаалгын өрөө F3', 'АЦӨ F3 · Ванн', (16.25, 9.3)),
        ('balcony', 'balcony', 'Тагт F6', 'Тагт', (21.2, 0.4)),
    ],
    nav={
        'entry': [('kitchen', (14.7, 6.6, 0.9), 'passage'), ('bath_d5', (15.475, 8.32, 1.15), 'door')],
        'kitchen': [('entry', (14.7, 7.07, 0.9), 'passage'), ('living', (17.6, 4.35, 0.95), 'passage')],
        'living': [('kitchen', (15.6, 4.9, 0.95), 'passage'), ('bed_d4', (16.8, 3.2, 1.15), 'door'), ('bed_d3', (17.9, 3.2, 1.15), 'door')],
        'bed_d4': [('living', (16.8, 3.25, 1.15), 'door')],
        'bed_d3': [('living', (17.9, 3.25, 1.15), 'door'), ('balcony', (20.3, 1.775, 1.15), 'door')],
        'bath_d5': [('entry', (15.55, 8.32, 1.18), 'door')],
        'balcony': [('bed_d3', (20.45, 1.775, 1.15), 'door')],
    },
    fixtures=('bath_d5', [('Toilet', (15.9, 7.67, .44)), ('Basin', (16.64, 8.27, .88)), ('Tub', (16.225, 9.155, .52))]),
 ),
 'E': dict(
    area='50.3', rooms_text='2 өрөө · 1 унтлагын өрөө', rooms_short='2 өрөө',
    stops=[
        ('entry', 'entry', 'Орох хаалга', 'Үүд', (17.5, 11.5)),
        ('kitchen', 'kitchen', 'Гал тогоо', 'Гал тогоо', (14.4, 13.4)),
        ('living', 'living', 'Зочны өрөө, хоолны хэсэг', 'Зочны өрөө', (15.0, 12.5)),
        ('bed_d3', 'bed_e2', 'Унтлагын өрөө E2', 'Унтлагын E2', (18.0, 8.4)),
        ('bath_d2', 'bath_e3', 'Ариун цэврийн өрөө E3', 'АЦӨ E3 · Шүршүүр', (13.2, 13.4)),
        ('balcony', 'balcony', 'Тагт E4', 'Тагт', (21.3, 9.5)),
    ],
    nav={
        'entry': [('kitchen', (15.3, 11.3, 0.9), 'passage'), ('bath_d2', (13.45, 11.3, 1.15), 'door')],
        'kitchen': [('entry', (13.8, 10.7, 0.9), 'passage'), ('living', (18.1, 11.2, 0.95), 'passage')],
        'living': [('kitchen', (15.9, 11.75, 0.95), 'passage'), ('bed_d3', (17.95, 9.8, 1.15), 'door')],
        'bed_d3': [('living', (17.95, 9.75, 1.15), 'door'), ('balcony', (20.2, 9.075, 1.15), 'door')],
        'bath_d2': [('entry', (13.45, 11.45, 1.18), 'door')],
        'balcony': [('bed_d3', (20.35, 9.075, 1.15), 'door')],
    },
    fixtures=('bath_d2', [('Toilet', (12.8, 12.0, .44)), ('Basin', (13.69, 12.46, .88)), ('Shower', (13.2, 13.35, 1.1))]),
 ),
}
U = UNITS[PLAN]
cams = json.load(open(f'{pdir}/cams.json'))
keys = [s[0] for s in U['stops']]
pts = {k: [cams[c][0], cams[c][1]] for k, c, *_ in U['stops']}
camkey = {k: c for k, c, *_ in U['stops']}
heads = {k: heading(pts[k], look) for k, c, n, sn, look in U['stops']}

# ------------------------------------------------------------------ images
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

panos, pmasks = {}, {}
for k in keys:
    im = Image.open(f'{rdir}/{camkey[k]}.jpg').convert('RGB')
    if im.size != (4096, 2048): im = im.resize((4096, 2048), Image.LANCZOS)
    panos[f'D_{k}'] = {'lo': b64(im.resize((1280, 640), Image.LANCZOS), 'JPEG', quality=82, optimize=True, progressive=True),
                       'hi': b64(im, 'JPEG', quality=86, optimize=True, progressive=True)}
    pmasks[f'D_{k}'] = mask_pngs(masks(f'{pdir}/ids/{camkey[k]}.png', np.array(im)))
    print('room', k, flush=True)

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

# ------------------------------------------------------------------ page data
def replace_json(var, end, obj, ascii_=True):
    global html
    i = html.index(f'window.{var} = ') + len(f'window.{var} = ')
    j = html.index(end, i) + (1 if end == '};' else 0)
    html = html[:i] + json.dumps(obj, ensure_ascii=ascii_) + html[j:]

replace_json('__PANOS__', '; window.__PLAN__', panos)
replace_json('__PALETTE_MASKS__', '};', pmasks)
replace_json('__TOPDOWN__', '};', {'viewBox': viewbox, 'images': tops})
nav = {k: [{'to': t, 'point': list(p), 'kind': kind} for t, p, kind in U['nav'][k]] for k in keys}
replace_json('__NAVIGATION__', '};', nav, ascii_=False)

def sub_re(pat, rep, count=1):
    global html
    html, n = re.subn(pat, lambda m: rep, html, flags=re.S)
    assert n == count, (pat, n)

yf = [[k, n] for k, c, n, sn, l in U['stops']]
sub_re(r'yf=\{"D":\[\[.*?\]\]\}', 'yf=' + json.dumps({'D': yf}, separators=(',', ':')))
links = {k: [t for t, p, kind in U['nav'][k]] for k in keys}
sub_re(r'vf=\{"D":\{"pts":\{[^}]*\},"links":\{[^}]*\}', 'vf=' + json.dumps({'D': {'pts': pts, 'links': links}}, separators=(',', ':'))[:-2])
sub_re(r'Mx=\{[^}]*\}', 'Mx=' + json.dumps({f'D_{k}': heads[k] for k in keys}, separators=(',', ':')))
sub_re(r'tourArrivalHeadings = \{[^}]*\}', 'tourArrivalHeadings = {' + ','.join(f'{k}:{heads[k]}' for k in keys) + '}')
bath = U['fixtures'][0]
sub_re(r"\(room === 'bath_d5' \? -?\d+ :", f"(room === 'bath_d5' ? {heads.get('bath_d5', 80)} :")
sub_re(r'tourRoomShortNames = \{.*?\};', 'tourRoomShortNames = ' + json.dumps({k: sn for k, c, n, sn, l in U['stops']}, ensure_ascii=False, indent=1) + ';')
fx = ',\n  '.join(f"{bath}:[" + ','.join(f"['{n}',[{x},{y},{z}]]" for n, (x, y, z) in U['fixtures'][1]) + ']' for _ in [0])
sub_re(r'const TOUR_FIXTURES=\{.*?\};', 'const TOUR_FIXTURES={\n  ' + fx + '\n};')

def sub(old, new, count=None):
    global html
    n = html.count(old); assert n and (count is None or n == count), (old, n)
    html = html.replace(old, new)
sub('D айл · 85.1 м²', f'{PLAN} айл · {U["area"]} м²')
sub('3 өрөө · 2 унтлагын өрөө', U['rooms_text'])
sub('-р давхар · 3 өрөө', f'-р давхар · {U["rooms_short"]}')
sub('9 байрлал', f'{len(keys)} байрлал')
html = html.replace('D айл', f'{PLAN} айл').replace('D · Top view', f'{PLAN} · Top view').replace('apartment D"', f'apartment {PLAN}"')
open(dst, 'w', encoding='utf-8').write(html)
print('written', dst, round(len(html) / 1e6, 1), 'MB', heads)
