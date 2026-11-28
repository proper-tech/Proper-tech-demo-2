"""Glass between two rooms of a flat is not a window to the street, so the drone's view must not show through it.

Plans F and E have a glazed pane in the wall between the bedroom and the balcony. It carries the scenes'
Window_Glass material, so the material-ID passes mark it as window glass, and the tours showed the city through it
with the room behind (the bedside lamp, the bed's frame) laid over the photo. This module finds that pane in a
stop's 360° picture and takes it out of the stop's window mask.

The pane is projected into the picture from the scene's own geometry: picture column u looks along the compass
bearing u * 360 + 270 degrees, clockwise from the scene's +y, and row v at the elevation 90 - v * 180 (fitted
to the published masks of plan F's balcony). The mirrored plans (A from F, B from E) take the same region turned
over left to right and half a turn round, as mirror_tour.py and hd_tours.mjs turn their pictures.

As a module: clear(mask, plan, stop) gives the mask without the pane (add_window_masks.py uses it).
As a script it mends the tours already published, in place, for plans E, F, A and B:
    python3 -I interior/tools/inner_glass.py <repository root>
- interior/tours/<plan>/index.html: the masks held as PNG data URIs;
- public/tour/<plan>/: the masks as lossless WebP named after the SHA-1 of the PNG (as split_tours.py names them);
- public/tour-hd/<plan>/: the masks of the default photos and of each colour-scheme photo (window.__BAKED__),
  as lossless WebP named after the SHA-1 of the WebP (as hd_tours.mjs names them).
A changed mask gets a new name, because the tours' pictures are cached for good, and the old file is removed.
"""
import base64, hashlib, io, json, os, re, sys
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))

# The panes, as (lowest corner, highest corner) in the scene's metres: F.blend's Glass.010 and E.blend's Glass.008.
# Their bottom is taken down to 0.3 m, because the renders' window boards and frames (upgrade_windows.py) leave the
# glass's lower edge lower than the plain scene has it.
INNER = {
    'F': [((20.36, -1.1, 0.3), (20.39, -0.25, 2.45))],
    'E': [((20.26, -8.3, 0.3), (20.28, -7.4, 2.45))],
}
# The tour's stops that look at the pane directly, with the camera each one was rendered from (<plan>_cams.json).
# Only these two rooms are mended, because the projection knows nothing of the walls that hide the pane elsewhere.
STOPS = {
    'F': {'bed_d3': 'bed_f5', 'balcony': 'balcony'},
    'E': {'bed_d3': 'bed_e2', 'balcony': 'balcony'},
}
MIRROR = {'A': 'F', 'B': 'E'}


def _region(plan, stop, w, h):
    """Boolean picture of where the stop sees the plan's inner pane (unmirrored plan)."""
    cams = json.load(open(os.path.join(HERE, '..', f'{plan}_cams.json')))
    x, y, z = cams[STOPS[plan][stop]]
    cam = (x, -y, z)  # the cameras file counts y southwards, the scene northwards
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    az = np.radians(u * 360 + 270)[None, :]
    el = np.radians(90 - v * 180)[:, None]
    dx, dy, dz = np.sin(az) * np.cos(el), np.cos(az) * np.cos(el), np.sin(el) * np.ones_like(az)
    hit = np.zeros((h, w), bool)
    for lo, hi in INNER[plan]:
        if hi[0] - lo[0] < hi[1] - lo[1]:  # a pane in a wall running north-south: the plane x = const
            t = ((lo[0] + hi[0]) / 2 - cam[0]) / np.where(np.abs(dx) < 1e-9, 1e-9, dx)
            a = cam[1] + t * dy
            span = (lo[1], hi[1])
        else:  # a wall running east-west: the plane y = const
            t = ((lo[1] + hi[1]) / 2 - cam[1]) / np.where(np.abs(dy) < 1e-9, 1e-9, dy)
            a = cam[0] + t * dx
            span = (lo[0], hi[0])
        zz = cam[2] + t * dz
        hit |= (t > 0) & (a >= span[0]) & (a <= span[1]) & (zz >= lo[2]) & (zz <= hi[2])
    return hit


