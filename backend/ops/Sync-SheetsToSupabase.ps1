[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$Json,
    [switch]$Strict,
    [string[]]$Entity,
    [switch]$ListEntities,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ForwardArgs
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
if ($ListEntities) {
    $arguments += "--list-entities"
}
foreach ($item in ($Entity | Where-Object { $_ })) {
    $arguments += "--entity"
    $arguments += $item
}
foreach ($item in ($ForwardArgs | Where-Object { $_ })) {
    $arguments += $item
}

& python @arguments
exit $LASTEXITCODE
