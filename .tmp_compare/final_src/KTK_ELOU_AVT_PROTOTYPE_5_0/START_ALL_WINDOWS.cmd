@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\START_ALL_WINDOWS.ps1"
if errorlevel 1 (
  echo.
  echo Startup failed. Run INSTALL_ALL_WINDOWS.cmd first.
  pause
  exit /b 1
)
