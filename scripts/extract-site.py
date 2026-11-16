"""Builds src/data/site.json from the site plan drawing (ET_coordinattai.dwg).

The DWG must first be converted to DXF (LibreDWG: `dwg2dxf -o site.dxf ET_coordinattai.dwg`).
Usage: python3 scripts/extract-site.py site.dxf src/data/site.json

The drawing is in metres, in UTM coordinates, with the building turned 10.71 degrees.
Everything is converted to a building-aligned frame (u along the short side of the
site, v along the long side) centred between the two towers.
"""
import json, math, sys
import ezdxf
from ezdxf import path as ezpath

SRC, OUT = sys.argv[1], sys.argv[2]
ROT = 10.71
ORIGIN = (641000.0, 5308760.0)   # arbitrary point near the building
CENTRE = (-18.0, 22.0)           # building-aligned point used as the new origin
SKIP = {'devsger'}               # survey base map

doc = ezdxf.readfile(SRC)
msp = doc.modelspace()
a = math.radians(ROT); ca, sa = math.cos(a), math.sin(a)

def loc(p):
    x, y = p.x - ORIGIN[0], p.y - ORIGIN[1]
    return [round(x * ca + y * sa - CENTRE[0], 2), round(-x * sa + y * ca - CENTRE[1], 2)]

def pts(e, tol=0.15):
    return [loc(q) for q in ezpath.make_path(e).flattening(tol)]

def size(p):
    us = [q[0] for q in p]; vs = [q[1] for q in p]
    return max(us) - min(us), max(vs) - min(vs)

def walk(ents, name='msp'):
    for e in ents:
        if e.dxftype() == 'INSERT':
            if e.dxf.name in SKIP or e.dxf.name in ('shrub3', 'flower shrub 3', 'togloomiin talbai'):
                continue
            try:
                yield from walk(e.virtual_entities(), e.dxf.name)
            except Exception:
                pass
        else:
            yield name, e

site = {'rotation': ROT, 'towers': [], 'podium': None, 'annex': None, 'boundary': None,
        'kerbs': [], 'parking': [], 'trees': [], 'playground': None, 'grid': {'u': [], 'v': []}}

for name, e in walk(msp):
    t, layer = e.dxftype(), e.dxf.layer
    if t not in ('LWPOLYLINE', 'LINE', 'ARC'):
        continue
    try:
        p = pts(e)
    except Exception:
        continue
    if len(p) < 2:
        continue
    du, dv = size(p)
    if name == 'tgetdhrth' and layer == 'TB_BarilgaB_A' and t == 'LWPOLYLINE':
        if e.closed and abs(du - 22.6) < 0.2 and abs(dv - 22.0) < 0.2:
            us = [q[0] for q in p]; vs = [q[1] for q in p]
            site['towers'].append({'u0': min(us), 'u1': max(us), 'v0': min(vs), 'v1': max(vs)})
        elif du > 30 and dv > 30:
            site['podium'] = p
    elif name == 'YUJTJU' and layer == 'TB_BarilgaB_A' and t == 'LWPOLYLINE' and len(p) == 5 and du > 15:
        site['annex'] = p[:4]
    elif name == 'tgetdhrth' and layer == '64' and t == 'LINE':
        (u1, v1), (u2, v2) = p[0], p[-1]
        if abs(u1 - u2) < 0.3: site['grid']['u'].append(round((u1 + u2) / 2, 2))
        elif abs(v1 - v2) < 0.3: site['grid']['v'].append(round((v1 + v2) / 2, 2))
    elif name == 'msp' and layer == 'TB_ONChanAutoZam_A' and du > 40:
        site['boundary'] = p
    elif name == 'msp' and layer == '1 YAVGAN ZAM':
        site['parking'].append(p)
    elif name == 'msp' and layer == '0' and t in ('LWPOLYLINE', 'ARC', 'LINE') and max(du, dv) > 1.5:
        site['kerbs'].append(p)

for e in msp.query('INSERT'):
    if e.dxf.name in ('shrub3', 'flower shrub 3'):
        site['trees'].append(loc(e.dxf.insert))
    elif e.dxf.name == 'togloomiin talbai':
        us, vs = [], []
        for i, v in enumerate(e.virtual_entities()):
            if i % 40 == 0 and v.dxftype() == 'LINE':
                q = loc(v.dxf.start); us.append(q[0]); vs.append(q[1])
        site['playground'] = {'u0': min(us), 'u1': max(us), 'v0': min(vs), 'v1': max(vs)}

site['towers'].sort(key=lambda t: t['v0'])
for k in 'uv':
    site['grid'][k] = sorted(set(site['grid'][k]))
json.dump(site, open(OUT, 'w'), separators=(',', ':'))
print({k: (len(v) if isinstance(v, list) else v) for k, v in site.items() if k not in ('podium', 'boundary')})
print('podium pts', len(site['podium']), 'boundary pts', len(site['boundary']), 'annex', site['annex'])
