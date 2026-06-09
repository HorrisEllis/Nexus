// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — BLE HCI scanner test
// §1.1: Nothing exists until proven.
'use strict';

const { BridgeHCI, findHCIDevice } = require('../bridge-hci');

const SCAN_MS = parseInt(process.argv.find(a => a.startsWith('--scan-ms='))?.split('=')[1] || '10000');
const G = '\x1b[92m', R = '\x1b[91m', Y = '\x1b[93m', DIM = '\x1b[2m', B = '\x1b[1m', C = '\x1b[0m';

console.log(`\n  ${B}Bridge OS — HCI BLE scanner test${C}`);
console.log(`  ${DIM}pure Node.js · no PowerShell · no WinRT events · §5.5${C}\n`);

if (process.platform !== 'win32') {
    console.log(`  ${R}✗${C}  Windows only (bthHCI device)`);
    process.exit(1);
}

// Phase 1: find HCI device
console.log(`  [1] Locating HCI device...`);
const devPath = findHCIDevice();
if (!devPath) {
    console.log(`  ${R}✗${C}  No bthHCI device found`);
    console.log(`      The RTL8852BE may not expose an HCI device path.`);
    console.log(`      This is common — Windows abstracts HCI behind the BT stack.`);
    console.log(`      Falling back to PS1 backend is the correct path.`);
    process.exit(1);
}
console.log(`  ${G}✓${C}  HCI device: ${devPath}`);

// Phase 2: open and scan
console.log(`  [2] Opening HCI device and starting scan (${SCAN_MS}ms)...`);
const hci = new BridgeHCI();
let opened = false;

try {
    hci.open();
    opened = true;
    console.log(`  ${G}✓${C}  HCI device opened`);
} catch (e) {
    console.log(`  ${R}✗${C}  Failed to open: ${e.message}`);
    console.log(`      ${DIM}This is expected if the Windows BT stack holds exclusive access.${C}`);
    process.exit(1);
}

const seen = new Map();
hci.on('discover', ({ addr, name, rssi }) => {
    if (!seen.has(addr)) {
        seen.set(addr, true);
        const tag = name.startsWith('BRIDGE:') ? `${G}⬡${C}` : `${DIM}·${C}`;
        console.log(`  ${tag}  ${addr}  "${name || '(no name)'}"  ${rssi} dBm`);
    }
});

hci.reset();
hci.startScan();
console.log(`  ${DIM}Scanning...${C}`);

setTimeout(() => {
    hci.close();
    console.log(`\n  ${B}Results:${C} ${seen.size} device(s) found in ${SCAN_MS}ms`);
    if (seen.size > 0) {
        console.log(`  ${G}✓${C}  HCI scanner operational`);
        process.exit(0);
    } else {
        console.log(`  ${Y}⚠${C}  No devices found — HCI access may be blocked by Windows BT stack`);
        process.exit(3);
    }
}, SCAN_MS);
