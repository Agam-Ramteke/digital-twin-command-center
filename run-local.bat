@echo off
setlocal
title Digital Twin Command Center Launcher
echo Starting Digital Twin Command Center...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-local.ps1"
if %errorlevel% neq 0 (
    echo An error occurred while launching.
    pause
)
