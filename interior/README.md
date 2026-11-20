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
