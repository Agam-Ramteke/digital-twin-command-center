@echo off
setlocal
title Digital Twin Docker Runner
echo Starting Digital Twin Docker Stack...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-docker.ps1"
if %errorlevel% neq 0 (
    echo Docker launch did not complete.
    pause
)
