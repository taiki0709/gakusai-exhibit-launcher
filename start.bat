@echo off
rem Starts the launcher server and opens Edge in full-screen kiosk mode.
rem To close the kiosk screen: press Alt+F4.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Please install it from https://nodejs.org
  pause
  exit /b
)

start "tenji-server" /min cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" msedge --kiosk http://localhost:3000 --edge-kiosk-type=fullscreen --no-first-run --autoplay-policy=no-user-gesture-required --user-data-dir="%TEMP%\tenji-kiosk"
