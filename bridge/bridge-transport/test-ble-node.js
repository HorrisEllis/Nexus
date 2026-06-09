// test-ble-node.js
// Tests BLE by spawning the PS1 script directly and watching raw output
// Usage: node bridge-transport/test-ble-node.js

'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PS1 = path.join(__dirname, 'bridge-winrt-ble.ps1');

console.log('\nBridge OS -- Raw WinRT BLE probe');
console.log('----------------------------------');
console.log('PS1:', PS1);
console.log('Exists:', fs.existsSync(PS1));
console.log('');

const proc = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive', 
    '-ExecutionPolicy', 'Bypass',
    '-File', PS1,
], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: false });

let buf = '';

proc.stdout.setEncoding('utf8');
proc.stdout.on('data', chunk => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
        const t = line.trim();
        if (t) console.log('STDOUT:', t);
    }
});

proc.stderr.setEncoding('utf8');
proc.stderr.on('data', err => {
    console.log('STDERR:', err.trim());
});

proc.on('exit', code => {
    console.log('\nProcess exited:', code);
});

// Send ping after 2s
setTimeout(() => {
    console.log('\nSending ping...');
    proc.stdin.write(JSON.stringify({ cmd: 'ping' }) + '\n');
}, 2000);

// Kill after 8s
setTimeout(() => {
    proc.stdin.write(JSON.stringify({ cmd: 'exit' }) + '\n');
    setTimeout(() => process.exit(0), 1000);
}, 8000);
