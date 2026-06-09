# Test: DeviceInformation.FindAllAsync with BLE selector
# No events. One-shot. Spin-wait. Should return all BLE advertisers.
# Run: powershell -ExecutionPolicy Bypass -File test-find-all.ps1

$ErrorActionPreference = 'Continue'

Write-Host "Loading WinRT..."
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType=WindowsRuntime] | Out-Null
[Windows.Devices.Bluetooth.BluetoothLEDevice, Windows.Devices.Bluetooth, ContentType=WindowsRuntime] | Out-Null
Write-Host "OK"

# Get the AQS selector for ALL Bluetooth LE devices
$selector = [Windows.Devices.Bluetooth.BluetoothLEDevice]::GetDeviceSelector()
Write-Host "Selector: $selector"

# ONE-SHOT async call -- no events, just spin-wait on Status
Write-Host "Calling FindAllAsync..."
$op = [Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($op.Status.ToString() -eq 'Started' -and $sw.ElapsedMilliseconds -lt 15000) {
    Start-Sleep -Milliseconds 200
    Write-Host "  waiting... $($sw.ElapsedMilliseconds)ms"
}

Write-Host "Status: $($op.Status) after $($sw.ElapsedMilliseconds)ms"

if ($op.Status.ToString() -eq 'Completed') {
    $devices = $op.GetResults()
    Write-Host "Found $($devices.Count) BLE devices:"
    foreach ($d in $devices) {
        Write-Host "  $($d.Name)  [$($d.Id)]"
    }
} else {
    Write-Host "FAILED: $($op.Status)"
}
