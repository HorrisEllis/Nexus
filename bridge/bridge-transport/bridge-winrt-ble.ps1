# bridge-winrt-ble.ps1  v2.0.0
# Bridge OS -- WinRT BLE host process (Central + Peripheral)
#
# Runs as a persistent child process spawned by bridge-winrt.js.
# Speaks a JSON line protocol on stdin/stdout.
# Uses Windows 10 1703+ built-in WinRT Bluetooth APIs.
# No external dependencies. Uses the internal hardware Bluetooth chip.
#
# Central role  (finding and connecting to other nodes):
#   BluetoothLEAdvertisementWatcher + BluetoothLEDevice + GattCharacteristic
#
# Peripheral role (advertising ourselves, accepting connections):
#   BluetoothLEAdvertisementPublisher -- makes us discoverable
#   GattServiceProvider               -- hosts the NUS GATT service locally
#   GattLocalCharacteristic           -- TX (remote writes) + RX (we notify)
#
# Commands (Node -> PS, one JSON line each):
#   startScanning   { serviceUUIDs[], allowDups }
#   stopScanning
#   startAdvertising{ localName, serviceUUID }
#   stopAdvertising
#   connect         { address }
#   disconnect      { address }
#   requestMtu      { address, mtu }
#   discoverServices{ address, serviceUUIDs[], charUUIDs[] }
#   write           { address, charUUID, data:base64, withoutResponse }
#   subscribe       { address, charUUID }
#   notify          { charUUID, data:base64 }   <- push data to all subscribed centrals
#   ping
#   exit
#
# Events (PS -> Node, one JSON line each):
#   stateChange     { state, backend }
#   ready           { backend, pid, address, hasPeripheral }
#   scanStarted / scanStopped
#   advertisingStarted / advertisingStopped / advertisingError { reason }
#   discover        { address, name, rssi, raw }
#   connecting / connected / disconnected { address }
#   mtuNegotiated   { address, mtu }
#   servicesDiscovered { address, characteristics[] }
#   subscribed      { address, charUUID }
#   data            { address, charUUID, data:base64 }   <- central wrote to us
#   centralConnected    { address }                      <- a central connected to us
#   centralDisconnected { address }
#   notified        { charUUID, recipients }             <- notify delivered
#   error           { address, reason }
#   pong            { ts }

param()
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8

