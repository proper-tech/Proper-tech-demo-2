# Interior scenes for the 360° tours

`F.blend` and `E.blend` are the furnished interiors of plans **F** and **E** (Block B, east side),
built from the plan-D scene (same materials, furniture and lighting) by `tools/build_unit.py`.
Plans **A** and **B** are their mirror images, so their tours are made from these renders too.
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
   Видео карт (NVIDIA/AMD) автоматаар ашиглагдана. 13 зураг, нэг бүр нь RTX картаар ~1–3 минут.
   Цонхон дээр `ok F living 95 s` гэх мэт мөрүүд гарна. Дуустал зөөврийн компьютерыг цэнэглэгчид залгаатай байлгаарай.
4. Дууссаны дараа зургуудаа илгээнэ:
   ```
   git add interior/renders
   git commit -m "F, E panoramas"
   git push
   ```

Only some stops, or another sample count: `render_all.bat 128` or
`"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b interior\F.blend -P interior\render_panos.py -- F 128 living,kitchen`.

## Rebuild the scenes

`tools/build_unit.py F|E <outdir>` (Blender's Python module `bpy`, needs the plan-D scene) rebuilds a scene;
`tools/preview.py` renders a quick top view or low-resolution panoramas to check it.

## Block D, floor 1 (car parts shop and repair shop) — Монгол заавар

`D1.blend` is block D's first floor, furnished (shop shelves, counter, office, waiting room, two car lifts, the
inspection pit, cars), built from the site's block D data by `tools/build_blockd.py` with F's materials and the
site's car. `D1_cams.json` holds its 9 tour stops (block metres: x = u east, y = -v, height).

1. Рендер эхлүүлнэ (давхар товшиж болно, эсвэл PowerShell-д `.\interior\render_blockd.bat`):
   ```
   interior\render_blockd.bat
   ```
   9 панорам (4096×2048) болон дээрээс харсан зураг `interior\renders\D1` хавтсанд гарна.
   Хурдан болгох бол: `interior\render_blockd.bat 64` (sample цөөн).
2. Сайтад тавина: `python3 -I interior/tools/publish_blockd.py . 1` → `public/tour-d/1` (4K, жижиг хувилбар, top.webp).

Rebuild the scene: `python3 -I interior/tools/build_blockd.py interior/F.blend <car.glb> interior` (bpy as a module;
car.glb is `Env_Car_01` cut out of `public/models/blocks/environment.glb`).
