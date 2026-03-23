[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$NssmPath,

    [string]$ServiceName = "MaterialsBackoffice",
    [string]$DisplayName = "Materials Backoffice",
    [string]$ListenHost = "0.0.0.0",
    [int]$ListenPort = 8000,
    [string]$PythonExe = "python"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsWindowsStorePython([string]$Path) {
    return $Path -like "*\WindowsApps\python*.exe" -or $Path -like "*\WindowsApps\PythonSoftwareFoundation.Python*"
}

function Resolve-PythonExecutable([string]$Candidate) {
    if (Test-Path $Candidate) {
        $resolvedPath = (Resolve-Path $Candidate).Path
        if (Test-IsWindowsStorePython $resolvedPath) {
            throw "O Python '$resolvedPath' vem da Microsoft Store/WindowsApps e nao deve ser usado para o servico. Usa um Python normal, por exemplo C:\Python313\python.exe ou AppData\Local\Python\python.exe."
        }
        return $resolvedPath
    }

    $command = Get-Command $Candidate -ErrorAction Stop
    $resolved = $command.Source

    if (Test-IsWindowsStorePython $resolved) {
        throw "O comando '$Candidate' resolve para '$resolved', que vem da Microsoft Store/WindowsApps. Indica explicitamente -PythonExe com um Python normal instalado fora de WindowsApps."
    }

    return $resolved
}

if (-not (Test-Path $NssmPath)) {
    throw "Nao encontrei o NSSM em '$NssmPath'."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$logDir = Join-Path $repoRoot "backend\logs"
$stdoutLog = Join-Path $logDir "service.stdout.log"
$stderrLog = Join-Path $logDir "service.stderr.log"
$resolvedPythonExe = Resolve-PythonExecutable $PythonExe
$arguments = "-m uvicorn backend.app.main:app --host $ListenHost --port $ListenPort"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if (-not $existingService) {
    & $NssmPath install $ServiceName $resolvedPythonExe $arguments
} else {
    & $NssmPath set $ServiceName Application $resolvedPythonExe
    & $NssmPath set $ServiceName AppParameters $arguments
}

& $NssmPath set $ServiceName AppDirectory $repoRoot
& $NssmPath set $ServiceName DisplayName $DisplayName
& $NssmPath set $ServiceName Description "FastAPI + frontend build do materials.backoffice"
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
& $NssmPath set $ServiceName AppStdout $stdoutLog
& $NssmPath set $ServiceName AppStderr $stderrLog
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateBytes 1048576
& $NssmPath set $ServiceName AppExit Default Restart

if ($existingService) {
    $existingService.Refresh()
    if ($existingService.Status -ne "Stopped") {
        Stop-Service -Name $ServiceName -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
    }
}

Start-Service -Name $ServiceName

Write-Host ""
Write-Host "Servico '$ServiceName' preparado e arrancado."
Write-Host "URL esperada: http://<IP-DO-PC>:$ListenPort/"
Write-Host "Logs:"
Write-Host "  $stdoutLog"
Write-Host "  $stderrLog"
