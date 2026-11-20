@echo off
rem Renders the podium's (block A's) empty rental halls: the 360 panoramas of the 6 tour stops and the
rem top view of each floor, into interior\renders\A<floor>.   render_a2.bat (floors 2 and 3), render_a2.bat 3 (only 3)
rem Uses the newest Blender in "C:\Program Files\Blender Foundation", or BLENDER if set.
rem set SAMPLES=64 before it for fewer samples (faster).
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
set "FLOORS=%*"
if "%FLOORS%"=="" set "FLOORS=2 3"
echo Using %BLENDER%
for %%F in (%FLOORS%) do (
  echo.
  echo ===== Block A, floor %%F =====
  "%BLENDER%" -b A%%F.blend -P render_panos.py -- A%%F %SAMPLES%
  "%BLENDER%" -b A%%F.blend -P render_top.py -- renders\A%%F\top 40 64
)
echo.
echo Done. The pictures are in interior\renders\A2 and A3 (6 panoramas and top.png each).
pause
