[CmdletBinding()]
param(
    [string]$ListenHost = "0.0.0.0",
    [int]$ListenPort = 8000,
    [string]$PythonExe = "python"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

Write-Host "materials.backoffice: a arrancar backend em $ListenHost`:$ListenPort"
Write-Host "Repo root: $repoRoot"

& $PythonExe -m uvicorn "backend.app.main:app" --host $ListenHost --port $ListenPort

