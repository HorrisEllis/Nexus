// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS -- Proprietary Software. See LICENSE for terms.
// ble-host/Program.cs  v5.0.0
//
// Sovereign BLE scanner using .NET 6 + CsWinRT.
// Targets net6.0-windows10.0.19041.0 -- WinRT events work natively.
// Compiles to self-contained single exe via: dotnet publish
//
// Protocol: JSON lines on stdin/stdout (identical to PS1 version)

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using Windows.Devices.Bluetooth;
using Windows.Devices.Bluetooth.Advertisement;
using Windows.Devices.Bluetooth.GenericAttributeProfile;
using Windows.Storage.Streams;

var output = new ConcurrentQueue<string>();
var running = true;
BluetoothLEAdvertisementWatcher watcher = null;
var scanning = false;
var rawMap = new Dictionary<string, ulong>();
var devices = new Dictionary<string, BluetoothLEDevice>();
var chars = new Dictionary<string, GattCharacteristic>();

// Helpers
string Js(string k, string v) => $"\"{k}\":\"{(v ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";
string Jn(string k, long v) => $"\"{k}\":{v}";
string Jb(string k, bool v) => $"\"{k}\":{(v ? "true" : "false")}";
string Ev(string name, params string[] fields) {
    var sb = new StringBuilder($"{{\"event\":\"{name}\"");
    foreach (var f in fields) sb.Append(',').Append(f);
    return sb.Append('}').ToString();
}
void Emit(string json) => output.Enqueue(json);

string FmtAddr(ulong addr) {
    var h = addr.ToString("X12");
    return $"{h[0..2]}:{h[2..4]}:{h[4..6]}:{h[6..8]}:{h[8..10]}:{h[10..12]}";
}

string GetField(string json, string field) {
    var key = $"\"{field}\":";
    var i = json.IndexOf(key);
    if (i < 0) return null;
    i += key.Length;
    while (i < json.Length && json[i] == ' ') i++;
    if (i >= json.Length) return null;
    if (json[i] == '"') {
        i++;
        var end = json.IndexOf('"', i);
        return end < 0 ? null : json[i..end];
    }
    var start = i;
    while (i < json.Length && json[i] != ',' && json[i] != '}') i++;
    return json[start..i].Trim();
}

// Stdout drain thread
var outThread = new Thread(() => {
    while (running || !output.IsEmpty) {
        while (output.TryDequeue(out var line)) Console.WriteLine(line);
        Thread.Sleep(10);
    }
}) { IsBackground = true };
outThread.Start();

// Ready
Emit(Ev("stateChange", Js("state","poweredOn"), Js("backend","winrt-dotnet6"), Jb("hasPeripheral",false), Js("address","unknown")));
Emit(Ev("ready", Js("backend","winrt-dotnet6"), Jn("pid", Environment.ProcessId), Jb("hasPeripheral",false), Js("address","unknown")));

void StartScan() {
    if (scanning) return;
    watcher = new BluetoothLEAdvertisementWatcher {
        ScanningMode = BluetoothLEScanningMode.Active
    };

    // .NET 6 + CsWinRT: += works natively for WinRT events
    watcher.Received += (s, a) => {
        try {
            var addr = a.BluetoothAddress;
            var addrStr = FmtAddr(addr);
            lock (rawMap) { rawMap[addrStr] = addr; }
            var name = a.Advertisement.LocalName ?? "";
            var rssi = a.RawSignalStrengthInDBm;
            Emit(Ev("discover", Js("address",addrStr), Js("name",name), Jn("rssi",rssi), Jn("raw",(long)addr)));
        } catch {}
    };

    watcher.Stopped += (s, a) => {
        scanning = false;
        Emit(Ev("scanStopped"));
    };

    watcher.Start();
    scanning = true;
    Emit(Ev("scanStarted"));
}

void StopScan() {
    try { watcher?.Stop(); } catch {}
    watcher = null;
    scanning = false;
    Emit(Ev("scanStopped"));
}

// Command loop
string line;
while (running && (line = Console.ReadLine()) != null) {
    var cmd = GetField(line, "cmd");
    if (cmd == null) continue;
    try {
        switch (cmd) {
            case "ping":     Emit(Ev("pong", Jn("ts", DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()))); break;
            case "scan":     StartScan(); break;
            case "stopScan": StopScan(); break;
            case "exit":     running = false; break;
        }
    } catch (Exception ex) {
        Emit(Ev("error", Js("reason", $"Loop: {ex.Message}")));
    }
}

running = false;
Thread.Sleep(200);
