@echo off
rem Оройн 360 зургууд (дэнлүү асаалттай, цонхоор бүрэнхий): D, F, E -> interior\renders\D_evening, F_evening, E_evening.
rem Нийт 22 зураг, RTX картаар ~1 цаг 15 мин.
setlocal
cd /d "%~dp0"
set "PLANS=D F E"
set "MOOD=evening"
set "STOPS="
call render_upgraded.bat %*
