@echo off
rem Double-click to start the FMP server. All checks live in start-server.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1" %*
