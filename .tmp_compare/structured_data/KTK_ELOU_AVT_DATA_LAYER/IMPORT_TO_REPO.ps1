param(
  [Parameter(Mandatory = $true)]
  [string]$RepoPath
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResolvedRepo = (Resolve-Path $RepoPath).Path

if (-not (Test-Path (Join-Path $ResolvedRepo ".git"))) {
  throw "The target is not a Git repository: $ResolvedRepo"
}

foreach ($Folder in @("data", "docs", "scripts\data")) {
  $Source = Join-Path $PackageRoot $Folder
  if (Test-Path $Source) {
    $Target = Join-Path $ResolvedRepo $Folder
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    Copy-Item -Path (Join-Path $Source "*") -Destination $Target -Recurse -Force
  }
}

Write-Host "Structured data copied to $ResolvedRepo"
Write-Host "Next: review git status and run scripts\data\validate_data.py"
