"""Give a self-contained tour the real view through its windows. Idempotent.

With ?tower=B&floor=7 in the tour's address, the tour reads /views/manifest.json, takes the drone's 360° sphere
nearest to that floor and shows it in the window glass (window.__WINDOW_MASKS__, add_window_masks.py) instead of
the rendered sky, turned to true north. Without the address parameters, the manifest or a sphere it does nothing.
In the evening (add_mood_toggle.py) the rendered dusk stays.

Manifest: {"B": {"4": {"src": "/views/B-04.jpg", "yaw": 0}, ...}, "C": {...}}. A sphere is an equirectangular
picture with true north in its middle; yaw (degrees, clockwise) corrects one that is not.
Directions: the renders put plate heading h at column u = (h + 90) / 360; the plate's north is 8.9° west of true
north (site TURN 10.31° less 1.42° grid convergence), so the sphere's column is u + 0.25 - 8.89/360 + yaw/360.
Run: python3 -I add_window_views.py <tour html> [...]
"""
import sys

UNIFORMS_OLD = "  ratios.forEach((value,i)=>uniforms['tourRatio'+i]={value});\n  tourPaletteState.uniforms=uniforms;"
UNIFORMS_NEW = ("  ratios.forEach((value,i)=>uniforms['tourRatio'+i]={value});\n"
                "  Object.assign(uniforms,{tourWindow:{value:null},tourOutside:{value:null},tourOutsideOn:{value:0},tourOutsideShift:{value:0}});\n"
                "  tourPaletteState.uniforms=uniforms;")
HEAD_OLD = "shader.fragmentShader='uniform sampler2D tourMaskA;\\nuniform sampler2D tourMaskB;\\nuniform float tourPaletteEnabled;\\n'"
HEAD_NEW = ("shader.fragmentShader='uniform sampler2D tourMaskA;\\nuniform sampler2D tourMaskB;\\nuniform float tourPaletteEnabled;\\n"
            "uniform sampler2D tourWindow;\\nuniform sampler2D tourOutside;\\nuniform float tourOutsideOn;\\nuniform float tourOutsideShift;\\n'")
GLSL_OLD = """        diffuseColor.rgb *= max(ratio, vec3(0.0));
      }
      #endif`);"""
GLSL_NEW = """        diffuseColor.rgb *= max(ratio, vec3(0.0));
      }
      if (tourOutsideOn > 0.5) {
        float glass = texture2D(tourWindow, vMapUv).r;
        if (glass > 0.002) {
          // exposed for the room, like a photo: the street is a touch soft and brighter than the room
          vec2 ou = vec2(fract(vMapUv.x + tourOutsideShift), vMapUv.y);
          vec2 px = vec2(0.00045, 0.0009);
          vec3 outside = texture2D(tourOutside, ou).rgb * 0.4
            + (texture2D(tourOutside, ou + vec2(px.x, 0.0)).rgb + texture2D(tourOutside, ou - vec2(px.x, 0.0)).rgb
             + texture2D(tourOutside, ou + vec2(0.0, px.y)).rgb + texture2D(tourOutside, ou - vec2(0.0, px.y)).rgb) * 0.15;
          outside = (1.0 - exp(-outside * 1.5)) / (1.0 - exp(-1.5));
          outside *= vec3(0.98, 1.0, 1.03);
          // keep some of the rendered glass: reflections of the room, sheer curtains, frame shadows
          vec3 rendered = diffuseColor.rgb;
          vec3 glassed = outside + rendered * 0.08 * (1.0 - outside);
          diffuseColor.rgb = mix(rendered, min(glassed, vec3(1.0)), glass);
        }
      }
      #endif`);"""
