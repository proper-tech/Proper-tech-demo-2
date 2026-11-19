@echo off
rem Renders every 360 panorama of plans F and E into interior\renders\F and interior\renders\E.
rem Uses the newest Blender installed in "C:\Program Files\Blender Foundation", or the one in BLENDER if set.
setlocal
cd /d "%~dp0"
if not defined BLENDER (
  for /d %%D in ("C:\Program Files\Blender Foundation\Blender*") do set "BLENDER=%%D\blender.exe"
)
if not exist "%BLENDER%" (
  echo Blender not found. Install it from https://www.blender.org/download/ or set BLENDER=C:\path\to\blender.exe
  pause
  exit /b 1
)
echo Using %BLENDER%
"%BLENDER%" -b F.blend -P render_panos.py -- F %*
"%BLENDER%" -b E.blend -P render_panos.py -- E %*
echo.
echo Done. The pictures are in interior\renders. Now push them:  git add interior/renders  ^&  git commit -m "F, E panoramas"  ^&  git push
pause
