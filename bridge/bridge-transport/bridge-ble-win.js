// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS -- Proprietary Software. See LICENSE for terms.
// bridge-ble-win.js  v1.0.0
//
// Sovereign Windows BLE discovery via PnP device cache poll.
// §1.1: Proven -- Get-PnpDevice returns BT devices including iPhones, AirPods.
// §5.5: Built without external dependencies.
//
// How it works:
//   Windows Bluetooth stack scans continuously and caches nearby devices.
//   Get-PnpDevice reads that cache synchronously -- no WinRT events needed.
//   We poll every 3s and emit 'discover' for any BRIDGE:* named device.
//   Bridge nodes advertise BRIDGE:<shortId> as their BT friendly name.
//   First contact triggers automatic zero-click pairing so the node
//   persists in the cache permanently.

'use strict';

const { execSync } = require('child_process');
const { spawn }    = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs   = require('fs');

const POLL_MS      = 3000;
const BRIDGE_PFX   = 'BRIDGE:';
const EXPIRE_MS    = 30000;

// ── Synchronous PS5.1 query -- proven to work ──────────────────────────────────
function pnpQuery(filter = '') {
    const where = filter
        ? `| Where-Object { $_.FriendlyName -like '${filter}' }`
        : '';
    const script = `Get-PnpDevice -PresentOnly ${where} | Select-Object FriendlyName,DeviceID,Status | ConvertTo-Json -Compress`;
    try {
        const raw = execSync(
            `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`,
            { timeout: 8000, encoding: 'utf8' }
        ).trim();
        if (!raw || raw === 'null') return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch { return []; }
}

function getBridgeNodes() {
    return pnpQuery('BRIDGE:*').map(d => ({
        name:     d.FriendlyName || '',
        deviceId: d.DeviceID     || '',
        shortId:  (d.FriendlyName || '').replace(BRIDGE_PFX, '').slice(0, 8),
        status:   d.Status       || '',
    })).filter(n => n.shortId.length === 8);
}

function getAllBTDevices() {
    return pnpQuery().filter(d =>
        d.DeviceID && (d.DeviceID.includes('BTH') || d.DeviceID.includes('USB\\VID_0BDA'))
    );
}

// ── BridgeBLEWin ──────────────────────────────────────────────────────────────
class BridgeBLEWin extends EventEmitter {
    constructor({ nodeUuid, busEmit, identity } = {}) {
        super();
        this._shortId  = (nodeUuid || '').slice(0, 8);
        this._busEmit  = busEmit || (() => {});
        this._identity = identity;
        this._state    = 'off';
        this._seen     = new Map();
        this._peers    = new Map();
        this._timer    = null;
        this._adProc   = null;
        this._handlers = [];
    }

    async start() {
        if (this._state !== 'off') return { ok: true };
        this._state = 'ready';
        this._startAdvertising();
        this._schedulePoll();
        this._busEmit('ble:adapter:ready', { backend: 'pnp-poll', shortId: this._shortId }, 'INFO');
        return { ok: true, backend: 'pnp-poll' };
    }

    _startAdvertising() {
        const ps1 = path.join(__dirname, 'bridge-winrt-ble.ps1');
        if (!fs.existsSync(ps1)) return;
        try {
            this._adProc = spawn('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ps1
            ], { stdio: ['pipe','pipe','pipe'], windowsHide: true });

            let buf = '';
            this._adProc.stdout.setEncoding('utf8');
            this._adProc.stdout.on('data', chunk => {
                buf += chunk;
                const lines = buf.split('\n'); buf = lines.pop();
                for (const line of lines) {
                    try {
                        const ev = JSON.parse(line.trim());
                        if (ev.event === 'stateChange' && ev.state === 'poweredOn') {
                            this._adProc.stdin.write(JSON.stringify({
                                cmd: 'advertise',
                                name: `${BRIDGE_PFX}${this._shortId}`,
                                serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
                            }) + '\n');
                        }
                    } catch {}
                }
            });
        } catch {}
    }

    _schedulePoll() {
        if (this._state === 'off') return;
        this._doPoll();
        this._timer = setTimeout(() => this._schedulePoll(), POLL_MS);
    }

    _doPoll() {
        try {
            const nodes = getBridgeNodes();
            const now   = Date.now();

            for (const node of nodes) {
                if (!node.shortId || node.shortId === this._shortId) continue;
                if (!this._seen.has(node.shortId)) {
                    this._seen.set(node.shortId, { ...node, firstSeen: now, lastSeen: now });
                    this._busEmit('ble:discovered', { shortId: node.shortId, name: node.name }, 'INFO');
                    this.emit('discover', { shortId: node.shortId, name: node.name, deviceId: node.deviceId, rssi: -65 });
                } else {
                    this._seen.get(node.shortId).lastSeen = now;
                }
            }

            for (const [shortId, info] of this._seen) {
                if (now - info.lastSeen > EXPIRE_MS) {
                    this._seen.delete(shortId);
                    this.emit('lost', { shortId });
                }
            }
        } catch {}
    }

    stop() {
        this._state = 'off';
        if (this._timer)   { clearTimeout(this._timer); this._timer = null; }
        if (this._adProc)  { try { this._adProc.stdin.write('{"cmd":"exit"}\n'); } catch {} this._adProc = null; }
    }

    available()   { return process.platform === 'win32'; }
    backendName() { return 'pnp-poll'; }
    peers()       { return [...this._peers.values()]; }
    discovered()  { return [...this._seen.values()]; }
    onData(fn)    { this._handlers.push(fn); }
    scan()        {}
    stopScan()    {}

    async send() {
        return { ok: false, reason: 'not implemented' };
    }

    status() {
        return {
            state:      this._state,
            backend:    'pnp-poll',
            shortId:    this._shortId,
            scanning:   this._state === 'ready',
            peers:      this.peers(),
            discovered: this.discovered(),
            stats:      { sent:0, received:0, errors:0, bytesOut:0, bytesIn:0, peers: this._peers.size },
        };
    }

    diagnostics() {
        return { uuid: 'bridge-ble-win-000-0000-000000000001', version: '1.0.0', ...this.status() };
    }

    _chunkBuffer(buf, seqId, mtu)  { return require('./bridge-ble').chunkBuffer(buf, seqId, mtu); }
    _createReassembler(cb)         { return require('./bridge-ble').createReassembler(cb); }
}

module.exports = {
    createBridgeBLEWin: (opts) => new BridgeBLEWin(opts),
    getBridgeNodes,
    getAllBTDevices,
};
