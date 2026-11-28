"""Give a tour its English, Chinese and Mongolian text: tour_languages.js with the table tour_languages.json, just
before </body>. With ?lang=en, zh or mn in its address the tour shows that language; without, it stays as built.
Idempotent: a tour that has them gets the current table and script in their place.
split_tours.py runs this on every tour it publishes, so a rebuilt tour keeps its languages; hd_tours.mjs then
carries them into public/tour-hd/. To change a translation, edit tour_languages.json and run this on the published
tours (public/tour/<id>/index.html), then node interior/tools/hd_tours.mjs.
Run: python3 -I add_languages.py <tour html> [...]
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
START, END = '<!-- tour-languages -->', '<!-- /tour-languages -->'


def block():
    table = json.load(open(os.path.join(HERE, 'tour_languages.json'), encoding='utf-8'))
    table.pop('_about', None)
    for p in table['patterns']:
        re.compile(p['re'])  # a broken pattern fails here, not in a visitor's browser
    script = open(os.path.join(HERE, 'tour_languages.js'), encoding='utf-8').read()
    data = json.dumps(table, ensure_ascii=False, separators=(',', ':'))
    # "</" would end the <script> early if a text ever held it
    data, script = data.replace('</', '<\\/'), script.replace('</', '<\\/')
    return f'{START}\n<script>window.__TOUR_LANGUAGES__ = {data};</script>\n<script>\n{script}</script>\n{END}\n'


def add_languages(html):
    """The tour page with the current languages block, replacing any it had."""
    new = block()
    a = html.find(START)
    if a >= 0:
        b = html.index(END, a) + len(END)
        return html[:a] + new.rstrip('\n') + html[b:]
    at = html.rfind('</body>')
    if at < 0:
        raise SystemExit('no </body> in the tour')
    return html[:at] + new + html[at:]


if __name__ == '__main__':
    for path in sys.argv[1:]:
        html = open(path, encoding='utf-8').read()
        out = add_languages(html)
        if out != html:
            open(path, 'w', encoding='utf-8').write(out)
        print(f'{path}: {"languages added" if START not in html else "languages updated" if out != html else "already current"}')
