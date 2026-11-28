# Sebotse — apartment sales site (mock)

Next.js 16 (App Router) + React 19 + three.js (`@react-three/fiber`).

## What is real and what is still a placeholder

| Real (from your files) | Still a placeholder |
| --- | --- |
| Site plan: tower, podium and annex footprints, kerbs, parking bays, trees (`src/data/site.json`, extracted from `ET_coordinattai.dwg`) | The sales office's phone number (`SALES_PHONE` in `src/data/contact.ts`, empty until known) |
| Blocks A-D, storeys and levels: apartments on floors 4-16 at 3.0 m from +11.7 m, roof +54.7 m (`src/data/building.ts`, from sections 1-1 and 2-2 of the schematic design) | Ceiling heights in `src/data/layouts.ts` (estimated from the 3.0 m storey height) |
| The six apartments on each floor, their rooms and areas, the lift and stair core (`src/data/layouts.ts`, traced from floor plans sheets 17-20) | Heights of most buildings around the site in the film (untagged in OpenStreetMap, so 12-21 m) |
| 155 apartments, including floor 4 of Block B, where the homeowners' association room replaces apartment B | Furniture (only there to show scale), including the fit-out of podium floor 1 (`furnish()` in `src/data/podium.ts`) |
| Capacity figures on the home page (general plan, sheet 7) | Door sides of the podium stairs and the roof stair, and the escalator direction (not on the drawings) |
| Block A (podium) floors 1-4: rooms, numbers and areas from the room schedules (`src/data/podium.ts`), facade from the elevations (`scripts/build-model.py`) | Blocks B, C and D have a simplified facade in the 3D model |
| Basement (B1): the car park under blocks A-C with its room schedule, the driveway to block D's garage, both ramps, the tower cores, 60 parking spaces as drawn (`src/data/podium.ts`, floor 0) | Ramp slopes: the plans stop at the building's edge, so the ramps are drawn reaching street level there, steeper than built |
| Towers 25.7 × 21.4 m from floor 4 up, overhanging the podium (typical floor plan and section 1-1); technical floor on each roof, up to +54.7 m, rooms 113-118 (`src/data/roof.ts`, roof plan) | |
| The four renders (`public/media/renders`) | |

Source: "СЭВОЦЗ" ХХК-ийн үйлчилгээ, орон сууцны цогцолбор, schematic design, Уран проект ХХК, 2026.
Unit numbers are tower + floor + position 01-06 for plans A-F (B1203 is Block B, floor 12, plan C).

To re-extract the site plan after the drawing changes: convert the DWG to DXF with LibreDWG
(`dwg2dxf -o site.dxf ET_coordinattai.dwg`), then
`python3 scripts/extract-site.py site.dxf src/data/site.json` (needs `pip install ezdxf`).

```bash
npm install
npm run dev      # http://localhost:3000
npm run build && npm start
```

## What is where

| Requirement | Where |
| --- | --- |
| Select a floor that is in stock | Home page: lift panel + clickable 3D building (`FloorPicker`, `three/BuildingScene`) |
| Floor plan, 3D and 2D | `/[locale]/floors/[tower]/[floor]` (`FloorExperience`, `three/FloorScene`, `Plan2D`); each apartment's floor is painted its own colour (`flatColors` in `layouts.ts`) |
| The view from each window on the floor plan | Amber points in front of the windows (3D and 2D), one per apartment and direction (`data/windowPoints.ts`); a click opens that window view for the floor (`WindowPointView`, pictures from `public/views/window`) |
| Podium floors 1-4, the basement car park (B1), and each tower's roof (technical floor, as floor 17) | Same route, `A/B1`, `A/1`-`A/4`, `B/17`, `C/17` (`PodiumFloorExperience`, `three/PodiumScene`; data in `podium.ts`, `roof.ts`) |
| Stairs, lifts, escalators | `three/Cores.tsx`, used by the tower, podium and roof floors |
| 3D apartment | `/[locale]/apartments/[id]`, "3D model" (`three/ApartmentModel`) |
| 360° view in every room, walking between rooms | Same page, "360° tour" (the photographic tour of its plan, `public/tour-hd/<plan>`, made from the rendered one); add `?view=tour` to link straight to it |
| Photographic 360° tours (every apartment, floors 4-16) | `public/tour-hd/<plan>`: the rooms repainted as photographs, a photo per colour scheme, the real view sharp in the windows; built by `interior/tools/hd_tours.mjs` (how: `interior/README.md`, last section) |
| Floor, wall, furniture colours of the 3D models | Fixed in `data/finishes.ts` (no picker on the page) |
| Room sizes and ceiling heights | "Rooms and sizes" table and the 2D plan |
| Film (38 s flight round the complex) | Home page: looping behind the hero, and with controls in `VideoSection` (`public/media/film.mp4`) |
| Chinese, English, Mongolian | `src/i18n/{zh,en,mn}.ts`, URL prefix `/zh`, `/en`, `/mn` |

## Replacing the mock content

- **Storeys**: `src/data/building.ts` (`FLOOR_MAX`, apartments per floor). The site shows no sales status (for
  sale, reserved, sold), at the owner's request: every apartment can be opened.
- **Layouts**: `src/data/layouts.ts`. Rooms are rectangles in metres; doors and windows are
  entries in `openings`. The 3D model, 2D plan and size table all come from this file.
- **Rendered 360° tours**: one self-contained file per plan (panoramas, plan and scripts inside) in
  `public/tour/<plan>/index.html`, served at `/tour/<plan>` (`/tour` is plan D). The apartment pages show
  their photographic copies, `public/tour-hd/<plan>` (`ApartmentExperience.tsx`); A4 uses A's.
  D, F and E are rendered from the Blender scenes; C, A and B are D, F and E mirrored. How they are made:
  `interior/README.md`. They do not use the site's code or data.
