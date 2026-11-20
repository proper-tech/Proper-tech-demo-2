#!/bin/sh
# Build the 360° tours of plans F, E and their mirrors A, B from the rendered panoramas.
# Needs: python3 with bpy (Blender as a module), numpy, opencv-python, pillow.
# Usage: interior/tools/make_tours.sh <repo root> <material->channel mapping.json>
set -e
ROOT=$1; MAP=$2; T=$ROOT/interior/tools; W=$(mktemp -d)
for P in F E; do
  mkdir -p $W/$P && cp $ROOT/interior/${P}_cams.json $W/$P/cams.json
  python3 -I $T/passes.py top $ROOT/interior/$P.blend $W/$P 128 48
  python3 -I $T/passes.py ids $ROOT/interior/$P.blend $ROOT/interior/${P}_cams.json $W/$P 2048 1024
  mkdir -p $ROOT/interior/tours/$P
  python3 -I $T/build_tour.py $ROOT/interior/tours/D/index.html $P $ROOT/interior/renders/$P $W/$P $MAP $ROOT/interior/tours/$P/index.html
done
mkdir -p $ROOT/interior/tours/A $ROOT/interior/tours/B
python3 -I $T/mirror_tour.py $ROOT/interior/tours/F/index.html $ROOT/interior/tours/A/index.html F A
python3 -I $T/mirror_tour.py $ROOT/interior/tours/E/index.html $ROOT/interior/tours/B/index.html E B
# publish the light versions (pictures as separate WebP files) to public/tour
python3 -I $T/split_tours.py $ROOT
