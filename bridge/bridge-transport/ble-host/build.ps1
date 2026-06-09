# Bridge OS -- build BLE host with .NET 6 SDK
# Usage: pwsh -File build.ps1
# Output: bridge-winrt-ble.exe in bridge-transport/

$ErrorActionPreference = 'Stop'

# Check dotnet
try {
    $version = dotnet --version 2>&1
    Write-Host "dotnet SDK: $version"
} catch {
    Write-Host "ERROR: dotnet SDK not found."
    Write-Host "Install from: https://dotnet.microsoft.com/download"
    Write-Host "Or run: winget install Microsoft.DotNet.SDK.8"
    exit 1
}

Write-Host "Building BLE host (net6.0-windows)..."
$out = Split-Path -Parent $PSScriptRoot
dotnet publish ble-host.csproj `
    --configuration Release `
    --runtime win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    --output "$out" 2>&1

if (Test-Path "$out\bridge-winrt-ble.exe") {
    Write-Host "SUCCESS: bridge-winrt-ble.exe built"
    Write-Host "Size: $((Get-Item "$out\bridge-winrt-ble.exe").Length / 1MB) MB"
} else {
    Write-Host "FAILED"
    exit 1
}
