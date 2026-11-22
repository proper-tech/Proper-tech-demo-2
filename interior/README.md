# Interior scenes for the 360° tours

`D.blend`, `F.blend` and `E.blend` are the furnished interiors of plans **D**, **F** and **E** (Block B, east side).
`D.blend` is the plan-D scene cleaned up by `tools/fix_scene.py` (see `tools/fixes.py`); F and E are built from it (same materials, furniture and lighting) by `tools/build_unit.py`.
Plans **C**, **A** and **B** are their mirror images, so their tours are made from these renders too.
`<plan>_cams.json` holds the tour stops (plan metres: x east, y south, height).

## Render on a gaming laptop (Windows) — Монгол заавар

1. **Blender** суулгана: https://www.blender.org/download/ (5.3 эсвэл түүнээс шинэ). Суулгах явцад
   анхны замыг (`C:\Program Files\Blender Foundation\...`) өөрчлөхгүй.
2. Төслийн хавтас дотор **cmd** нээгээд шинэчилнэ:
   ```
   git pull
   ```
3. Рендер эхлүүлнэ (давхар товшиж болно):
   ```
   interior\render_all.bat
   ```
   Видео карт (NVIDIA/AMD) автоматаар ашиглагдана. 22 зураг (D 9, F 7, E 6), нэг бүр нь RTX картаар ~1–3 минут.
   Цонхон дээр `ok F living 95 s` гэх мэт мөрүүд гарна. Дуустал зөөврийн компьютерыг цэнэглэгчид залгаатай байлгаарай.
4. Дууссаны дараа зургуудаа илгээнэ:
   ```
   git add interior/renders
   git commit -m "D, F, E panoramas"
   git push
   ```

Only some stops, or another sample count: `render_all.bat 128` or
`"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b interior\F.blend -P interior\render_panos.py -- F 128 living,kitchen`.

## Rebuild the scenes

`tools/build_unit.py F|E <outdir>` (Blender's Python module `bpy`, needs the plan-D scene) rebuilds a scene;
`tools/preview.py` renders a quick top view or low-resolution panoramas to check it.

## Block D: floor 1 (car parts shop and repair shop) and the car parks B1, 2, 3 — Монгол заавар

`D1.blend` is block D's first floor, furnished (shop shelves, counter, office, waiting room, two car lifts, the
inspection pit, cars); `D0.blend` (B1), `D2.blend` and `D3.blend` are the car parks (bays with cars, markings, the
ramps and the opening over them, strip windows, the store room). Built from the site's block D data by
`tools/build_blockd.py` (floor 1) and `tools/build_blockd_parking.py <floor>` (0, 2, 3), with F's materials and the
site's car; `D<floor>_cams.json` holds each floor's tour stops (block metres: x = u east, y = -v, height).

1. Рендер эхлүүлнэ (давхар товшиж болно, эсвэл PowerShell-д `.\interior\render_blockd.bat`):
   ```
   interior\render_blockd.bat          (B1, 2, 3 давхар)
   interior\render_blockd.bat 0        (зөвхөн B1)
   interior\render_blockd.bat 1        (1-р давхар дахин)
   ```
   Панорамууд (4096×2048) болон дээрээс харсан зураг `interior\renders\D<давхар>` хавтсанд гарна.
   Хурдан болгох бол эхлээд `set SAMPLES=64` гэж бичнэ (cmd), PowerShell-д `$env:SAMPLES=64`.
2. Сайтад тавина: `python3 -I interior/tools/publish_blockd.py . <давхар>` → `public/tour-d/<давхар>`.

Rebuild the scenes: `python3 -I interior/tools/build_blockd.py interior/F.blend <car.glb> interior` and
`python3 -I interior/tools/build_blockd_parking.py interior/F.blend <car.glb> interior <0|2|3>` (bpy as a module;
car.glb is `Env_Car_01` cut out of `public/models/blocks/environment.glb`).

## Block A, 2nd and 3rd floors (empty rental halls 201, 120) — `A2.blend`, `A3.blend` — Монгол заавар

`A2.blend` / `A3.blend` are the podium's 2nd and 3rd floors as empty shells to let: porcelain floor, white ceiling
at 3.0 m with LED panels, round columns on the grid, glass all round (single-pane thin glass), the stair, lift and
toilet cores. Floor 2 has the escalators up from floor 1 through a void and the pair on to floor 3; on floor 3 that
pair arrives through a void. Built by `tools/build_podium2.py` from `A1_floor.json` (outline and grid) and the cores
of `src/data/podium.ts`; `A<floor>_cams.json` holds the 6 tour stops (site metres: x = u east, y = -v, height).

1. Рендер: `interior\render_a2.bat` (2, 3-р давхар хоёулаа), `interior\render_a2.bat 3` (зөвхөн 3).
   Хурдан болгох бол `set SAMPLES=64`. Зургууд `interior\renders\A2`, `interior\renders\A3` хавтсанд гарна.
2. Сайтад тавина: `python3 -I interior/tools/publish_blockd.py . A2` (A3) → `public/tour-a/2` (3).

Rebuild: `python3 -I interior/tools/build_podium2.py interior/F.blend none interior <2|3>`.

## Block A, 1st floor (podium ground floor) — `A1.blend`

The hall, escalators and supermarket of the podium's ground floor, for the 360° tour at
`/floors/A/1` (button «360° аялал»). Built entirely by script from the site data, so it can be rebuilt:

1. `A1_floor.json` is floor 1 of `src/data/podium.ts` (walls, rooms, furniture), dumped with esbuild.
2. Download the HDRI seen through the glass (Poly Haven, CC0):
   `curl -L -o interior/hdri/modern_buildings_2_4k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/modern_buildings_2_4k.hdr`
3. In Blender with `A1.blend` open, run `tools/build_a1.py` (architecture, fittings and stock, plants).
4. Render the stops of `A1_cams.json`: `blender -b interior/A1.blend -P interior/render_panos.py -- A1 96`
   (about 4 minutes each on an Apple M-series GPU). The top view (`renders/A1/topdown.jpg`) is an
   orthographic render from camera `TopCam`, clipped at 2.9 m.
5. `python3 -I interior/tools/make_tour_a1.py` writes `public/tour/A1/index.html` from the plan-D tour's viewer.

## Photographic upgrade of plans D, F, E (daylight, textures, props) — Монгол заавар

`tools/upgrade_interior.py` turns a plan scene into a photographic one: sun through thin window glass, curtains
gathered at the ends of their rods, the city HDRI outside, exposure by the side the windows face.
`tools/upgrade_dress.py` adds Poly Haven (CC0) textures (floor, stone, wood, fabric, plaster) and props (plants,
vases, books, bowls, kitchen things), placed by rule. The assets are not in git:

1. `interior\fetch_assets.bat` — татаж авна (`interior\assets`, ~250 MB, нэг удаа).
2. `interior\render_upgraded.bat` — D, F, E-г шинэчлээд 22 панорамыг рендерлэнэ (RTX: ~200 с нэг зураг).
   Зөвхөн заримыг нь: `set PLANS=F E` эсвэл `set PLANS=D` + `set STOPS=entry,hall`.
3. Tours: run `tools/passes.py ids|top` on `<plan>_day.blend`, then repanos / retop / build_tour / mirror_tour /
   make_plans / split_tours as in `tools/finalize.sh`.
