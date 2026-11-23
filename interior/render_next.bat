@echo off
rem Дараагийн рендер: орой (22 зураг) + Цайвар, Бараан материалын багц (44 зураг) = 66 зураг, RTX дээр ~3.5-4 цаг.
rem Дуусахад зургуудыг interior-renders салбар руу автоматаар push хийнэ. Компьютерыг унтуулахгүй, цэнэглэгчтэй байлгана.
setlocal
cd /d "%~dp0"
rem Blender байгаа эсэхийг эхэнд нь шалгана (олдохгүй бол BLENDER=C:\...\blender.exe гэж зааж өгнө)
if not defined BLENDER (
  for /d %%D in ("C:\Program Files\Blender Foundation\Blender*") do set "BLENDER=%%D\blender.exe"
)
if not exist "%BLENDER%" (
  echo.
  echo Blender oldsongui. Blender suulgasan bol: set BLENDER=C:\zam\blender.exe  geed dahin ajilluulna uu.
  pause
  exit /b 1
)
echo Blender: %BLENDER%
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fetch_assets.ps1
if not exist assets\textures (
  echo.
  echo interior\assets tatagdsangui. Internet holboltoo shalgaad dahin ajilluulna uu.
  pause
  exit /b 1
)
set "PLANS=D F E"
set "STOPS="

echo ===== Evening =====
set "MOOD=evening"
set "FINISH=warm"
call render_upgraded.bat 128 nopause

echo ===== Light finish =====
set "MOOD=day"
set "FINISH=light"
call render_upgraded.bat 128 nopause

echo ===== Dark finish =====
set "FINISH=dark"
call render_upgraded.bat 128 nopause

echo ===== Push =====
cd ..
git checkout -B interior-renders
rem зөвхөн энэ удаагийн зургууд (бусад хавтас, хуучин файлууд орохгүй)
set "N=0"
for %%P in (D F E) do for %%K in (evening light dark) do if exist "interior\renders\%%P_%%K\*.jpg" (git add "interior/renders/%%P_%%K" & set /a N+=1)
if "%N%"=="0" (
  echo.
  echo Shine zurag alga - render amjiltgui bolson. Deerh aldaag Claude-d yavuulna uu.
  pause
  exit /b 1
)
git commit -m "Evening and finish-package panoramas (D, F, E)"
git push -u origin interior-renders --force
echo.
echo Duussan. Claude-d "duussan" gej bichne uu.
pause
