@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [BLOCKED] Node.js 20+ was not found.
  echo [FIX] Install it, then reopen the terminal:
  echo winget install OpenJS.NodeJS.LTS
  exit /b 1
)

node "%~dp0scripts\startup\launcher.mjs" %*
exit /b %ERRORLEVEL%
