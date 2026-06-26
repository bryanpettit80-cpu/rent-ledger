@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Rent-Ledger.ps1"
echo.
echo Press any key to close this launcher window. The app server can keep running in the background.
pause >nul
