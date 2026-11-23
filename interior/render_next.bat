@echo off
rem Дараагийн рендер: орой (22 зураг) + Цайвар, Бараан материалын багц (44 зураг) = 66 зураг, RTX дээр ~3.5-4 цаг.
rem Дуусахад зургуудыг interior-renders салбар руу автоматаар push хийнэ. Компьютерыг унтуулахгүй, цэнэглэгчтэй байлгана.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\fetch_assets.ps1
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
git add interior/renders
git commit -m "Evening and finish-package panoramas (D, F, E)"
git push -u origin interior-renders --force
echo.
echo Duussan. Claude-d "duussan" gej bichne uu.
pause
