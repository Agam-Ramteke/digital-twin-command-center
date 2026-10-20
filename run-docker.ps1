<#
.SYNOPSIS
    Runs the full Digital Twin Command Center stack using Docker Compose.
.DESCRIPTION
    Launches Mosquitto (MQTT), MongoDB, FastAPI Backend, and Nginx Frontend in isolated containers.
#>

$dockerCandidates = @(
    "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin",
    "C:\Program Files\Docker\Docker\resources\bin",
    "C:\Program Files (x86)\Docker\Docker\resources\bin"
)
foreach ($bin in $dockerCandidates) {
    if (Test-Path $bin) {
        $env:PATH = "$bin;$env:PATH"
        break
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "    Digital Twin Command Center - Docker Compose Runner" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Test if Docker daemon is responsive
try {
    docker ps | Out-Null
    Write-Host "[OK] Docker daemon is running." -ForegroundColor Green
} catch {
    Write-Host "[!] Docker daemon is not running yet." -ForegroundColor Yellow
    Write-Host "[*] Please start Docker Desktop from your Start Menu / Desktop icon," -ForegroundColor Yellow
    Write-Host "    wait until the whale icon shows 'Engine running', and re-run this script." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "`n[*] Building and launching multi-container factory stack..." -ForegroundColor Green
Push-Location "$PSScriptRoot\dashboard"
docker compose up --build -d
Pop-Location

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " [OK] Digital Twin Stack is active in Docker!" -ForegroundColor Green
Write-Host " - Web Dashboard:      http://localhost:3000" -ForegroundColor White
Write-Host " - REST API / Swagger: http://localhost:8000/docs" -ForegroundColor White
Write-Host " - MQTT WebSocket:     ws://localhost:9001" -ForegroundColor White
Write-Host " - Mosquitto TCP:      mqtt://localhost:1883" -ForegroundColor White
Write-Host " - MongoDB 7.0:        mongodb://localhost:27017" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

Start-Process "http://localhost:3000"
