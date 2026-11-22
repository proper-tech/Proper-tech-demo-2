@echo off
rem Poly Haven-ээс (CC0) текстур, чимэглэл, тэнгэрийг interior\assets руу татаад interior\assets.zip болгоно.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File interior\tools\fetch_assets.ps1
pause
