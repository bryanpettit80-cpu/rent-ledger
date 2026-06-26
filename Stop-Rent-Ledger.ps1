$ErrorActionPreference = "Stop"

$StateDir = Join-Path $env:LOCALAPPDATA "RentLedger"
$StatePath = Join-Path $StateDir "server.json"

if (-not (Test-Path -LiteralPath $StatePath)) {
    Write-Host "No Rent Ledger server record was found."
    return
}

try {
    $serverState = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
    $pidToStop = [int]$serverState.pid
    $process = Get-Process -Id $pidToStop -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $pidToStop -Force
        Write-Host "Stopped Rent Ledger server process $pidToStop."
    } else {
        Write-Host "Rent Ledger server process $pidToStop was not running."
    }
    Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "Unable to stop the recorded Rent Ledger server: $($_.Exception.Message)"
}
