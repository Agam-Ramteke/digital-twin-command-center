<#
.SYNOPSIS
    Universal Initialization and Startup Launcher for Digital Twin Command Center.
.DESCRIPTION
    Detects Docker, Python, and Node.js. Auto-initializes dependencies (pip, npm, venv)
    and orchestrates startup via Docker Compose or Local Native mode.
#>

param(
    [string]$Mode = "" # "docker", "local", "stop", "clean"
)

$ErrorActionPreference = "Continue"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dashboardDir = Join-Path $root "dashboard"
$backendDir = Join-Path $dashboardDir "backend"
$frontendDir = Join-Path $dashboardDir "frontend"
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"

function Show-Header {
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "         DIGITAL TWIN COMMAND CENTER - SYSTEM LAUNCHER & INITIALIZER      " -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host ""
}

# -----------------------------------------------------------------------------
# 1. Probe System Capabilities (Docker, Python, Node)
# -----------------------------------------------------------------------------
function Probe-Docker {
    # Check if docker is in PATH or known Windows locations
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerCmd) {
        $candidates = @(
            "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin",
            "$env:ProgramFiles\Docker\Docker\resources\bin",
            "C:\Program Files\Docker\Docker\resources\bin"
        )
        foreach ($c in $candidates) {
            if (Test-Path (Join-Path $c "docker.exe")) {
                $env:PATH = "$c;$env:PATH"
                $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
                break
            }
        }
    }

    $dockerDesktopExe = @(
        "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    $isInstalled = ($dockerCmd -ne $null) -or ($dockerDesktopExe -ne $null)
    $isRunning = $false

    if ($dockerCmd) {
        try {
            $null = & docker ps 2>&1
            if ($LASTEXITCODE -eq 0) {
                $isRunning = $true
            }
        } catch {
            $isRunning = $false
        }
    }

    return @{
        Installed = $isInstalled
        Running   = $isRunning
        DesktopExe = $dockerDesktopExe
    }
}

function Probe-Python {
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pyCmd) {
        $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    }
    $ver = "Not installed"
    if ($pyCmd) {
        try {
            $ver = (& $pyCmd.Source --version 2>&1).ToString().Trim()
        } catch {
            $ver = "Found"
        }
    }
    return @{
        Available = ($pyCmd -ne $null)
        Version   = $ver
        Command   = $pyCmd
    }
}

function Probe-Node {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
    $ver = "Not installed"
    if ($nodeCmd) {
        try {
            $ver = (& $nodeCmd.Source --version 2>&1).ToString().Trim()
        } catch {
            $ver = "Found"
        }
    }
    return @{
        NodeAvailable = ($nodeCmd -ne $null)
        NpmAvailable  = ($npmCmd -ne $null)
        Version       = $ver
    }
}

# -----------------------------------------------------------------------------
# 2. Stop Instances Helper
# -----------------------------------------------------------------------------
function Stop-AllServices {
    Write-Host "`n[*] Stopping all active services and freeing ports..." -ForegroundColor Yellow

    # Stop Docker Compose if active
    $docker = Probe-Docker
    if ($docker.Running) {
        Write-Host " [*] Stopping Docker Compose containers..." -ForegroundColor White
        Push-Location $dashboardDir
        & docker compose down 2>&1 | Out-Null
        Pop-Location
    }

    # Terminate any stray local processes on standard ports (8000, 5173)
    $ports = @(8000, 5173)
    foreach ($port in $ports) {
        try {
            $lines = netstat -ano | Select-String ":$port\s+.*LISTENING"
            foreach ($line in $lines) {
                $parts = ($line.ToString().Trim() -split '\s+')
                $pidToKill = $parts[-1]
                if ($pidToKill -match '^\d+$' -and [int]$pidToKill -gt 0) {
                    Write-Host " [*] Terminating process on port $port (PID: $pidToKill)..." -ForegroundColor White
                    Stop-Process -Id [int]$pidToKill -Force -ErrorAction SilentlyContinue
                }
            }
        } catch {}
    }

    Write-Host "[OK] All running instances have been stopped." -ForegroundColor Green
    Start-Sleep -Seconds 1
}

