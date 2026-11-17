# Tenger Residence — apartment sales site (mock)

Next.js 16 (App Router) + React 19 + three.js (`@react-three/fiber`).

## What is real and what is still a placeholder

| Real (from your files) | Still a placeholder |
| --- | --- |
| Site plan: tower, podium and annex footprints, kerbs, parking bays, trees (`src/data/site.json`, extracted from `ET_coordinattai.dwg`) | Apartment layouts and room sizes (`src/data/layouts.ts`) |
| Tower footprint 22.6 × 22.0 m, column grid, site size | Number of storeys (`PODIUM_FLOORS`, `FLOOR_MAX` in `src/data/building.ts`, estimated from the renders) |
| The six renders (`public/media/renders`) | Which apartments are sold (`statusOf` in `building.ts`) |
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
