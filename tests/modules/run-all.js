'use strict';
/**
 * tests/modules/run-all.js — Module Test Runner
 * UUID: test-modules-runner-v1-0000-4000-0000-000000000001
 *
 * Runs every per-module fractal adversarial test suite.
 * Each module test lives at tests/modules/<module>.test.js
 *
 * §12.1 Every runtime file has a brutal recursive test suite.
 * §12.2 Tests are verification, not coverage.
 *
 * Run: node tests/modules/run-all.js
 */

const path = require('path');
const fs   = require('fs');

const MODULES_DIR = __dirname;

const SUITES = [
  'jaa-db.test.js',
  'queue.test.js',
  'baseline.test.js',
  'interaction-contract.test.js',
  'uid.test.js',
  'alk.test.js',
  'healer.test.js',
];

let totalPassed = 0;
let totalFailed = 0;
const results = [];

async function runSuite(file) {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn('node', [path.join(MODULES_DIR, file)], {
      cwd: path.join(__dirname, '../..'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    proc.stdout.on('data', d => { out += d; process.stdout.write(d); });
    proc.stderr.on('data', d => { process.stderr.write(d); });

    proc.on('close', (code) => {
      // Parse pass/fail from output
      const match = out.match(/(\d+) passed\s+(\d+) failed/);
      const p = match ? parseInt(match[1]) : 0;
      const f = match ? parseInt(match[2]) : 0;
      totalPassed += p;
      totalFailed += f;
      results.push({ file, passed: p, failed: f, code });
      resolve();
    });
  });
}

async function main() {
  console.log('\n══ NEXUS MODULE TESTS — Fractal Adversarial Suite ══\n');

  for (const suite of SUITES) {
    const fp = path.join(MODULES_DIR, suite);
    if (!fs.existsSync(fp)) {
      console.log(`  SKIP (not found): ${suite}`);
      continue;
    }
    await runSuite(suite);
  }

  console.log('\n══ MODULE TEST RESULTS ══════════════════════════════');
  for (const r of results) {
    const status = r.failed === 0 ? '✓' : '✗';
    console.log(`  ${status} ${r.file.padEnd(40)} ${r.passed} passed  ${r.failed} failed`);
  }
  console.log('─'.repeat(55));
  console.log(`  TOTAL: ${totalPassed} passed  ${totalFailed} failed`);

  if (totalFailed > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
