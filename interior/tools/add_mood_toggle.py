"""Give a self-contained tour the Өдөр / Орой (day / evening) button. Idempotent.

The button shows only when the tour holds evening panoramas (keys D_<stop>@eve, see add_evening.py); it swaps the
room's picture for its evening one and back, keeping the view direction, and remembers the choice.
Run: python3 -I add_mood_toggle.py <tour html> [...]
"""
import sys

BUTTON = ('<button id="tourMood" class="tour-tool" type="button" aria-pressed="false" hidden '
          'title="Өдөр / Орой">☾ Орой</button>\n      ')
ANCHOR = '<button id="tourMapToggle"'
OLD_ASSET = 'const asset = Mf[`D_${room}`];'
NEW_ASSET = "const asset = (interiorTour.mood === 'evening' && Mf[`D_${room}@eve`]) || Mf[`D_${room}`];"
OLD_ROTATE = "  tourElement('tourRotate').onclick = () => {"
NEW_ROTATE = """  // BEGIN DAY/EVENING
  {
    const moodButton = tourElement('tourMood');
    const hasEvening = Object.keys(Mf).some(key => key.endsWith('@eve'));
    moodButton.hidden = !hasEvening;
    const showMood = () => {
      const evening = interiorTour.mood === 'evening';
      moodButton.setAttribute('aria-pressed', String(evening));
      moodButton.textContent = evening ? '☀ Өдөр' : '☾ Орой';
      moodButton.title = evening ? 'Өдрийн гэрэлтэй харах' : 'Оройн гэрэлтэй харах';
      tourElement('pano').classList.toggle('is-evening', evening);
    };
    try { if (hasEvening && localStorage.getItem('sebotse-tour-mood') === 'evening') interiorTour.mood = 'evening'; } catch (_) {}
    showMood();
    moodButton.onclick = () => {
      interiorTour.mood = interiorTour.mood === 'evening' ? 'day' : 'evening';
      try { localStorage.setItem('sebotse-tour-mood', interiorTour.mood); } catch (_) {}
      showMood();
      if (interiorTour.active && interiorTour.room) {
        tourElement('panoFade').classList.add('on');
        loadTourRoom(interiorTour.room);
      }
    };
  }
  // END DAY/EVENING
  tourElement('tourRotate').onclick = () => {"""
OLD_STATE = "autoRotate: false,"
NEW_STATE = "autoRotate: false, mood: 'day',"
CSS = ('#tourMood[aria-pressed=true]{background:#1c2433;color:#f3d9a6;border-color:#f3d9a6}'
       '#pano.is-evening #panoFade{background:#05070c}\n')

for path in sys.argv[1:]:
    html = open(path, encoding='utf-8').read()
    if 'id="tourMood"' in html:
        print('already', path)
        continue
    for old, new in ((ANCHOR, BUTTON + ANCHOR), (OLD_ASSET, NEW_ASSET), (OLD_ROTATE, NEW_ROTATE), (OLD_STATE, NEW_STATE),
                     ('/* BEGIN PALETTE CSS */', CSS + '/* BEGIN PALETTE CSS */')):
        assert html.count(old) == 1, (path, old[:40], html.count(old))
        html = html.replace(old, new)
    open(path, 'w', encoding='utf-8').write(html)
    print('mood button', path)
