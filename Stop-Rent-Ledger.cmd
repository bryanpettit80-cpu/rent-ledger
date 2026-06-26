@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Stop-Rent-Ledger.ps1"
echo.
pause
