@echo off
rem Renders block D floors: the 360 panoramas of every tour stop and the furnished top view,
rem into interior\renders\D<floor>. Uses the newest Blender in "C:\Program Files\Blender Foundation", or BLENDER if set.
rem   render_blockd.bat            floors B1, 2 and 3 (0 2 3)
rem   render_blockd.bat 0          only B1;  render_blockd.bat 1 = floor 1 again
rem   set SAMPLES=64               before it, for fewer samples (faster)
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
set "FLOORS=%*"
if "%FLOORS%"=="" set "FLOORS=0 2 3"
for %%F in (%FLOORS%) do (
  echo.
  echo ===== Block D, floor %%F =====
  "%BLENDER%" -b D%%F.blend -P render_panos.py -- D%%F %SAMPLES%
  "%BLENDER%" -b D%%F.blend -P render_top.py -- renders\D%%F\top 60 64
)
echo.
echo Done. The pictures are in interior\renders\D^<floor^> (panoramas and top.png).
pause
