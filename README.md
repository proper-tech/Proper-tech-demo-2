# Tenger Residence — apartment sales site (mock)

Next.js 16 (App Router) + React 19 + three.js (`@react-three/fiber`).

## What is real and what is still a placeholder

| Real (from your files) | Still a placeholder |
| --- | --- |
| Site plan: tower, podium and annex footprints, kerbs, parking bays, trees (`src/data/site.json`, extracted from `ET_coordinattai.dwg`) | Which apartments are sold: all are for sale (`status` in `src/data/building.ts`) |
| Blocks A-D, storeys and levels: apartments on floors 4-16 at 3.0 m from +11.7 m, roof +54.7 m (`src/data/building.ts`, from sections 1-1 and 2-2 of the schematic design) | Ceiling heights in `src/data/layouts.ts` (estimated from the 3.0 m storey height) |
| The six apartments on each floor, their rooms and areas, the lift and stair core (`src/data/layouts.ts`, traced from floor plans sheets 17-20) | Intro video (`public/media/intro.mp4`), project name, phone number |
| 155 apartments, including floor 4 of Block B, where the homeowners' association room replaces apartment B | Furniture (only there to show scale), including the fit-out of podium floor 1 (`furnish()` in `src/data/podium.ts`) |
| Capacity figures on the home page (general plan, sheet 7) | Door sides of the podium stairs and the roof stair, and the escalator direction (not on the drawings) |
| Block A (podium) floors 1-4: rooms, numbers and areas from the room schedules (`src/data/podium.ts`), facade from the elevations (`scripts/build-model.py`) | Blocks B, C and D have a simplified facade in the 3D model |
| Basement (B1): the car park under blocks A-C with its room schedule, the driveway to block D's garage, both ramps, the tower cores, 60 parking spaces as drawn (`src/data/podium.ts`, floor 0) | Ramp slopes: the plans stop at the building's edge, so the ramps are drawn reaching street level there, steeper than built |
| Towers 25.7 × 21.4 m from floor 4 up, overhanging the podium (typical floor plan and section 1-1); technical floor on each roof, up to +54.7 m, rooms 113-118 (`src/data/roof.ts`, roof plan) | |
| The six renders (`public/media/renders`) | |

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
| Podium floors 1-4, the basement car park (B1), and each tower's roof (technical floor, as floor 17) | Same route, `A/B1`, `A/1`-`A/4`, `B/17`, `C/17` (`PodiumFloorExperience`, `three/PodiumScene`; data in `podium.ts`, `roof.ts`) |
| Stairs, lifts, escalators | `three/Cores.tsx`, used by the tower, podium and roof floors |
| 3D apartment | `/[locale]/apartments/[id]`, "3D model" (`three/ApartmentModel`) |
| 360° view in every room, walking between rooms | Same page, "360° tour" (`three/ApartmentScene`); add `?view=tour` to link straight to it |
| Rendered 360° photos of plan D (interior concept), 8 stops with walk-through hotspots | `src/data/photoTour.ts`, photos in `public/media/360/D`, source data in `docs/interior-D` |
| Change floor, wall, furniture colours | "Finishes" panel (`data/finishes.ts`) |
| Room sizes and ceiling heights | "Rooms and sizes" table and the 2D plan |
| Intro video | Home page (`VideoSection`) |
| Chinese, English, Mongolian | `src/i18n/{zh,en,mn}.ts`, URL prefix `/zh`, `/en`, `/mn` |

## Replacing the mock content

- **Storeys and availability**: `src/data/building.ts` (`FLOOR_MAX`, apartments per floor, `status`).
- **Layouts**: `src/data/layouts.ts`. Rooms are rectangles in metres; doors and windows are
  entries in `openings`. The 3D model, 2D plan, tour and size table all come from this file.
- **Real 360° photos**: put an equirectangular JPG in `public/` and set `panorama: '/media/living.jpg'`
  on a room. The tour then shows the photo for that room instead of the 3D model.
- **Rendered photo tour (plan D)**: `layout.photoTour` lists viewpoints, each with its own photo,
  eye point and hotspots, so one room (the open living room) can hold several stops (entrance,
  kitchen, living, corridor). Stops, cameras and hotspot points are in `src/data/photoTour.ts`,
  taken from the Blender interior scene (`docs/interior-D`: `render_log.json`,
  `navigation_visibility.json`). That scene's inner walls differ from `layouts.ts` by up to ~1.2 m,
  which is why the stops do not use the layout's doors. The renders face east at the image centre;
  the files in `public/media/360/D` are rolled half a turn to face west, as the photo sphere
  expects. The `.blend` itself is not in git (see `.gitignore`).
- **Video**: replace `public/media/intro.mp4`.
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
  to also save a `.blend` you can edit by hand. The earlier box massing model is kept in
  `scripts/BuildingScene.massing.tsx.bak`.
- **Furniture**: swap the box furniture in `three/Furniture.tsx` for glTF models (`useGLTF` from
  `@react-three/drei`).
- **Texts**: the three files in `src/i18n`. The site name is `site.name` in each.
