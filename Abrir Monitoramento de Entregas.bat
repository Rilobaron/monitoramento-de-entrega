@echo off
set "APP_EXE=%~dp0electron-app\dist4\win-unpacked\Monitoramento de Entregas.exe"
if exist "%APP_EXE%" (
  start "" "%APP_EXE%"
  exit /b
)
cd /d "%~dp0electron-app"
npm start
