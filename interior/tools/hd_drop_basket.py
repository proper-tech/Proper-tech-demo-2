"""Take the wicker basket off plan F's kitchen worktop in the photographic tours (and so off plan A's, its mirror).

upgrade_dress.py put a basket on the worktop corner next to the tall fridge unit, and in F it went half into the
unit's side. The repainted photos (interior/hd/F/kitchen*.jpg) kept it, so the HD tour showed a basket cut by the
fridge in every colour scheme. Re-rendering and repainting the room is the thorough fix; until then this paints
the basket out of the photos:
- the basket is found by its colour in the warm-neutral photo, round the same spot in all of them;
- the worktop and the tiled wall behind are filled with their own grain, copied from beside the hole, and the tall
  unit's side with its own colour; the light across each surface comes from the pixels round the hole, so the
  patch takes the photo's shading;
- a Poisson blend (OpenCV's seamless clone) hides the edge.

Run from the repository root, one of:
    python3 -I interior/tools/hd_drop_basket.py public      mend public/tour-hd/F and A in place
    python3 -I interior/tools/hd_drop_basket.py files <neutral.jpg> [<scheme.jpg> ...]
                                                            mend repainted sources (interior/hd/F/kitchen*.jpg)
In place, each mended photo is written as hd_tours.mjs writes it (hi 4096, lo 1280 and thumb 384 px WebP at quality
82, named after the SHA-1 of the file, so cached copies never go stale), the tour's tables point at the new files and
the old ones are removed. A's photos are F's mended ones turned over left to right and half a turn round.
"""
import hashlib, io, json, os, re, sys
import numpy as np
import cv2
from PIL import Image

# The basket's neighbourhood, in the photo turned half a turn round (the basket sits on the picture's 360° join).
X0, Y0, SIZE = 750, 1100, 600


