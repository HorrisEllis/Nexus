'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-autopilot-warp-spine.js — pins the 2026-07-24 WARP
 * spine on autopilot (James: "make sure you're always using warp"; his
 * standing intent per lib/warp-bus.js: "warp is the spine for each
 * system, supposed to be").
 *
 * Autopilot previously had ZERO WARP — every spawn/despawn/crash/circuit-
 * break, and every tablet T1 ledger read, was invisible movement: the
 * exact property the tablet spec identifies behind every catalogued bug
 * ("the system could not see itself doing it").
 *
 * The spine uses warp/core DIRECTLY (Stream+StreamLog+Axiom), not
 * lib/warp-bus.js's WarpSpine adapter — autopilot has no nexus-bus, and
 * requiring the nexus-bus singleton would pull its wired relay listeners
 * into the supervisor (§5.12). Axioms mirror defaultAxioms(): same
 * checks, same severities.
 *
 * Stream stamps events as {seq, type, payload, timestamp} — verified
 * against the live stream, not assumed from Event's own {uuid, ts, data}
 * shape (they differ; the first draft of this very test got it wrong and
 * was corrected against reality).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const SRC = fs.readFileSync(path.join(__dirname, '../../nexus/autopilot.js'), 'utf8');

(async () => {
  await test('AWS-001', 'autopilot constructs a real warp/core Stream with a StreamLog and the three contract axioms', async () => {
    assert.ok(/require\(['"]\.\.\/warp\/core\/Stream\.js['"]\)/.test(SRC), 'must use warp/core Stream');
    assert.ok(/require\(['"]\.\.\/warp\/core\/StreamLog\.js['"]\)/.test(SRC), 'must use warp/core StreamLog');
    assert.ok(/new Axiom\('type-is-string'/.test(SRC) && /new Axiom\('has-id'/.test(SRC) && /new Axiom\('has-ts'/.test(SRC),
      'must register the same axiom contract as lib/warp-bus.js defaultAxioms()');
  });

  await test('AWS-002', 'all supervisor movements are instrumented: spawn, stop, despawn, crash, circuit-open, ledger.read', async () => {
    for (const type of ['autopilot.kernel.spawn', 'autopilot.kernel.stop', 'autopilot.kernel.despawn',
                        'autopilot.kernel.crash', 'autopilot.circuit.open', 'autopilot.ledger.read']) {
      assert.ok(SRC.includes(`'${type}'`), `missing emit for ${type}`);
    }
  });

  await test('AWS-003', 'a warp emit failure can never kill the supervisor — contained and reported, not thrown', async () => {
    const fnMatch = SRC.match(/function _warpEmit[\s\S]*?\n\}/);
    assert.ok(fnMatch, '_warpEmit must be locatable');
    assert.ok(/try\s*\{/.test(fnMatch[0]) && /catch/.test(fnMatch[0]), 'emit must be try/caught');
    assert.ok(/console\.error/.test(fnMatch[0]), 'failure must be loud (§1.2), not swallowed');
  });

  await test('AWS-004', 'LIVE: real ledger reads land on the real stream, served at /warp with stamped shape {seq,type,payload,timestamp}', async () => {
    process.env.AUTOPILOT_STATUS_PORT = '0'; // pick a free port? autopilot uses the value directly...
    // autopilot reads AUTOPILOT_STATUS_PORT at require time — this file may
    // run after other suites already required it. Use whatever port its
    // server binds by starting our own probe against a fresh spawn instead:
    // simplest deterministic route — a child process with a dedicated port.
    const { spawnSync } = require('child_process');
    const script = `
      process.env.AUTOPILOT_STATUS_PORT = '7921';
      const { _startStatusServer } = require(${JSON.stringify(path.join(__dirname, '../../nexus/autopilot.js'))});
      const http = require('http');
      _startStatusServer();
      const GET = (p) => new Promise((res) => { http.get({ host:'127.0.0.1', port:7921, path:p }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }); });
      setTimeout(async () => {
        await GET('/ledger'); await GET('/ledger/cortex');
        const w = await GET('/warp');
        const reads = w.tail.filter(e => e.type === 'autopilot.ledger.read');
        const ok = w.ok && w.events >= 2 && reads.length >= 2
          && reads.every(e => e.payload.path.startsWith('/ledger'))
          && w.tail.every(e => Number.isFinite(e.seq) && Number.isFinite(e.timestamp));
        console.log(ok ? 'LIVE-OK' : 'LIVE-FAIL ' + JSON.stringify(w).slice(0, 300));
        process.exit(ok ? 0 : 1);
      }, 300);
    `;
    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 20000 });
    assert.ok(r.stdout.includes('LIVE-OK'), `live check failed: ${r.stdout.slice(-300)} ${r.stderr.slice(-200)}`);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
