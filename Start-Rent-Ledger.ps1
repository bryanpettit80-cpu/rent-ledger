$ErrorActionPreference = "Stop"

$AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateDir = Join-Path $env:LOCALAPPDATA "RentLedger"
$StatePath = Join-Path $StateDir "server.json"
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Test-TcpPort {
    param([int]$Port)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(300, $false)) {
            return $false
        }
        $client.EndConnect($result)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-RentLedgerServer {
    param([int]$Port)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://127.0.0.1:$Port/index.html"
        return ($response.StatusCode -eq 200 -and $response.Content -match "Rent Ledger")
    } catch {
        return $false
    }
}

function Get-PythonLaunch {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @{
            File = $python.Source
            PrefixArgs = @()
        }
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return @{
            File = $py.Source
            PrefixArgs = @("-3")
        }
    }

    throw "Python was not found. Install Python 3 or open index.html directly without PWA/offline support."
}

$existingPort = $null
if (Test-Path -LiteralPath $StatePath) {
    try {
        $serverState = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
        if ($serverState.port -and (Test-RentLedgerServer -Port ([int]$serverState.port))) {
            $existingPort = [int]$serverState.port
        }
    } catch {
        $existingPort = $null
    }
}

if (-not $existingPort -and (Test-RentLedgerServer -Port 4173)) {
    $existingPort = 4173
}

if ($existingPort) {
    $url = "http://127.0.0.1:$existingPort/index.html"
    Start-Process $url
    Write-Host "Rent Ledger is already running at $url"
    return
}

$port = 4173..4199 | Where-Object { -not (Test-TcpPort -Port $_) } | Select-Object -First 1
if (-not $port) {
    throw "No free local port was found from 4173 through 4199."
}

$pythonLaunch = Get-PythonLaunch
$serverArgs = @($pythonLaunch.PrefixArgs + @("-m", "http.server", "$port", "--bind", "127.0.0.1"))
$process = Start-Process -FilePath $pythonLaunch.File -ArgumentList $serverArgs -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1

if (-not (Test-RentLedgerServer -Port $port)) {
    try {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
        # Nothing else to do; the startup error below is the useful signal.
    }
    throw "The local Rent Ledger server did not start."
}

@{
    pid = $process.Id
    port = $port
    appRoot = $AppRoot
    startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding UTF8

$appUrl = "http://127.0.0.1:$port/index.html"
Start-Process $appUrl
Write-Host "Rent Ledger is running at $appUrl"
Write-Host "Server process id: $($process.Id)"
Write-Host "Use Stop-Rent-Ledger.cmd when you want to stop the local server."
