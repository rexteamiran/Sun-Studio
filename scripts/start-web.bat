@echo off
rem Sun Studio web server — binds to localhost only.
cd /d "%~dp0"
set HOSTNAME=127.0.0.1
if "%PORT%"=="" set PORT=3570
node server.js
