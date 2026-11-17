# Tenger Residence — apartment sales site (mock)

Next.js 16 (App Router) + React 19 + three.js (`@react-three/fiber`).

## What is real and what is still a placeholder

| Real (from your files) | Still a placeholder |
| --- | --- |
| Site plan: tower, podium and annex footprints, kerbs, parking bays, trees (`src/data/site.json`, extracted from `ET_coordinattai.dwg`) | Which apartments are sold (`statusOf` in `src/data/building.ts`) |
| Blocks A-D, storeys and levels: apartments on floors 4-16 at 3.0 m from +11.7 m, roof +54.7 m (`src/data/building.ts`, from sections 1-1 and 2-2 of the schematic design) | Ceiling heights in `src/data/layouts.ts` (estimated from the 3.0 m storey height) |
| The six apartments on each floor, their rooms and areas, the lift and stair core (`src/data/layouts.ts`, traced from floor plans sheets 17-20) | Intro video (`public/media/intro.mp4`), project name, phone number |
| 155 apartments, including floor 4 of Block B, where the homeowners' association room replaces apartment B | Furniture (only there to show scale) |
| Capacity figures on the home page (general plan, sheet 7) | |
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
| Floor plan, 3D and 2D | `/[locale]/floors/[tower]/[floor]` (`FloorExperience`, `three/FloorScene`, `Plan2D`) |
| 3D apartment | `/[locale]/apartments/[id]`, "3D model" (`three/ApartmentModel`) |
| 360° view in every room, walking between rooms | Same page, "360° tour" (`three/ApartmentScene`); add `?view=tour` to link straight to it |
| Change floor, wall, furniture colours | "Finishes" panel (`data/finishes.ts`) |
| Room sizes and ceiling heights | "Rooms and sizes" table and the 2D plan |
| Intro video | Home page (`VideoSection`) |
| Chinese, English, Mongolian | `src/i18n/{zh,en,mn}.ts`, URL prefix `/zh`, `/en`, `/mn` |

## Replacing the mock content

- **Storeys and availability**: `src/data/building.ts` (`FLOOR_MAX`, apartments per floor, `statusOf`).
- **Layouts**: `src/data/layouts.ts`. Rooms are rectangles in metres; doors and windows are
  entries in `openings`. The 3D model, 2D plan, tour and size table all come from this file.
- **Real 360° photos**: put an equirectangular JPG in `public/` and set `panorama: '/media/living.jpg'`
  on a room. The tour then shows the photo for that room instead of the 3D model.
- **Video**: replace `public/media/intro.mp4`.
- **The building model**: `public/models/complex.glb`, shown by `three/BuildingScene.tsx`. It is
  generated from `src/data/site.json` by `scripts/build-model.py` (needs Blender, or `pip install bpy`):
  `python3 scripts/build-model.py src/data/site.json public/models/complex.glb`. Re-run it after the
  site plan or the storey heights change (the heights at the top of the script must match
  `src/data/building.ts`). Add `--blend` to also save a `.blend` you can edit by hand. The earlier
  box massing model is kept in `scripts/BuildingScene.massing.tsx.bak`.
- **Furniture**: swap the box furniture in `three/Furniture.tsx` for glTF models (`useGLTF` from
  `@react-three/drei`).
- **Texts**: the three files in `src/i18n`. The site name is `site.name` in each.
# Proper-tech-demo-2
