@echo off
rem Renders the podium's (block A's) floor 2, the empty rental hall: the 360 panoramas of its 6 tour stops
rem and the top view, into interior\renders\A2. Uses the newest Blender in "C:\Program Files\Blender Foundation",
rem or BLENDER if set.   set SAMPLES=64 before it for fewer samples (faster).
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
echo.
echo ===== Block A, floor 2 =====
"%BLENDER%" -b A2.blend -P render_panos.py -- A2 %SAMPLES%
"%BLENDER%" -b A2.blend -P render_top.py -- renders\A2\top 40 64
echo.
echo Done. The pictures are in interior\renders\A2 (6 panoramas and top.png).
pause
