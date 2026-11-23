@echo off
rem Шинэчилсэн дотор талын 360 зургууд: D, F, E планыг бодит гэрэл, материал, чимэглэлтэй болгоод рендерлэнэ.
rem Эхлээд interior\fetch_assets.bat-аар interior\assets-ыг татсан байх ёстой.
rem   render_upgraded.bat            (бүгд, 128 sample)
rem   render_upgraded.bat 64         (хурдан туршилт)
rem   set PLANS=F E  ^&  render_upgraded.bat           (зөвхөн F, E)
rem   set PLANS=D  ^&  set STOPS=entry,hall  ^&  render_upgraded.bat   (D-ийн хоёр цэг)
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
if not defined PLANS set "PLANS=D F E"
if not defined MOOD set "MOOD=day"
set "SAMPLES=%~1"
if not defined SAMPLES set "SAMPLES=128"
for %%P in (%PLANS%) do (
  echo === %%P: upgrade ===
  "%BLENDER%" -b %%P.blend -P tools\upgrade_interior.py -- %%P %MOOD% "%~dp0%%P_%MOOD%.blend"
  echo === %%P: render ===
  "%BLENDER%" -b %%P_%MOOD%.blend -P render_panos.py -- %%P %SAMPLES% %STOPS%
)
echo.
echo Duussan. Zurguud interior\renders dotor baina. Claude-d "duussan" gej bichne uu.
if /i not "%~2"=="nopause" pause
