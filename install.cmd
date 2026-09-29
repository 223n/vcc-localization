@echo off
rem VCC Japanese localization patch (unofficial): install
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vcc-ja.ps1" -Action install %*
pause
