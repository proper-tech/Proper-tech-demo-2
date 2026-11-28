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

### Windows (Цонх)

`tools/upgrade_windows.py` (called by `upgrade_interior.py`) replaces the plain posts around each pane with a built
window: outer frame with head and bottom rail, mullions, one tilt-and-turn sash per opening with its handle, glazing
beads and black gaskets, softened edges, anthracite satin paint. The window board now overhangs the wall by 3.5 cm
(it stood flush, which left a dark seam). After new renders the ID passes must be made again from the upgraded
scenes so the window-glass masks (drone views) follow the new frames.

### Evening (Орой) panoramas

`interior\render_evening.bat` renders the same 22 stops at dusk (lamps on, twilight outside) into
`interior\renders\D_evening`, `F_evening`, `E_evening` (~1 h 15 min). `tools/make_all_tours.sh` then adds them to the
tours as `D_<stop>@eve` (`tools/add_evening.py`), and the tour's **☾ Орой / ☀ Өдөр** button
(`tools/add_mood_toggle.py`) switches between the two; it stays hidden while a tour has no evening pictures.

### The real view through the windows (drone spheres)

Every tour holds the window-glass mask of each of its views (`tools/add_window_masks.py`). The apartment page opens
the tour with `?tower=B&floor=7`; the tour then reads `public/views/manifest.json`, takes the drone sphere nearest
to that floor and shows it in the windows, turned to true north (`tools/add_window_views.py`). Until a sphere is
added nothing changes. To add one (stitched 2:1 JPG from DJI Fly's Sphere mode, nose to the north):

    python3 -I interior/tools/add_view.py . B 7 PANO_0012.jpg        # -> public/views/B-07.jpg + manifest

If a view turns out rotated, give the yaw in degrees as a fifth argument (clockwise).

Plans F and E (and their mirrors A and B) have a glazed pane between the bedroom and the balcony. It carries the
windows' material, so the masks marked it as a window and the tours showed the city through it, with the bedside
lamp laid over the photo. `tools/inner_glass.py` projects that pane into each stop's picture and takes it out of the
mask; `add_window_masks.py` uses it, and `python3 -I interior/tools/inner_glass.py .` mends the published tours
(`interior/tours`, `public/tour`, `public/tour-hd`) in place.

From DJI video with the drone's flight data in it (one run makes a sphere for every height the drone spun at):
`interior/tools/drone/video_spheres.py`, see `interior/tools/drone/README.md`.

### Finish packages (Дулаан / Цайвар / Бараан)

`FINISH=light` or `FINISH=dark` (environment) makes `upgrade_dress.py` swap the floor, joinery, doors and worktops
(`FINISHES` there); `render_panos.py` then writes to `renders/<plan>_light` / `_dark`. `tools/add_finish_toggle.py`
gives the tours three chips in the "Interior colors" panel, shown once a tour has the pictures
(`add_evening.py <tour> <plan> <dir> light|dark`). `interior\render_next.bat` renders the evening and both packages
(66 views, ~3.5-4 h) and pushes them to the `interior-renders` branch.

## Photographic tours (`public/tour-hd/`)

Every apartment page opens its plan's tour from `public/tour-hd/<plan>/` (`tourPath` in
`src/components/ApartmentExperience.tsx`): the same rooms as `public/tour/<plan>/`, repainted as photographs by an
image model, with one photo per interior colour scheme instead of the colour masks, and the drone's view drawn
sharp through the windows.

1. **Repaint** each room of D, F and E (22 panoramas, the 4096 × 2048 `hi` pictures of the published tours) with
   GPT Image 2.6 at 4K in Higgsfield, asked to keep every edge where it is, to paint the window glass flat white and
   to add no curtains. Then, from each repainted room, the three colour schemes (navy, sage, charcoal), with the
   exact colours of `TOUR_PALETTES` in the tour for walls, kitchen units, sofa, chairs and headboards, armchairs and
   throws, and duvets, each recoloured over the whole object. Check every result against its render (edges in the
   same place, glass where the render's glass is) before using it.
2. **Prepare** each picture into `interior/hd/<plan>/` (not in git, about 110 MB):
   `node interior/tools/hd_prepare.mjs <repainted> <render's window mask> interior/hd/D/living.jpg interior/hd/D/living-glass.png`
   (and `living-navy.jpg`, `living-navy-glass.png`, ...). It blends the 360° join and finds the glass.
3. **Build** the tours: `node interior/tools/hd_tours.mjs`. C, A and B are made from D, F and E turned over and half
   a turn round, as `mirror_tour.py` makes the rendered ones. It rewrites `public/tour-hd/` from scratch.

The drone's photos stop some 20° below the horizon and are flat colour below that, which balcony glass (46° down)
showed as a brown block. For every floor (4-16), each photo was repainted by GPT Image 2.6 with that band filled in (streets,
roofs and cars seen from above: made up, not photographed), and `node interior/tools/hd_outside.mjs
public/views/4k/B-16.jpg <repainted.png> interior/hd/outside/B-16.jpg` keeps every real pixel and takes only the band
from it. The photos also stop some 11-14° above the horizon, which cut the nearby towers off flat on floors 4-13; each
of those was repainted again with the towers finished upwards (rooftops continued from the floors below, no signs or
lettering) and blended in with `... interior/hd/outside/B-NN.jpg <repainted.png> interior/hd/outside/B-NN.jpg --top <top>`.
`hd_tours.mjs` publishes it to `public/tour-hd/outside/` and the tours use it in their windows instead of the
photo; the views pages keep the real one. The colour masks, top views and plans still come from `public/tour/<plan>/img/`, so rebuild the HD tours after the
rendered ones are republished. Evening pictures, where a tour has them, are the renders.

<<<<<<< HEAD
Plan F's kitchen (and A's) had a wicker basket half inside the tall fridge unit in every repainted photo
(`upgrade_dress.py` placed props by a guessed radius; it now checks each prop's real footprint against the tall
units, hobs and sinks beside the worktop). `python3 -I interior/tools/hd_drop_basket.py public` painted it out of
the published HD photos; run `... hd_drop_basket.py files interior/hd/F/kitchen.jpg interior/hd/F/kitchen-navy.jpg
...` on the repainted sources (the warm-neutral one first) before rebuilding the HD tours, or the basket comes back.
=======
## Languages (English, Chinese, Mongolian)

The tours are built in Mongolian, with the colour panel and the top view in English. Every published tour also
carries `tools/tour_languages.js` and its table `tools/tour_languages.json` (put in by `tools/add_languages.py`): with
`?lang=en`, `zh` or `mn` in its address the tour shows that language, swapping each text it knows as it appears,
including what the tour writes later (the room's name, the window badge, messages). Without `?lang` it stays as built.
The apartment and podium pages pass their own language, so switching language on the site switches the tour.

`split_tours.py` adds the languages to every tour it publishes, so a rebuilt tour keeps them. To change or add a
translation, edit `tools/tour_languages.json` (a key is the text as the tour shows it; `patterns` cover texts with a
room or floor in them), then:

    python3 -I interior/tools/add_languages.py public/tour/{A,B,C,D,E,F,A1}/index.html
    node interior/tools/hd_tours.mjs

A new text in a tour that the table lacks stays in the tour's own language until it is added. The Chinese and the
Mongolian of the English panels want checking by a native speaker. The whole-building viewer underneath the tours
(not shown on the site) is not translated.
>>>>>>> b2932374d4921ab4c4c8f9094e7a0c50832670ec
