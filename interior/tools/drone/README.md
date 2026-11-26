# Drone video → window-view sphere

For a drone that turned a full circle on the spot while filming (no Sphere mode photo).

1. Frames from the 4K original, only the seconds of one clean turn, 2 per second:
   `ffmpeg -ss 178 -t 60 -i DJI_….MP4 -vf fps=2 -q:v 2 frames\%03d.jpg`
2. Camera rotations (SIFT + bundle adjustment, loop closed by matching the last frames to the first;
   the argument is how many frames at the end to try against the start):
   `FRAMES=frames WORK=work python3 estimate.py 14`
3. Spherical warp with graph-cut seams and multi-band blending (seams instead of feathering: the drone drifts,
   so near things like the crane would ghost). Pass the frame list, every 2nd frame of one turn, skipping
   any stretch where the drone stopped turning:
   `FRAMES=frames WORK=work python3 seam.py 0,2,4,…,106 6144`
4. Full 2:1 sphere: sky above, blurred street below, facades cut by the frame top continued upward,
   then turned so the middle is true north:
   `WORK=work python3 finalize.py <horizon fix°> <theta of north°> sphere.jpg`
   North comes from the sun: find the sun's theta in the stitch and its true azimuth for the clip's
   time (DJI file name = local start time); horizon fix = true sun elevation − measured.
5. `python3 -I interior/tools/add_view.py <repo> <B|C> <floor> sphere.jpg`

2026-11-23 clip (`drone/2026-11-23` on the `drone-frames` branch): frames 0–106 minus 68–88, horizon fix 2.6°,
north at theta −49.7° (sun azimuth 191.6°, elevation 21.0° at 13:24).

## Straight from the video, with the drone's flight data (`video_spheres.py`)

