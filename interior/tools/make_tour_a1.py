"""Make the Block A 1st-floor 360° tour (interior/tours/A1/index.html) from the plan-D tour.

The plan-D tour is a self-contained page: the viewer code with its data inlined (panoramas, top view,
stops, door hotspots). This keeps the viewer and swaps the data for the renders of interior/A1.blend:
- panoramas  interior/renders/A1/<stop>.jpg (4096 x 2048, Cycles, render_panos.py A1)
- top view   interior/renders/A1/topdown.jpg (orthographic, cut at 2.9 m)
- stops      interior/A1_cams.json (plan metres: x = u east, y = -v south, eye height)
Plan coordinates and headings follow the D tour (heading = 180 - atan2(dz, dx), dz = -(y - y0)).
The interior palettes and bathroom fixture views of the apartment tour are switched off.
Run: python3 -I make_tour_a1.py
"""
import base64, io, json, math, os, re
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'interior/tours/D/index.html')
OUT = os.path.join(ROOT, 'interior/tours/A1/index.html')
REN = os.path.join(ROOT, 'interior/renders/A1')
CAMS = json.load(open(os.path.join(ROOT, 'interior/A1_cams.json')))

STOPS = [  # id, full name, short name, look-at point (plan x, y) for the first view
    ('entry', 'Гол орц', 'Орц', (-2.0, -8.0)),
    ('atrium', 'Төв танхим, урсдаг шат', 'Танхим', (1.0, -6.5)),
    ('market', 'Супермаркетын орц, касс', 'Касс', (-7.7, 5.0)),
    ('aisle', 'Барааны эгнээ', 'Эгнээ', (5.18, 6.0)),
    ('fresh', 'Хөргөсөн бүтээгдэхүүн', 'Хөргүүр', (17.0, -10.0)),
]
LINKS = {'entry': ['atrium'], 'atrium': ['entry', 'market'], 'market': ['atrium', 'aisle', 'fresh'],
         'aisle': ['market', 'fresh'], 'fresh': ['aisle', 'market']}
VIEWBOX = [-18.7, -31.6, 37.1, 47.5]  # plan x, y of the top view's top-left corner, width, height

def heading(frm, to):
    dx, dz = to[0] - frm[0], -(to[1] - frm[1])
    return round(180 - math.degrees(math.atan2(dz, dx)))

