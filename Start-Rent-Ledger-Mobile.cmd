@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Rent-Ledger-Mobile.ps1"
echo.
echo Keep this PC awake and on the same Wi-Fi as your phone while using the mobile URL.
echo Press any key to close this launcher window. The app server can keep running in the background.
pause >nul
