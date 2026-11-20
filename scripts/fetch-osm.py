"""Fetches the real city round the site from OpenStreetMap for the home-page film (scripts/build-film.py --osm):
building footprints with heights and the streets, within 800 m, in the site plan's own frame (metres, x along
the building's short side, y along its long side, 0,0 between the two towers).

  python3 scripts/fetch-osm.py scripts/osm-surroundings.json [SERVER]

SERVER: another Overpass endpoint when the main one is busy (HTTP 504), e.g.
https://lz4.overpass-api.de/api/interpreter or https://overpass.kumi.systems/api/interpreter.

Map data © OpenStreetMap contributors, under the ODbL (openstreetmap.org/copyright): the film must credit it.
Standard library only; one query to the public Overpass API.
"""
import json, math, sys, urllib.parse, urllib.request

OUT = sys.argv[1]
# the middle between the towers, pinned on Google Maps (the site drawing's own coordinates are on a local grid
# that doesn't match UTM, so the pin is the link to the real map)
PIN = (47.928253, 106.913053)
# OSM in the site frame: turned and shifted so its street centrelines run down the middle of the street model's
# roads (fitted against public/models/blocks/environment.glb; the drawing's own 10.71 deg is 0.4 deg off)
TURN, SHIFT = 10.31, (3.25, -1.0)
RADIUS = 800
SERVER = sys.argv[2] if len(sys.argv) > 2 else "https://overpass-api.de/api/interpreter"
# street widths by type (m); footpaths, steps, tracks and anything unbuilt are left out
WIDTH = {"motorway": 14, "trunk": 14, "primary": 12, "secondary": 11, "tertiary": 9, "unclassified": 7,
         "residential": 7, "living_street": 6, "service": 5}
for k in list(WIDTH):
    WIDTH[k + "_link"] = WIDTH[k] - 2


def utm48(lat, lon):
    """WGS84 -> UTM zone 48N metres (Krueger series, mm accuracy)."""
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    n = f / (2 - f)
    A = a / (1 + n) * (1 + n**2 / 4 + n**4 / 64)
    al = [n / 2 - 2 * n**2 / 3 + 5 * n**3 / 16, 13 * n**2 / 48 - 3 * n**3 / 5, 61 * n**3 / 240]
    p, dl = math.radians(lat), math.radians(lon - 105.0)
    c = 2 * math.sqrt(n) / (1 + n)
    t = math.sinh(math.atanh(math.sin(p)) - c * math.atanh(c * math.sin(p)))
    xi, eta = math.atan2(t, math.cos(dl)), math.atanh(math.sin(dl) / math.sqrt(1 + t * t))
    E = 500000 + k0 * A * (eta + sum(al[j] * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j in range(3)))
    N = k0 * A * (xi + sum(al[j] * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j in range(3)))
    return E, N


E0, N0 = utm48(*PIN)
ca, sa = math.cos(math.radians(TURN)), math.sin(math.radians(TURN))


def site(pt):
    """A lat/lon point -> the site frame, rounded to 10 cm."""
    x, y = (v - o for v, o in zip(utm48(pt["lat"], pt["lon"]), (E0, N0)))
    return [round(x * ca + y * sa + SHIFT[0], 1), round(-x * sa + y * ca + SHIFT[1], 1)]


def metres(v):
    """'15', '15 m', '15.5' -> 15.5; anything else -> None."""
    try:
        return float(str(v).replace("m", "").strip())
    except ValueError:
        return None


def height(tags, osm_id):
    h = metres(tags.get("height", ""))
    if h:
        return h
    levels = metres(tags.get("building:levels", ""))
    if levels:
        return levels * 3 + 1
    # untagged (most of them): 4-7 storeys, varied per building so the skyline isn't one flat slab
    return (12, 15, 18, 21)[osm_id % 4]


dlat, dlon = RADIUS / 111320, RADIUS / (111320 * math.cos(math.radians(PIN[0])))
bbox = f"{PIN[0] - dlat},{PIN[1] - dlon},{PIN[0] + dlat},{PIN[1] + dlon}"
query = f'[out:json][timeout:120];(way["building"]({bbox});relation["building"]["type"="multipolygon"]({bbox});way["highway"]({bbox}););out geom;'
req = urllib.request.Request(SERVER, data=urllib.parse.urlencode({"data": query}).encode(),
                             headers={"User-Agent": "sebotse-film/1.0 (scripts/fetch-osm.py)"})
data = json.load(urllib.request.urlopen(req, timeout=180))

buildings, roads, skipped = [], [], 0
for el in data["elements"]:
    tags = el.get("tags", {})
    if "building" in tags:
        # a relation's outline is its closed outer ways; outlines split over several ways are skipped
        rings = [el["geometry"]] if el["type"] == "way" else [m["geometry"] for m in el.get("members", []) if m.get("role") == "outer" and "geometry" in m]
        for g in rings:
            if len(g) < 4 or (g[0]["lat"], g[0]["lon"]) != (g[-1]["lat"], g[-1]["lon"]):
                skipped += 1
                continue
            buildings.append({"id": el["id"], "h": round(height(tags, el["id"]), 1), "ring": [site(p) for p in g[:-1]]})
    elif tags.get("highway") in WIDTH and "geometry" in el:
        roads.append({"w": WIDTH[tags["highway"]], "line": [site(p) for p in el["geometry"]]})

json.dump({"source": "Map data © OpenStreetMap contributors, ODbL (openstreetmap.org/copyright)",
           "pin": PIN, "turn": TURN, "shift": SHIFT, "buildings": buildings, "roads": roads},
          open(OUT, "w"), separators=(",", ":"))
print(f"{len(buildings)} buildings, {len(roads)} streets ({skipped} outlines skipped) -> {OUT}")