def _crop(a):
    return np.roll(a, a.shape[1] // 4, axis=1)[Y0:Y0 + SIZE, X0:X0 + SIZE]


def _put(a, c):
    q = a.shape[1] // 4
    r = np.roll(a, q, axis=1)
    r[Y0:Y0 + SIZE, X0:X0 + SIZE] = c
    return np.roll(r, -q, axis=1)


def basket_mask(neutral):
    """Where the basket is (uint8 0/1, crop coordinates), from the warm-neutral photo, where it stands out best."""
    c = _crop(neutral).astype(int)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    m = (((r + g + b) / 3 < 150) & (r > g) & (g >= b - 5)).astype(np.uint8)  # brown wicker
    box = np.zeros_like(m); box[105:315, 105:295] = 1
    m *= box
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    # The weave's gaps belong to the basket too: take the outline's convex hull.
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    hull = np.zeros_like(m)
    cv2.drawContours(hull, [cv2.convexHull(max(cnts, key=cv2.contourArea))], -1, 1, -1)
    return cv2.dilate(hull, np.ones((9, 9), np.uint8))


def _mblur(img, valid, s):
    """Gaussian blur of img counting only the valid pixels."""
    v = valid.astype(np.float32)
    num = cv2.GaussianBlur(img * v[..., None], (0, 0), s)
    den = cv2.GaussianBlur(v, (0, 0), s)[..., None]
    return num / np.maximum(den, 1e-3)


def retouch(a, m):
    """The photo (RGB array, 4096 x 2048) with the basket in m painted out."""
    c = _crop(a).copy()
    H, W = m.shape
    yy, xx = np.mgrid[0:H, 0:W]
    t = m > 0
    junction = 186 - (xx - 180) * 0.03  # where the tiled wall meets the worktop
    # The tall unit's side: left of the wall's corner, and left of the line where the worktop meets it.
    side = (xx < 180) & (xx < 180 - (yy - 188) * (67 / 137)) & (yy < 330)
    f = c.astype(np.float32)
    hp = f - _mblur(f, ~t, 6)  # the surfaces' grain, without the light across them
    hp[t] = 0
    o = hp.copy()
    # Worktop: grain from the stone to the right, a band at a time, from right to left.
    for x0 in range(298, 100, -95):
        sel = t & (yy >= junction - 14) & (~side) & (xx > x0 - 95) & (xx <= x0)
        ys, xs = np.nonzero(sel)
        o[ys, xs] = o[ys, xs + 95]
    # Tiled wall: one tile (178 px) to the right, so the joints fall where they should.
    ys, xs = np.nonzero(t & (yy < junction - 14) & (~side))
    o[ys, xs] = hp[ys, xs + 178]
    # The strip where the wall meets the worktop: its shading across, averaged along the clean stretch beside the
    # hole, because a copy of any one stretch brings the small fitting at the wall's foot (or the hob) with it.
    ys, xs = np.nonzero(t & (yy >= junction - 14) & (yy < junction + 6) & (~side))
    rel = np.round(ys - junction[ys, xs]).astype(int)
    ref = np.arange(312, 390)
    prof = {d: hp[np.round(186 - (ref - 180) * 0.03 + d).astype(int), ref].mean(0) for d in range(-15, 8)}
    o[ys, xs] = np.array([prof[d] for d in rel])
    # The unit's side: from above it, a band at a time.
    for y0 in range(101, 331, 95):
        ys, xs = np.nonzero(t & side & (yy >= y0) & (yy < y0 + 95))
        o[ys, xs] = o[ys - 95, xs]
    # The light: carried in from round the hole, separately for the unit's side and for the stone.
    low = np.zeros_like(f)
    base = _mblur(f, ~t, 4).clip(0, 255).astype(np.uint8)
    for region in (side, ~side):
        unknown = (t | ~region).astype(np.uint8)
        fill = cv2.inpaint(base, unknown, 9, cv2.INPAINT_TELEA).astype(np.float32)
        low[region] = _mblur(fill, region, 8)[region]
    res = f.copy()
    res[t] = np.clip(low[t] + o[t], 0, 255)
    mm = cv2.dilate(m, np.ones((5, 5), np.uint8)) * 255
    ys, xs = np.nonzero(mm)
    centre = (int((xs.min() + xs.max()) / 2), int((ys.min() + ys.max()) / 2))
    return _put(a, cv2.seamlessClone(res.astype(np.uint8), c, mm, centre, cv2.NORMAL_CLONE))


def mirrored(a):
    """The picture as a mirrored plan shows it: turned over left to right, then half a turn round."""
    return np.roll(a[:, ::-1], a.shape[1] // 2, axis=1)


# --------------------------------------------------------------------------------------------- the HD tours
def _webp(a, w, h):
    im = Image.fromarray(a)
    if im.size != (w, h):
        im = im.resize((w, h), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=82, method=6)
    return buf.getvalue()


def _emit(plan, data):
    key = hashlib.sha1(data).hexdigest()[:16]
    open(os.path.join('public', 'tour-hd', plan, 'img', f'{key}.webp'), 'wb').write(data)
    return f'/tour-hd/{plan}/img/{key}.webp'


def _tables(html):
    p = re.search(r'window\.__PANOS__ = (\{.*?\}\});', html, re.S)
    b = re.search(r'window\.__BAKED__ = (\{.*?\});</script>', html, re.S)
    return p, json.loads(p.group(1)), b, json.loads(b.group(1))


def _entries(panos, baked):
    """The kitchen's pictures: the default one first, then one per colour scheme."""
    return [panos['D_kitchen']] + list(baked.get('D_kitchen', {}).values())


def mend_public():
    pics = {}
    for plan in ('F', 'A'):
        path = os.path.join('public', 'tour-hd', plan, 'index.html')
        html = open(path, encoding='utf-8').read()
        p, panos, b, baked = _tables(html)
        entries = _entries(panos, baked)
        if plan == 'F':
            load = lambda e: np.array(Image.open('public' + e['hi']).convert('RGB'))
            m = basket_mask(load(entries[0]))
            pics = [retouch(load(e), m) for e in entries]
            out = pics
        else:
            out = [mirrored(a) for a in pics]
        old = []
        for e, a in zip(entries, out):
            old += [e['hi'], e['lo'], e['thumb']]
            e['hi'] = _emit(plan, _webp(a, 4096, 2048))
            e['lo'] = _emit(plan, _webp(a, 1280, 640))
            e['thumb'] = _emit(plan, _webp(a, 384, 192))
        html = html[:p.start(1)] + json.dumps(panos) + html[p.end(1):]
        b = re.search(r'window\.__BAKED__ = (\{.*?\});</script>', html, re.S)
        html = html[:b.start(1)] + json.dumps(baked) + html[b.end(1):]
        open(path, 'w', encoding='utf-8').write(html)
        for url in old:
            if url not in html:
                os.remove('public' + url)
        print(f'public/tour-hd/{plan}: kitchen, {len(entries)} photos mended')


def mend_files(files):
    load = lambda f: np.array(Image.open(f).convert('RGB'))
    m = basket_mask(load(files[0]))
    for f in files:
        Image.fromarray(retouch(load(f), m)).save(f, quality=95)
        print('mended', f)


if __name__ == '__main__':
    if sys.argv[1] == 'public':
        mend_public()
    else:
        mend_files(sys.argv[2:])
