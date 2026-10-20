@echo off
setlocal enabledelayedexpansion
title Digital Twin Command Center Launcher
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launcher.ps1" %*
if %ERRORLEVEL% neq 0 (
    echo.
    echo ==========================================================
    echo  Launcher finished or exited.
    echo ==========================================================
    pause
)
