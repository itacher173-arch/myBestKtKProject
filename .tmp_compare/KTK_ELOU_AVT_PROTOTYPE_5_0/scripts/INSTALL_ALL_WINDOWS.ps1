$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "KTK ELOU-AVT: clean Windows installation" -ForegroundColor Cyan

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

function Ensure-WingetPackage {
    param(
        [string]$Command,
        [string]$PackageId,
        [string]$DisplayName
    )
    if (Get-Command $Command -ErrorAction SilentlyContinue) {
        Write-Host "$DisplayName already installed."
        return
    }
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw "winget was not found. Install Microsoft App Installer, then rerun this file."
    }
    Write-Host "Downloading and installing $DisplayName..." -ForegroundColor Yellow
    & winget.exe install --exact --id $PackageId --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) { throw "$DisplayName installation failed with code $LASTEXITCODE" }
    Refresh-Path
}

function Get-Python312 {
    $Launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($Launcher) {
        & py.exe -3.12 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" *> $null
        if ($LASTEXITCODE -eq 0) {
            return [PSCustomObject]@{ Exe = "py.exe"; PrefixArgs = @("-3.12") }
        }
    }

    $Candidates = @()
    $PythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($PythonCommand) { $Candidates += $PythonCommand.Source }
    $Candidates += "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe"
    $Candidates += "$env:ProgramFiles\Python312\python.exe"
    if (${env:ProgramFiles(x86)}) {
        $Candidates += "${env:ProgramFiles(x86)}\Python312\python.exe"
    }

    foreach ($Candidate in ($Candidates | Select-Object -Unique)) {
        if (-not $Candidate -or -not (Test-Path $Candidate)) { continue }
        & $Candidate -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" *> $null
        if ($LASTEXITCODE -eq 0) {
            return [PSCustomObject]@{ Exe = $Candidate; PrefixArgs = @() }
        }
    }
    return $null
}

$Python312 = Get-Python312
if (-not $Python312) {
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        throw "Python 3.12 was not found and winget is unavailable. Install Microsoft App Installer and rerun this file."
    }
    Write-Host "Python Launcher exists, but Python 3.12 runtime is missing. Installing Python 3.12..." -ForegroundColor Yellow
    & winget.exe install --exact --id "Python.Python.3.12" --scope user --force --accept-package-agreements --accept-source-agreements --silent
    if ($LASTEXITCODE -ne 0) { throw "Python 3.12 installation failed with code $LASTEXITCODE" }
    Refresh-Path
    $Python312 = Get-Python312
}
if (-not $Python312) {
    throw "Python 3.12 installation completed, but python.exe was not found. Restart Windows and rerun INSTALL_ALL_WINDOWS.cmd."
}
Write-Host "Python 3.12 runtime: $($Python312.Exe)"

Ensure-WingetPackage -Command "node.exe" -PackageId "OpenJS.NodeJS.LTS" -DisplayName "Node.js LTS"

$VenvArgs = @($Python312.PrefixArgs) + @("-m", "venv", ".venv")
& $Python312.Exe @VenvArgs
if ($LASTEXITCODE -ne 0) { throw "Python 3.12 failed to create the virtual environment." }

$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) { throw "Virtual Python environment was not created." }

Write-Host "Installing pinned Python dependencies..." -ForegroundColor Yellow
& $VenvPython -m pip install --upgrade pip
& $VenvPython -m pip install -r "requirements.txt"

$Npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $Npm) { throw "npm.cmd was not found after Node.js installation. Restart Windows and rerun the installer." }

Write-Host "Installing pinned frontend dependencies..." -ForegroundColor Yellow
$NpmCache = Join-Path $ProjectRoot ".cache\npm"
New-Item -ItemType Directory -Force -Path $NpmCache | Out-Null
Push-Location "apps\frontend"
try {
    & npm.cmd ci --no-audit --no-fund --cache $NpmCache
    if ($LASTEXITCODE -ne 0) { throw "npm.cmd ci failed" }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
} finally {
    Pop-Location
}

Write-Host "Running backend tests..." -ForegroundColor Yellow
& $VenvPython -m unittest discover -s tests -p "test_*.py" -v
if ($LASTEXITCODE -ne 0) { throw "Backend tests failed" }

Set-Content -Path ".installation-complete" -Value (Get-Date -Format "o") -Encoding UTF8
Write-Host "Ready. Run START_ALL_WINDOWS.cmd" -ForegroundColor Green
