#!/usr/bin/env node
'use strict';
/**
 * fix-orchestrator.js
 * Fixes: Error: Cannot find module './lib/intent-map'
 *
 * ROOT CAUSE:
 * You extracted nexus-complete-v1_0_9.zip to D:\Backups\Downloads\
 * but ran `node orchestrator.js` from D:\Backups\Downloads\ directly.
 * The zip extracts to D:\Backups\Downloads\nexus-complete-v1_0_9\
 * so orchestrator.js is at:
 *   D:\Backups\Downloads\nexus-complete-v1_0_9\orchestrator.js
 * and ./lib/intent-map resolves correctly FROM THERE.
 *
 * FIX: Run from inside the extracted folder:
 *   cd D:\Backups\Downloads\nexus-complete-v1_0_9
 *   node orchestrator.js
 *
 * Or use npm start from that directory:
 *   cd D:\Backups\Downloads\nexus-complete-v1_0_9
 *   npm start
 *
 * This script verifies your directory structure is correct.
 */

const fs   = require('fs');
const path = require('path');

const cwd = process.cwd();
console.log(`\nChecking NEXUS structure from: ${cwd}\n`);

const required = [
  'orchestrator.js',
  'lib/intent-map.js',
  'lib/boot-sequence.js',
  'lib/cfr/ledger.js',
  'package.json',
  'siso/index.js',
];

let ok = true;
for (const f of required) {
  const exists = fs.existsSync(path.join(cwd, f));
  console.log(`  ${exists ? '✓' : '✗'} ${f}`);
  if (!exists) ok = false;
}

if (!ok) {
  console.log(`
✗ Missing files detected.

You are running from the wrong directory.

CORRECT boot sequence:
  1. Extract nexus-complete-v1_0_9.zip
  2. cd nexus-complete-v1_0_9
  3. npm install          (first time only)
  4. node orchestrator.js
  
  Or: npm start

DO NOT run orchestrator.js from the parent Downloads folder.
The lib/ folder must be in the same directory as orchestrator.js.
`);
  process.exit(1);
} else {
  console.log(`
✓ Structure looks correct.
  Run: node orchestrator.js
  Or:  npm start
`);
  process.exit(0);
}
