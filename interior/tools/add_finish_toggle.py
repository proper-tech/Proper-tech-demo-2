"""Give a self-contained tour the finish-package chips (Дулаан / Цайвар / Бараан: floor, joinery, worktops). Idempotent.

The chips show in the "Interior colors" panel when the tour holds pictures of other finishes (keys D_<stop>@light,
D_<stop>@dark from add_evening.py <dir> <suffix>); picking one swaps the room's picture, keeping the view. The
evening pictures are of the warm finish, so the evening wins over a picked finish. Needs add_mood_toggle.py first.
Run: python3 -I add_finish_toggle.py <tour html> [...]
"""
import sys

ROW = ('<div id="tourFinish" hidden>\n'
       '        <p class="fixture-title">Шал, тавилга, тавцан</p>\n'
       '        <div id="tourFinishChoices" role="group" aria-label="Finish package">'
       '<button type="button" data-finish="warm" aria-pressed="true"><i style="background:#8a6a47"></i>Дулаан</button>'
       '<button type="button" data-finish="light" aria-pressed="false"><i style="background:#cdb898"></i>Цайвар</button>'
       '<button type="button" data-finish="dark" aria-pressed="false"><i style="background:#3b2b20"></i>Бараан</button></div>\n'
       '      </div>\n      ')
ANCHOR = '<div id="tourPaletteChoices"'
OLD_ASSET = "const asset = (interiorTour.mood === 'evening' && Mf[`D_${room}@eve`]) || Mf[`D_${room}`];"
NEW_ASSET = ("const asset = (interiorTour.mood === 'evening' && Mf[`D_${room}@eve`])"
             " || (interiorTour.finish !== 'warm' && Mf[`D_${room}@${interiorTour.finish}`]) || Mf[`D_${room}`];")
OLD_STATE = "autoRotate: false, mood: 'day',"
NEW_STATE = "autoRotate: false, mood: 'day', finish: 'warm',"
OLD_END = "  // END DAY/EVENING\n"
NEW_END = """  // END DAY/EVENING
  // BEGIN FINISHES
  {
    const row = tourElement('tourFinish');
    const buttons = [...row.querySelectorAll('button[data-finish]')];
    const has = finish => finish === 'warm' || Object.keys(Mf).some(key => key.endsWith('@' + finish));
    buttons.forEach(button => { button.hidden = !has(button.dataset.finish); });
    row.hidden = buttons.filter(button => !button.hidden).length < 2;
    const showFinish = () => buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.finish === interiorTour.finish)));
    try { const saved = localStorage.getItem('sebotse-tour-finish'); if (saved && has(saved)) interiorTour.finish = saved; } catch (_) {}
    showFinish();
    buttons.forEach(button => button.onclick = () => {
      if (interiorTour.finish === button.dataset.finish) return;
      interiorTour.finish = button.dataset.finish;
      try { localStorage.setItem('sebotse-tour-finish', interiorTour.finish); } catch (_) {}
      showFinish();
      if (interiorTour.active && interiorTour.room) {
        tourElement('panoFade').classList.add('on');
        loadTourRoom(interiorTour.room);
      }
    });
  }
  // END FINISHES
"""
CSS = ('#tourFinish{padding:0 0 12px}'
       '#tourFinishChoices{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}'
       '#tourFinishChoices button{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 4px;border:1px solid #ffffff24;'
       'border-radius:9px;background:#ffffff08;color:#f5f3ed;cursor:pointer;font-size:11px}'
       '#tourFinishChoices button[aria-pressed=true]{border-color:#e9c58f;background:#e9c58f22;box-shadow:inset 0 0 0 1px #e9c58f}'
       '#tourFinishChoices i{width:26px;height:14px;border-radius:4px;border:1px solid #ffffff44}\n')

for path in sys.argv[1:]:
    html = open(path, encoding='utf-8').read()
    if 'id="tourFinish"' in html:
        print('already', path)
        continue
    for old, new in ((ANCHOR, ROW + ANCHOR), (OLD_ASSET, NEW_ASSET), (OLD_STATE, NEW_STATE), (OLD_END, NEW_END),
                     ('/* BEGIN PALETTE CSS */', CSS + '/* BEGIN PALETTE CSS */')):
        assert html.count(old) == 1, (path, old[:50], html.count(old))
        html = html.replace(old, new)
    open(path, 'w', encoding='utf-8').write(html)
    print('finish chips', path)
