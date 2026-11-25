"""Finishing touches to the drone's view through the tour windows (tours already given add_window_views.py). Idempotent.

- Window masks and the drone sphere get mipmaps (smooth edges when zoomed out; both are power-of-two).
- A sphere marked "kind": "render" in public/views/manifest.json (a stand-in rendered from the 3D city until a drone
  photo replaces it) is labelled as a visualisation, not as a real photo.
How the view is exposed for the room is add_window_views.py's job (the street a touch soft and brighter, as in a
photo of the room); this script no longer touches it.
Run: python3 -I tune_window_views.py <tour html> [...]
"""
import sys

MIPMAP = '1008'  # THREE.LinearMipmapLinearFilter (the tour's bundled three.js doesn't export the name)

SWAPS = [
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
    done = 0
    for old, new in SWAPS:
        if html.count(new) == 1:
            continue  # already tuned
        assert html.count(old) == 1, (path, old[:60], html.count(old))
        html = html.replace(old, new)
        done += 1
    open(path, 'w', encoding='utf-8').write(html)
    print('tuned window views' if done else 'already', path)
