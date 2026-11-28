"""Publish the 360° tours light: every picture of a tour in its own file, loaded when it is shown.

The tour builders (build_tour.py, mirror_tour.py, make_tour_a1.py, ...) write self-contained pages to
interior/tours/<id>/index.html, with all panoramas, colour masks and top views inlined as data URIs
(8-12 MB each). This copies each of them to public/tour/<id>/index.html with those pictures moved to
public/tour/<id>/img/<hash>.webp (photos as lossy WebP, masks and plans lossless), plus a small
thumbnail per panorama for the room strip, so a tour opens with its page and the first room only.
Run: python3 -I split_tours.py <repo root> [ids...]
"""
import sys, os, re, io, json, base64, hashlib, glob, shutil
from PIL import Image
import importlib.util
# the tours' English, Chinese and Mongolian text (add_languages.py); loaded by path, as python3 -I leaves this
# script's folder off the import path
_spec = importlib.util.spec_from_file_location('add_languages', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'add_languages.py'))
add_languages = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(add_languages)

R = os.path.abspath(sys.argv[1]); ids = sys.argv[2:] or sorted(os.path.basename(os.path.dirname(p)) for p in glob.glob(f'{R}/interior/tours/*/index.html'))
URI = re.compile(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)')

def save(im, path, lossless):
    im.save(path, 'WEBP', quality=82, method=6, lossless=lossless)

for tid in ids:
    src = f'{R}/interior/tours/{tid}/index.html'
    html = open(src, encoding='utf-8').read()
    out_dir = f'{R}/public/tour/{tid}'; img_dir = f'{out_dir}/img'
    shutil.rmtree(img_dir, ignore_errors=True); os.makedirs(img_dir)
    done = {}
    def put(kind, data):
        key = hashlib.sha1(data).hexdigest()[:16]
        if key not in done:
            im = Image.open(io.BytesIO(data)); im.load()
            lossless = kind == 'png'
            if im.mode not in ('RGB', 'RGBA', 'L'): im = im.convert('RGBA' if lossless else 'RGB')
            save(im, f'{img_dir}/{key}.webp', lossless)
            done[key] = f'/tour/{tid}/img/{key}.webp'
        return done[key]
    # panoramas: add a thumbnail for the room strip next to each preview
    m = re.search(r'window\.__PANOS__ = (\{.*?\}); window\.__PLAN__', html, re.S)
    panos = json.loads(m.group(1))
    for k, v in panos.items():
        if 'lo' in v and v['lo'].startswith('data:'):
            data = base64.b64decode(v['lo'].split(',', 1)[1])
            im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((384, 192), Image.LANCZOS)
            b = io.BytesIO(); im.save(b, 'JPEG', quality=85); v['thumb'] = put('jpeg', b.getvalue())
    html = html[:m.start(1)] + json.dumps(panos) + html[m.end(1):]
    html = URI.sub(lambda mm: put(mm.group(1), base64.b64decode(mm.group(2))), html)
    # the room strip shows the thumbnails, not the 1280 px previews
    html, n = re.subn(r'thumbnail\.src = Mf\[(`[^`]+`)\]\.lo;', r'thumbnail.src = Mf[\1].thumb || Mf[\1].lo; thumbnail.loading = "lazy";', html)
    html = add_languages.add_languages(html)
    open(f'{out_dir}/index.html', 'w', encoding='utf-8').write(html)
    total = sum(os.path.getsize(p) for p in glob.glob(f'{img_dir}/*'))
    print(f'{tid}: page {len(html) // 1024} KB, {len(done)} pictures {total // 1024} KB, strip patched {n}')
