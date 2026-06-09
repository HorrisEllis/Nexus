# Bridge OS BLE Backend v5.1.0 -- PowerShell 7 / .NET 6+
# .NET 6 loads WinRT via Windows.Win32.winmd or CsWinRT nuget
# But the simplest path: use Add-Type with the WinMD directly

$ErrorActionPreference = 'Continue'

function Emit([hashtable]$obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 3
    [Console]::Out.WriteLine($json)
    [Console]::Out.Flush()
}

# PS7/.NET 6 WinRT loading -- different from PS5.1
# Method: load System.Runtime.WindowsRuntime then use winmd reference
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime -ErrorAction Stop
} catch {}

# Try the ContentType=WindowsRuntime cast -- works in some PS7 builds
$loaded = $false
try {
    $null = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher, Windows.Devices.Bluetooth, ContentType=WindowsRuntime]
    $loaded = $true
} catch {}

if (-not $loaded) {
    # PS7 on Windows 11: load via full winmd path
    try {
        $winmd = "C:\Windows\System32\WinMetadata\Windows.Devices.winmd"
        Add-Type -Path $winmd -ErrorAction Stop
        $loaded = $true
    } catch {}
}

if (-not $loaded) {
    Emit @{ event='stateChange'; state='unsupported'; reason='Cannot load BLE WinRT types in PS7' }
    exit 1
}

$script:watcher    = $null
$script:scanning   = $false
$script:discovered = [System.Collections.Concurrent.ConcurrentQueue[hashtable]]::new()

Emit @{ event='stateChange'; state='poweredOn'; backend='winrt-ps7'; hasPeripheral=$false; address='unknown' }
Emit @{ event='ready'; backend='winrt-ps7'; pid=[System.Diagnostics.Process]::GetCurrentProcess().Id; hasPeripheral=$false; address='unknown' }

function Start-Scan {
    if ($script:scanning) { return }
    $script:watcher = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher]::new()
    $script:watcher.ScanningMode = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEScanningMode]::Active
    $script:watcher.Received += {
        param($s, $a)
        try {
            $addr    = $a.BluetoothAddress
            $hex     = $addr.ToString('X12')
            $addrStr = "$($hex.Substring(0,2)):$($hex.Substring(2,2)):$($hex.Substring(4,2)):$($hex.Substring(6,2)):$($hex.Substring(8,2)):$($hex.Substring(10,2))"
            $name    = $a.Advertisement.LocalName
            if (-not $name) { $name = '' }
            $rssi    = $a.RawSignalStrengthInDBm
            $script:discovered.Enqueue(@{ event='discover'; address=$addrStr; name=$name; rssi=$rssi; raw=$addr })
        } catch {}
    }
    $script:watcher.Stopped += { $script:scanning = $false }
    $script:watcher.Start()
    $script:scanning = $true
    Emit @{ event='scanStarted' }
}

function Stop-Scan {
    if ($script:watcher) { try { $script:watcher.Stop() } catch {} }
    $script:scanning = $false
    Emit @{ event='scanStopped' }
}

$timer = [System.Timers.Timer]::new(100)
$timer.add_Elapsed({
    $item = $null
    while ($script:discovered.TryDequeue([ref]$item)) { Emit $item }
})
$timer.Start()

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $line = $line.Trim()
    if (-not $line) { continue }
    try {
        $cmd = ($line | ConvertFrom-Json).cmd
        switch ($cmd) {
            'ping'     { Emit @{ event='pong'; ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } }
            'scan'     { Start-Scan }
            'stopScan' { Stop-Scan }
            'exit'     { break }
        }
    } catch { Emit @{ event='error'; reason="Loop: $($_.Exception.Message)" } }
}

$timer.Stop()
