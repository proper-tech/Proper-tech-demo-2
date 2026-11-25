"""Make the drone's view through the tour windows sit in the room (tours already given add_window_views.py). Idempotent.

- The view is lifted towards white and a little desaturated, as a bright day looks from inside in interior photographs,
  so it belongs with the window glow baked into the renders; a faint reflection of the room stays on the glass.
- Window masks and the drone sphere get mipmaps (smooth edges when zoomed out; both are power-of-two).
- A sphere marked "kind": "render" in public/views/manifest.json (a stand-in rendered from the 3D city until a drone
  photo replaces it) is labelled as a visualisation, not as a real photo.
Run: python3 -I tune_window_views.py <tour html> [...]
"""
import sys

HAZE, DESAT, REFLECT = 0.18, 0.10, 0.06
MIPMAP = '1008'  # THREE.LinearMipmapLinearFilter (the tour's bundled three.js doesn't export the name)

SWAPS = [
    ('          diffuseColor.rgb = mix(diffuseColor.rgb, outside * 1.08, glass);',
     '          outside = mix(outside, vec3(dot(outside, vec3(0.299, 0.587, 0.114))), %.2f);\n'
     '          outside = mix(outside, vec3(1.0), %.2f) * 1.06;\n'
     '          diffuseColor.rgb = mix(diffuseColor.rgb, mix(outside, diffuseColor.rgb, %.2f), glass);' % (DESAT, HAZE, REFLECT)),
    ("      texture.colorSpace = ''; texture.minFilter = TourThree.LinearFilter; texture.magFilter = TourThree.LinearFilter;\n"
     '      texture.generateMipmaps = false;',
     "      texture.colorSpace = ''; texture.minFilter = %s; texture.magFilter = TourThree.LinearFilter;\n"
     '      texture.generateMipmaps = true;' % MIPMAP),
    ('      texture.magFilter = TourThree.LinearFilter; texture.generateMipmaps = false; resolve(texture);',
     '      texture.magFilter = TourThree.LinearFilter; texture.minFilter = %s; texture.generateMipmaps = true; resolve(texture);' % MIPMAP),
    ('    badge.textContent = `Цонхоор: ${tower} блок, ${nearest}-р давхраас авсан бодит зураг`;',
     "    badge.textContent = entry.kind === 'render'\n"
     '      ? `Цонхоор: ${tower} блок, ${nearest}-р давхрын харагдах байдлын дүрслэл`\n'
     '      : `Цонхоор: ${tower} блок, ${nearest}-р давхраас авсан бодит зураг`;'),
]

for path in sys.argv[1:]:
    html = open(path, encoding='utf-8').read()
    if 'vec3(0.299, 0.587, 0.114)' in html:
        print('already', path)
        continue
    for old, new in SWAPS:
        assert html.count(old) == 1, (path, old[:60], html.count(old))
        html = html.replace(old, new)
    open(path, 'w', encoding='utf-8').write(html)
    print('tuned window views', path)
