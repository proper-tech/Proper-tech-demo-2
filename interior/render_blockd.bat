@echo off
rem Renders block D, floor 1: the 360 panoramas of every tour stop and the furnished top view,
rem into interior\renders\D1. Uses the newest Blender in "C:\Program Files\Blender Foundation", or BLENDER if set.
rem   render_blockd.bat        all stops, 128 samples
rem   render_blockd.bat 64     fewer samples (faster)
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
"%BLENDER%" -b D1.blend -P render_panos.py -- D1 %*
"%BLENDER%" -b D1.blend -P render_top.py -- renders\D1\top 60 64
echo.
echo Done. The pictures are in interior\renders\D1 (9 panoramas and top.png).
pause
