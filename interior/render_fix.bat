@echo off
rem Сүүлийн засварууд: F, E бүхэлдээ, D-ийн үүд ба коридор (нийт 15 зураг, ~50 мин).
cd /d "%~dp0"
set "PLANS=F E"
set "STOPS="
call render_upgraded.bat 128 nopause
set "PLANS=D"
set "STOPS=entry,hall"
call render_upgraded.bat 128
