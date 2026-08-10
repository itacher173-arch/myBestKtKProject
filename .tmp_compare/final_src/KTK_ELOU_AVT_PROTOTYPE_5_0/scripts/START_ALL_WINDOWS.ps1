$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$Frontend = Join-Path $ProjectRoot "apps\frontend\dist\index.html"
if (-not (Test-Path $Python)) { throw "Python environment not found. Run INSTALL_ALL_WINDOWS.cmd." }
if (-not (Test-Path $Frontend)) { throw "Frontend build not found. Run INSTALL_ALL_WINDOWS.cmd." }

$Runtime = Join-Path $ProjectRoot "runtime"
New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

$OldPidFile = Join-Path $Runtime "pids.json"
if (Test-Path $OldPidFile) {
    & (Join-Path $PSScriptRoot "STOP_ALL_WINDOWS.ps1") -Quiet
}

function Start-KtkService {
    param([string]$Name, [string]$Module, [string]$LogName)
    $Log = Join-Path $Runtime $LogName
    $ErrLog = Join-Path $Runtime ($LogName + ".err")
    $Process = Start-Process -FilePath $Python -ArgumentList "-m", $Module -WorkingDirectory $ProjectRoot -RedirectStandardOutput $Log -RedirectStandardError $ErrLog -WindowStyle Hidden -PassThru
    Write-Host "$Name started, PID $($Process.Id)"
    return $Process.Id
}

$Pids = [ordered]@{}
$Pids.simulator = Start-KtkService "Simulator" "services.simulator.app" "simulator.log"
$Pids.scenarios = Start-KtkService "Scenarios" "services.scenarios.app" "scenarios.log"
$Pids.training = Start-KtkService "Mini training" "services.training.app" "training.log"
$Pids.knowledge = Start-KtkService "Knowledge base" "services.knowledge.app" "knowledge.log"
$Pids.auth = Start-KtkService "Authorization" "services.auth.app" "auth.log"
$Pids.ai = Start-KtkService "AI assistant" "services.ai.app" "ai.log"
$Pids.gateway = Start-KtkService "Gateway" "services.gateway.app" "gateway.log"
$Pids | ConvertTo-Json | Set-Content -Path $OldPidFile -Encoding UTF8

$Ready = $false
for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
    try {
        $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 2
        if ($Health.status -eq "ok") { $Ready = $true; break }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $Ready) {
    throw "Services did not become ready. Check files in the runtime folder."
}

Write-Host "KTK ELOU-AVT is ready: http://127.0.0.1:8000" -ForegroundColor Green
Start-Process "http://127.0.0.1:8000"