# -----------------------------------------------------------------------------
# 3. Launch via Docker Compose
# -----------------------------------------------------------------------------
function Start-DockerMode {
    param($dockerInfo)

    if (-not $dockerInfo.Running) {
        if ($dockerInfo.DesktopExe) {
            Write-Host "`n[*] Starting Docker Desktop engine..." -ForegroundColor Yellow
            Start-Process $dockerInfo.DesktopExe
            Write-Host "[*] Waiting up to 30 seconds for Docker Engine to initialize..." -ForegroundColor White

            $waited = 0
            while ($waited -lt 30) {
                Start-Sleep -Seconds 2
                $waited += 2
                Write-Host -NoNewline "."
                try {
                    $null = & docker ps 2>&1
                    if ($LASTEXITCODE -eq 0) {
                        $dockerInfo.Running = $true
                        Write-Host " Ready!" -ForegroundColor Green
                        break
                    }
                } catch {}
            }
            Write-Host ""
        }

        if (-not $dockerInfo.Running) {
            Write-Host "[!] Docker Engine did not start in time." -ForegroundColor Yellow
            Write-Host "[*] Falling back to Local Native Mode (Python + Node)..." -ForegroundColor Cyan
            Start-LocalMode
            return
        }
    }

    Write-Host "`n[*] Initializing and building Docker containers..." -ForegroundColor Green
    Write-Host "    - Mosquitto MQTT Broker (1883 / 9001)" -ForegroundColor White
    Write-Host "    - MongoDB 7.0 Persistence (27017)" -ForegroundColor White
    Write-Host "    - FastAPI Digital Twin Backend (8000)" -ForegroundColor White
    Write-Host "    - Nginx React Production Frontend (3000)" -ForegroundColor White

    Push-Location $dashboardDir
    & docker compose up --build -d
    $composeExit = $LASTEXITCODE
    Pop-Location

    if ($composeExit -ne 0) {
        Write-Host "`n[!] Docker Compose build failed. Falling back to Local Native Mode..." -ForegroundColor Yellow
        Start-LocalMode
        return
    }

    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host " [OK] Digital Twin Command Center is running in Docker!" -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host " • Web Dashboard:       http://localhost:3000" -ForegroundColor White
    Write-Host " • What-If Studio:      http://localhost:3000/twin" -ForegroundColor White
    Write-Host " • REST API & Swagger:  http://localhost:8000/docs" -ForegroundColor White
    Write-Host " • System Healthcheck:  http://localhost:8000/health" -ForegroundColor White
    Write-Host " • MQTT Broker:         mqtt://localhost:1883 (WS: ws://localhost:9001)" -ForegroundColor White
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "Opening Dashboard in default browser..." -ForegroundColor Yellow

    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000/twin"
}

# -----------------------------------------------------------------------------
# 4. Launch via Local Native Stack (FastAPI + Vite)
# -----------------------------------------------------------------------------
function Start-LocalMode {
    Write-Host "`n[*] Initializing Local Native Stack (No Docker required)..." -ForegroundColor Cyan

    $py = Probe-Python
    if (-not $py.Available) {
        Write-Host "`n[ERROR] Python is not installed on this machine." -ForegroundColor Red
        Write-Host "Please install Python 3.10+ from https://www.python.org/downloads/ and re-run." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }

    $node = Probe-Node
    if (-not $node.NodeAvailable) {
        Write-Host "`n[ERROR] Node.js is not installed on this machine." -ForegroundColor Red
        Write-Host "Please install Node.js (LTS) from https://nodejs.org/ and re-run." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 1
    }

    # Step A: Python Virtual Environment Verification & Dependency Install
    if (-not (Test-Path $venvPython)) {
        Write-Host "`n[*] Creating Python virtual environment in dashboard\backend\venv..." -ForegroundColor Yellow
        Push-Location $backendDir
        & python -m venv "venv"
        Pop-Location
    }

    $venvPip = Join-Path $backendDir "venv\Scripts\pip.exe"
    Write-Host "[*] Verifying backend Python dependencies..." -ForegroundColor White
    & $venvPip install -q --disable-pip-version-check -r (Join-Path $backendDir "requirements.txt")

    # Step B: Frontend node_modules Verification & Dependency Install
    $nodeModules = Join-Path $frontendDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "`n[*] Installing frontend npm dependencies (this only happens once)..." -ForegroundColor Yellow
        Push-Location $frontendDir
        npm.cmd install
        Pop-Location
    }

    # Step C: Free ports 8000 & 5173 if busy
    Stop-AllServices

    # Step D: Launch Backend in dedicated window
    Write-Host "`n[*] Starting Backend (FastAPI Causal Twin) on http://127.0.0.1:8000..." -ForegroundColor Green
    $backendRunner = "title Digital Twin Backend & cd /d `"$backendDir`" & set PYTHONPATH=. & .\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
    Start-Process cmd.exe -ArgumentList "/k", $backendRunner

    Start-Sleep -Seconds 2

    # Step E: Launch Frontend in dedicated window
    Write-Host "[*] Starting Frontend (React + Vite) on http://localhost:5173..." -ForegroundColor Green
    $frontendRunner = "title Digital Twin Frontend & cd /d `"$frontendDir`" & npm.cmd run dev"
    Start-Process cmd.exe -ArgumentList "/k", $frontendRunner

    Start-Sleep -Seconds 2

    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host " [OK] Digital Twin Command Center is running locally!" -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host " • Web Dashboard:       http://localhost:5173" -ForegroundColor White
    Write-Host " • What-If Studio:      http://localhost:5173/twin" -ForegroundColor White
    Write-Host " • REST API & Swagger:  http://127.0.0.1:8000/docs" -ForegroundColor White
    Write-Host " • System Healthcheck:  http://127.0.0.1:8000/health" -ForegroundColor White
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "Opening Dashboard in default browser..." -ForegroundColor Yellow

    Start-Process "http://localhost:5173/twin"
}

