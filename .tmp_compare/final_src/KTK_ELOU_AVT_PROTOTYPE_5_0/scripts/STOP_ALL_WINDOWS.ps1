param([switch]$Quiet)
$ErrorActionPreference = "SilentlyContinue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $ProjectRoot "runtime\pids.json"

if (-not (Test-Path $PidFile)) {
    if (-not $Quiet) { Write-Host "No running KTK services were registered." }
    exit 0
}

$Pids = Get-Content $PidFile -Raw | ConvertFrom-Json
foreach ($Property in $Pids.PSObject.Properties) {
    $Process = Get-Process -Id ([int]$Property.Value) -ErrorAction SilentlyContinue
    if ($Process) {
        Stop-Process -Id $Process.Id -Force
        if (-not $Quiet) { Write-Host "$($Property.Name) stopped (PID $($Process.Id))." }
    }
}
Remove-Item $PidFile -Force
