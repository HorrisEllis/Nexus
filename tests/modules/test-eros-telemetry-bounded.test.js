'use strict';
/**
 * tests/modules/test-eros-telemetry-bounded.test.js — 0.39.285
 *
 * James: "the data folder is 10GB … data\erosmancer\telemetry.jsonl is huge" (8.6 GB). Root cause: ErosmancerOS's
 * Telemetry.flush() appended the WHOLE ring buffer every flush and never marked it written.
 *   ET-01 each event reaches the disk once, however many flushes run
 *   ET-02 debug events are not persisted by default (EROS_PERSIST_LEVEL=info); they stay in memory
 *   ET-03 past the cap (EROS_TELEMETRY_MAX_MB) the file rotates to telemetry.1.jsonl, one kept
 *   ET-04 an oversized file left from before is rotated at start
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '../..');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }
const lines = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean) : [];

(async () => {
  console.log('\ntest-eros-telemetry-bounded\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eros-tel-'));
  try {
    delete process.env.EROS_PERSIST_LEVEL;
    process.env.EROS_LOG_LEVEL = 'error';   // keep the console quiet
    // the real source, loaded as an ES module (erosmancer-os has no "type": "module"; its type import is erased)
    const mts = path.join(dir, 'telemetry.mts');
    fs.writeFileSync(mts, fs.readFileSync(path.join(ROOT, 'erosmancer/erosmancer-os/src/telemetry/index.ts'), 'utf8'));
    const { Telemetry } = await import(mts);
    const p = path.join(dir, 'telemetry.jsonl');
    const t = new Telemetry({ persistPath: p, maxEvents: 1000, flushIntervalMs: 60000 });
    for (let i = 0; i < 5; i++) t.info('bridge', `e${i}`);
    for (let i = 0; i < 4; i++) t.flush();
    t.info('bridge', 'e5'); t.flush(); t.flush();
    check('ET-01 each event is written once, however many flushes run', lines(p).length === 6, `${lines(p).length} lines`);
    t.debug('bridge', 'noise'); t.flush();
    check('ET-02 debug is kept in memory, not persisted (EROS_PERSIST_LEVEL default info)', lines(p).length === 6 && t.getEvents().some(e => e.message === 'noise'));
    t.destroy();

    process.env.EROS_TELEMETRY_MAX_MB = String(2000 / 1024 / 1024);   // ~2 KB
    const p2 = path.join(dir, 'rot.jsonl');
    const t2 = new Telemetry({ persistPath: p2, maxEvents: 1000, flushIntervalMs: 60000 });
    for (let r = 0; r < 6; r++) { for (let i = 0; i < 10; i++) t2.info('bridge', `r${r}-${i}`, { pad: 'x'.repeat(40) }); t2.flush(); }
    t2.destroy();
    const sz = fs.statSync(p2).size, prev = path.join(dir, 'rot.1.jsonl');
    check('ET-03 past the cap it rotates: the file stays near the cap, one previous kept', fs.existsSync(prev) && sz < 4000 && fs.readdirSync(dir).filter(f => f.startsWith('rot')).length === 2, `${sz} bytes; ${fs.readdirSync(dir)}`);

    const p3 = path.join(dir, 'old.jsonl');
    fs.writeFileSync(p3, 'x'.repeat(5000));
    const t3 = new Telemetry({ persistPath: p3, maxEvents: 10, flushIntervalMs: 60000 });
    t3.destroy();
    check('ET-04 an oversized file from before is rotated at start', fs.existsSync(path.join(dir, 'old.1.jsonl')) && !fs.existsSync(p3));
  } catch (e) { fail++; console.log(`  ✗ crashed: ${e.stack}`); }
  finally { delete process.env.EROS_TELEMETRY_MAX_MB; try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 200);
})();