KEY_OLD = "material.customProgramCacheKey=()=> 'sebotse-material-palettes-v1';"
KEY_NEW = "material.customProgramCacheKey=()=> 'sebotse-material-palettes-v3-windows';"
LOAD_OLD = "  const paletteReady = prepareTourPaletteRoom(room, requestId);"
LOAD_NEW = "  const paletteReady = prepareTourPaletteRoom(room, requestId);\n  setTourOutsideRoom(room);"
FUNCS_ANCHOR = "function loadTourRoom(room) {"
FUNCS = r"""// BEGIN WINDOW VIEWS
const tourOutside = {texture: null, shift: 0, label: '', masks: new Map(), room: null};
function refreshTourOutside() {
  const uniforms = tourPaletteState.uniforms;
  if (!uniforms) return;
  const mask = tourOutside.masks.get(tourOutside.room);
  const on = Boolean(tourOutside.texture && mask && mask !== 'loading' && interiorTour.mood !== 'evening');
  uniforms.tourWindow.value = on ? mask : null;
  uniforms.tourOutside.value = on ? tourOutside.texture : null;
  uniforms.tourOutsideShift.value = tourOutside.shift;
  uniforms.tourOutsideOn.value = on ? 1 : 0;
  const badge = document.getElementById('tourOutsideBadge');
  if (badge) badge.hidden = !on;
  if (interiorTour.sphere) interiorTour.sphere.material.needsUpdate = true;
}
function setTourOutsideRoom(room) {
  tourOutside.room = room;
  const source = window.__WINDOW_MASKS__?.['D_' + room];
  if (tourOutside.texture && source && !tourOutside.masks.has(room)) {
    tourOutside.masks.set(room, 'loading');
    tourTextureLoader.load(source, texture => {
      texture.colorSpace = ''; texture.minFilter = TourThree.LinearFilter; texture.magFilter = TourThree.LinearFilter;
      texture.generateMipmaps = false;
      tourOutside.masks.set(room, texture);
      refreshTourOutside();
    }, undefined, () => tourOutside.masks.delete(room));
  }
  refreshTourOutside();
}
async function initTourOutside() {
  const query = new URLSearchParams(location.search);
  const tower = query.get('tower'), floor = Number(query.get('floor'));
  if (!tower || !floor || !window.__WINDOW_MASKS__) return;
  try {
    const manifest = await (await fetch(query.get('views') || '/views/manifest.json')).json();
    const spheres = manifest?.[tower] || {};
    const floors = Object.keys(spheres).map(Number).filter(Boolean);
    if (!floors.length) return;
    const nearest = floors.reduce((a, b) => Math.abs(b - floor) < Math.abs(a - floor) ? b : a);
    const entry = spheres[String(nearest)];
    tourOutside.shift = 0.25 - 8.89 / 360 + (entry.yaw || 0) / 360;
    tourOutside.texture = await new Promise((resolve, reject) => tourTextureLoader.load(entry.src, texture => {
      texture.colorSpace = TourThree.SRGBColorSpace; texture.minFilter = TourThree.LinearFilter;
      texture.magFilter = TourThree.LinearFilter; texture.generateMipmaps = false; resolve(texture);
    }, undefined, reject));
    const badge = document.createElement('div');
    badge.id = 'tourOutsideBadge';
    badge.className = 'tour-outside-badge';
    badge.textContent = `Цонхоор: ${tower} блок, ${nearest}-р давхраас авсан бодит зураг`;
    badge.hidden = true;
    tourElement('pano').appendChild(badge);
    if (interiorTour.room) setTourOutsideRoom(interiorTour.room);
  } catch (error) { /* no view: the rendered sky stays */ }
}
initTourOutside();
// END WINDOW VIEWS
"""
MOOD_OLD = "        loadTourRoom(interiorTour.room);\n      }\n    };"
CSS = ('.tour-outside-badge{position:absolute;left:24px;bottom:118px;z-index:6;padding:6px 11px;border-radius:999px;'
       'background:#0d1420c9;color:#f5f3ed;font-size:11px;letter-spacing:.01em;pointer-events:none}\n')

for path in sys.argv[1:]:
    html = open(path, encoding='utf-8').read()
    if 'BEGIN WINDOW VIEWS' in html:
        print('already', path)
        continue
    for old, new in ((UNIFORMS_OLD, UNIFORMS_NEW), (HEAD_OLD, HEAD_NEW), (GLSL_OLD, GLSL_NEW), (KEY_OLD, KEY_NEW),
                     (LOAD_OLD, LOAD_NEW), (FUNCS_ANCHOR, FUNCS + FUNCS_ANCHOR),
                     ('/* BEGIN PALETTE CSS */', CSS + '/* BEGIN PALETTE CSS */')):
        assert html.count(old) == 1, (path, old[:50], html.count(old))
        html = html.replace(old, new)
    open(path, 'w', encoding='utf-8').write(html)
    print('window views', path)
