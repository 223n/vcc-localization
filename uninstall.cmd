@echo off
rem VCC Japanese localization patch (unofficial): uninstall
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0vcc-ja.ps1" -Action uninstall %*
pause
