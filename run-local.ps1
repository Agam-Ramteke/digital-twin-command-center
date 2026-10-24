<#
.SYNOPSIS
    Starts the Digital Twin Command Center locally on Windows.
.DESCRIPTION
    Launches the FastAPI backend and Vite frontend in dedicated terminal processes.
#>

$root = $PSScriptRoot
$backendDir = Join-Path $root "dashboard\backend"
$frontendDir = Join-Path $root "dashboard\frontend"
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    Digital Twin Command Center - Local Launcher" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Backend venv verification
if (-not (Test-Path $venvPython)) {
    Write-Host "[!] Python venv not found at $venvPython" -ForegroundColor Yellow
    Write-Host "[*] Creating virtual environment..." -ForegroundColor White
    python -m venv (Join-Path $backendDir "venv")
    Write-Host "[*] Installing backend dependencies..." -ForegroundColor White
    & (Join-Path $backendDir "venv\Scripts\pip.exe") install -r (Join-Path $backendDir "requirements.txt")
}

# 2. Frontend dependencies verification
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "[!] Frontend node_modules not found. Running npm install..." -ForegroundColor Yellow
    Push-Location $frontendDir
    npm.cmd install
    Pop-Location
}

# 3. Start Backend
Write-Host "`n[*] Starting Backend (FastAPI + Causal Physics Engine) on http://127.0.0.1:8000..." -ForegroundColor Green
$backendCmd = "cd '$backendDir'; `$env:PYTHONPATH='.'; & '$venvPython' -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $backendCmd

Start-Sleep -Seconds 2

# 4. Start Frontend
Write-Host "[*] Starting Frontend (React + Vite) on http://localhost:5173..." -ForegroundColor Green
$frontendCmd = "cd '$frontendDir'; npm.cmd run dev"
Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $frontendCmd

Start-Sleep -Seconds 2

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " [OK] Digital Twin Command Center is running!" -ForegroundColor Green
Write-Host " - Web Dashboard:      http://localhost:5173" -ForegroundColor White
Write-Host " - REST API & Docs:    http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host " - Health Endpoint:    http://127.0.0.1:8000/health" -ForegroundColor White
Write-Host " - Readiness Probe:    http://127.0.0.1:8000/ready" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

# Open dashboard in browser
Start-Process "http://localhost:5173"