def clear(mask, plan, stop):
    """The window mask (a PIL image) without the plan's inner pane; unchanged for other plans and stops."""
    src = MIRROR.get(plan, plan)
    if src not in INNER or stop not in STOPS[src]:
        return mask
    w, h = mask.size
    r = _region(src, stop, w, h)
    if plan in MIRROR:
        r = np.roll(r[:, ::-1], w // 2, axis=1)
    # A little wider than the pane, so that the mask's soft edge against the frame goes too.
    grow = max(3, round(w / 512)) | 1
    r = np.asarray(Image.fromarray(r.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(grow))) > 0
    a = np.array(mask.convert('L'))
    a[r] = 0
    return Image.fromarray(a, 'L')


# ------------------------------------------------------------------------------------------- published tours
def _table(html, name):
    m = re.search(r'window\.' + name + r' = (\{.*?\});', html, re.S)
    return (m.group(1), json.loads(m.group(1))) if m else (None, None)


def _replace_table(html, name, text, value):
    old = f'window.{name} = {text};'
    assert html.count(old) == 1, name
    return html.replace(old, f'window.{name} = {json.dumps(value)};')


def _mend_source(root, plan):
    path = os.path.join(root, 'interior', 'tours', plan, 'index.html')
    html = open(path, encoding='utf-8').read()
    text, masks = _table(html, '__WINDOW_MASKS__')
    n = 0
    for key, uri in masks.items():
        stop = key[2:]
        old = Image.open(io.BytesIO(base64.b64decode(uri.split(',', 1)[1]))).convert('L')
        new = clear(old, plan, stop)
        if np.array_equal(np.asarray(old), np.asarray(new)):
            continue
        buf = io.BytesIO(); new.save(buf, 'PNG', optimize=True)
        masks[key] = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
        n += 1
    if n:
        open(path, 'w', encoding='utf-8').write(_replace_table(html, '__WINDOW_MASKS__', text, masks))
    print(f'interior/tours/{plan}: {n} masks mended')


def _webp(im):
    buf = io.BytesIO(); im.save(buf, 'WEBP', lossless=True, method=6)
    return buf.getvalue()


def _mend_published(root, tour, plan):
    out = os.path.join(root, 'public', tour, plan)
    path = os.path.join(out, 'index.html')
    html = open(path, encoding='utf-8').read()
    old_files = set()

    def mend(url, stop):
        old = Image.open(os.path.join(root, 'public', url.lstrip('/'))).convert('L')
        new = clear(old, plan, stop)
        if np.array_equal(np.asarray(old), np.asarray(new)):
            return url
        if tour == 'tour':  # named as split_tours.py names it: after the PNG that interior/tours holds
            buf = io.BytesIO(); new.save(buf, 'PNG', optimize=True)
            key = hashlib.sha1(buf.getvalue()).hexdigest()[:16]
            data = _webp(new)
        else:  # named as hd_tours.mjs names it: after the WebP itself
            data = _webp(new)
            key = hashlib.sha1(data).hexdigest()[:16]
        open(os.path.join(out, 'img', f'{key}.webp'), 'wb').write(data)
        old_files.add(url)
        return f'/{tour}/{plan}/img/{key}.webp'

    n = 0
    text, masks = _table(html, '__WINDOW_MASKS__')
    for key in masks:
        new = mend(masks[key], key[2:])
        n += new != masks[key]
        masks[key] = new
    html = _replace_table(html, '__WINDOW_MASKS__', text, masks)
    text, baked = _table(html, '__BAKED__')
    if baked:
        for key, schemes in baked.items():
            for entry in schemes.values():
                if 'glass' in entry:
                    new = mend(entry['glass'], key[2:])
                    n += new != entry['glass']
                    entry['glass'] = new
        html = _replace_table(html, '__BAKED__', text, baked)
    open(path, 'w', encoding='utf-8').write(html)
    for url in old_files:
        if url not in html:
            os.remove(os.path.join(root, 'public', url.lstrip('/')))
    print(f'public/{tour}/{plan}: {n} masks mended')


if __name__ == '__main__':
    root = sys.argv[1]
    for plan in ('F', 'E', 'A', 'B'):
        _mend_source(root, plan)
        for tour in ('tour', 'tour-hd'):
            _mend_published(root, tour, plan)
