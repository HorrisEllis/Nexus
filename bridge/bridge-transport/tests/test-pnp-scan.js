// Bridge OS -- PnP BLE discovery test
'use strict';
const { getBridgeNodes, getAllBTDevices } = require('../bridge-ble-win');

console.log('\nBridge OS -- Windows BLE Cache Test');
console.log('=====================================\n');

console.log('All Bluetooth devices Windows sees:');
const all = getAllBTDevices();
if (all.length === 0) {
    console.log('  (none -- Bluetooth may be off)');
} else {
    for (const d of all) {
        console.log(`  [${d.Status}] ${d.FriendlyName || '(no name)'}`);
    }
}

console.log(`\nBRIDGE nodes specifically:`);
const bridge = getBridgeNodes();
if (bridge.length === 0) {
    console.log('  (none -- no Bridge nodes paired yet)');
    console.log('  Run a second Bridge node nearby to test peer discovery');
} else {
    for (const n of bridge) {
        console.log(`  BRIDGE:${n.shortId}  ${n.deviceId}`);
    }
}

console.log(`\nResult: ${all.length} BT devices visible, ${bridge.length} Bridge nodes`);
