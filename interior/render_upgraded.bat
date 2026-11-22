@echo off
rem Шинэчилсэн дотор талын 360 зургууд: D, F, E планыг бодит гэрэл, материал, чимэглэлтэй болгоод рендерлэнэ.
rem Эхлээд interior\fetch_assets.bat-аар interior\assets-ыг татсан байх ёстой.
rem   render_upgraded.bat            (бүгд, 128 sample)
rem   render_upgraded.bat 64         (хурдан туршилт)
setlocal
cd /d "%~dp0"
if not defined BLENDER (
  for /d %%D in ("C:\Program Files\Blender Foundation\Blender*") do set "BLENDER=%%D\blender.exe"
)
if not exist "%BLENDER%" (
  echo Blender not found. Set BLENDER=C:\path\to\blender.exe
  pause
  exit /b 1
)
if not exist assets\textures (
  echo interior\assets alga. Ehleed interior\fetch_assets.bat ajilluulna uu.
  pause
  exit /b 1
)
for %%P in (D F E) do (
  echo === %%P: upgrade ===
  "%BLENDER%" -b %%P.blend -P tools\upgrade_interior.py -- %%P day "%~dp0%%P_day.blend"
  echo === %%P: render ===
  "%BLENDER%" -b %%P_day.blend -P render_panos.py -- %%P %*
)
echo.
echo Duussan. Zurguud interior\renders\D, F, E-d baina. Odoo ilgeene:
echo   git add interior/renders ^&^& git commit -m "Upgraded D, F, E panoramas" ^&^& git push
pause
