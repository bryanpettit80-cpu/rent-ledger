$ErrorActionPreference = "Stop"

$AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateDir = Join-Path $env:LOCALAPPDATA "RentLedger"
$StatePath = Join-Path $StateDir "server.json"
$FirewallRuleName = "Rent Ledger Mobile 4173-4199"
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Test-TcpPort {
    param(
        [string]$HostName,
        [int]$Port
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect($HostName, $Port, $null, $null)
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
    param(
        [string]$HostName,
        [int]$Port
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://$HostName`:$Port/index.html"
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

function Get-LanAddress {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.IPAddress -notlike "172.16.*" -and
            $_.IPAddress -notlike "172.17.*" -and
            $_.IPAddress -notlike "172.18.*" -and
            $_.IPAddress -notlike "172.19.*" -and
            $_.InterfaceAlias -notmatch "Loopback|vEthernet|VMware|VirtualBox|WSL|Docker"
        } |
        Sort-Object @{ Expression = { if ($_.InterfaceAlias -match "Wi-Fi|Wireless") { 0 } else { 1 } } }, InterfaceMetric |
        Select-Object -First 1

    if (-not $addresses) {
        throw "No usable LAN IPv4 address was found. Connect this PC to Wi-Fi or Ethernet and try again."
    }

    return $addresses
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Ensure-FirewallRule {
    if (Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue) {
        return "Firewall rule already exists: $FirewallRuleName"
    }

    if (-not (Test-IsAdministrator)) {
        return "Firewall rule was not added because this launcher is not elevated. If the phone cannot connect, right-click Start-Rent-Ledger-Mobile.cmd and choose Run as administrator, or run: New-NetFirewallRule -DisplayName `"$FirewallRuleName`" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4173-4199 -Profile Private"
    }

    New-NetFirewallRule -DisplayName $FirewallRuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort "4173-4199" -Profile Private | Out-Null
    return "Firewall rule added: $FirewallRuleName"
}

function Stop-RecordedServerIfNeeded {
    if (-not (Test-Path -LiteralPath $StatePath)) {
        return
    }

    try {
        $serverState = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
        if (-not $serverState.pid) {
            return
        }

        $process = Get-Process -Id ([int]$serverState.pid) -ErrorAction SilentlyContinue
        if (-not $process) {
            Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
            return
        }

        if ($serverState.bind -eq "0.0.0.0" -and $serverState.port -and (Test-RentLedgerServer -HostName "127.0.0.1" -Port ([int]$serverState.port))) {
            return
        }

        Stop-Process -Id ([int]$serverState.pid) -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    } catch {
        Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
    }
}

$lanAddress = Get-LanAddress
Stop-RecordedServerIfNeeded

$existingPort = $null
if (Test-Path -LiteralPath $StatePath) {
    try {
        $serverState = Get-Content -Raw -LiteralPath $StatePath | ConvertFrom-Json
        if ($serverState.port -and (Test-RentLedgerServer -HostName "127.0.0.1" -Port ([int]$serverState.port))) {
            $existingPort = [int]$serverState.port
        }
    } catch {
        $existingPort = $null
    }
}

if ($existingPort) {
    $desktopUrl = "http://127.0.0.1:$existingPort/index.html"
    $phoneUrl = "http://$($lanAddress.IPAddress):$existingPort/index.html"
    Set-Clipboard -Value $phoneUrl -ErrorAction SilentlyContinue
    Start-Process $desktopUrl
    Write-Host "Rent Ledger mobile server is already running."
    Write-Host "Desktop URL: $desktopUrl"
    Write-Host "Phone URL:   $phoneUrl"
    Write-Host "The phone URL has been copied to the clipboard."
    return
}

$port = 4173..4199 | Where-Object { -not (Test-TcpPort -HostName "127.0.0.1" -Port $_) } | Select-Object -First 1
if (-not $port) {
    throw "No free local port was found from 4173 through 4199."
}

$pythonLaunch = Get-PythonLaunch
$serverArgs = @($pythonLaunch.PrefixArgs + @("-m", "http.server", "$port", "--bind", "0.0.0.0"))
$process = Start-Process -FilePath $pythonLaunch.File -ArgumentList $serverArgs -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1

if (-not (Test-RentLedgerServer -HostName "127.0.0.1" -Port $port)) {
    try {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    } catch {
        # Startup failure below is the useful signal.
    }
    throw "The local Rent Ledger mobile server did not start."
}

$firewallStatus = Ensure-FirewallRule
$desktopUrl = "http://127.0.0.1:$port/index.html"
$phoneUrl = "http://$($lanAddress.IPAddress):$port/index.html"

@{
    pid = $process.Id
    port = $port
    bind = "0.0.0.0"
    appRoot = $AppRoot
    desktopUrl = $desktopUrl
    phoneUrl = $phoneUrl
    interfaceAlias = $lanAddress.InterfaceAlias
    ipAddress = $lanAddress.IPAddress
    startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $StatePath -Encoding UTF8

Set-Clipboard -Value $phoneUrl -ErrorAction SilentlyContinue
Start-Process $desktopUrl

Write-Host "Rent Ledger mobile server is running."
Write-Host "Desktop URL: $desktopUrl"
Write-Host "Phone URL:   $phoneUrl"
Write-Host "Wi-Fi/LAN:   $($lanAddress.InterfaceAlias) $($lanAddress.IPAddress)"
Write-Host $firewallStatus
Write-Host "The phone URL has been copied to the clipboard."
Write-Host "Use Stop-Rent-Ledger.cmd when you want to stop the local server."