- **Film**: `public/media/film.mp4` and `film-poster.webp` are rendered in Blender (EEVEE) from the site's
  own model by `scripts/build-film.py` (six shots, about 1.5-2 hours for 912 frames on a 2019 MacBook Pro;
  keep it plugged in with the lid open, a sleeping Mac stalls the render):

  ```bash
  B=/Applications/Blender.app/Contents/MacOS/Blender
  $B -b -P scripts/build-film.py -- --render --out film_frames --res 1920 --samples 32 --sky SKY.hdr --osm scripts/osm-surroundings.json --facades FACADES
  $B -b -P scripts/build-film.py -- --encode --out film_frames --mp4 public/media/film.mp4 --crf VERYLOW --width 1280
  ```

  The city round the site is the real one from OpenStreetMap (`scripts/osm-surroundings.json`, made by
  `python3 scripts/fetch-osm.py scripts/osm-surroundings.json`): footprints and streets within 800 m, placed from
  a Google Maps pin between the towers (the drawing's own coordinates are on a local grid). Left out, so the site
  stands clear: buildings on or within 6 m of the site and street model or on a street, service lanes within 150 m,
  streets that stop at the site without joining a road, and scraps of street under 25 m (rules and the few streets
  added by hand at the top of `scripts/build-film.py`). The licence (ODbL) needs the credit "Map data © OpenStreetMap
  contributors", which is in the video note under the film. Without `--osm` the film gets generated blocks.
  `FACADES` is a folder with ambientCG's CC0 textures `Facade018A`, `Facade019A`, `Facade020A` and `Facade006`
  (the `1K-JPG` zips from ambientcg.com, about 24 MB, each unpacked into `FACADES/<name>/`; not in the repo):
  photo facades on the surrounding buildings, glass on the ones 30 m and taller. Without it they get a drawn
  window grid. The same city stands round the 3D building on the home page (`public/models/blocks/city.glb`,
  credited under the view), exported with
  `$B -b -P scripts/build-film.py -- --city-glb public/models/blocks/city.glb --osm scripts/osm-surroundings.json --facades FACADES`.
  `SKY.hdr` is optional (without it Blender's own sky is used); the film used Poly Haven's
  `kloofendal_48d_partly_cloudy_puresky_2k.hdr` (CC0). The Sun Position add-on, if installed, places the sun over
  Ulaanbaatar. The poster is frame 0000 resized to 1600 px, saved as WebP.
- **The building model**: one GLB per block in `public/models/blocks/`, in the architect's block key:
  `A.glb` podium (floors 1-3 under the whole complex, roof playground, media screen), `B.glb` the
  north tower on the main road, `C.glb` the south tower (both floors 4-16, standing on A, with the
  technical floor on the roof), `D.glb` the annex, `site.glb` parked cars. They are generated from
  `src/data/site.json` by `scripts/build-model.py` (needs Blender), then merged into
  `public/models/complex.glb`, which `three/BuildingScene.tsx` shows:

  ```bash
  B=/Applications/Blender.app/Contents/MacOS/Blender
  $B --background --python scripts/build-model.py -- src/data/site.json public/models/blocks
  $B --background --python scripts/merge-blocks.py -- public/models/blocks public/models/complex.glb
  ```

  A block can be rebuilt or replaced on its own (for example edited by hand in Blender) as long as
  it is exported with the same settings, in the site-plan frame and with its own objects only; then
  re-run the merge, which only reads `A`, `B`, `C`, `D` and `site` (so `environment.glb`, which sits
  in the same folder, is not merged in). Heights at the top of `build-model.py` must match
  `src/data/building.ts`, and `plate()` there must match `towerPlate()` in that file. Add `--blend`
  to also save a `.blend` you can edit by hand.
- **The drone's 360° spheres** (`public/views/B-NN.jpg` and the season `.webp`s, 8192 × 4096, listed in
  `public/views/manifest.json` by `interior/tools/drone/window_views.py spheres`): `scripts/view-variants.mjs`
  makes a 4096 × 2048 copy of each in `public/views/4k/` and `public/views/manifest-4k.json` for them. It runs
  before `npm run dev` and `npm run build` and only redoes copies older than their original. The apartment
  page's tour shows the copies in its windows (its rooms are 4096 wide too); the 360° views (`WindowSphere`,
  `DroneView`) show the copy first and, on larger screens, swap in the original when it has arrived.
- **Window-view pictures**: the same script makes a 640 × 360 thumbnail of each window view
  (`public/views/thumbs/<facing>-<floor>.webp`, the winter photograph) for the apartment page's link to its view.
  The home page's window-views band crossfades `public/media/renders/window-<season>-{960,1600}.webp`, made with
  sharp from `public/views/window/NE/floor-16/<season>.webp`; remake them if that view changes.
- **Hero still** (`public/media/hero-sunset-*`): the 2400 px WebP is the master; the 1200 px WebP and the
  AVIFs are made from it with sharp. Remake them when it changes.
- **Home page videos** (`public/media/hero-loop.mp4`, `flight-sunset-6.mp4`): each has a `-portrait.mp4` cut
  for phones held upright, the middle 720 × 1080 of the frame (the only part such a screen shows). Remake it
  whenever the video changes; the ffmpeg settings are in `page.tsx`, beside `PORTRAIT`. The flight's keeps a
  keyframe every third frame (`-g 3 -bf 0`), or scrolling it stutters.
- **Furniture**: swap the box furniture in `three/Furniture.tsx` for glTF models (`useGLTF` from
  `@react-three/drei`).
- **Texts**: the three files in `src/i18n`. The site name is `site.name` in each.