Newer DJI drones (Mini 4/5 Pro, Air 3) record GPS, altitude and the gimbal's attitude for every frame inside the MP4.
With that the frames are placed on the sphere directly and every height the drone turned a circle at becomes one
floor's sphere in one run: no frame export, no bundle adjustment, no sun hunt. It finds the hover spot and the
spins, maps each height to the floor whose eye level (floor level + 1.5 m, `src/data/building.ts`) is nearest,
corrects each frame by SIFT matches with its neighbours, and writes `public/views/<tower>-<floor>.jpg` and the
manifest like `add_view.py`. Floors already in the manifest are kept unless `--overwrite`.

    pip install numpy opencv-python-headless pillow        # and ffmpeg on the PATH
    python3 interior/tools/drone/video_spheres.py --tower B --tower C VIDEOS/*.MP4 --dry-run   # list the spins
    python3 interior/tools/drone/video_spheres.py --tower B --tower C --north-fix -12.83 VIDEOS/*.MP4

**Check north before trusting the compass.** Near the site's steel and the crane the drone's compass can be several
degrees out. Compare a new sphere with one whose north is known (B-05's is set from the sun) at a nearby floor
(horizontal-gradient profiles of the horizon band, cross-correlated), and pass the difference as `--north-fix`
(degrees clockwise from compass north to true north). Spheres from one flight share the same error.

2026-11-25 clips (`dji_fly_20261125_115900_0179`, 12:02-12:07): spins at 10.8, 16.2, 22.0, 42.5 and 51.5 m above the
take-off point, 14 m west of block B's west face -> floors 4, 5 (kept the existing B-05), 7, 14 and 16. The compass
read 12.8° east of true north (the floor-5 spin against B-05; the sun in B-05 is within 0.6° of its true azimuth),
so `--north-fix -12.83`; the new spheres then agree with B-05 and with each other within 1.6°. Heights are from the
take-off point, about 250 m south-east, whose ground may differ from the site's by a metre or two (`--ground`).
The floor-14 spin missed 24° to the north-west, taken from the 51 m one. Block C uses block B's spheres, as before:
from C's floors the view north is partly behind tower B, which the spheres don't show.

The same clip also has a spiral at 305-333 s: one full turn while sinking from 35.9 to 29.4 m. The station search
skips it (the height changes by more than 1.5 m), so it is given by hand; its median height, 32.9 m, is floor 11:

    python3 interior/tools/drone/video_spheres.py --tower B --tower C --north-fix -12.83 --station 305-333 VIDEO.MP4

The heights round that sphere differ by up to 6.5 m, which only shows at the seam to the north-north-west where the
turn began and ended.

## Every floor and every season

Photographed floors: 5, 7, 11, 14 and 16 (the floor-4 circle is not used; see below). Every floor's sphere and its
spring, summer and autumn versions are made by `window_views.py spheres` from the same masters and 4K season edits as
the flat window views (last section). The earlier chain that did this, `complete.py` (the model drawing the sky,
building tops and street around the photographed band), `seasons.py` (one 21:9 edit of a whole sphere) and
`derive_floors.py`, was removed on 2026-11-26 with its files in `interior/views/`: its drawn parts did not join
the photograph and its season spheres were redrawn at too low a resolution (details in the last section).

A new photographed floor: run `video_spheres.py` to find its circle, add it to `STATIONS` and `FRAME_PITCH` in
`window_views.py` and its shot to `SHOTS` in `src/data/views.ts`, then run `masters`, make and `check` its season
edits, and run `finals` and `spheres`.

## Plain photographs (`photos.py`)

Next to the sphere the page has a Photo view and a list of the drone's own frames for each floor. The moments come
from screenshots taken while watching the flight (`interior/views/screenshots/`, 105 of them, gitignored: ~800 MB).
`photos.py` finds each screenshot in the CapCut export (`~/Movies/CapCut/1126 (1).mov`, which starts 211.3 s into
clip 0179), reads its height and true heading from the flight data, keeps one per 10° per floor (and one looking
down), takes the sharpest 4K frame within 0.2 s from the original clip and writes `public/views/photos/` (2400 px
WebP and a 480 px thumbnail) with `public/views/photos.json`. A photograph belongs to the floor whose eye level is
nearest its height, so the spiral gives floors 9-12 frames of their own; `src/data/photos.ts` fills a floor's
missing directions from the nearest floors and the page says which floor a borrowed one is from.

    python3 interior/tools/drone/photos.py interior/views/screenshots ~/Desktop/videos/dji_fly_20261125_115900_0179_….MP4 \
        --export ~/Movies/CapCut/"1126 (1).mov" --offset 211.3

## Flat panoramas (`panoramas.py`)

The page's Panorama view pans one continuous strip per circle, under the finger, instead of jumping between single
photographs. `panoramas.py` draws the band each circle photographed (the same placed and corrected frames as the
spheres) at 8192 px for 360°, cut to the rows nearly every heading saw (about 42° tall), with true north in the
middle column, into `public/views/pano/B-<floor>.webp` and `public/views/panoramas.json`. Only real pixels, except
floor 14's 24° north-west gap, taken from its repaired sphere. Floors without a circle show the nearest one's and
say so. About 4 MB for all six.

    python3 interior/tools/drone/panoramas.py ~/Desktop/videos/dji_fly_20261125_115900_0179_….MP4

## Flat window views per apartment (`window_views.py`)

One plain 16:9 picture per floor (4-16), per facing (the six apartment directions, `src/data/building.ts`) and per
season: 13 × 6 × 4 = 312 WebP files, 2560 × 1440, in `public/views/window/<facing>/floor-NN/<season>.webp`, listed in
`public/views/window/manifest.json` (heading, the floor a view was moved from, its height and tilt, how much of it
the camera saw). Every view looks along its facing's true heading, 64° wide and 6° down, so stepping through floors
or seasons changes only the height or the season.

1. `masters`: for each circle (floors 5, 7, 11, 14, 16) and facing, the 4K frames within 32° of the heading are placed
   by the flight data, corrected against each other (`refine.py`) and drawn into one level picture, 72° wide, 5° down,
   3840 × 2160 (`interior/views/window/masters/`, with a mask of the pixels the camera saw). The frame that looks most
   nearly along the heading covers nearly all of it; the others only fill its edges (a blend of every frame left a
   seam every few degrees and ghosted moving cars). What no frame saw is filled from the floor's sphere below the
   horizon and by inpainting above it. The floor-4 circle is not used: the drone was 2.4 m under the floor's eye level,
   beside a street hoarding and the containers on the site. Floor 14 missed west and north-west.
2. Seasons: each master is edited by GPT Image 2.6 on Higgsfield (16:9, 4K, high; 3.25 credits) into spring, summer
   and autumn, with the prompts in `PROMPTS` (written for a flat photo, told to keep every sign and the distant hills
   as they are; the first test rewrote "AUTO MALL" as "CITY MALL"). Results go to `interior/views/window/seasons/
   <master>-<season>.png`. `window_views.py check` measures each edit's drift against its master by phase correlation
   of edges in 36 tiles: on 2026-11-26 all 84 were 0.9-2.5 px median at 3840 px; three had one tile up to 33 px, where
   clearing the haze made the model draw the far street (the distance hidden by haze in the photograph is its guess).
3. `finals`: a photographed floor is its master cut to 64°. Any other floor takes the master photographed nearest its
   eye level for that facing and moves the ground as it would move. A floor below its master tilts up as
   little as keeps it inside the master: floor 4 looks 3.4° down, floor 6 4.9°, floor 15 west and north-west 5.4°.
   No sphere from the hover spot shows the ground right under it (the near cars and fence are too close); only the
   strips under the floor-11 and floor-14 masters (up to 4%, floors 9, 10 and 12) come from their spheres.

    python3 interior/tools/drone/window_views.py masters ~/Desktop/videos/dji_fly_20261125_115900_0179_….MP4
    python3 interior/tools/drone/window_views.py check
    python3 interior/tools/drone/window_views.py finals --quality 74

All views are from the hover spot, 14 m west of block B's west face. For the apartments facing north-east, east and
south-east the windows are 25-35 m further east and above the podium, so the near ground (the building site itself
on the low floors) is not what those windows will see; the skyline is. Tower C uses tower B's views, as the spheres do.

## The 360° spheres, rebuilt from the window-view masters (`window_views.py spheres`, 2026-11-26)

The published spheres (`public/views/B-NN.jpg` and `B-NN-<season>.webp`, every floor 4-16) are no longer the
`video_spheres.py` + `complete.py` + `seasons.py` + `derive_floors.py` chain. Looked at the way the viewer shows them
(70° views at several headings), the old ones had three faults:

1. **Season spheres re-drawn by the model.** Each whole sphere went to GPT Image as one 21:9 picture, so a 70° view got
   about 930 of the model's pixels: melted windows, scribbled facades, garbled signs, blob cars.
2. **Drawn building tops and street.** `complete.py` had the model continue the 43° band upward and downward; where a
   near tower was cut by the frame top, its drawn upper floors did not line up with the real ones (B-11 at 250°, a torn
   floor; B-14 at 216°, a redrawn roof), and the drawn street below was what the view showed when looking down.
3. **Seams.** Every pixel took the frame whose centre was nearest, so seams ran every few degrees; moving cars
   ghosted, and the floor-11 spiral (6.5 m of sinking) left a sliver at its north-north-west join.

Now each sphere is eight sectors: the six window masters plus two more, due plan north and south (`N`, `S`; the facings
are 45° apart on the east side but 90° apart across north and south, and a master is 72° wide). Each sector is the
master of its floor (or the one nearest its eye level, as the window views choose), moved to the floor's eye level,
drawn into an 8192 × 4096 equirectangular band using only the pixels the camera saw (the `-real.png` masks). The
sectors' colours are matched where they overlap (per-sector gains, tied weakly to 1) and joined with a multi-band
blend, so colour changes spread wide while edges stay sharp. The seasons use the same sectors' 4K edits (114 of them,
all 0.8-2.7 px median drift). Above and below the band the sphere is one sky colour and one ground colour, faded in
over 2°: no building tops and no street are drawn. Each manifest line gives `top` and `bottom`, the band every heading
was photographed in (less the fade), and the 360° view keeps its field of view and tilt inside it
(`lookBand` in `src/data/views.ts`). Each sphere takes all its sectors from one photographed floor, the nearest
with all eight (floor 14's circle missed the west, so floors 14 and 15 use floor 16's): sectors from circles 10 m
apart tore the near towers where they met.

    python3 interior/tools/drone/window_views.py masters --facings N,S ~/Desktop/videos/dji_fly_20261125_115900_0179_….MP4
    python3 interior/tools/drone/window_views.py spheres            # all floors and seasons, rewrites the manifest

What the drone footage cannot give: anything more than about 13° above or 25° below the horizon was never filmed at
a level circle. A taller real view needs the circles flown twice at each height, once with the gimbal at about +15°
and once at about -35° (or DJI's Sphere photo mode at each height), and the east-facing windows need a circle flown
25-35 m further east, above the podium.