# -- WinRT loader --------------------------------------------------------------
function Load-WinRT {
    # Load System.Runtime.WindowsRuntime for AsTask/AsTaskAction helpers
    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    # Windows 11 24H2 (build 26xxx) broke the multi-line type-cast syntax:
    #   [TypeName, AssemblyName, ContentType = WindowsRuntime]
    # Use the WinRT type-loading helper instead -- works on Win10 1703+ through Win11 24H2.
    $loader = [System.Type]::GetType(
        'Windows.Foundation.UniversalApiContract, Windows.Foundation.UniversalApiContract, ContentType=WindowsRuntime'
    )
    if ($null -eq $loader) {
        # Fallback: load via reflection through a known WinRT type
        [Windows.Storage.Streams.Buffer, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    }

    # Load each required namespace using the safe single-line form
    [Windows.Devices.Bluetooth.BluetoothAdapter, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
    [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
    [Windows.Devices.Bluetooth.GenericAttributeProfile.GattServiceProvider, Windows.Devices.Bluetooth, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
    [Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null

}

# Get adapter via DeviceInformation selector -- works in child processes on Win11 24H2
# GetDefaultAsync() returns null in child processes without bluetooth capability declaration
function Get-BLEAdapter {
    # Null-safe wrapper -- GetDefaultAsync() itself can return null on Win11 24H2
    # when called from a child process. Guard every call.
    try {
        $op = [Windows.Devices.Bluetooth.BluetoothAdapter]::GetDefaultAsync()
    } catch { $op = $null }

    if ($null -ne $op) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        while ($op.Status.ToString() -eq 'Started' -and $sw.ElapsedMilliseconds -lt 3000) {
            Start-Sleep -Milliseconds 100
        }
        if ($op.Status.ToString() -eq 'Completed') {
            $a = $op.GetResults()
            if ($null -ne $a) { return $a }
        }
    }

    # Fallback: enumerate via DeviceInformation selector
    try { $selector = [Windows.Devices.Bluetooth.BluetoothAdapter]::GetDeviceSelector() } catch { return $null }
    try { $devOp = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector) } catch { return $null }
    if ($null -eq $devOp) { return $null }
    $sw2 = [System.Diagnostics.Stopwatch]::StartNew()
    while ($devOp.Status.ToString() -eq 'Started' -and $sw2.ElapsedMilliseconds -lt 5000) {
        Start-Sleep -Milliseconds 100
    }
    if ($devOp.Status.ToString() -ne 'Completed') { return $null }
    $devs = $devOp.GetResults()
    if ($null -eq $devs -or $devs.Count -eq 0) { return $null }

    # Get adapter from first device ID
    try { $fromIdOp = [Windows.Devices.Bluetooth.BluetoothAdapter]::FromIdAsync($devs[0].Id) } catch { return $null }
    if ($null -eq $fromIdOp) { return $null }
    $sw3 = [System.Diagnostics.Stopwatch]::StartNew()
    while ($fromIdOp.Status.ToString() -eq 'Started' -and $sw3.ElapsedMilliseconds -lt 5000) {
        Start-Sleep -Milliseconds 100
    }
    if ($fromIdOp.Status.ToString() -ne 'Completed') { return $null }
    return $fromIdOp.GetResults()
}

# Await-WinRT: spin-wait on IAsyncOperation.Status
# Null-safe: throws descriptive error if op is null (AWAIT-01)
# Works on PS5.1 + Win10 1703 through Win11 24H2 -- no reflection, no AsTask
function Await-WinRT {
    param($AsyncOp, [int]$TimeoutMs = 15000)
    if ($null -eq $AsyncOp) { throw "Await-WinRT: AsyncOp is null -- WinRT call returned null (permissions or device not ready)" }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($AsyncOp.Status.ToString() -eq 'Started' -and $sw.ElapsedMilliseconds -lt $TimeoutMs) {
        Start-Sleep -Milliseconds 50
    }
    $status = $AsyncOp.Status.ToString()
    if ($status -eq 'Error') {
        $ec = try { $AsyncOp.ErrorCode } catch { $null }
        throw "WinRT op error: $($ec)"
    }
    if ($status -ne 'Completed') {
        throw "WinRT op did not complete: $status after $($sw.ElapsedMilliseconds)ms"
    }
    return $AsyncOp.GetResults()
}

# Alias kept for call-site compatibility
function Await2 {
    param($AsyncOp, [int]$TimeoutMs = 15000)
    return Await-WinRT $AsyncOp $TimeoutMs
}

# IAsyncAction awaiter -- spin-wait, null-safe
function Await-Action {
    param($AsyncAction, [int]$TimeoutMs = 10000)
    if ($null -eq $AsyncAction) { throw "Await-Action: AsyncAction is null" }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($AsyncAction.Status.ToString() -eq 'Started' -and $sw.ElapsedMilliseconds -lt $TimeoutMs) {
        Start-Sleep -Milliseconds 50
    }
    $status = $AsyncAction.Status.ToString()
    if ($status -ne 'Completed') {
        throw "WinRT action did not complete: $status after $($sw.ElapsedMilliseconds)ms"
    }
}

function Buffer-ToBase64 {
    param($IBuffer)
    if ($null -eq $IBuffer -or $IBuffer.Length -eq 0) { return '' }
    try {
        $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($IBuffer)
        $bytes  = New-Object byte[] $IBuffer.Length
        $reader.ReadBytes($bytes)
        $reader.DetachBuffer()
        return [Convert]::ToBase64String($bytes)
    } catch { return '' }
}

function Base64-ToBuffer {
    param([string]$B64)
    if ([string]::IsNullOrEmpty($B64)) { throw "Base64-ToBuffer: empty input" }
    try {
        $bytes  = [Convert]::FromBase64String($B64)
        $writer = New-Object Windows.Storage.Streams.DataWriter
        $writer.WriteBytes($bytes)
        return $writer.DetachBuffer()
    } catch { throw "Base64-ToBuffer failed: $($_.Exception.Message)" }
}

function Bytes-ToBuffer {
    param([byte[]]$Bytes)
    $writer = New-Object Windows.Storage.Streams.DataWriter
    $writer.WriteBytes($Bytes)
    return $writer.DetachBuffer()
}

function Emit {
    param([hashtable]$Obj)
    try {
        $json = $Obj | ConvertTo-Json -Compress -Depth 6
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
    } catch {}
}

function Emit-Error {
    param([string]$Reason, [string]$Address = '')
    Emit @{ event = 'error'; address = $Address; reason = $Reason }
}

# -- Script-level state --------------------------------------------------------
$script:watcher        = $null
$script:blew           = $null      # BLEWatcher C# inline class
$script:scanThread     = $null
$script:scanning       = $false
$script:rawAddressMap  = @{}        # addrStr -> uint64
$script:devices        = @{}        # addrStr -> BluetoothLEDevice
$script:services       = @{}        # addrStr -> hashtable{uuid->GattDeviceService}
$script:chars          = @{}        # addrStr -> hashtable{uuid->GattCharacteristic}

# Peripheral state
$script:publisher      = $null      # BluetoothLEAdvertisementPublisher
$script:serviceProvider = $null     # GattServiceProvider
$script:localTxChar    = $null      # GattLocalCharacteristic (write -- central->us)
$script:localRxChar    = $null      # GattLocalCharacteristic (notify -- us->central)
$script:advertising    = $false
$script:subscribedSessions = [System.Collections.Generic.List[object]]::new()

# -- Initialise ----------------------------------------------------------------
# Strategy: skip BluetoothAdapter.GetDefaultAsync() entirely.
# That call returns null in child processes on Win11 24H2 (no app manifest/capability).
# BluetoothLEAdvertisementWatcher does NOT require adapter enumeration -- it
# goes directly to the Bluetooth radio via the watcher service.
# We prove BLE is available by constructing the watcher. If it throws, BLE is unavailable.
# Peripheral role and adapter address are discovered lazily on first use.
$script:adapterAddrStr = 'unknown'
$script:hasPeripheral  = $false

try {
    Load-WinRT

    # Probe: can we construct a watcher? This works in any process on Win10 1703+
    # and does not require GetDefaultAsync or any capability declaration.
    $probe = New-Object Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher
    if ($null -eq $probe) {
        Emit @{ event = 'stateChange'; state = 'unsupported'; reason = 'BluetoothLEAdvertisementWatcher unavailable' }
        exit 1
    }
    # If we got here, BLE scanning is available.
    # Try to get adapter address (best-effort -- not required for scanning)
    try {
        $adapterOp = [Windows.Devices.Bluetooth.BluetoothAdapter]::GetDefaultAsync()
        if ($null -ne $adapterOp) {
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            while ($adapterOp.Status.ToString() -eq 'Started' -and $sw.ElapsedMilliseconds -lt 2000) {
                Start-Sleep -Milliseconds 100
            }
            if ($adapterOp.Status.ToString() -eq 'Completed') {
                $ad = $adapterOp.GetResults()
                if ($null -ne $ad) {
                    $script:hasPeripheral  = [bool]$ad.IsPeripheralRoleSupported
                    $addrHex               = '{0:X12}' -f $ad.BluetoothAddress
                    $script:adapterAddrStr = ($addrHex -split '(..)' | Where-Object { $_ }) -join ':'
                }
            }
        }
    } catch {}   # adapter address is cosmetic -- never fatal

    Emit @{
        event         = 'stateChange'
        state         = 'poweredOn'
        backend       = 'winrt-native'
        hasPeripheral = $script:hasPeripheral
        address       = $script:adapterAddrStr
    }
} catch {
    $errLine = $_.InvocationInfo.ScriptLineNumber
    $errMsg  = $_.Exception.Message
    Emit @{ event = 'stateChange'; state = 'poweredOff'; reason = "line:$errLine -- $errMsg" }
    exit 1
}

# -- Central: Scanning ---------------------------------------------------------
function Start-BLEScan {
    param([string[]]$ServiceUUIDs = @(), [bool]$AllowDups = $true)
    if ($script:scanning) { return }

    $script:watcher = New-Object Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher
    $script:watcher.ScanningMode = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEScanningMode]::Active

    if ($ServiceUUIDs.Count -gt 0) {
        foreach ($u in $ServiceUUIDs) {
            try { $script:watcher.AdvertisementFilter.Advertisement.ServiceUuids.Add([Guid]$u) } catch {}
        }
    }

    # PS5.1 cannot subscribe to WinRT events via add_Received or Register-ObjectEvent.
    # Solution: compile a tiny C# class inline that subscribes to the event natively
    # and queues results into a ConcurrentQueue that PS5.1 can poll safely.
    if (-not ([System.Management.Automation.PSTypeName]'BLEWatcher').Type) {
        Add-Type -TypeDefinition @"
using System;
using System.Collections.Concurrent;
using Windows.Devices.Bluetooth.Advertisement;
public class BLEWatcher {
    public ConcurrentQueue<string> Events = new ConcurrentQueue<string>();
    private BluetoothLEAdvertisementWatcher w;
    public BLEWatcher() {
        w = new BluetoothLEAdvertisementWatcher();
        w.ScanningMode = BluetoothLEScanningMode.Active;
        w.Received += (s, a) => {
            try {
                ulong addr = a.BluetoothAddress;
                string hex = addr.ToString("X12");
                string addrStr = hex.Substring(0,2)+":"+hex.Substring(2,2)+":"+hex.Substring(4,2)+":"+hex.Substring(6,2)+":"+hex.Substring(8,2)+":"+hex.Substring(10,2);
                string name = a.Advertisement.LocalName ?? "";
                int rssi = a.RawSignalStrengthInDBm;
                Events.Enqueue(addrStr + "|" + name + "|" + rssi + "|" + addr.ToString());
            } catch {}
        };
        w.Stopped += (s, a) => { Events.Enqueue("__stopped__"); };
    }
    public void Start() { w.Start(); }
    public void Stop()  { try { w.Stop(); } catch {} }
}
"@ -ReferencedAssemblies @(
            [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher].Assembly.Location
        )
    }

    $script:blew = New-Object BLEWatcher
    $script:blew.Start()
    $script:scanning = $true
    Emit @{ event = 'scanStarted' }

    # Poll the queue on a background thread so the command loop stays responsive
    $script:scanThread = [System.Threading.ThreadPool]::QueueUserWorkItem({
        while ($script:scanning) {
            $item = $null
            while ($script:blew.Events.TryDequeue([ref]$item)) {
                if ($item -eq '__stopped__') {
                    $script:scanning = $false
                    Emit @{ event = 'scanStopped' }
                } else {
                    $parts = $item -split '\|', 4
                    if ($parts.Count -ge 4) {
                        $addrStr = $parts[0]
                        $script:rawAddressMap[$addrStr] = [uint64]$parts[3]
                        Emit @{ event = 'discover'; address = $addrStr; name = $parts[1]; rssi = [int]$parts[2]; raw = [uint64]$parts[3] }
                    }
                }
            }
            Start-Sleep -Milliseconds 50
        }
    })
}

function Stop-BLEScan {
    if ($script:blew -and $script:scanning) {
        try { $script:blew.Stop() } catch {}
        $script:scanning = $false
    }
}

# -- Peripheral: Advertising ---------------------------------------------------
function Start-Advertising {
    param([string]$LocalName = 'BRIDGE', [string]$ServiceUUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e')

    if ($script:advertising) { Stop-Advertising }

    try {
        # -- Publisher: makes us visible in BLE scans --------------------------
        $script:publisher = New-Object Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementPublisher

        # Advertisement property is read-only in newer WinRT -- modify in-place
        try { $script:publisher.Advertisement.LocalName = $LocalName } catch {}
        try {
            $svcGuid = [Guid]$ServiceUUID
            $script:publisher.Advertisement.ServiceUuids.Add($svcGuid)
        } catch {}

        $script:publisher.add_StatusChanged({
            param($pub, $args)
            $status = $args.Status.ToString()
            if ($status -eq 'Started') {
                $script:advertising = $true
                Emit @{ event = 'advertisingStarted'; localName = $LocalName }
            } elseif ($status -eq 'Stopped') {
                $script:advertising = $false
                Emit @{ event = 'advertisingStopped' }
            } elseif ($status -eq 'Aborted') {
                $script:advertising = $false
                $err = $args.Error
                Emit @{ event = 'advertisingError'; reason = "Aborted: $err" }
            }
        })

        $script:publisher.Start()

        # -- GattServiceProvider: hosts the actual NUS GATT service ------------
        # This creates a real GATT server on the hardware adapter.
        # Other devices can connect and write to our characteristics.
        $svcGuid    = [Guid]$ServiceUUID
        $svcParams  = New-Object Windows.Devices.Bluetooth.GenericAttributeProfile.GattServiceProviderAdvertisingParameters
        $svcParams.IsConnectable   = $true
        $svcParams.IsDiscoverable  = $true

        $svcResult  = Await-WinRT ([Windows.Devices.Bluetooth.GenericAttributeProfile.GattServiceProvider]::CreateAsync($svcGuid))
        if ($svcResult.Error.ToString() -ne 'Success') {
            Emit @{ event = 'advertisingError'; reason = "GattServiceProvider create failed: $($svcResult.Error)" }
            return
        }
        $script:serviceProvider = $svcResult.ServiceProvider

        # -- TX characteristic: central writes to this (we receive data) -------
        $txGuid    = [Guid]'6e400002-b5a3-f393-e0a9-e50e24dcca9e'
        $txParams  = New-Object Windows.Devices.Bluetooth.GenericAttributeProfile.GattLocalCharacteristicParameters
        $txParams.CharacteristicProperties = `
            [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::Write -bor `
            [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::WriteWithoutResponse
        $txParams.WriteProtectionLevel = `
            [Windows.Devices.Bluetooth.GenericAttributeProfile.GattProtectionLevel]::Plain
        $txParams.UserDescription = 'Bridge TX'

        $txResult = Await-WinRT ($script:serviceProvider.Service.CreateCharacteristicAsync($txGuid, $txParams))
        if ($txResult.Error.ToString() -ne 'Success') {
            Emit @{ event = 'advertisingError'; reason = "TX char failed: $($txResult.Error)" }
            return
        }
        $script:localTxChar = $txResult.Characteristic

        # Handle incoming writes from centrals
        $script:localTxChar.add_WriteRequested({
            param($char, $args)
            $deferral = $args.GetDeferral()
            try {
                $session = $args.Session
                $addr    = 'central'
                try {
                    $btAddr  = $session.DeviceId.Id
                    # Extract address from DeviceId string (format varies)
                    if ($btAddr -match '([0-9A-Fa-f]{12})') {
                        $hex     = $matches[1]
                        $addr    = ($hex -split '(..)' | Where-Object { $_ }) -join ':'
                    }
                } catch {}

                $request = $args.GetRequestAsync() | ForEach-Object { Await-WinRT $_ }
                if ($request.Value.Length -gt 0) {
                    $b64 = Buffer-ToBase64 $request.Value
                    Emit @{
                        event    = 'data'
                        address  = $addr
                        charUUID = '6e400002b5a3f393e0a9e50e24dcca9e'
                        data     = $b64
                    }
                }
                if ($request.Option -eq [Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteOption]::WriteWithResponse) {
                    $request.Respond()
                }
            } catch {
                Emit-Error "WriteRequested: $($_.Exception.Message)"
            } finally {
                $deferral.Complete()
            }
        })

        # -- RX characteristic: we notify centrals on this (we send data) ------
        $rxGuid   = [Guid]'6e400003-b5a3-f393-e0a9-e50e24dcca9e'
        $rxParams = New-Object Windows.Devices.Bluetooth.GenericAttributeProfile.GattLocalCharacteristicParameters
        $rxParams.CharacteristicProperties = `
            [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::Notify
        $rxParams.WriteProtectionLevel = `
            [Windows.Devices.Bluetooth.GenericAttributeProfile.GattProtectionLevel]::Plain
        $rxParams.UserDescription = 'Bridge RX'

        $rxResult = Await-WinRT ($script:serviceProvider.Service.CreateCharacteristicAsync($rxGuid, $rxParams))
        if ($rxResult.Error.ToString() -ne 'Success') {
            Emit @{ event = 'advertisingError'; reason = "RX char failed: $($rxResult.Error)" }
            return
        }
        $script:localRxChar = $rxResult.Characteristic

        # Track which centrals have subscribed to notifications
        $script:localRxChar.add_SubscribedClientsChanged({
            param($char, $args)
            $count = $char.SubscribedClients.Count
            $script:subscribedSessions = $char.SubscribedClients
            Emit @{ event = 'subscribersChanged'; count = $count }
        })

        # Session (central) connect/disconnect events via GattSession
        $script:serviceProvider.add_AdvertisementStatusChanged({
            param($p, $args)
        })

        # Start the GATT service
        $script:serviceProvider.StartAdvertising($svcParams)

    } catch {
        Emit @{ event = 'advertisingError'; reason = $_.Exception.Message }
    }
}

function Stop-Advertising {
    if ($script:publisher) {
        try { $script:publisher.Stop() } catch {}
        $script:publisher = $null
    }
    if ($script:serviceProvider) {
        try { $script:serviceProvider.StopAdvertising() } catch {}
        $script:serviceProvider = $null
    }
    $script:localTxChar = $null
    $script:localRxChar = $null
    $script:advertising = $false
    $script:subscribedSessions = [System.Collections.Generic.List[object]]::new()
    Emit @{ event = 'advertisingStopped' }
}

# -- Peripheral: Notify (push data to connected centrals) ---------------------
function Send-Notify {
    param([string]$CharUUID, [string]$DataB64)
    if (-not $script:localRxChar) {
        Emit-Error "Not advertising -- call startAdvertising first"
        return
    }
    try {
        $buf        = Base64-ToBuffer $DataB64
        $recipients = 0
        foreach ($session in $script:subscribedSessions) {
            try {
                Await-WinRT ($script:localRxChar.NotifyValueAsync($buf, $session))
                $recipients++
            } catch {}
        }
        Emit @{ event = 'notified'; charUUID = $CharUUID; recipients = $recipients }
    } catch {
        Emit-Error "Notify failed: $($_.Exception.Message)"
    }
}

# -- Central: Connect ----------------------------------------------------------
function Connect-Device {
    param([string]$Address, [uint64]$RawAddr)
    try {
        Emit @{ event = 'connecting'; address = $Address }
        $device = Await-WinRT ([Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($RawAddr))
        if ($null -eq $device) { Emit-Error "Device not found" $Address; return }
        $script:devices[$Address] = $device
        $capturedAddr = $Address
        $device.add_ConnectionStatusChanged({
            param($d, $a)
            if ($d.ConnectionStatus.ToString() -eq 'Disconnected') {
                Emit @{ event = 'disconnected'; address = $capturedAddr }
                $script:devices.Remove($capturedAddr)
                $script:services.Remove($capturedAddr)
                $script:chars.Remove($capturedAddr)
            }
        })
        Emit @{ event = 'connected'; address = $Address }
    } catch {
        Emit-Error "Connect failed: $($_.Exception.Message)" $Address
    }
}

function Disconnect-Device {
    param([string]$Address)
    $d = $script:devices[$Address]
    if ($d) {
        try { $d.Dispose() } catch {}
        $script:devices.Remove($Address)
        $script:services.Remove($Address)
        $script:chars.Remove($Address)
        Emit @{ event = 'disconnected'; address = $Address; reason = 'local' }
    }
}

function Request-MTU {
    param([string]$Address, [int]$Mtu)
    # WinRT negotiates MTU automatically; report the supported max
    Emit @{ event = 'mtuNegotiated'; address = $Address; mtu = 247 }
}

# -- Central: Discover services ------------------------------------------------
function Discover-Services {
    param([string]$Address, [string[]]$ServiceUUIDs = @(), [string[]]$CharUUIDs = @())
    $device = $script:devices[$Address]
    if (-not $device) { Emit-Error "Not connected" $Address; return }
    try {
        if (-not $script:services.ContainsKey($Address)) { $script:services[$Address] = @{} }
        if (-not $script:chars.ContainsKey($Address))    { $script:chars[$Address] = @{} }
        $found = @()
        foreach ($su in $ServiceUUIDs) {
            $sg = [Guid]$su
            $sr = Await-WinRT ($device.GetGattServicesForUuidAsync($sg))
            if ($sr.Status.ToString() -ne 'Success') { continue }
            foreach ($svc in $sr.Services) {
                $script:services[$Address][$su] = $svc
                $cr = Await-WinRT ($svc.GetCharacteristicsAsync())
                if ($cr.Status.ToString() -ne 'Success') { continue }
                foreach ($ch in $cr.Characteristics) {
                    $cuuid = $ch.Uuid.ToString('D').ToLower() -replace '-', ''
                    $want  = ($CharUUIDs.Count -eq 0) -or ($CharUUIDs -contains $cuuid)
                    if (-not $want) { continue }
                    $script:chars[$Address][$cuuid] = $ch
                    $cp    = $ch.CharacteristicProperties
                    $props = @()
                    $P     = [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]
                    if ($cp -band $P::Read)               { $props += 'read' }
                    if ($cp -band $P::Write)              { $props += 'write' }
                    if ($cp -band $P::WriteWithoutResponse){ $props += 'writeWithoutResponse' }
                    if ($cp -band $P::Notify)             { $props += 'notify' }
                    if ($cp -band $P::Indicate)           { $props += 'indicate' }
                    $found += @{ uuid = $cuuid; properties = $props }
                }
            }
        }
        Emit @{ event = 'servicesDiscovered'; address = $Address; characteristics = $found }
    } catch {
        Emit-Error "Discover failed: $($_.Exception.Message)" $Address
    }
}

# -- Central: Write characteristic --------------------------------------------
function Write-Char {
    param([string]$Address, [string]$CharUUID, [string]$DataB64, [bool]$WithoutResponse)
    $ch = $script:chars[$Address][$CharUUID]
    if (-not $ch) { Emit-Error "Char $CharUUID not found" $Address; return }
    try {
        $buf = Base64-ToBuffer $DataB64
        $wt  = if ($WithoutResponse) {
            [Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteOption]::WriteWithoutResponse
        } else {
            [Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteOption]::WriteWithResponse
        }
        $r = Await-WinRT ($ch.WriteValueWithResultAsync($buf, $wt))
        if ($r.Status.ToString() -ne 'Success') { Emit-Error "Write: $($r.Status)" $Address }
    } catch {
        Emit-Error "Write exception: $($_.Exception.Message)" $Address
    }
}

# -- Central: Subscribe characteristic ----------------------------------------
function Subscribe-Char {
    param([string]$Address, [string]$CharUUID)
    $ch = $script:chars[$Address][$CharUUID]
    if (-not $ch) { Emit-Error "Char $CharUUID not found for subscribe" $Address; return }
    try {
        $CCCD = [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]
        $r    = Await-WinRT ($ch.WriteClientCharacteristicConfigurationDescriptorAsync($CCCD::Notify))
        if ($r.ToString() -ne 'Success') { Emit-Error "Subscribe: $r" $Address; return }
        $capAddr = $Address; $capUUID = $CharUUID
        $ch.add_ValueChanged({
            param($s, $a)
            try {
                $b64 = Buffer-ToBase64 $a.CharacteristicValue
                Emit @{ event = 'data'; address = $capAddr; charUUID = $capUUID; data = $b64 }
            } catch { Emit-Error "Data event: $($_.Exception.Message)" $capAddr }
        })
        Emit @{ event = 'subscribed'; address = $Address; charUUID = $CharUUID }
    } catch {
        Emit-Error "Subscribe exception: $($_.Exception.Message)" $Address
    }
}

# -- Ready ---------------------------------------------------------------------
Emit @{
    event         = 'ready'
    backend       = 'winrt-native'
    pid           = [System.Diagnostics.Process]::GetCurrentProcess().Id
    hasPeripheral = $script:hasPeripheral
    address       = $script:adapterAddrStr
}

# -- Command loop --------------------------------------------------------------
while ($true) {
    try {
        $line = [Console]::In.ReadLine()
        if ($null -eq $line) { break }
        $line = $line.Trim()
        if ($line -eq '') { continue }
        $cmd = $line | ConvertFrom-Json

        switch ($cmd.cmd) {
            'startScanning' {
                $uuids = if ($cmd.serviceUUIDs) { $cmd.serviceUUIDs } else { @() }
                Start-BLEScan -ServiceUUIDs $uuids -AllowDups ($cmd.allowDups -ne $false)
            }
            'stopScanning'   { Stop-BLEScan }

            'startAdvertising' {
                $name  = if ($cmd.localName)    { $cmd.localName }    else { 'BRIDGE' }
                $svcUu = if ($cmd.serviceUUID)  { $cmd.serviceUUID }  else { '6e400001-b5a3-f393-e0a9-e50e24dcca9e' }
                Start-Advertising -LocalName $name -ServiceUUID $svcUu
            }
            'stopAdvertising'  { Stop-Advertising }

            'notify' {
                $cuuid = if ($cmd.charUUID) { $cmd.charUUID } else { '6e400003b5a3f393e0a9e50e24dcca9e' }
                [System.Threading.ThreadPool]::QueueUserWorkItem({
                    Send-Notify -CharUUID $cuuid -DataB64 $cmd.data
                }) | Out-Null
            }

            'connect' {
                $raw = $script:rawAddressMap[$cmd.address]
                if (-not $raw) { Emit-Error "Unknown address $($cmd.address) -- scan first" $cmd.address; break }
                $addr = $cmd.address; $rawA = $raw
                [System.Threading.ThreadPool]::QueueUserWorkItem({
                    Connect-Device -Address $addr -RawAddr $rawA
                }) | Out-Null
            }
            'disconnect'      { Disconnect-Device -Address $cmd.address }
            'requestMtu'      { Request-MTU -Address $cmd.address -Mtu ([int]$cmd.mtu) }

            'discoverServices' {
                $su = if ($cmd.serviceUUIDs) { $cmd.serviceUUIDs } else { @() }
                $cu = if ($cmd.charUUIDs)    { $cmd.charUUIDs }    else { @() }
                $addr = $cmd.address
                [System.Threading.ThreadPool]::QueueUserWorkItem({
                    Discover-Services -Address $addr -ServiceUUIDs $su -CharUUIDs $cu
                }) | Out-Null
            }

            'write' {
                $addr = $cmd.address; $ch = $cmd.charUUID; $dat = $cmd.data; $wor = [bool]($cmd.withoutResponse)
                [System.Threading.ThreadPool]::QueueUserWorkItem({
                    Write-Char -Address $addr -CharUUID $ch -DataB64 $dat -WithoutResponse $wor
                }) | Out-Null
            }

            'subscribe' {
                $addr = $cmd.address; $ch = $cmd.charUUID
                [System.Threading.ThreadPool]::QueueUserWorkItem({
                    Subscribe-Char -Address $addr -CharUUID $ch
                }) | Out-Null
            }

            'ping' { Emit @{ event = 'pong'; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() } }

            'exit' {
                Stop-BLEScan; Stop-Advertising
                foreach ($a in @($script:devices.Keys)) { Disconnect-Device -Address $a }
                exit 0
            }
            default { Emit-Error "Unknown command: $($cmd.cmd)" }
        }
    } catch {
        Emit-Error "Command loop: $($_.Exception.Message)"
    }
}
