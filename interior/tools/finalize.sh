#!/bin/sh
# After new panoramas are in interior/renders/{D,F,E}: rebuild all six tours, the top views and the plan pictures.
set -e
R=/home/claude/proper-tech-demo-2; U=/home/claude/units; MAP=/home/claude/d4k/ids/mapping.json
cd $U
# D: north of the flat is open floor in the scene; keep only the flat in its top view
python3 - <<'PY'
import json, numpy as np
from PIL import Image
L,N,W,H=json.load(open('tour2/D/top.json'))['viewBox']
im=Image.open('tour2/D/top.png'); a=np.array(im); sx=a.shape[1]/W; sy=a.shape[0]/H
a[:int((13.9-N)*sy), int((12.12-L)*sx):, 3]=0
Image.fromarray(a).save('tour2/D/top_masked.png')
PY
cp tour2/D/top.png tour2/D/top_raw.png; cp tour2/D/top_masked.png tour2/D/top.png
python3 -I repanos.py $R/interior/tours/D/index.html $R/interior/renders/D tour2/D $MAP
python3 -I retop.py $R/interior/tours/D/index.html tour2/D $MAP
python3 -I mirror_tour.py $R/interior/tours/D/index.html $R/interior/tours/C/index.html D C
for P in F E; do
  python3 -I build_tour.py $R/interior/tours/D/index.html $P $R/interior/renders/$P tour2/$P $MAP $R/interior/tours/$P/index.html
done
python3 -I mirror_tour.py $R/interior/tours/F/index.html $R/interior/tours/A/index.html F A
python3 -I mirror_tour.py $R/interior/tours/E/index.html $R/interior/tours/B/index.html E B
python3 -I $R/interior/tools/make_plans.py $R /tmp/plans.json
echo FINAL_DONE
# publish the light versions (pictures as separate WebP files) to public/tour
python3 -I split_tours.py $R