def jpeg(path, size, q):
    im = Image.open(path).convert('RGB')
    if size: im = im.resize(size, Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q, optimize=True, progressive=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

html = open(SRC, encoding='utf-8').read()
def sub(old, new, count=1):
    global html
    n = html.count(old)
    assert n >= 1, f'not found: {old[:60]}'
    html = html.replace(old, new) if count == 0 else html.replace(old, new, count)
def resub(pat, new):
    global html
    html, n = re.subn(pat, lambda m: new, html, count=1, flags=re.S)
    assert n == 1, f'no match: {pat[:60]}'

pts = {s: [CAMS[s][0], CAMS[s][1]] for s, *_ in STOPS}
panos = {'sample': {'lo': None}}
for s, *_ in STOPS:
    f = os.path.join(REN, f'{s}.jpg')
    panos[f'A1_{s}'] = {'lo': jpeg(f, (1280, 640), 80), 'hi': jpeg(f, None, 80)}
panos['sample']['lo'] = panos['A1_atrium']['lo']
nav = {}
for s, *_ in STOPS:
    nav[s] = []
    for t in LINKS[s]:
        a, b = pts[s], pts[t]; d = math.dist(a, b); k = min(1, 3.5 / d)
        nav[s].append({'to': t, 'point': [round(a[0] + (b[0] - a[0]) * k, 3), round(a[1] + (b[1] - a[1]) * k, 3), 0.75], 'kind': 'passage'})
top = {'viewBox': VIEWBOX, 'images': {'neutral': jpeg(os.path.join(REN, 'topdown.jpg'), None, 82)}}
heads = {s: heading(pts[s], look) for s, _, _, look in STOPS}

# ---- data blocks
resub(r'window\.__PANOS__ = \{.*?\}; window\.__PLAN__', 'window.__PANOS__ = ' + json.dumps(panos) + '; window.__PLAN__')
resub(r'window\.__PALETTE_MASKS__ = \{.*?\};\n', 'window.__PALETTE_MASKS__ = {};\n')
resub(r'window\.__TOPDOWN__ = \{.*?\};\n', 'window.__TOPDOWN__ = ' + json.dumps(top) + ';\n')
resub(r'window\.__NAVIGATION__ = \{.*?\};\n', 'window.__NAVIGATION__ = ' + json.dumps(nav, ensure_ascii=False) + ';\n')
# ---- viewer configuration (minified constants of the D tour)
resub(r'yf=\{"D":\[\[.*?\]\]\}', 'yf={"D":' + json.dumps([[s, n] for s, n, _, _ in STOPS], ensure_ascii=False) + '}')
resub(r'vf=\{"D":\{"pts":.*?"off":\[[^\]]*\]\}\}', 'vf={"D":' + json.dumps({'pts': pts, 'links': LINKS, 'off': [-0.85, 0.6]}) + '}')
resub(r'Mx=\{"D_entry":[^}]*\}', 'Mx=' + json.dumps({f'A1_{s}': h for s, h in heads.items()}))
sub('`D_${room}`', '`A1_${room}`', 0)
resub(r'const tourRoomShortNames = \{.*?\};', 'const tourRoomShortNames = ' + json.dumps({s: n for s, _, n, _ in STOPS}, ensure_ascii=False) + ';')
resub(r'const tourArrivalHeadings = \{[^}]*\};', 'const tourArrivalHeadings = ' + json.dumps(heads) + ';')
resub(r'const TOUR_FIXTURES=\{.*?\n\};', 'const TOUR_FIXTURES={};')
sub("if (!tourRoomNames[room]) room = 'living';", "if (!tourRoomNames[room]) room = 'atrium';")
sub("function openInteriorTour(selection, unit = 'D', room = 'living', heading)", "function openInteriorTour(selection, unit = 'D', room = 'atrium', heading)")
sub("openInteriorTour(null, 'D', 'living');", "openInteriorTour(null, 'D', 'atrium');", 0)
sub("tourElement('panoTitle').textContent = 'D айл · 85.1 м²';", "tourElement('panoTitle').textContent = 'A блок · 1-р давхар';")
resub(r"tourElement\('tourContext'\)\.textContent = selection\s*\?.*?: '3 өрөө · 2 унтлагын өрөө';", "tourElement('tourContext').textContent = 'Худалдааны төв · супермаркет';")
# ---- visible text
resub(r'<title>.*?</title>', '<title>СЭБОЦЭ · A блок, 1-р давхрын 360° тур</title>')
sub('aria-label="D айлын 360 градусын тур"', 'aria-label="A блокийн 1-р давхрын 360 градусын тур"')
sub('<h1 id="panoTitle">D айл · 85.1 м²</h1>', '<h1 id="panoTitle">A блок · 1-р давхар</h1>')
sub('<p id="tourContext">3 өрөө · 2 унтлагын өрөө</p>', '<p id="tourContext">Худалдааны төв · супермаркет</p>')
sub('Интерьерийн төсөл · 9 байрлал', f'Интерьерийн төсөл · {len(STOPS)} байрлал')
sub('aria-label="Furnished top view of apartment D"', 'aria-label="Top view of Block A, 1st floor"')
sub('<strong>D · Top view</strong>', '<strong>A1 · Top view</strong>')
resub(r'<details class="tour-source-note">.*?</details>', '<details class="tour-source-note"><summary>Интерьерийн тухай</summary>'
      '<p>Санал болгож буй интерьер. Хана, багана, урсдаг шатны байрлалыг төслийн 1-р давхрын планаас авсан.</p>'
      '<p>Орчны гэрэл · Poly Haven, Modern Buildings 2, CC0. Ургамал · Khronos glTF Sample Assets, CC BY 4.0.</p></details>')
# the map spans the whole floor (about 4x the apartment's), so its markers are drawn 4x bigger
K = 4.2
sub('<circle cx="${x}" cy="${y}" r=".40"', f'<circle cx="${{x}}" cy="${{y}}" r="{.40 * K:.2f}"')
sub('<circle class="map-dot" cx="${x}" cy="${y}" r=".23"/>', f'<circle class="map-dot" cx="${{x}}" cy="${{y}}" r="{.23 * K:.2f}"/>')
sub('dy=".085"', f'dy="{.085 * K:.3f}"')
sub('const radius = 1.5;', f'const radius = {1.5 * K};')
sub('stroke-width=".035"', f'stroke-width="{.035 * K:.3f}"')
MAPCSS = (f'#panoMini .map-number {{ font-size: {.245 * K:.2f}px; }}'
          f' #panoMini .map-dot {{ stroke-width: {.045 * K:.2f}; filter: drop-shadow(0 {.035 * K:.2f}px {.04 * K:.2f}px #0006); }}'
          f' #panoMini .map-node.is-current .map-dot {{ stroke-width: {.055 * K:.2f}; }}'
          f' #panoMini .map-node:focus-visible .map-dot {{ stroke-width: {.09 * K:.2f}; }}')
sub('</head>', '<style>' + MAPCSS + '</style>\n</head>')
# no interior palettes here: hide their panel and the palette name under the map
sub('</head>', '<style>#tourDesignPanel, .map-caption #tourTopdownPalette { display: none !important; }</style>\n</head>')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf-8').write(html)
print('wrote', OUT, round(len(html) / 1e6, 1), 'MB', heads)