# -----------------------------------------------------------------------------
# 5. Interactive Orchestrator
# -----------------------------------------------------------------------------
Show-Header

$docker = Probe-Docker
$py = Probe-Python
$node = Probe-Node

Write-Host "Detected Environment Capabilities:" -ForegroundColor White
if ($docker.Running) {
    Write-Host "  [OK] Docker Engine:      Running & Ready" -ForegroundColor Green
} elseif ($docker.Installed) {
    Write-Host "  [!]  Docker Engine:      Installed, but daemon not active" -ForegroundColor Yellow
} else {
    Write-Host "  [-]  Docker Engine:      Not installed" -ForegroundColor DarkGray
}

if ($py.Available) {
    Write-Host "  [OK] Python Runtime:     $($py.Version)" -ForegroundColor Green
} else {
    Write-Host "  [-]  Python Runtime:     Not found" -ForegroundColor Red
}

if ($node.NodeAvailable) {
    Write-Host "  [OK] Node.js & NPM:      $($node.Version)" -ForegroundColor Green
} else {
    Write-Host "  [-]  Node.js & NPM:      Not found" -ForegroundColor Red
}

Write-Host "--------------------------------------------------------------------------" -ForegroundColor DarkGray

# Check explicit command line parameters
if ($Mode -eq "docker") {
    Start-DockerMode -dockerInfo $docker
    exit 0
} elseif ($Mode -eq "local") {
    Start-LocalMode
    exit 0
} elseif ($Mode -eq "stop") {
    Stop-AllServices
    exit 0
}

# Auto-selection logic
$defaultChoice = "1"
if (-not $docker.Installed -and -not $docker.Running) {
    $defaultChoice = "2"
}

Write-Host "Select Startup Mode:" -ForegroundColor Cyan
if ($docker.Running) {
    Write-Host "  [1] Docker Compose Stack (Full Stack: MongoDB + Mosquitto + FastAPI + Nginx)" -ForegroundColor White
    Write-Host "  [2] Local Native Stack   (FastAPI + Vite - Lightweight, no containers)" -ForegroundColor White
    Write-Host "  [3] Stop All Running Instances" -ForegroundColor White
    Write-Host "  [4] Exit" -ForegroundColor White
    Write-Host ""
    Write-Host "Press [1-4] or wait 5 seconds for default [1]..." -ForegroundColor Yellow
} elseif ($docker.Installed) {
    Write-Host "  [1] Start Docker Desktop & Launch Full Stack" -ForegroundColor White
    Write-Host "  [2] Local Native Stack   (FastAPI + Vite - Fast & Recommended)" -ForegroundColor White
    Write-Host "  [3] Stop All Running Instances" -ForegroundColor White
    Write-Host "  [4] Exit" -ForegroundColor White
    Write-Host ""
    Write-Host "Press [1-4] or wait 5 seconds for default [2]..." -ForegroundColor Yellow
    $defaultChoice = "2"
} else {
    Write-Host "  [1] Local Native Stack   (FastAPI + Vite - Auto-initializes venv & npm)" -ForegroundColor White
    Write-Host "  [2] Stop All Running Instances" -ForegroundColor White
    Write-Host "  [3] Exit" -ForegroundColor White
    Write-Host ""
    Write-Host "Press [1-3] or wait 5 seconds for default [1]..." -ForegroundColor Yellow
    $defaultChoice = "1"
}

# 5-second non-blocking countdown
$choice = $null
$secondsLeft = 5
while ($secondsLeft -gt 0) {
    if ([Console]::KeyAvailable) {
        $key = [Console]::ReadKey($true)
        $choice = $key.KeyChar.ToString()
        break
    }
    Start-Sleep -Milliseconds 250
    $subSeconds = 250
    # Update timer every 1s
    if (($secondsLeft * 1000) % 1000 -eq 0) {
        Write-Host -NoNewline "`rAuto-booting in ${secondsLeft}s (press 1-4 to choose)... "
    }
    $secondsLeft -= 0.25
}
Write-Host ""

if ([string]::IsNullOrWhiteSpace($choice)) {
    $choice = $defaultChoice
}

# Handle choice
if ($docker.Installed) {
    switch ($choice) {
        "1" { Start-DockerMode -dockerInfo $docker }
        "2" { Start-LocalMode }
        "3" { Stop-AllServices }
        "4" { exit 0 }
        default { Start-DockerMode -dockerInfo $docker }
    }
} else {
    switch ($choice) {
        "1" { Start-LocalMode }
        "2" { Stop-AllServices }
        "3" { exit 0 }
        default { Start-LocalMode }
    }
}
