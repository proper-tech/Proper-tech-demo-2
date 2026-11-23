#!/bin/sh
# Rebuild the six apartment tours (A-F), their top views and the plan pictures from interior/renders,
# with the window masks for the drone's real view (add_window_masks.py, add_window_views.py).
# Needs the passes of the upgraded scenes in <passes>/<D|E|F> (tools/passes.py ids + top on <plan>_day.blend)
# and the palette mapping. Evening panoramas in interior/renders/<plan>_evening, when there, add the
# Өдөр / Орой button (add_evening.py, add_mood_toggle.py).
# Usage: interior/tools/make_all_tours.sh <repo root> <passes dir> <mapping.json>
set -e
R=$1; P=$2; MAP=$3; T=$R/interior/tools
python3 - "$P" <<'PY'
import json, sys, numpy as np
from PIL import Image
P = sys.argv[1]
L, N, W, H = json.load(open(f'{P}/D/top.json'))['viewBox']
src = f'{P}/D/top_raw.png'
try: im = Image.open(src)
except FileNotFoundError: im = Image.open(f'{P}/D/top.png'); im.save(src)
a = np.array(im); sx = a.shape[1] / W; sy = a.shape[0] / H
a[:int((13.9 - N) * sy), int((12.12 - L) * sx):, 3] = 0  # north of plan D is open floor in the scene
Image.fromarray(a).save(f'{P}/D/top.png')
PY
python3 -I $T/add_mood_toggle.py $R/interior/tours/D/index.html
python3 -I $T/add_window_views.py $R/interior/tours/D/index.html
python3 -I $T/add_finish_toggle.py $R/interior/tours/D/index.html
python3 -I $T/add_tour_bridge.py $R/interior/tours/D/index.html
python3 -I $T/repanos.py $R/interior/tours/D/index.html $R/interior/renders/D $P/D $MAP
python3 -I $T/retop.py $R/interior/tours/D/index.html $P/D $MAP
for U in F E; do
  python3 -I $T/build_tour.py $R/interior/tours/D/index.html $U $R/interior/renders/$U $P/$U $MAP $R/interior/tours/$U/index.html
done
for U in D F E; do
  python3 -I $T/add_window_masks.py $R/interior/tours/$U/index.html $U $P/$U
  if [ -d $R/interior/renders/${U}_evening ]; then
    python3 -I $T/add_evening.py $R/interior/tours/$U/index.html $U $R/interior/renders/${U}_evening eve
  fi
  for F in light dark; do  # the other finish packages
    if [ -d $R/interior/renders/${U}_$F ]; then
      python3 -I $T/add_evening.py $R/interior/tours/$U/index.html $U $R/interior/renders/${U}_$F $F
    fi
  done
done
python3 -I $T/mirror_tour.py $R/interior/tours/D/index.html $R/interior/tours/C/index.html D C
python3 -I $T/mirror_tour.py $R/interior/tours/F/index.html $R/interior/tours/A/index.html F A
python3 -I $T/mirror_tour.py $R/interior/tours/E/index.html $R/interior/tours/B/index.html E B
python3 -I $T/make_plans.py $R /tmp/plans.json
python3 -I $T/split_tours.py $R A B C D E F
python3 -I $T/make_tour_stops.py $R
echo TOURS_DONE
