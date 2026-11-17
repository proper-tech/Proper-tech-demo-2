# Tenger Residence — apartment sales site (mock)

Next.js 16 (App Router) + React 19 + three.js (`@react-three/fiber`).

## What is real and what is still a placeholder

| Real (from your files) | Still a placeholder |
| --- | --- |
| Site plan: tower, podium and annex footprints, kerbs, parking bays, trees (`src/data/site.json`, extracted from `ET_coordinattai.dwg`) | Floor 4 of B and C: no drawing yet, it uses the typical floor plan |
| Column grid, site size. Towers 25.4 × 21.6 m from floor 4 up (typical floor plan, section 1-1), overhanging the podium; the site plan's 22.6 × 22.0 m rectangle is the podium under each tower | |
| Technical floor on each tower roof, over the core, up to +54.7 m (roof plan, section 1-1) | |
| Apartments A-F, core and room areas from the typical floor plan of B and C (floors 5-16, `src/data/layouts.ts`, `building.ts`); traced to about 0.2 m, areas from the room schedule | Furniture, and ceiling height in the 3D model (2.7 m assumed) |
| Storeys and heights from the architect's sections: podium 4.5 / 3.6 / 3.6 m (roof playground at +11.7 m), apartment floors 4-16 at 3.0 m (`src/data/building.ts`) | |
| Block A (podium) facade from the elevations and plans (`scripts/build-model.py`) | Blocks B and C have the right size but a simplified facade; block D is simplified throughout |
| The six renders (`public/media/renders`) | Which apartments are sold: all are for sale (`status` in `building.ts`) |
| | Intro video (`public/media/intro.mp4`), project name, phone number |

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
| Floor plan, 3D and 2D | `/[locale]/floors/[tower]/[floor]` (`FloorExperience`, `three/FloorScene`, `Plan2D`) |
| Podium floors 1-4, and each tower's roof (technical floor, as floor 17) | Same route, `A/1`-`A/4`, `B/17`, `C/17` (`PodiumFloorExperience`, `three/PodiumScene`; data in `podium.ts`, `roof.ts`) |
| 3D apartment | `/[locale]/apartments/[id]`, "3D model" (`three/ApartmentModel`) |
| 360° view in every room, walking between rooms | Same page, "360° tour" (`three/ApartmentScene`); add `?view=tour` to link straight to it |
| Change floor, wall, furniture colours | "Finishes" panel (`data/finishes.ts`) |
| Room areas | "Rooms and sizes" table and the 2D plan |
| Intro video | Home page (`VideoSection`) |
| Chinese, English, Mongolian | `src/i18n/{zh,en,mn}.ts`, URL prefix `/zh`, `/en`, `/mn` |

## Replacing the mock content

- **Storeys and availability**: `src/data/building.ts` (`FLOOR_MAX`, the flats per floor, `status`).
- **Layouts**: `src/data/layouts.ts`. Rooms are rectangles in floor-plate metres (x east from grid
  X2, z south from grid Y4); doors and windows are entries in `openings`; D, E and F are mirrored
  from C, B and A. The 3D model, 2D plan, tour and area table all come from this file.
- **Real 360° photos**: put an equirectangular JPG in `public/` and set `panorama: '/media/living.jpg'`
  on a room. The tour then shows the photo for that room instead of the 3D model.
- **Video**: replace `public/media/intro.mp4`.
- **The building model**: one GLB per block in `public/models/blocks/`, in the architect's block key:
  `A.glb` podium (floors 1-3 under the whole complex, roof playground, media screen), `B.glb` the
  north tower on the main road, `C.glb` the south tower (both floors 4-16, standing on A),
  `D.glb` the annex, `site.glb` the parked cars. The viewer (`three/BuildingScene.tsx`) loads
  `public/models/complex.glb`, which is the blocks merged:

  ```bash
  B=/Applications/Blender.app/Contents/MacOS/Blender
  $B --background --python scripts/build-model.py -- src/data/site.json public/models/blocks
  $B --background --python scripts/merge-blocks.py -- public/models/blocks public/models/complex.glb
  ```

  A block can be rebuilt or replaced on its own (for example edited by hand in Blender) as long as
  it keeps the site-plan coordinates (no re-centring) and is exported as GLB, Y-up, selected
  objects only; then re-run the merge. Heights at the top of `build-model.py` must match
  `src/data/building.ts`. Add `--blend` to the build to also save a `.blend`. The earlier box
  massing model is kept in `scripts/BuildingScene.massing.tsx.bak`.
- **Furniture**: swap the box furniture in `three/Furniture.tsx` for glTF models (`useGLTF` from
  `@react-three/drei`).
- **Texts**: the three files in `src/i18n`. The site name is `site.name` in each.
# Proper-tech-demo-2
