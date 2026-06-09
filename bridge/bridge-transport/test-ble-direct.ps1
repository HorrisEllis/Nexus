# test-ble-direct.ps1
# BLE adapter probe -- runs WinRT call on correct STA thread via C# helper
# Usage: powershell -ExecutionPolicy Bypass -File test-ble-direct.ps1

$ErrorActionPreference = 'Continue'
Write-Host ""
Write-Host "Bridge OS -- Direct BLE adapter probe" -ForegroundColor Cyan
Write-Host "--------------------------------------"

# Compile a tiny C# class that calls GetDefaultAsync on a thread-pool
# thread with the correct WinRT context
Write-Host "[1] Compiling WinRT bridge..."
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    [Windows.Devices.Bluetooth.BluetoothAdapter,Windows.Devices.Bluetooth,ContentType=WindowsRuntime] | Out-Null
    [Windows.Devices.Radios.Radio,Windows.System.Devices,ContentType=WindowsRuntime] | Out-Null

    Add-Type -TypeDefinition @"
using System;
using System.Threading;
using System.Threading.Tasks;
using Windows.Devices.Bluetooth;

public static class BleProbe {
    public static BluetoothAdapter GetAdapter() {
        BluetoothAdapter result = null;
        Exception ex = null;
        var done = new ManualResetEventSlim(false);

        ThreadPool.QueueUserWorkItem(_ => {
            try {
                var op = BluetoothAdapter.GetDefaultAsync();
                var task = op.AsTask();
                task.Wait(10000);
                result = task.Result;
            } catch (Exception e) {
                ex = e;
            } finally {
                done.Set();
            }
        });

        done.Wait(12000);
        if (ex != null) throw ex;
        return result;
    }
}
"@ -ReferencedAssemblies @(
        'System.Runtime.WindowsRuntime',
        [Windows.Devices.Bluetooth.BluetoothAdapter].Assembly.Location
    )
    Write-Host "    OK" -ForegroundColor Green
} catch {
    Write-Host "    FAIL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Call it
Write-Host "[2] Getting adapter..."
try {
    $adapter = [BleProbe]::GetAdapter()
    if ($null -eq $adapter) {
        Write-Host "    FAIL: null -- WinRT found no BLE adapter" -ForegroundColor Red
        Write-Host "    Check: Device Manager -> Bluetooth -> Realtek Bluetooth Adapter -> Enabled" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "    OK" -ForegroundColor Green
} catch {
    Write-Host "    FAIL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Print details
Write-Host ""
Write-Host "Adapter:" -ForegroundColor Cyan
try { $hex = '{0:X12}' -f $adapter.BluetoothAddress; Write-Host "  Address    : $(($hex -split '(..)' | Where-Object{$_}) -join ':')" } catch {}
try { Write-Host "  BLE        : $($adapter.IsLowEnergySupported)" } catch {}
try { Write-Host "  Central    : $($adapter.IsCentralRoleSupported)" } catch {}
try { Write-Host "  Peripheral : $($adapter.IsPeripheralRoleSupported)" } catch {}

# Get radio
Write-Host ""
Write-Host "[3] Getting radio..."
try {
    $op2 = $adapter.GetRadioAsync()
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($op2.Status.ToString() -eq 'Started' -and $sw.ElapsedMilliseconds -lt 5000) {
        Start-Sleep -Milliseconds 200
    }
    if ($op2.Status.ToString() -eq 'Completed') {
        $radio = $op2.GetResults()
        if ($radio) {
            $col = if ($radio.State.ToString() -eq 'On') {'Green'} else {'Red'}
            Write-Host "  State : $($radio.State)" -ForegroundColor $col
            Write-Host "  Name  : $($radio.Name)"
            Write-Host "  Kind  : $($radio.Kind)"
        } else { Write-Host "  Radio null" -ForegroundColor Yellow }
    } else { Write-Host "  Radio op: $($op2.Status)" -ForegroundColor Yellow }
} catch { Write-Host "  Radio error: $($_.Exception.Message)" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Done." -ForegroundColor Cyan
