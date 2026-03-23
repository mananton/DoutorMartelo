[CmdletBinding()]
param(
    [string]$ServiceName = "MaterialsBackoffice",
    [switch]$SkipFrontendBuild,
    [switch]$SkipTests,
    [switch]$NoRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$frontendDir = Join-Path $repoRoot "frontend"

Set-Location $repoRoot

if (-not $SkipFrontendBuild) {
    if (Test-Path Env:VITE_API_BASE_URL) {
        Remove-Item Env:VITE_API_BASE_URL
    }

    Push-Location $frontendDir
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "Falha no build do frontend."
        }
    }
    finally {
        Pop-Location
    }
}

if (-not $SkipTests) {
    & python -m unittest backend.tests.test_api backend.tests.test_operational_serving
    if ($LASTEXITCODE -ne 0) {
        throw "Falha na validacao rapida do backend."
    }
}

if ($NoRestart) {
    Write-Host ""
    Write-Host "Atualizacao concluida sem restart."
    Write-Host "Quando houver janela segura, reinicia o backend ou o servico '$ServiceName'."
    exit 0
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    Restart-Service -Name $ServiceName -Force
    Write-Host ""
    Write-Host "Atualizacao concluida e servico '$ServiceName' reiniciado."
    exit 0
}

Write-Warning "Nao encontrei o servico '$ServiceName'."
Write-Host "O build e os testes ficaram feitos, mas tens de reiniciar manualmente o backend atual."
