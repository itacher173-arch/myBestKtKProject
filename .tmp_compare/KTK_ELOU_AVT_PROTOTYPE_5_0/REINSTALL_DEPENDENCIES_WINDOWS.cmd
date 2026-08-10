@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python environment was not found. Run INSTALL_ALL_WINDOWS.cmd.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
pushd apps\frontend
if not exist "..\..\.cache\npm" mkdir "..\..\.cache\npm"
call npm.cmd ci --no-audit --no-fund --cache "..\..\.cache\npm"
if errorlevel 1 (
  popd
  exit /b 1
)
call npm.cmd run build
set BUILD_RESULT=%ERRORLEVEL%
popd
if not "%BUILD_RESULT%"=="0" exit /b %BUILD_RESULT%
echo Dependencies and frontend build were refreshed.
pause
