"""Cut the furnished top views out of the D, E, F tours into public/plans/<plan>.jpg (A, B, C mirrored) and print
the room rectangles for src/data/planPhotos.ts.  Run: python3 -I make_plans.py <repo root> <out json>"""
import sys, json, base64, io
import numpy as np
from PIL import Image
R = sys.argv[1]
CROP = {'D': (10.6, 10.95, 22.2, 21.35), 'E': (12.1, 6.8, 22.2, 14.1), 'F': (12.8, -0.35, 22.2, 9.95)}
ROOMS = {
 'F': dict(living=(13.95, 3.3, 21.85, 7.0), hall=(13.0, 7.15, 15.4, 9.6), bathroom=(15.55, 7.15, 16.9, 9.6),
           bedroom1=(17.4, 0, 20.3, 3.15), bedroom2=(13.95, 0, 17.25, 3.15), balcony=(20.45, 0, 21.85, 3.15)),
 'E': dict(living=(14.1, 9.85, 21.85, 13.9), bedroom=(17.45, 7.15, 20.2, 9.7), bathroom=(12.45, 11.45, 13.95, 13.9),
           balcony=(20.35, 7.15, 21.85, 9.7)),
 'D': dict(living=(10.95, 13.9, 14.75, 21.0), bathroom1=(16.55, 14.1, 17.9, 16.55), bathroom2=(14.9, 14.1, 16.4, 16.55),
           bedroom1=(18.05, 14.1, 21.85, 17.75), bedroom2=(15.9, 17.9, 20.55, 21.0), balcony=(20.7, 17.9, 21.85, 21.0)),
}
CREAM = (246, 243, 236)
MIRROR_OF = {'C': 'D', 'B': 'E', 'A': 'F'}
out = {}
for P in 'DEF':
    s = open(f'{R}/interior/tours/{P}/index.html', encoding='utf-8').read()
    i = s.index('window.__TOPDOWN__ = ') + len('window.__TOPDOWN__ = '); j = s.index('};', i) + 1
    t = json.loads(s[i:j]); L, N, W, H = t['viewBox']
    im = Image.open(io.BytesIO(base64.b64decode(t['images']['neutral'].split(',', 1)[1]))).convert('RGB')
    sx, sy = im.width / W, im.height / H
    x0, y0, x1, y1 = CROP[P]
    c = im.crop((round((x0 - L) * sx), round((y0 - N) * sy), round((x1 - L) * sx), round((y1 - N) * sy)))
    w, h = x1 - x0, y1 - y0
    if P == 'D':  # the long entry corridor renders dim; lift it to the rooms' brightness
        ppm = c.width / w
        box = (round((10.95 - x0) * ppm), round((11.4 - y0) * ppm), round((11.95 - x0) * ppm), round((13.9 - y0) * ppm))
        a = np.asarray(c).astype(np.float32) / 255
        lin = np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)
        sub = lin[box[1]:box[3], box[0]:box[2]] * 2.2
        lin[box[1]:box[3], box[0]:box[2]] = sub
        a = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 0, 1), 1 / 2.4) - .055)
        c = Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8))
    rooms = {k: [round(a - x0, 3), round(b - y0, 3), round(cc - a, 3), round(d - b, 3)] for k, (a, b, cc, d) in ROOMS[P].items()}
    for Q, img, rm in ((P, c, rooms), ({v: k for k, v in MIRROR_OF.items()}[P], c.transpose(Image.FLIP_LEFT_RIGHT),
                       {k: [round(w - (x + ww), 3), y, ww, hh] for k, (x, y, ww, hh) in rooms.items()})):
        a = np.asarray(img).astype(np.int16)
        dist = np.abs(a - np.array(CREAM)).max(-1)  # the tour's cream background -> transparent
        alpha = (np.clip((dist - 4) / 10, 0, 1) * 255).astype(np.uint8)
        Image.fromarray(np.dstack([np.asarray(img), alpha])).save(f'{R}/public/plans/{Q}.webp', quality=88, method=6)
        out[Q] = dict(w=round(w, 3), h=round(h, 3), rooms=rm)
        print(Q, img.size, round(w, 2), round(h, 2))
json.dump(out, open(sys.argv[2], 'w'), indent=1)
