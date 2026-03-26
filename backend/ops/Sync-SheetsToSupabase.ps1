[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Json,
    [switch]$Strict
)

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

$arguments = @("backend/scripts/sync_sheets_to_supabase.py")
if ($Apply) {
    $arguments += "--apply"
}
if ($Json) {
    $arguments += "--json"
}
if ($Strict) {
    $arguments += "--strict"
}

& python @arguments
exit $LASTEXITCODE
